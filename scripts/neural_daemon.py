import sys
import os
import json
import traceback

# 1. Защита stdout на этапе импорта сторонних библиотек (onnxruntime, numpy и т.д.)
if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

IPC_OUT = sys.stdout
sys.stdout = sys.stderr

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from scripts.neural_engine import (
    create_onnx_session,
    alphabeta_search,
    mcts_search,
    deep_search_5ply
)

def send_json(ipc_out, payload):
    try:
        ipc_out.write(json.dumps(payload, separators=(',', ':'), allow_nan=False) + '\n')
        ipc_out.flush()
    except (BrokenPipeError, OSError):
        sys.exit(0)

# Cache loaded ONNX sessions: by model_path and by normalized model_ver
sessions_by_path = {}
sessions_by_ver = {}

MODEL_CANDIDATES = {
    'v1_7': ('modular_chess_v1_7.onnx', 'modular_chess_v1_6.onnx', 'modular_chess_v1_5.onnx', 'modular_chess_v1.onnx'),
    'v1_6': ('modular_chess_v1_6.onnx', 'modular_chess_v1_5.onnx', 'modular_chess_v1.onnx'),
    'v1_5': ('modular_chess_v1_5.onnx', 'modular_chess_v1.onnx'),
    'v1':   ('modular_chess_v1.onnx',)
}

VER_ALIASES = {
    'v1_7': 'v1_7', 'v1.7': 'v1_7', 'neural-v1-7': 'v1_7', 'neural-v1-7-alphabeta': 'v1_7',
    'v1_6': 'v1_6', 'v1.6': 'v1_6', 'neural-v1-6': 'v1_6', 'neural-v1-6-alphabeta': 'v1_6',
    'v1_5': 'v1_5', 'v1.5': 'v1_5', 'neural-v1-5': 'v1_5', 'neural-v1-5-mcts': 'v1_5',
}

def get_session(model_ver):
    norm_ver = VER_ALIASES.get(model_ver, 'v1')
    if norm_ver in sessions_by_ver:
        return sessions_by_ver[norm_ver]

    candidates = MODEL_CANDIDATES.get(norm_ver, MODEL_CANDIDATES['v1'])
    chosen_path = None
    for c in candidates:
        p = os.path.join(root_dir, c)
        if os.path.isfile(p):
            chosen_path = p
            break

    if not chosen_path:
        chosen_path = os.path.join(root_dir, 'modular_chess_v1.onnx')
        if not os.path.isfile(chosen_path):
            raise FileNotFoundError(f"ONNX model not found: {chosen_path}")

    if chosen_path not in sessions_by_path:
        sessions_by_path[chosen_path] = create_onnx_session(chosen_path)

    session = sessions_by_path[chosen_path]
    sessions_by_ver[norm_ver] = session
    return session

DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

def handle_request(req):
    req_id = req.get('id')
    fen = req.get('fen')
    if not isinstance(fen, str) or not (10 <= len(fen) <= 120) or not fen.strip():
        fen = DEFAULT_FEN

    model_ver = req.get('modelVer') if isinstance(req.get('modelVer'), str) else 'v1'
    search_type = req.get('searchType') if isinstance(req.get('searchType'), str) else 'alphabeta'

    history = req.get('history')
    if isinstance(history, list):
        # Оставляем только последние 100 валидных строк (защита от DoS и TypeError в движке)
        history = [h for h in history[-100:] if isinstance(h, str) and len(h) <= 120]
    else:
        history = None

    session = get_session(model_ver)

    if search_type == 'mcts':
        top_moves, root_val, elapsed_ms = mcts_search(
            session, fen, num_simulations=160, c_puct=1.0, history=history
        )
        res = {
            'value': root_val, 'searchType': 'mcts', 'simulations': 160,
            'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver
        }
    elif search_type in ('deep', 'minimax'):
        top_moves, root_val, elapsed_ms = deep_search_5ply(
            session, fen, top_k1=14, top_k2=8, top_k3=4, top_k4=3, history=history
        )
        res = {
            'value': root_val, 'searchType': 'minimax', 'searchDepth': 5,
            'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver
        }
    else:
        top_moves, root_val, elapsed_ms = alphabeta_search(
            session, fen, max_depth=6, time_limit_ms=4000, history=history
        )
        completed_d = top_moves[0].get('depth', 6) if top_moves else 6
        res = {
            'value': root_val, 'searchType': 'alphabeta', 'searchDepth': completed_d,
            'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver
        }

    if req_id is not None:
        res['id'] = req_id
    return res

def main():
    # Предзагрузка модели по умолчанию, чтобы первый ход не тормозил
    try:
        get_session('v1_7')
    except Exception as e:
        sys.stderr.write(f"Preload warning: {e}\n")

    send_json(IPC_OUT, {'status': 'ready'})

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            req = None
            try:
                req = json.loads(line)
                if not isinstance(req, dict):
                    raise ValueError("Request payload must be a JSON object")

                req_id = req.get('id')
                if req.get('cmd') == 'ping':
                    send_json(IPC_OUT, {'status': 'pong', 'id': req_id})
                    continue

                response = handle_request(req)
                send_json(IPC_OUT, response)
            except Exception as e:
                sys.stderr.write(traceback.format_exc() + '\n')
                err_res = {'error': str(e)}
                if isinstance(req, dict) and 'id' in req:
                    err_res['id'] = req['id']
                send_json(IPC_OUT, err_res)
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    main()
