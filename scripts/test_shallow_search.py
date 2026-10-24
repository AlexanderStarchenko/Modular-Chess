import numpy as np
import onnxruntime as ort
import time

PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

def fen_to_board(fen):
    parts = fen.split()
    board = [[None]*8 for _ in range(8)]
    r, c = 0, 0
    for ch in parts[0]:
        if ch == '/':
            r += 1
            c = 0
        elif ch.isdigit():
            c += int(ch)
        else:
            board[r][c] = ch
            c += 1
    turn = parts[1] if len(parts) > 1 else 'w'
    castling = parts[2] if len(parts) > 2 else '-'
    return board, turn, castling

def board_to_tensor(board, turn, castling='-'):
    planes = np.zeros((16, 8, 8), dtype=np.float32)
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if p and p in PIECE_MAP:
                planes[PIECE_MAP[p], r, c] = 1.0
    if turn == 'w': planes[12, :, :] = 1.0
    if 'K' in castling: planes[13, 0:4, 0:4] = 1.0
    if 'Q' in castling: planes[13, 0:4, 4:8] = 1.0
    if 'k' in castling: planes[14, 4:8, 0:4] = 1.0
    if 'q' in castling: planes[14, 4:8, 4:8] = 1.0
    return planes

def simulate_move(board, f_r, f_c, t_r, t_c):
    nb = [row[:] for row in board]
    p = nb[f_r][f_c]
    nb[f_r][f_c] = None
    if p == 'P' and t_r == 0: p = 'Q'
    elif p == 'p' and t_r == 7: p = 'q'
    nb[t_r][t_c] = p
    return nb

def shallow_search_2ply(session, fen, top_k=5):
    t0 = time.time()
    board, turn, castling = fen_to_board(fen)
    persp = 1.0 if turn == 'w' else -1.0
    opp_turn = 'b' if turn == 'w' else 'w'

    # Step 1: Root pass
    root_inp = board_to_tensor(board, turn, castling)[np.newaxis, ...]
    out = session.run(None, {'board_state': root_inp})
    policy = out[0][0]
    root_val = float(out[1][0, 0])

    top_indices = np.argsort(policy)[-top_k:][::-1]
    candidates = []
    batch_boards = []

    for idx in top_indices:
        f_sq, t_sq = divmod(int(idx), 64)
        fr, fc = divmod(f_sq, 8)
        tr, tc = divmod(t_sq, 8)
        nb = simulate_move(board, fr, fc, tr, tc)
        candidates.append({'fr': fr, 'fc': fc, 'tr': tr, 'tc': tc, 'p_score': float(policy[idx]), 'board': nb})
        batch_boards.append(board_to_tensor(nb, opp_turn, castling))

    # Step 2: Batch pass for all candidate moves
    batch_tensor = np.stack(batch_boards, axis=0)
    out_b = session.run(None, {'board_state': batch_tensor})
    opp_policies = out_b[0]
    cand_values = out_b[1]

    # Step 3: Simulate opponent's best response for each candidate
    opp_batch = []
    for i in range(len(candidates)):
        opp_pol = opp_policies[i]
        best_opp_idx = int(np.argmax(opp_pol))
        o_fsq, o_tsq = divmod(best_opp_idx, 64)
        o_fr, o_fc = divmod(o_fsq, 8)
        o_tr, o_tc = divmod(o_tsq, 8)
        opp_leaf = simulate_move(candidates[i]['board'], o_fr, o_fc, o_tr, o_tc)
        opp_batch.append(board_to_tensor(opp_leaf, turn, castling))

    # Step 4: Leaf evaluation after opponent reply
    out_leaf = session.run(None, {'board_state': np.stack(opp_batch, axis=0)})
    leaf_values = out_leaf[1]
    dt = (time.time() - t0) * 1000

    results = []
    for i, c in enumerate(candidates):
        uci = chr(97 + c['fc']) + str(8 - c['fr']) + chr(97 + c['tc']) + str(8 - c['tr'])
        l_val = float(leaf_values[i][0])
        # Minimax total: leaf position value from our perspective + normalized policy prior
        total = (persp * l_val) + 0.15 * c['p_score']
        results.append({
            'uci': uci,
            'fromR': c['fr'], 'fromC': c['fc'],
            'toR': c['tr'], 'toC': c['tc'],
            'policy': c['p_score'],
            'leafValue': l_val,
            'totalScore': total
        })

    results.sort(key=lambda x: x['totalScore'], reverse=True)
    return results, root_val, dt

if __name__ == '__main__':
    session = ort.InferenceSession('modular_chess_v1.onnx')
    fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    res, rval, dt = shallow_search_2ply(session, fen)
    print(f"2-Ply Shallow Minimax completed in {dt:.2f} ms | Root eval: {rval:+.3f}")
    for r in res:
        print(f"Move: {r['uci']} | Total Score: {r['totalScore']:.3f} (Leaf Value: {r['leafValue']:+.3f}, Policy: {r['policy']:.3f})")
