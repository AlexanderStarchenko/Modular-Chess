import sys
import os
import json
import traceback

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from scripts.neural_engine import (
    create_onnx_session,
    alphabeta_search,
    mcts_search,
    deep_search_5ply
)

# Cache loaded ONNX sessions: { model_path: session }
sessions = {}

def get_session(model_ver):
    if model_ver in ('v1_7', 'v1.7', 'neural-v1-7', 'neural-v1-7-alphabeta'):
        candidates = ['modular_chess_v1_7.onnx', 'modular_chess_v1_6.onnx', 'modular_chess_v1_5.onnx', 'modular_chess_v1.onnx']
    elif model_ver in ('v1_6', 'v1.6', 'neural-v1-6', 'neural-v1-6-alphabeta'):
        candidates = ['modular_chess_v1_6.onnx', 'modular_chess_v1_5.onnx', 'modular_chess_v1.onnx']
    elif model_ver in ('v1_5', 'v1.5', 'neural-v1-5', 'neural-v1-5-mcts'):
        candidates = ['modular_chess_v1_5.onnx', 'modular_chess_v1.onnx']
    else:
        candidates = ['modular_chess_v1.onnx']

    chosen_path = None
    for c in candidates:
        p = os.path.join(root_dir, c)
        if os.path.exists(p):
            chosen_path = p
            break
    if not chosen_path:
        chosen_path = os.path.join(root_dir, 'modular_chess_v1.onnx')

    if chosen_path not in sessions:
        sessions[chosen_path] = create_onnx_session(chosen_path)
    return sessions[chosen_path]

def handle_request(req):
    req_id = req.get('id')
    fen = req.get('fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    model_ver = req.get('modelVer', 'v1')
    search_type = req.get('searchType', 'alphabeta')
    history = req.get('history')

    session = get_session(model_ver)

    if search_type in ('alphabeta', 'ab', 'policy_alphabeta'):
        top_moves, root_val, elapsed_ms = alphabeta_search(session, fen, max_depth=6, time_limit_ms=4000, history=history)
        completed_d = top_moves[0].get('depth', 6) if top_moves else 6
        res = {'value': root_val, 'searchType': 'alphabeta', 'searchDepth': completed_d, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}
    elif search_type == 'mcts':
        top_moves, root_val, elapsed_ms = mcts_search(session, fen, num_simulations=160, c_puct=1.0, history=history)
        res = {'value': root_val, 'searchType': 'mcts', 'simulations': 160, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}
    elif search_type in ('deep', 'minimax'):
        top_moves, root_val, elapsed_ms = deep_search_5ply(session, fen, top_k1=14, top_k2=8, top_k3=4, top_k4=3, history=history)
        res = {'value': root_val, 'searchType': 'minimax', 'searchDepth': 5, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}
    else:
        top_moves, root_val, elapsed_ms = alphabeta_search(session, fen, max_depth=6, time_limit_ms=4000, history=history)
        completed_d = top_moves[0].get('depth', 6) if top_moves else 6
        res = {'value': root_val, 'searchType': 'alphabeta', 'searchDepth': completed_d, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}

    if req_id is not None:
        res['id'] = req_id
    return res

def main():
    if hasattr(sys.stdin, 'reconfigure'):
        sys.stdin.reconfigure(encoding='utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    # Notify ready
    print(json.dumps({'status': 'ready'}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get('id')
            if req.get('cmd') == 'ping':
                print(json.dumps({'status': 'pong', 'id': req_id}), flush=True)
                continue
            response = handle_request(req)
            print(json.dumps(response), flush=True)
        except Exception as e:
            err_res = {'error': str(e), 'traceback': traceback.format_exc()}
            try:
                err_res['id'] = req.get('id')
            except Exception:
                pass
            print(json.dumps(err_res), flush=True)

if __name__ == '__main__':
    main()
