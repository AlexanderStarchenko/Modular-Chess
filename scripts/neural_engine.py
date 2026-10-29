import sys
import os
import json
import time
import random
import math
import numpy as np
import onnxruntime as ort

PIECE_MAP = {
    'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
    'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
}

PIECE_VALUES = {
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000,
    'p': -100, 'n': -320, 'b': -330, 'r': -500, 'q': -900, 'k': -20000
}

PIECE_ABS_VALUES = {
    'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
}

DEFAULT_OPENING_BOOK = {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "c2c4", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "c7c5", "e7e6", "c7c6", "g8f6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "e7e6", "c7c5"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "b1c3", "f2f4", "d2d4"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "g8f6", "d7d6"],
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": ["f1b5", "f1c4", "d2d4", "b1c3"],
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6": ["g1f3", "b1c3", "c2c3", "d2d4"],
    "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3": ["e7e6", "c7c6", "d5c4"],
    "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": ["b1c3", "g1f3"],
    "rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": ["g1f3", "b1c3"],
    "rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -": ["c2c4", "g1f3", "c1f4"],
    "rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": ["b1c3", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3": ["e7e5", "c7c5", "g8f6"],
    "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -": ["d7d5", "g8f6", "c7c5"],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": ["e4d5"],
    "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": ["e5d4"]
}

OPENING_BOOK = dict(DEFAULT_OPENING_BOOK)
_book_json_path = os.path.join(os.path.dirname(__file__), 'generated_book.json')
if os.path.exists(_book_json_path):
    try:
        with open(_book_json_path, 'r', encoding='utf-8') as _bf:
            _loaded = json.load(_bf)
            if isinstance(_loaded, dict) and len(_loaded) > 0:
                OPENING_BOOK = _loaded
    except Exception:
        pass

OPENING_BOOK_3PART = {}
for _k, _v in OPENING_BOOK.items():
    _kp = _k.split()
    if len(_kp) >= 3:
        _k3 = ' '.join(_kp[:3])
        if _k3 not in OPENING_BOOK_3PART:
            OPENING_BOOK_3PART[_k3] = _v

ENDGAME_TABLEBASE = {}

def create_onnx_session(model_path):
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.intra_op_num_threads = min(4, os.cpu_count() or 4)
    opts.inter_op_num_threads = 1
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return ort.InferenceSession(model_path, sess_options=opts, providers=['CPUExecutionProvider'])
# Complex and theoretical endgames are calculated dynamically by Alpha-Beta search.
# Elementary checkmates (K+Q vs K, K+R vs K) are solved by solve_elementary_endgame.

def uci_to_move(uci):
    fc = ord(uci[0]) - ord('a')
    fr = 8 - int(uci[1])
    tc = ord(uci[2]) - ord('a')
    tr = 8 - int(uci[3])
    promo = uci[4] if len(uci) > 4 else None
    return {
        'uci': uci,
        'fromR': fr, 'fromC': fc,
        'toR': tr, 'toC': tc,
        'promotion': promo,
        'score': 999.0,
        'policy': 1.0,
        'leafValue': 0.0,
        'isBook': True
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
    en_passant = parts[3] if len(parts) > 3 else '-'
    return board, turn, castling, en_passant

def board_to_tensor(board, turn, castling='-'):
    planes = np.zeros((16, 8, 8), dtype=np.float32)
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if p and p in PIECE_MAP:
                planes[PIECE_MAP[p], r, c] = 1.0
    if turn == 'w':
        planes[12, :, :] = 1.0
    if 'K' in castling:
        planes[13, 0:4, 0:4] = 1.0
    if 'Q' in castling:
        planes[13, 0:4, 4:8] = 1.0
    if 'k' in castling:
        planes[14, 4:8, 0:4] = 1.0
    if 'q' in castling:
        planes[14, 4:8, 4:8] = 1.0
    return planes

def simulate_move(board, f_r, f_c, t_r, t_c, promo=None):
    nb = [row[:] for row in board]
    p = nb[f_r][f_c]
    nb[f_r][f_c] = None
    if p == 'P' and t_r == 0:
        p = promo.upper() if promo else 'Q'
    elif p == 'p' and t_r == 7:
        p = promo.lower() if promo else 'q'
    nb[t_r][t_c] = p
    return nb

def is_passed_pawn(board, r, c, is_w):
    p = board[r][c]
    if not p or (p != ('P' if is_w else 'p')):
        return False
    opp_p = 'p' if is_w else 'P'
    files_to_check = [fc for fc in (c - 1, c, c + 1) if 0 <= fc < 8]
    if is_w:
        for check_r in range(0, r):
            for check_c in files_to_check:
                if board[check_r][check_c] == opp_p:
                    return False
    else:
        for check_r in range(r + 1, 8):
            for check_c in files_to_check:
                if board[check_r][check_c] == opp_p:
                    return False
    return True

def is_square_attacked(board, sq_r, sq_c, by_color):
    is_w = (by_color == 'w')
    p_char = 'P' if is_w else 'p'
    n_char = 'N' if is_w else 'n'
    b_chars = ('B', 'Q') if is_w else ('b', 'q')
    r_chars = ('R', 'Q') if is_w else ('r', 'q')
    k_char = 'K' if is_w else 'k'

    # Pawns
    p_source_dir = 1 if is_w else -1
    for dc in (-1, 1):
        nr, nc = sq_r + p_source_dir, sq_c + dc
        if 0 <= nr < 8 and 0 <= nc < 8 and board[nr][nc] == p_char:
            return True

    # Knights
    for dr, dc in ((-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)):
        nr, nc = sq_r + dr, sq_c + dc
        if 0 <= nr < 8 and 0 <= nc < 8 and board[nr][nc] == n_char:
            return True

    # Rooks & Queens
    for dr, dc in ((-1,0),(1,0),(0,-1),(0,1)):
        nr, nc = sq_r + dr, sq_c + dc
        while 0 <= nr < 8 and 0 <= nc < 8:
            p = board[nr][nc]
            if p:
                if p in r_chars: return True
                break
            nr += dr
            nc += dc

    # Bishops & Queens
    for dr, dc in ((-1,-1),(-1,1),(1,-1),(1,1)):
        nr, nc = sq_r + dr, sq_c + dc
        while 0 <= nr < 8 and 0 <= nc < 8:
            p = board[nr][nc]
            if p:
                if p in b_chars: return True
                break
            nr += dr
            nc += dc

    # King
    for dr in (-1,0,1):
        for dc in (-1,0,1):
            if dr == 0 and dc == 0: continue
            nr, nc = sq_r + dr, sq_c + dc
            if 0 <= nr < 8 and 0 <= nc < 8 and board[nr][nc] == k_char:
                return True

    return False

def is_king_in_check(board, turn):
    is_w = (turn == 'w')
    k_char = 'K' if is_w else 'k'
    kr, kc = -1, -1
    for r in range(8):
        for c in range(8):
            if board[r][c] == k_char:
                kr, kc = r, c
                break
        if kr != -1:
            break
    if kr == -1:
        return True
    return is_square_attacked(board, kr, kc, 'b' if is_w else 'w')

def evaluate_material(board):
    score = 0
    non_king_material = 0
    w_kr, w_kc = -1, -1
    b_kr, b_kc = -1, -1
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if p:
                val = PIECE_VALUES.get(p, 0)
                is_w = p.isupper()
                if p == 'K':
                    w_kr, w_kc = r, c
                elif p == 'k':
                    b_kr, b_kc = r, c
                else:
                    non_king_material += PIECE_ABS_VALUES.get(p, 0)
                # Positional advancement bonus for passed pawns
                if p.lower() == 'p' and is_passed_pawn(board, r, c, is_w):
                    adv = (7 - r) if is_w else r
                    if adv >= 3:
                        bonus = [0, 0, 0, 20, 50, 110, 250, 0][adv]
                        val += bonus if is_w else -bonus
                score += val

    # In endgame (non-king material <= 1600 cp), king centralization is crucial
    if non_king_material <= 1600:
        if w_kr != -1:
            w_center_dist = max(abs(w_kr - 3.5), abs(w_kc - 3.5))
            score += int((3.5 - w_center_dist) * 15)
        if b_kr != -1:
            b_center_dist = max(abs(b_kr - 3.5), abs(b_kc - 3.5))
            score -= int((3.5 - b_center_dist) * 15)

    return score

def is_endgame_position(board):
    non_king_mat = 0
    total_pieces = 0
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if p:
                total_pieces += 1
                if p.lower() != 'k':
                    non_king_mat += PIECE_ABS_VALUES.get(p, 0)
    return total_pieces <= 14 or non_king_mat <= 1600

def board_to_simple_key(board, turn):
    rows = []
    for r in range(8):
        empty = 0
        row_str = ''
        for c in range(8):
            p = board[r][c]
            if p is None:
                empty += 1
            else:
                if empty > 0:
                    row_str += str(empty)
                    empty = 0
                row_str += p
        if empty > 0:
            row_str += str(empty)
        rows.append(row_str)
    return '/'.join(rows) + ' ' + turn

def generate_captures(board, turn):
    is_w = (turn == 'w')
    captures = []
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if not p or (p.isupper() != is_w):
                continue
            ptype = p.lower()
            if ptype == 'p':
                p_dir = -1 if is_w else 1
                nr = r + p_dir
                # Promotion push to empty square
                if (nr == 0 or nr == 7) and 0 <= nr < 8 and board[nr][c] is None:
                    captures.append({'fr': r, 'fc': c, 'tr': nr, 'tc': c, 'victim_val': 800, 'mvv_lva': 8000})
                if 0 <= nr < 8:
                    for dc in [-1, 1]:
                        nc = c + dc
                        if 0 <= nc < 8:
                            tp = board[nr][nc]
                            if tp and (tp.isupper() != is_w):
                                v_val = PIECE_ABS_VALUES.get(tp, 0)
                                if nr == 0 or nr == 7:
                                    v_val += 800
                                a_val = PIECE_ABS_VALUES.get(p, 0)
                                captures.append({'fr': r, 'fc': c, 'tr': nr, 'tc': nc, 'victim_val': v_val, 'mvv_lva': v_val*10 - a_val})
            elif ptype == 'n':
                for dr, dc in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp and (tp.isupper() != is_w):
                            v_val = PIECE_ABS_VALUES.get(tp, 0)
                            a_val = PIECE_ABS_VALUES.get(p, 0)
                            captures.append({'fr': r, 'fc': c, 'tr': nr, 'tc': nc, 'victim_val': v_val, 'mvv_lva': v_val*10 - a_val})
            elif ptype in ('b', 'r', 'q'):
                dirs = []
                if ptype in ('b', 'q'):
                    dirs += [(-1,-1),(-1,1),(1,-1),(1,1)]
                if ptype in ('r', 'q'):
                    dirs += [(-1,0),(1,0),(0,-1),(0,1)]
                for dr, dc in dirs:
                    nr, nc = r + dr, c + dc
                    while 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp:
                            if tp.isupper() != is_w:
                                v_val = PIECE_ABS_VALUES.get(tp, 0)
                                a_val = PIECE_ABS_VALUES.get(p, 0)
                                captures.append({'fr': r, 'fc': c, 'tr': nr, 'tc': nc, 'victim_val': v_val, 'mvv_lva': v_val*10 - a_val})
                            break
                        nr += dr
                        nc += dc
            elif ptype == 'k':
                for dr in [-1, 0, 1]:
                    for dc in [-1, 0, 1]:
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 8 and 0 <= nc < 8:
                            tp = board[nr][nc]
                            if tp and (tp.isupper() != is_w):
                                v_val = PIECE_ABS_VALUES.get(tp, 0)
                                a_val = PIECE_ABS_VALUES.get(p, 0)
                                captures.append({'fr': r, 'fc': c, 'tr': nr, 'tc': nc, 'victim_val': v_val, 'mvv_lva': v_val*10 - a_val})
    return captures

def quiesce(board, turn, alpha, beta, depth=4):
    in_check = is_king_in_check(board, turn)
    persp = 1.0 if turn == 'w' else -1.0
    
    if not in_check:
        stand_pat = persp * evaluate_material(board)
        if stand_pat >= beta:
            return beta
        if stand_pat > alpha:
            alpha = stand_pat
    else:
        stand_pat = -9999.0

    if depth <= 0:
        if not in_check:
            return alpha
        depth = 1

    opp_turn = 'b' if turn == 'w' else 'w'

    if in_check:
        legal = get_legal_moves(board, turn)
        if not legal:
            return -10000.0
        scored_evasions = []
        for m in legal:
            fr, fc, tr, tc = m
            target = board[tr][tc]
            v_val = PIECE_ABS_VALUES.get(target, 0) if target else 0
            a_val = PIECE_ABS_VALUES.get(board[fr][fc], 0)
            scored_evasions.append((v_val * 10 - a_val, m))
        scored_evasions.sort(key=lambda x: x[0], reverse=True)
        for _, m in scored_evasions:
            nb = simulate_move(board, m[0], m[1], m[2], m[3])
            score = -quiesce(nb, opp_turn, -beta, -alpha, depth - 1)
            if score >= beta:
                return beta
            if score > alpha:
                alpha = score
        return alpha

    caps = generate_captures(board, turn)
    if not caps:
        return alpha
    caps.sort(key=lambda x: x['mvv_lva'], reverse=True)
    for c in caps:
        if stand_pat + c['victim_val'] + 200 < alpha:
            continue
        nb = simulate_move(board, c['fr'], c['fc'], c['tr'], c['tc'])
        if is_king_in_check(nb, turn):
            continue
        score = -quiesce(nb, opp_turn, -beta, -alpha, depth - 1)
        if score >= beta:
            return beta
        if score > alpha:
            alpha = score
    return alpha

def simulate_move_full(board, fr, fc, tr, tc, castling='-', en_passant='-', promo=None, return_ep=False):
    nb = [row[:] for row in board]
    p = nb[fr][fc]
    nb[fr][fc] = None

    new_ep = '-'
    if p and p.lower() == 'p':
        if tr == 0:
            p = promo.upper() if promo else 'Q'
        elif tr == 7:
            p = promo.lower() if promo else 'q'
        elif abs(tr - fr) == 2:
            new_ep = chr(ord('a') + fc) + str(8 - (fr + tr) // 2)
        elif en_passant != '-' and len(en_passant) == 2:
            ep_c = ord(en_passant[0]) - ord('a')
            ep_r = 8 - int(en_passant[1])
            if tr == ep_r and tc == ep_c and board[tr][tc] is None:
                nb[fr][tc] = None

    new_castling = castling
    if p == 'K':
        new_castling = new_castling.replace('K', '').replace('Q', '')
        if fc == 4 and tc == 6:
            nb[7][7] = None; nb[7][5] = 'R'
        elif fc == 4 and tc == 2:
            nb[7][0] = None; nb[7][3] = 'R'
    elif p == 'k':
        new_castling = new_castling.replace('k', '').replace('q', '')
        if fc == 4 and tc == 6:
            nb[0][7] = None; nb[0][5] = 'r'
        elif fc == 4 and tc == 2:
            nb[0][0] = None; nb[0][3] = 'r'

    # Rook moved: revoke castling rights for moved rook
    if fr == 7 and fc == 7: new_castling = new_castling.replace('K', '')
    if fr == 7 and fc == 0: new_castling = new_castling.replace('Q', '')
    if fr == 0 and fc == 7: new_castling = new_castling.replace('k', '')
    if fr == 0 and fc == 0: new_castling = new_castling.replace('q', '')

    # Rook captured: revoke castling rights for captured rook
    if tr == 7 and tc == 7: new_castling = new_castling.replace('K', '')
    if tr == 7 and tc == 0: new_castling = new_castling.replace('Q', '')
    if tr == 0 and tc == 7: new_castling = new_castling.replace('k', '')
    if tr == 0 and tc == 0: new_castling = new_castling.replace('q', '')
    if not new_castling: new_castling = '-'

    nb[tr][tc] = p
    if return_ep:
        return nb, new_castling, new_ep
    return nb, new_castling

def get_legal_moves(board, turn, castling='-', en_passant='-'):
    is_w = (turn == 'w')
    moves = []
    p_dir = -1 if is_w else 1
    start_rank = 6 if is_w else 1

    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if not p or (p.isupper() != is_w):
                continue
            ptype = p.lower()

            if ptype == 'p':
                nr = r + p_dir
                if 0 <= nr < 8 and board[nr][c] is None:
                    moves.append((r, c, nr, c))
                    if r == start_rank and board[r + 2*p_dir][c] is None:
                        moves.append((r, c, r + 2*p_dir, c))
                for dc in [-1, 1]:
                    nc = c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp and (tp.isupper() != is_w) and tp.lower() != 'k':
                            moves.append((r, c, nr, nc))

            elif ptype == 'n':
                for dr, dc in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if not tp or ((tp.isupper() != is_w) and tp.lower() != 'k'):
                            moves.append((r, c, nr, nc))

            elif ptype in ('b', 'r', 'q'):
                dirs = []
                if ptype in ('b', 'q'): dirs += [(-1,-1),(-1,1),(1,-1),(1,1)]
                if ptype in ('r', 'q'): dirs += [(-1,0),(1,0),(0,-1),(0,1)]
                for dr, dc in dirs:
                    nr, nc = r + dr, c + dc
                    while 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if not tp:
                            moves.append((r, c, nr, nc))
                        else:
                            if tp.isupper() != is_w and tp.lower() != 'k':
                                moves.append((r, c, nr, nc))
                            break
                        nr += dr
                        nc += dc

            elif ptype == 'k':
                for dr in [-1,0,1]:
                    for dc in [-1,0,1]:
                        if dr == 0 and dc == 0: continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 8 and 0 <= nc < 8:
                            tp = board[nr][nc]
                            if not tp or ((tp.isupper() != is_w) and tp.lower() != 'k'):
                                moves.append((r, c, nr, nc))

    # En Passant
    if en_passant != '-' and len(en_passant) == 2:
        ep_c = ord(en_passant[0]) - ord('a')
        ep_r = 8 - int(en_passant[1])
        if 0 <= ep_c < 8 and 0 <= ep_r < 8:
            if is_w and ep_r == 2:
                for dc in (-1, 1):
                    sc = ep_c + dc
                    if 0 <= sc < 8 and board[3][sc] == 'P':
                        moves.append((3, sc, 2, ep_c))
            elif (not is_w) and ep_r == 5:
                for dc in (-1, 1):
                    sc = ep_c + dc
                    if 0 <= sc < 8 and board[4][sc] == 'p':
                        moves.append((4, sc, 5, ep_c))

    # Castling (FIDE Rule 3.8.b: King cannot castle out of, through, or into check)
    if is_w:
        if 'K' in castling and board[7][4] == 'K' and board[7][7] == 'R':
            if board[7][5] is None and board[7][6] is None:
                if not is_square_attacked(board, 7, 4, 'b') and not is_square_attacked(board, 7, 5, 'b') and not is_square_attacked(board, 7, 6, 'b'):
                    moves.append((7, 4, 7, 6))
        if 'Q' in castling and board[7][4] == 'K' and board[7][0] == 'R':
            if board[7][1] is None and board[7][2] is None and board[7][3] is None:
                if not is_square_attacked(board, 7, 4, 'b') and not is_square_attacked(board, 7, 3, 'b') and not is_square_attacked(board, 7, 2, 'b'):
                    moves.append((7, 4, 7, 2))
    else:
        if 'k' in castling and board[0][4] == 'k' and board[0][7] == 'r':
            if board[0][5] is None and board[0][6] is None:
                if not is_square_attacked(board, 0, 4, 'w') and not is_square_attacked(board, 0, 5, 'w') and not is_square_attacked(board, 0, 6, 'w'):
                    moves.append((0, 4, 0, 6))
        if 'q' in castling and board[0][4] == 'k' and board[0][0] == 'r':
            if board[0][1] is None and board[0][2] is None and board[0][3] is None:
                if not is_square_attacked(board, 0, 4, 'w') and not is_square_attacked(board, 0, 3, 'w') and not is_square_attacked(board, 0, 2, 'w'):
                    moves.append((0, 4, 0, 2))

    # Filter checks
    legal = []
    for m in moves:
        promo = m[4] if len(m) > 4 else None
        nb, _ = simulate_move_full(board, m[0], m[1], m[2], m[3], castling, en_passant, promo)
        if not is_king_in_check(nb, turn):
            legal.append(m)
    return legal

def find_instant_mate(board, turn, castling='-'):
    opp_turn = 'b' if turn == 'w' else 'w'
    for m in get_legal_moves(board, turn, castling):
        nb, ncast = simulate_move_full(board, m[0], m[1], m[2], m[3], castling)
        if is_king_in_check(nb, opp_turn):
            opp_moves = get_legal_moves(nb, opp_turn, ncast)
            if len(opp_moves) == 0:
                return m
    return None

def find_mate_in_two(board, turn, castling='-'):
    """Finds a forcing mate-in-2 combination if one exists."""
    opp_turn = 'b' if turn == 'w' else 'w'
    for m in get_legal_moves(board, turn, castling):
        nb, ncast = simulate_move_full(board, m[0], m[1], m[2], m[3], castling)
        if not is_king_in_check(nb, opp_turn):
            continue
        opp_moves = get_legal_moves(nb, opp_turn, ncast)
        if not opp_moves:
            continue
        all_lead_to_mate = True
        for om in opp_moves:
            onb, oncast = simulate_move_full(nb, om[0], om[1], om[2], om[3], ncast)
            if not find_instant_mate(onb, turn, oncast):
                all_lead_to_mate = False
                break
        if all_lead_to_mate:
            return m
    return None

def get_cheapest_attacker(board, sq_r, sq_c, by_color):
    is_w = (by_color == 'w')
    p_char = 'P' if is_w else 'p'
    n_char = 'N' if is_w else 'n'
    b_chars = ('B', 'Q') if is_w else ('b', 'q')
    r_chars = ('R', 'Q') if is_w else ('r', 'q')
    k_char = 'K' if is_w else 'k'

    # Pawns
    p_source_dir = 1 if is_w else -1
    for dc in (-1, 1):
        nr, nc = sq_r + p_source_dir, sq_c + dc
        if 0 <= nr < 8 and 0 <= nc < 8 and board[nr][nc] == p_char:
            return 100

    # Knights
    for dr, dc in ((-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)):
        nr, nc = sq_r + dr, sq_c + dc
        if 0 <= nr < 8 and 0 <= nc < 8 and board[nr][nc] == n_char:
            return 300

    cheapest = 9999
    # Bishops & Queens
    for dr, dc in ((-1,-1),(-1,1),(1,-1),(1,1)):
        nr, nc = sq_r + dr, sq_c + dc
        while 0 <= nr < 8 and 0 <= nc < 8:
            p = board[nr][nc]
            if p:
                if p in b_chars:
                    val = 300 if p.lower() == 'b' else 900
                    cheapest = min(cheapest, val)
                break
            nr += dr
            nc += dc

    # Rooks & Queens
    for dr, dc in ((-1,0),(1,0),(0,-1),(0,1)):
        nr, nc = sq_r + dr, sq_c + dc
        while 0 <= nr < 8 and 0 <= nc < 8:
            p = board[nr][nc]
            if p:
                if p in r_chars:
                    val = 500 if p.lower() == 'r' else 900
                    cheapest = min(cheapest, val)
                break
            nr += dr
            nc += dc

    # King
    for dr in (-1,0,1):
        for dc in (-1,0,1):
            if dr == 0 and dc == 0: continue
            nr, nc = sq_r + dr, sq_c + dc
            if 0 <= nr < 8 and 0 <= nc < 8 and board[nr][nc] == k_char:
                cheapest = min(cheapest, 20000)

    return cheapest if cheapest < 9999 else None

def check_move_tactical_blunder(board, turn, m, castling='-', en_passant='-'):
    """
    Evaluates if candidate move m is a tactical blunder:
    - 'hanging_piece': moved piece is placed on attacked square without defense.
    - 'bad_trade': moved piece is placed on square where cheaper enemy piece captures it.
    - 'abandons_piece': moving m leaves an already-attacked friendly major/minor piece undefended.
    - 'skewer_fork': move allows forcing check that inescapably wins major/minor piece.
    """
    opp_turn = 'b' if turn == 'w' else 'w'
    fr, fc, tr, tc = m[0], m[1], m[2], m[3]
    p = board[fr][fc]
    if not p:
        return None
    p_val = PIECE_ABS_VALUES.get(p, 0)
    cap = board[tr][tc]
    cap_val = PIECE_ABS_VALUES.get(cap, 0) if cap else 0
    nb, ncast = simulate_move_full(board, fr, fc, tr, tc, castling, en_passant)

    # 1. Hanging piece & bad exchange check on the moved piece
    if p.lower() != 'k':
        cheap_enemy = get_cheapest_attacker(nb, tr, tc, opp_turn)
        if cheap_enemy is not None:
            is_def = is_square_attacked(nb, tr, tc, turn)
            if not is_def:
                net_loss = p_val - cap_val
                if net_loss > 150:
                    return 'hanging_piece'
            else:
                trade_loss = p_val - cheap_enemy - cap_val
                if trade_loss > 150:
                    return 'bad_trade'

    # 2. Abandoned piece check (did we unguard a major/minor piece?)
    is_w = (turn == 'w')
    for r in range(8):
        for c in range(8):
            if r == tr and c == tc:
                continue
            fp = nb[r][c]
            if fp and (fp.isupper() == is_w) and fp.lower() in ('q', 'r', 'b', 'n'):
                if is_square_attacked(nb, r, c, opp_turn) and not is_square_attacked(nb, r, c, turn):
                    if is_square_attacked(board, r, c, turn):
                        return 'abandons_piece'

    return None

def filter_mating_blunders(board, turn, legal_moves, castling='-', en_passant='-'):
    """Filters out moves that immediately allow opponent instant mate in 1."""
    if not legal_moves or len(legal_moves) <= 1:
        return legal_moves
    opp_turn = 'b' if turn == 'w' else 'w'
    non_mating = []
    for m in legal_moves:
        nb, ncast = simulate_move_full(board, m[0], m[1], m[2], m[3], castling, en_passant)
        if not find_instant_mate(nb, opp_turn, ncast):
            non_mating.append(m)
    return non_mating if len(non_mating) > 0 else legal_moves

def filter_tactical_blunders(board, turn, legal_moves, castling='-', en_passant='-'):
    """Filters out moves that immediately allow opponent instant mate, check-skewers, or hang pieces."""
    pool = filter_mating_blunders(board, turn, legal_moves, castling, en_passant)
    if len(pool) <= 1:
        return pool

    # Priority 2: Filter out moves that hang pieces, make bad trades, abandon pieces, or allow skewers/forks
    safe_moves = []
    for m in pool:
        blunder = check_move_tactical_blunder(board, turn, m, castling, en_passant)
        if blunder is None:
            safe_moves.append(m)

    return safe_moves if len(safe_moves) > 0 else pool

def is_elementary_mating_endgame(board, turn):
    is_w = (turn == 'w')
    my_queens = 0
    my_rooks = 0
    opp_pieces = 0
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if not p:
                continue
            if p.isupper() == is_w:
                if p.lower() == 'q':
                    my_queens += 1
                elif p.lower() == 'r':
                    my_rooks += 1
            else:
                if p.lower() != 'k':
                    opp_pieces += 1
    return (opp_pieces == 0) and (my_queens >= 1 or my_rooks >= 1)

def solve_elementary_endgame(board, turn, castling='-'):
    is_w = (turn == 'w')
    opp_turn = 'b' if is_w else 'w'

    im = find_instant_mate(board, turn, castling)
    if im:
        p = board[im[0]][im[1]]
        is_promo = p and p.lower() == 'p' and (im[2] == 0 or im[2] == 7)
        uci = chr(97 + im[1]) + str(8 - im[0]) + chr(97 + im[3]) + str(8 - im[2]) + ('q' if is_promo else '')
        return {
            'uci': uci,
            'fromR': im[0], 'fromC': im[1],
            'toR': im[2], 'toC': im[3],
            'promotion': 'q' if is_promo else None,
            'score': 10000.0,
            'policy': 1.0,
            'leafValue': 1.0,
            'isMate': True,
            'isEndgame': True
        }

    legal_moves = get_legal_moves(board, turn, castling)
    if not legal_moves:
        return None

    fk_char = 'K' if is_w else 'k'
    ok_char = 'k' if is_w else 'K'
    fk_r, fk_c = -1, -1
    ok_r, ok_c = -1, -1
    for r in range(8):
        for c in range(8):
            if board[r][c] == fk_char:
                fk_r, fk_c = r, c
            elif board[r][c] == ok_char:
                ok_r, ok_c = r, c

    best_score = -9999999
    best_move = None

    for m in legal_moves:
        fr, fc, tr, tc = m
        nb, ncast = simulate_move_full(board, fr, fc, tr, tc, castling)
        opp_moves = get_legal_moves(nb, opp_turn, ncast)

        # Stalemate prevention
        if len(opp_moves) == 0:
            if is_king_in_check(nb, opp_turn):
                p = board[fr][fc]
                is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
                uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
                return {
                    'uci': uci,
                    'fromR': fr, 'fromC': fc,
                    'toR': tr, 'toC': tc,
                    'promotion': 'q' if is_promo else None,
                    'score': 10000.0,
                    'policy': 1.0,
                    'leafValue': 1.0,
                    'isMate': True,
                    'isEndgame': True
                }
            else:
                continue

        # Prevent undefended hanging piece blunder
        p_moved = board[fr][fc]
        hanging = False
        if p_moved.lower() != 'k':
            for om in opp_moves:
                if om[2] == tr and om[3] == tc:
                    after_cap, _ = simulate_move_full(nb, om[0], om[1], tr, tc, ncast)
                    if not is_square_attacked(after_cap, tr, tc, turn):
                        hanging = True
                        break
        if hanging:
            continue

        new_fk_r = tr if (fr == fk_r and fc == fk_c) else fk_r
        new_fk_c = tc if (fr == fk_r and fc == fk_c) else fk_c

        edge_dist = min(ok_r, 7 - ok_r, ok_c, 7 - ok_c)
        edge_score = (3.5 - edge_dist) * 40.0
        k_dist = max(abs(new_fk_r - ok_r), abs(new_fk_c - ok_c))
        k_score = - (k_dist * 12.0)
        mob_score = - (len(opp_moves) * 4.0)
        check_bonus = 15.0 if is_king_in_check(nb, opp_turn) else 0.0

        total = edge_score + k_score + mob_score + check_bonus
        if total > best_score:
            best_score = total
            best_move = m

    if best_move:
        fr, fc, tr, tc = best_move
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return {
            'uci': uci,
            'fromR': fr, 'fromC': fc,
            'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'score': best_score,
            'policy': 1.0,
            'leafValue': 1.0,
            'isEndgame': True
        }
    return None

def get_endgame_move(board, turn, castling='-', fen=''):
    if fen:
        parts = fen.split()
        eg_key = ' '.join(parts[:4]) if len(parts) >= 4 else parts[0]
        if eg_key in ENDGAME_TABLEBASE:
            chosen = random.choice(ENDGAME_TABLEBASE[eg_key])
            res = uci_to_move(chosen)
            res['isEndgame'] = True
            return res
    if is_elementary_mating_endgame(board, turn):
        return solve_elementary_endgame(board, turn, castling)
    return None

DIRECTIONS_4672 = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
KNIGHT_MOVES_4672 = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]
UNDERPROMOS_4672 = ['n', 'b', 'r']

def uci_to_4672(uci: str):
    if not uci or len(uci) < 4:
        return None
    from_c = ord(uci[0]) - ord('a')
    from_r = 8 - int(uci[1])
    to_c = ord(uci[2]) - ord('a')
    to_r = 8 - int(uci[3])
    promo = uci[4].lower() if len(uci) > 4 else None

    from_sq = from_r * 8 + from_c
    dr = to_r - from_r
    dc = to_c - from_c

    if promo in UNDERPROMOS_4672:
        p_idx = UNDERPROMOS_4672.index(promo)
        p_dir = -1 if dc < 0 else (1 if dc > 0 else 0)
        dir_idx = p_dir + 1
        return from_sq * 73 + 64 + dir_idx * 3 + p_idx

    for k_idx, (k_dr, k_dc) in enumerate(KNIGHT_MOVES_4672):
        if dr == k_dr and dc == k_dc:
            return from_sq * 73 + 56 + k_idx

    for d_idx, (d_dr, d_dc) in enumerate(DIRECTIONS_4672):
        for dist in range(1, 8):
            if dr == d_dr * dist and dc == d_dc * dist:
                return from_sq * 73 + d_idx * 7 + (dist - 1)

    return None

def idx_4672_to_move(idx):
    if idx is None or idx < 0 or idx >= 4672:
        return None
    from_sq = idx // 73
    plane = idx % 73
    from_r = from_sq // 8
    from_c = from_sq % 8
    
    if plane < 56:
        d_idx = plane // 7
        dist = (plane % 7) + 1
        dr, dc = DIRECTIONS_4672[d_idx]
        to_r = from_r + dr * dist
        to_c = from_c + dc * dist
        if 0 <= to_r < 8 and 0 <= to_c < 8:
            promo = 'q' if (to_r == 0 or to_r == 7) and dist == 1 else None
            return from_r, from_c, to_r, to_c, promo
    elif plane < 64:
        k_idx = plane - 56
        dr, dc = KNIGHT_MOVES_4672[k_idx]
        to_r = from_r + dr
        to_c = from_c + dc
        if 0 <= to_r < 8 and 0 <= to_c < 8:
            return from_r, from_c, to_r, to_c, None
    else:
        u_idx = plane - 64
        dir_idx = u_idx // 3
        p_idx = u_idx % 3
        p_dir = dir_idx - 1
        to_c = from_c + p_dir
        to_r = 0 if from_r == 1 else (7 if from_r == 6 else -1)
        if 0 <= to_r < 8 and 0 <= to_c < 8:
            return from_r, from_c, to_r, to_c, UNDERPROMOS_4672[p_idx]
    return None

def decode_policy_idx(idx, pol_len):
    if pol_len == 4672:
        res = idx_4672_to_move(idx)
        if res is not None:
            return res[0], res[1], res[2], res[3], res[4]
    fsq, tsq = divmod(int(idx), 64)
    fr, fc = divmod(fsq, 8)
    tr, tc = divmod(tsq, 8)
    return fr, fc, tr, tc, None

def compute_priors(board, turn, legal_moves, raw_policy, history_set=None, root_val=0.0, last_own_key=None, is_root=True):
    is_w = (turn == 'w')
    opp_turn = 'b' if is_w else 'w'
    scores = []
    is_4672 = len(raw_policy) == 4672
    in_eg = is_endgame_position(board)
    for m in legal_moves:
        p = board[m[0]][m[1]]
        promo = m[4] if len(m) > 4 else None
        is_promo = p and p.lower() == 'p' and (m[2] == 0 or m[2] == 7)
        if is_4672:
            uci = chr(97 + m[1]) + str(8 - m[0]) + chr(97 + m[3]) + str(8 - m[2]) + (promo or ('q' if is_promo else ''))
            idx = uci_to_4672(uci)
            s = float(raw_policy[idx]) if (idx is not None and idx < 4672) else -999.0
        else:
            idx = (m[0] * 8 + m[1]) * 64 + (m[2] * 8 + m[3])
            s = float(raw_policy[idx]) if idx < 4096 else -999.0

        if is_root:
            if is_promo:
                nb_promo, ncast_promo = simulate_move_full(board, m[0], m[1], m[2], m[3])
                enemy_attack = is_square_attacked(nb_promo, m[2], m[3], opp_turn)
                friendly_defend = is_square_attacked(nb_promo, m[2], m[3], turn)
                if enemy_attack and not friendly_defend:
                    s -= 2.0
                else:
                    s += 1.5
            else:
                blunder_type = check_move_tactical_blunder(board, turn, m)
                if blunder_type == 'hanging_piece':
                    s -= 2.5
                elif blunder_type == 'bad_trade':
                    s -= 1.5
                elif blunder_type == 'abandons_piece':
                    s -= 2.0

            # Tactical capture bonus (gentle scaling)
            target = board[m[2]][m[3]]
            if target:
                v_val = PIECE_ABS_VALUES.get(target, 0)
                a_val = PIECE_ABS_VALUES.get(p, 0) if p else 0
                s += min(1.5, max(0.2, (v_val * 10 - a_val) / 500.0 + (v_val / 200.0)))

            # Safe passed pawn advancement boost
            if p and p.lower() == 'p' and is_passed_pawn(board, m[0], m[1], is_w):
                adv = (7 - m[2]) if is_w else m[2]
                if adv < 7:
                    adv_boost = [0.0, 0.0, 0.0, 0.3, 0.6, 1.0, 1.5, 0.0][adv]
                    s += adv_boost

            # Repetition penalty at root
            if history_set:
                nb_rep = simulate_move(board, m[0], m[1], m[2], m[3])
                dest_key = board_to_simple_key(nb_rep, opp_turn)
                if dest_key in history_set:
                    engine_eval = root_val if turn == 'w' else -root_val
                    is_osc = (last_own_key is not None and dest_key == last_own_key)
                    if in_eg:
                        s -= (3.0 if is_osc else 2.0)
                    else:
                        s -= (1.5 if engine_eval >= -0.15 else 0.8)
        else:
            # Internal tree nodes (MCTS/tree): clean neural logits + mild capture bonus
            target = board[m[2]][m[3]]
            if target:
                s += min(0.8, PIECE_ABS_VALUES.get(target, 0) / 1000.0)

        scores.append(s)

    max_s = max(scores) if scores else 0.0
    exp_s = [math.exp(min(50.0, s - max_s)) for s in scores]
    sum_exp = sum(exp_s) or 1.0
    return [e / sum_exp for e in exp_s]

def deep_search_5ply(session, fen, top_k1=14, top_k2=8, top_k3=4, top_k4=3, history=None):
    t0 = time.time()
    
    # 1. Opening book check (0ms)
    parts = fen.split()
    book_move = None
    if len(parts) >= 4:
        key_4 = ' '.join(parts[:4])
        if key_4 in OPENING_BOOK:
            book_move = random.choice(OPENING_BOOK[key_4])
    if not book_move and len(parts) >= 3:
        key_3 = ' '.join(parts[:3])
        if key_3 in OPENING_BOOK_3PART:
            book_move = random.choice(OPENING_BOOK_3PART[key_3])
    if not book_move and len(parts) >= 1:
        if parts[0] in OPENING_BOOK:
            book_move = random.choice(OPENING_BOOK[parts[0]])
    if book_move:
        move_obj = uci_to_move(book_move)
        return [move_obj], 0.0, 0.5

    # Build history set for repetition penalty
    history_set = set()
    history_counts = {}
    recent_keys = []
    if history:
        for h in history:
            if isinstance(h, str):
                hparts = h.split()
                if len(hparts) >= 2:
                    k = hparts[0] + ' ' + hparts[1]
                    history_set.add(k)
                    recent_keys.append(k)
                    history_counts[k] = history_counts.get(k, 0) + 1
                elif len(hparts) == 1:
                    history_set.add(hparts[0])
                    recent_keys.append(hparts[0])
                    history_counts[hparts[0]] = history_counts.get(hparts[0], 0) + 1
    last_own_key = recent_keys[-2] if len(recent_keys) >= 2 else None

    board, turn, castling, en_passant = fen_to_board(fen)
    persp = 1.0 if turn == 'w' else -1.0
    opp_turn = 'b' if turn == 'w' else 'w'

    # 1b. Theoretical Endgame Tablebase & Solver (0ms)
    eg_move = get_endgame_move(board, turn, castling, fen)
    if eg_move:
        return [eg_move], 1.0, (time.time() - t0) * 1000

    # Instant mate check
    instant_mate = find_instant_mate(board, turn, castling)
    if instant_mate:
        fr, fc, tr, tc = instant_mate[0], instant_mate[1], instant_mate[2], instant_mate[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return [{
            'uci': uci,
            'fromR': fr, 'fromC': fc,
            'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'score': 10000.0,
            'policy': 1.0,
            'leafValue': 1.0,
            'isMate': True
        }], 1.0, (time.time() - t0) * 1000

    # Mate-in-2 attack check
    mate_in_2 = find_mate_in_two(board, turn, castling)
    if mate_in_2:
        fr, fc, tr, tc = mate_in_2[0], mate_in_2[1], mate_in_2[2], mate_in_2[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return [{
            'uci': uci,
            'fromR': fr, 'fromC': fc,
            'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'score': 9000.0,
            'policy': 1.0,
            'leafValue': 1.0,
            'isMate': True
        }], 1.0, (time.time() - t0) * 1000

    # Filter out fatal blunder moves that immediately allow opponent instant mate
    legal_moves = get_legal_moves(board, turn, castling, en_passant)
    if not legal_moves:
        return [], 0.0, 0.0
    active_moves = filter_mating_blunders(board, turn, legal_moves, castling, en_passant)

    # Step 1: Root evaluation
    root_inp = board_to_tensor(board, turn, castling)[np.newaxis, ...]
    out = session.run(None, {'board_state': root_inp})
    policy = out[0][0]
    root_val = float(out[1][0, 0])

    priors = compute_priors(board, turn, active_moves, policy, history_set, root_val, last_own_key, is_root=True)
    scored_moves = []
    for i, m in enumerate(active_moves):
        scored_moves.append((m, priors[i]))
    scored_moves.sort(key=lambda x: x[1], reverse=True)
    top_moves = scored_moves[:top_k1]

    candidates = []
    p1_boards = []
    for m, p_score in top_moves:
        fr, fc, tr, tc = m[0], m[1], m[2], m[3]
        promo = m[4] if len(m) > 4 else None
        nb, ncast = simulate_move_full(board, fr, fc, tr, tc, castling, en_passant, promo)
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        candidates.append({'fr': fr, 'fc': fc, 'tr': tr, 'tc': tc, 'p_score': p_score, 'board': nb, 'castling': ncast, 'promotion': promo or ('q' if is_promo else None)})
        p1_boards.append(board_to_tensor(nb, opp_turn, ncast))

    if not candidates:
        return [], 0.0, 0.0

    # Step 2: Ply 2 - Opponent responses (Legal masked)
    out_p2 = session.run(None, {'board_state': np.stack(p1_boards, axis=0)})
    p2_policies = out_p2[0]

    p2_branches = []
    p2_tensors = []
    for i in range(len(candidates)):
        c_board = candidates[i]['board']
        c_cast = candidates[i]['castling']
        opp_legal = get_legal_moves(c_board, opp_turn, c_cast)
        if not opp_legal:
            p2_branches.append([])
            continue
        opp_pol = p2_policies[i]
        opp_len = len(opp_pol)
        is_4672 = (opp_len == 4672)
        scored_opp = []
        for om in opp_legal:
            p = c_board[om[0]][om[1]]
            is_promo = p and p.lower() == 'p' and (om[2] == 0 or om[2] == 7)
            if is_4672:
                uci = chr(97 + om[1]) + str(8 - om[0]) + chr(97 + om[3]) + str(8 - om[2]) + ('q' if is_promo else '')
                idx = uci_to_4672(uci)
                s = float(opp_pol[idx]) if (idx is not None and idx < 4672) else -999.0
            else:
                idx = (om[0] * 8 + om[1]) * 64 + (om[2] * 8 + om[3])
                s = float(opp_pol[idx]) if idx < 4096 else -999.0
            scored_opp.append((s, om))
        scored_opp.sort(key=lambda x: x[0], reverse=True)
        cand_branches = []
        for _, o_m in scored_opp[:top_k2]:
            o_fr, o_fc, o_tr, o_tc = o_m[0], o_m[1], o_m[2], o_m[3]
            o_promo = o_m[4] if len(o_m) > 4 else None
            o_nb, o_cast = simulate_move_full(c_board, o_fr, o_fc, o_tr, o_tc, c_cast, promo=o_promo)
            cand_branches.append({'board': o_nb, 'castling': o_cast, 'fr': o_fr, 'fc': o_fc, 'tr': o_tr, 'tc': o_tc})
            p2_tensors.append(board_to_tensor(o_nb, turn, o_cast))
        p2_branches.append(cand_branches)

    # Step 3: Ply 3 - Our counter-moves (Legal masked)
    if p2_tensors:
        out_p3 = session.run(None, {'board_state': np.stack(p2_tensors, axis=0)})
        p3_policies = out_p3[0]
    else:
        p3_policies = []

    p3_branches = []
    p3_tensors = []
    tensor_idx = 0
    for i in range(len(candidates)):
        cand_list = []
        for b_idx in range(len(p2_branches[i])):
            b_board = p2_branches[i][b_idx]['board']
            b_cast = p2_branches[i][b_idx]['castling']
            our_legal = get_legal_moves(b_board, turn, b_cast)
            if not our_legal:
                cand_list.append([])
                tensor_idx += 1
                continue
            our_pol = p3_policies[tensor_idx]
            our_len = len(our_pol)
            is_4672 = (our_len == 4672)
            tensor_idx += 1
            scored_our = []
            for cm in our_legal:
                p = b_board[cm[0]][cm[1]]
                is_promo = p and p.lower() == 'p' and (cm[2] == 0 or cm[2] == 7)
                if is_4672:
                    uci = chr(97 + cm[1]) + str(8 - cm[0]) + chr(97 + cm[3]) + str(8 - cm[2]) + ('q' if is_promo else '')
                    idx = uci_to_4672(uci)
                    s = float(our_pol[idx]) if (idx is not None and idx < 4672) else -999.0
                else:
                    idx = (cm[0] * 8 + cm[1]) * 64 + (cm[2] * 8 + cm[3])
                    s = float(our_pol[idx]) if idx < 4096 else -999.0
                scored_our.append((s, cm))
            scored_our.sort(key=lambda x: x[0], reverse=True)
            counter_list = []
            for _, c_m in scored_our[:top_k3]:
                c_fr, c_fc, c_tr, c_tc = c_m[0], c_m[1], c_m[2], c_m[3]
                c_promo = c_m[4] if len(c_m) > 4 else None
                c_nb, c_cast = simulate_move_full(b_board, c_fr, c_fc, c_tr, c_tc, b_cast, promo=c_promo)
                counter_list.append({'board': c_nb, 'castling': c_cast, 'fr': c_fr, 'fc': c_fc, 'tr': c_tr, 'tc': c_tc})
                p3_tensors.append(board_to_tensor(c_nb, opp_turn, c_cast))
            cand_list.append(counter_list)
        p3_branches.append(cand_list)

    # Step 4: Ply 4 - Opponent replies to counter-moves (Legal masked)
    if p3_tensors:
        out_p4 = session.run(None, {'board_state': np.stack(p3_tensors, axis=0)})
        p4_policies = out_p4[0]
    else:
        p4_policies = []

    p5_tensors = []
    p5_map = []
    tensor_idx = 0
    for i in range(len(candidates)):
        for b_idx in range(len(p2_branches[i])):
            for c_idx in range(len(p3_branches[i][b_idx])):
                b4_board = p3_branches[i][b_idx][c_idx]['board']
                b4_cast = p3_branches[i][b_idx][c_idx]['castling']
                opp2_legal = get_legal_moves(b4_board, opp_turn, b4_cast)
                if not opp2_legal:
                    tensor_idx += 1
                    continue
                opp2_pol = p4_policies[tensor_idx]
                opp2_len = len(opp2_pol)
                is_4672 = (opp2_len == 4672)
                tensor_idx += 1
                scored_opp2 = []
                for o2m in opp2_legal:
                    p = b4_board[o2m[0]][o2m[1]]
                    is_promo = p and p.lower() == 'p' and (o2m[2] == 0 or o2m[2] == 7)
                    if is_4672:
                        uci = chr(97 + o2m[1]) + str(8 - o2m[0]) + chr(97 + o2m[3]) + str(8 - o2m[2]) + ('q' if is_promo else '')
                        idx = uci_to_4672(uci)
                        s = float(opp2_pol[idx]) if (idx is not None and idx < 4672) else -999.0
                    else:
                        idx = (o2m[0] * 8 + o2m[1]) * 64 + (o2m[2] * 8 + o2m[3])
                        s = float(opp2_pol[idx]) if idx < 4096 else -999.0
                    scored_opp2.append((s, o2m))
                scored_opp2.sort(key=lambda x: x[0], reverse=True)
                for _, o2_m in scored_opp2[:top_k4]:
                    o2_fr, o2_fc, o2_tr, o2_tc = o2_m[0], o2_m[1], o2_m[2], o2_m[3]
                    o2_promo = o2_m[4] if len(o2_m) > 4 else None
                    o2_nb, o2_cast = simulate_move_full(b4_board, o2_fr, o2_fc, o2_tr, o2_tc, b4_cast, promo=o2_promo)
                    p5_tensors.append(board_to_tensor(o2_nb, turn, o2_cast))
                    p5_map.append({'cand_i': i, 'b_idx': b_idx, 'c_idx': c_idx, 'board': o2_nb})

    # Step 5: Ply 5 - Leaf evaluation of all positions (Batched)
    if p5_tensors:
        out_p5 = session.run(None, {'board_state': np.stack(p5_tensors, axis=0)})
        p5_values = out_p5[1]
    else:
        p5_values = []

    # Quiescence Search on leaves + 5-Ply Minimax backpropagation
    tree = {i: {b_idx: {c_idx: [] for c_idx in range(len(p3_branches[i][b_idx]))} for b_idx in range(len(p2_branches[i]))} for i in range(len(candidates))}
    for leaf_idx, item in enumerate(p5_map):
        neural_v = float(p5_values[leaf_idx][0])
        q_cp = quiesce(item['board'], turn, -10000, 10000, depth=4)
        q_eval = float(np.tanh(q_cp / 400.0))
        # Fixed: q_eval already accounts for player turn perspective
        leaf_score = (0.65 * (persp * neural_v)) + (0.35 * q_eval)
        tree[item['cand_i']][item['b_idx']][item['c_idx']].append(leaf_score)

    results = []
    for i, c in enumerate(candidates):
        if not tree[i]:
            worst_b_score = 10.0 if is_king_in_check(c['board'], opp_turn) else 0.0
        else:
            worst_b_score = 9999.0
            for b_idx in tree[i]:
                if not tree[i][b_idx]:
                    best_counter_score = -10.0 if is_king_in_check(p2_branches[i][b_idx]['board'], turn) else 0.0
                else:
                    best_counter_score = -9999.0
                    for c_idx in tree[i][b_idx]:
                        leaf_scores = tree[i][b_idx][c_idx]
                        if not leaf_scores:
                            c_board_p3 = p3_branches[i][b_idx][c_idx]['board']
                            worst_leaf_score = 10.0 if is_king_in_check(c_board_p3, opp_turn) else 0.0
                        else:
                            worst_leaf_score = min(leaf_scores)
                        if worst_leaf_score > best_counter_score:
                            best_counter_score = worst_leaf_score
                if best_counter_score < worst_b_score:
                    worst_b_score = best_counter_score

        p = board[c['fr']][c['fc']]
        is_promo = p and p.lower() == 'p' and (c['tr'] == 0 or c['tr'] == 7)
        uci = chr(97 + c['fc']) + str(8 - c['fr']) + chr(97 + c['tc']) + str(8 - c['tr']) + ('q' if is_promo else '')
        
        dest_key = board_to_simple_key(c['board'], opp_turn)
        rep_penalty = 0.0
        if history_set and dest_key in history_set:
            in_eg = is_endgame_position(c['board'])
            rep_count = history_counts.get(dest_key, 0)
            is_osc = (last_own_key is not None and dest_key == last_own_key)
            if in_eg:
                rep_penalty = 3.0 if (rep_count >= 2 or is_osc) else 2.0
            else:
                if (persp * root_val) >= -0.15:
                    rep_penalty = 0.40

        total_score = worst_b_score + 0.08 * c['p_score'] - rep_penalty
        results.append({
            'uci': uci,
            'fromR': c['fr'], 'fromC': c['fc'],
            'toR': c['tr'], 'toC': c['tc'],
            'promotion': 'q' if is_promo else None,
            'score': total_score,
            'minimaxVal': worst_b_score,
            'policy': c['p_score']
        })

    results.sort(key=lambda x: x['score'], reverse=True)
    dt = (time.time() - t0) * 1000
    return results, root_val, dt

# 1. Precompute MOVE_TO_4672_NORMAL table: [fr][fc][tr][tc] -> index
MOVE_TO_4672_NORMAL = [[[[None for _ in range(8)] for _ in range(8)] for _ in range(8)] for _ in range(8)]
for fr in range(8):
    for fc in range(8):
        for tr in range(8):
            for tc in range(8):
                uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr)
                MOVE_TO_4672_NORMAL[fr][fc][tr][tc] = uci_to_4672(uci)

# 2. Zobrist Hashing tables
_z_rng = random.Random(0x4D6F64756C6172)
ZOBRIST_PIECES = {
    p: [[_z_rng.getrandbits(64) for _ in range(8)] for _ in range(8)]
    for p in ('P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k')
}
ZOBRIST_TURN = _z_rng.getrandbits(64)
ZOBRIST_CASTLING = [_z_rng.getrandbits(64) for _ in range(16)]
ZOBRIST_EP = [_z_rng.getrandbits(64) for _ in range(9)] # 0..7 files, 8 for no EP

def castling_to_mask(castling_str):
    mask = 0
    if 'K' in castling_str: mask |= 1
    if 'Q' in castling_str: mask |= 2
    if 'k' in castling_str: mask |= 4
    if 'q' in castling_str: mask |= 8
    return mask

def mask_to_castling(mask):
    s = ''
    if mask & 1: s += 'K'
    if mask & 2: s += 'Q'
    if mask & 4: s += 'k'
    if mask & 8: s += 'q'
    return s if s else '-'

def ep_to_col(ep_str):
    if ep_str and ep_str != '-' and len(ep_str) == 2:
        return ord(ep_str[0]) - ord('a')
    return -1

def compute_zobrist(board, turn, cast_mask, ep_col):
    h = 0
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if p:
                h ^= ZOBRIST_PIECES[p][r][c]
    if turn == 'b':
        h ^= ZOBRIST_TURN
    h ^= ZOBRIST_CASTLING[cast_mask]
    h ^= ZOBRIST_EP[ep_col if 0 <= ep_col < 8 else 8]
    return h

def init_board_metadata(board):
    mat_score = 0
    non_king_mat = 0
    w_kpos = (-1, -1)
    b_kpos = (-1, -1)
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if p:
                val = PIECE_VALUES.get(p, 0)
                mat_score += val
                if p == 'K':
                    w_kpos = (r, c)
                elif p == 'k':
                    b_kpos = (r, c)
                else:
                    non_king_mat += PIECE_ABS_VALUES.get(p, 0)
    return mat_score, non_king_mat, w_kpos, b_kpos

def make_move(board, fr, fc, tr, tc, promo, cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash):
    piece = board[fr][fc]
    captured = board[tr][tc]
    is_w = piece.isupper()
    is_ep = False
    is_castle = False
    new_w_kpos = w_kpos
    new_b_kpos = b_kpos
    new_cast_mask = cast_mask
    new_ep_col = -1
    new_mat = mat_score
    new_nkm = non_king_mat
    new_hash = z_hash

    # 1. Remove from source
    board[fr][fc] = None
    new_hash ^= ZOBRIST_PIECES[piece][fr][fc]

    # 2. Check En Passant
    if piece.lower() == 'p' and fc != tc and captured is None:
        is_ep = True
        captured = board[fr][tc]
        board[fr][tc] = None
        new_hash ^= ZOBRIST_PIECES[captured][fr][tc]
        if is_w:
            new_mat += 100
        else:
            new_mat -= 100
        new_nkm -= 100
    elif captured:
        new_hash ^= ZOBRIST_PIECES[captured][tr][tc]
        c_val = PIECE_VALUES.get(captured, 0)
        c_abs = PIECE_ABS_VALUES.get(captured, 0)
        new_mat -= c_val
        if captured.lower() != 'k':
            new_nkm -= c_abs

    # 3. Promotion
    final_piece = piece
    if piece == 'P' and tr == 0:
        final_piece = promo.upper() if promo else 'Q'
        promo_diff = PIECE_VALUES[final_piece] - 100
        new_mat += promo_diff
        new_nkm += PIECE_ABS_VALUES[final_piece]
    elif piece == 'p' and tr == 7:
        final_piece = promo.lower() if promo else 'q'
        promo_diff = PIECE_VALUES[final_piece] - (-100)
        new_mat += promo_diff
        new_nkm += PIECE_ABS_VALUES[final_piece]

    board[tr][tc] = final_piece
    new_hash ^= ZOBRIST_PIECES[final_piece][tr][tc]

    # 4. Castling execution
    if piece == 'K':
        new_w_kpos = (tr, tc)
        new_cast_mask &= ~3
        if fc == 4 and tc == 6:
            is_castle = True
            board[7][7] = None; board[7][5] = 'R'
            new_hash ^= ZOBRIST_PIECES['R'][7][7] ^ ZOBRIST_PIECES['R'][7][5]
        elif fc == 4 and tc == 2:
            is_castle = True
            board[7][0] = None; board[7][3] = 'R'
            new_hash ^= ZOBRIST_PIECES['R'][7][0] ^ ZOBRIST_PIECES['R'][7][3]
    elif piece == 'k':
        new_b_kpos = (tr, tc)
        new_cast_mask &= ~12
        if fc == 4 and tc == 6:
            is_castle = True
            board[0][7] = None; board[0][5] = 'r'
            new_hash ^= ZOBRIST_PIECES['r'][0][7] ^ ZOBRIST_PIECES['r'][0][5]
        elif fc == 4 and tc == 2:
            is_castle = True
            board[0][0] = None; board[0][3] = 'r'
            new_hash ^= ZOBRIST_PIECES['r'][0][0] ^ ZOBRIST_PIECES['r'][0][3]

    # 5. Revoke castling rights
    if fr == 7 and fc == 7: new_cast_mask &= ~1
    elif fr == 7 and fc == 0: new_cast_mask &= ~2
    elif fr == 0 and fc == 7: new_cast_mask &= ~4
    elif fr == 0 and fc == 0: new_cast_mask &= ~8

    if tr == 7 and tc == 7: new_cast_mask &= ~1
    elif tr == 7 and tc == 0: new_cast_mask &= ~2
    elif tr == 0 and tc == 7: new_cast_mask &= ~4
    elif tr == 0 and tc == 0: new_cast_mask &= ~8

    # 6. Double pawn push sets en passant col
    if piece.lower() == 'p' and abs(tr - fr) == 2:
        new_ep_col = fc

    # 7. Update castling and EP in hash
    if new_cast_mask != cast_mask:
        new_hash ^= ZOBRIST_CASTLING[cast_mask] ^ ZOBRIST_CASTLING[new_cast_mask]
    if new_ep_col != ep_col:
        old_ep_idx = ep_col if 0 <= ep_col < 8 else 8
        new_ep_idx = new_ep_col if 0 <= new_ep_col < 8 else 8
        new_hash ^= ZOBRIST_EP[old_ep_idx] ^ ZOBRIST_EP[new_ep_idx]

    new_hash ^= ZOBRIST_TURN

    undo_info = (piece, captured, promo, cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash, is_ep, is_castle)
    return new_cast_mask, new_ep_col, new_w_kpos, new_b_kpos, new_mat, new_nkm, new_hash, undo_info

def unmake_move(board, fr, fc, tr, tc, undo_info):
    piece, captured, promo, cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash, is_ep, is_castle = undo_info

    board[fr][fc] = piece
    board[tr][tc] = None

    if is_ep:
        board[fr][tc] = captured
    elif captured:
        board[tr][tc] = captured

    if is_castle:
        if piece == 'K':
            if tc == 6:
                board[7][5] = None; board[7][7] = 'R'
            elif tc == 2:
                board[7][3] = None; board[7][0] = 'R'
        elif piece == 'k':
            if tc == 6:
                board[0][5] = None; board[0][7] = 'r'
            elif tc == 2:
                board[0][3] = None; board[0][0] = 'r'

    return cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash

def generate_pseudo_legal_moves(board, turn, cast_mask, ep_col):
    is_w = (turn == 'w')
    moves = []
    p_dir = -1 if is_w else 1
    start_rank = 6 if is_w else 1
    promo_rank = 0 if is_w else 7

    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if not p or (p.isupper() != is_w):
                continue
            ptype = p.lower()

            if ptype == 'p':
                nr = r + p_dir
                if 0 <= nr < 8 and board[nr][c] is None:
                    if nr == promo_rank:
                        moves.append((r, c, nr, c, 'q'))
                    else:
                        moves.append((r, c, nr, c, None))
                        if r == start_rank and board[r + 2 * p_dir][c] is None:
                            moves.append((r, c, r + 2 * p_dir, c, None))
                for dc in (-1, 1):
                    nc = c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp and (tp.isupper() != is_w) and tp.lower() != 'k':
                            if nr == promo_rank:
                                moves.append((r, c, nr, nc, 'q'))
                            else:
                                moves.append((r, c, nr, nc, None))
                        elif ep_col == nc and ((is_w and r == 3 and nr == 2) or (not is_w and r == 4 and nr == 5)):
                            moves.append((r, c, nr, nc, None))

            elif ptype == 'n':
                for dr, dc in ((-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if not tp or ((tp.isupper() != is_w) and tp.lower() != 'k'):
                            moves.append((r, c, nr, nc, None))

            elif ptype in ('b', 'r', 'q'):
                dirs = []
                if ptype in ('b', 'q'): dirs += [(-1,-1),(-1,1),(1,-1),(1,1)]
                if ptype in ('r', 'q'): dirs += [(-1,0),(1,0),(0,-1),(0,1)]
                for dr, dc in dirs:
                    nr, nc = r + dr, c + dc
                    while 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if not tp:
                            moves.append((r, c, nr, nc, None))
                        else:
                            if tp.isupper() != is_w and tp.lower() != 'k':
                                moves.append((r, c, nr, nc, None))
                            break
                        nr += dr
                        nc += dc

            elif ptype == 'k':
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        if dr == 0 and dc == 0: continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 8 and 0 <= nc < 8:
                            tp = board[nr][nc]
                            if not tp or ((tp.isupper() != is_w) and tp.lower() != 'k'):
                                moves.append((r, c, nr, nc, None))

    # Castling
    if is_w:
        if (cast_mask & 1) and board[7][4] == 'K' and board[7][7] == 'R':
            if board[7][5] is None and board[7][6] is None:
                if not is_square_attacked(board, 7, 4, 'b') and not is_square_attacked(board, 7, 5, 'b') and not is_square_attacked(board, 7, 6, 'b'):
                    moves.append((7, 4, 7, 6, None))
        if (cast_mask & 2) and board[7][4] == 'K' and board[7][0] == 'R':
            if board[7][1] is None and board[7][2] is None and board[7][3] is None:
                if not is_square_attacked(board, 7, 4, 'b') and not is_square_attacked(board, 7, 3, 'b') and not is_square_attacked(board, 7, 2, 'b'):
                    moves.append((7, 4, 7, 2, None))
    else:
        if (cast_mask & 4) and board[0][4] == 'k' and board[0][7] == 'r':
            if board[0][5] is None and board[0][6] is None:
                if not is_square_attacked(board, 0, 4, 'w') and not is_square_attacked(board, 0, 5, 'w') and not is_square_attacked(board, 0, 6, 'w'):
                    moves.append((0, 4, 0, 6, None))
        if (cast_mask & 8) and board[0][4] == 'k' and board[0][0] == 'r':
            if board[0][1] is None and board[0][2] is None and board[0][3] is None:
                if not is_square_attacked(board, 0, 4, 'w') and not is_square_attacked(board, 0, 3, 'w') and not is_square_attacked(board, 0, 2, 'w'):
                    moves.append((0, 4, 0, 2, None))

    return moves

def generate_captures_fast(board, turn, ep_col):
    is_w = (turn == 'w')
    p_dir = -1 if is_w else 1
    promo_rank = 0 if is_w else 7
    caps = []

    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if not p or (p.isupper() != is_w):
                continue
            ptype = p.lower()
            a_val = PIECE_ABS_VALUES.get(p, 0)

            if ptype == 'p':
                nr = r + p_dir
                for dc in (-1, 1):
                    nc = c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp and (tp.isupper() != is_w) and tp.lower() != 'k':
                            v_val = PIECE_ABS_VALUES.get(tp, 0)
                            if nr == promo_rank: v_val += 800
                            caps.append((v_val * 10 - a_val, v_val, r, c, nr, nc, 'q' if nr == promo_rank else None))
                        elif ep_col == nc and ((is_w and r == 3 and nr == 2) or (not is_w and r == 4 and nr == 5)):
                            caps.append((100 * 10 - a_val, 100, r, c, nr, nc, None))

            elif ptype == 'n':
                for dr, dc in ((-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp and (tp.isupper() != is_w) and tp.lower() != 'k':
                            v_val = PIECE_ABS_VALUES.get(tp, 0)
                            caps.append((v_val * 10 - a_val, v_val, r, c, nr, nc, None))

            elif ptype in ('b', 'r', 'q'):
                dirs = []
                if ptype in ('b', 'q'): dirs += [(-1,-1),(-1,1),(1,-1),(1,1)]
                if ptype in ('r', 'q'): dirs += [(-1,0),(1,0),(0,-1),(0,1)]
                for dr, dc in dirs:
                    nr, nc = r + dr, c + dc
                    while 0 <= nr < 8 and 0 <= nc < 8:
                        tp = board[nr][nc]
                        if tp:
                            if (tp.isupper() != is_w) and tp.lower() != 'k':
                                v_val = PIECE_ABS_VALUES.get(tp, 0)
                                caps.append((v_val * 10 - a_val, v_val, r, c, nr, nc, None))
                            break
                        nr += dr
                        nc += dc

            elif ptype == 'k':
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        if dr == 0 and dc == 0: continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 8 and 0 <= nc < 8:
                            tp = board[nr][nc]
                            if tp and (tp.isupper() != is_w) and tp.lower() != 'k':
                                v_val = PIECE_ABS_VALUES.get(tp, 0)
                                caps.append((v_val * 10 - a_val, v_val, r, c, nr, nc, None))

    return caps

# 1. Precomputed LMR table [depth][move_idx]
MAX_LMR_DEPTH = 64
MAX_LMR_MOVES = 128
LMR_TABLE = [[0 for _ in range(MAX_LMR_MOVES)] for _ in range(MAX_LMR_DEPTH)]
for d in range(1, MAX_LMR_DEPTH):
    for m in range(1, MAX_LMR_MOVES):
        if d >= 2 and m >= 2:
            LMR_TABLE[d][m] = max(1, int(0.5 + math.log(d) * math.log(m) * 0.35))

# 2. Fixed-size Transposition Table with depth-preferred replacement & aging
TT_FLAG_NONE = 0
TT_FLAG_EXACT = 1
TT_FLAG_LOWER = 2  # Fail-high (beta cutoff)
TT_FLAG_UPPER = 3  # Fail-low (alpha cutoff)

class TranspositionTable:
    def __init__(self, size_power=16):
        self.size = 1 << size_power
        self.mask = self.size - 1
        self.keys = [0] * self.size
        self.turns = [None] * self.size
        self.depths = [-1] * self.size
        self.scores = [0.0] * self.size
        self.flags = [TT_FLAG_NONE] * self.size
        self.moves = [None] * self.size
        self.ages = [0] * self.size
        self.current_age = 0

    def new_search(self):
        self.current_age += 1

    def probe(self, z_hash, c_turn):
        idx = z_hash & self.mask
        if self.keys[idx] == z_hash and self.turns[idx] == c_turn:
            return True, self.depths[idx], self.scores[idx], self.flags[idx], self.moves[idx]
        return False, -1, 0.0, TT_FLAG_NONE, None

    def store(self, z_hash, depth, score, flag, best_move, c_turn):
        idx = z_hash & self.mask
        curr_key = self.keys[idx]
        if curr_key == 0 or curr_key == z_hash or self.depths[idx] <= depth or self.ages[idx] < self.current_age:
            self.keys[idx] = z_hash
            self.turns[idx] = c_turn
            self.depths[idx] = depth
            self.scores[idx] = score
            self.flags[idx] = flag
            if best_move is not None or curr_key != z_hash:
                self.moves[idx] = best_move
            self.ages[idx] = self.current_age

# Global TT instance across iterative deepening
GLOBAL_TT = TranspositionTable(size_power=16)

def alphabeta_search(session, fen, max_depth=6, time_limit_ms=4000, history=None):
    t0 = time.time()
    
    # 1. Opening book check (0ms)
    parts = fen.split()
    book_key = ' '.join(parts[:4]) if len(parts) >= 4 else parts[0]
    if book_key in OPENING_BOOK:
        chosen = random.choice(OPENING_BOOK[book_key])
        move_obj = uci_to_move(chosen)
        return [move_obj], 0.0, 0.5

    board, turn, castling, en_passant = fen_to_board(fen)

    # 1b. Theoretical Endgame Tablebase & Solver (0ms)
    eg_move = get_endgame_move(board, turn, castling, fen)
    if eg_move:
        eg_move['score'] = 10000.0
        return [eg_move], 1.0, (time.time() - t0) * 1000

    legal_moves = get_legal_moves(board, turn, castling, en_passant)
    if not legal_moves:
        return [], 0.0, 0.0

    # 2. Instant checkmate attack check
    instant_mate = find_instant_mate(board, turn, castling)
    if instant_mate:
        fr, fc, tr, tc = instant_mate[0], instant_mate[1], instant_mate[2], instant_mate[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return [{
            'uci': uci, 'fromR': fr, 'fromC': fc, 'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'score': 10000.0, 'isMate': True
        }], 1.0, (time.time() - t0) * 1000

    # 3. Forcing Checkmate-in-2 attack check
    mate_in_2 = find_mate_in_two(board, turn, castling)
    if mate_in_2:
        fr, fc, tr, tc = mate_in_2[0], mate_in_2[1], mate_in_2[2], mate_in_2[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return [{
            'uci': uci, 'fromR': fr, 'fromC': fc, 'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'score': 9000.0, 'isMate': True
        }], 1.0, (time.time() - t0) * 1000

    history_hashes = set()
    history_set = set()
    last_own_key = None
    if history:
        recent_keys = []
        for h in history:
            if isinstance(h, str):
                hparts = h.split()
                if len(hparts) >= 2:
                    k = hparts[0] + ' ' + hparts[1]
                    history_set.add(k)
                    recent_keys.append(k)
                elif len(hparts) == 1:
                    history_set.add(hparts[0])
                    recent_keys.append(hparts[0])
                if len(hparts) >= 4:
                    hb, ht, hc, he = fen_to_board(h)
                    history_hashes.add(compute_zobrist(hb, ht, castling_to_mask(hc), ep_to_col(he)))
        last_own_key = recent_keys[-2] if len(recent_keys) >= 2 else None

    # Filter out fatal mate blunders at root
    active_moves = filter_mating_blunders(board, turn, legal_moves, castling, en_passant)
    if len(active_moves) == 1:
        m = active_moves[0]
        p = board[m[0]][m[1]]
        is_promo = p and p.lower() == 'p' and (m[2] == 0 or m[2] == 7)
        uci = chr(97 + m[1]) + str(8 - m[0]) + chr(97 + m[3]) + str(8 - m[2]) + ('q' if is_promo else '')
        return [{
            'uci': uci, 'fromR': m[0], 'fromC': m[1], 'toR': m[2], 'toC': m[3],
            'promotion': 'q' if is_promo else None, 'score': 1.0
        }], 0.0, (time.time() - t0) * 1000

    # Root metadata & Zobrist
    cast_mask_root = castling_to_mask(castling)
    ep_col_root = ep_to_col(en_passant)
    mat_score_root, non_king_mat_root, w_kpos_root, b_kpos_root = init_board_metadata(board)
    z_hash_root = compute_zobrist(board, turn, cast_mask_root, ep_col_root)
    history_hashes.add(z_hash_root)
    path_hashes = set(history_hashes)

    # Root neural evaluation
    inp = board_to_tensor(board, turn, castling)[np.newaxis, ...]
    out = session.run(None, {'board_state': inp})
    root_pol = out[0][0]
    root_val = float(out[1][0, 0])
    root_priors = compute_priors(board, turn, active_moves, root_pol, history_set, root_val, last_own_key, is_root=True)

    eval_cache = {}    # z_hash -> scalar [-1.0, 1.0] from White perspective
    policy_cache = {}  # z_hash -> policy vector
    killer_moves = {}  # ply -> (m0, m1, m2, m3)
    history_table = {} # (m0, m1, m2, m3) -> heuristic cutoff score
    node_counter = [0]
    time_expired = [False]

    GLOBAL_TT.new_search()

    def get_neural_val(b, c_turn, c_cast_mask, z_h):
        if z_h in eval_cache:
            return eval_cache[z_h]
        c_cast_str = mask_to_castling(c_cast_mask)
        inp_tensor = board_to_tensor(b, c_turn, c_cast_str)[np.newaxis, ...]
        res = session.run(None, {'board_state': inp_tensor})
        pol = res[0][0]
        v = float(res[1][0, 0])
        eval_cache[z_h] = v
        policy_cache[z_h] = pol
        return v

    def batch_prefetch_leaves(leaf_tasks):
        """
        leaf_tasks: list of (b, c_turn, c_cast_mask, z_h)
        Evaluates up to 16 uncached positions in one batched session.run call.
        """
        uncached = [t for t in leaf_tasks if t[3] not in eval_cache]
        if not uncached:
            return
        # Take up to 16 positions
        uncached = uncached[:16]
        tensors = []
        for b, c_turn, c_cast_mask, _ in uncached:
            c_cast_str = mask_to_castling(c_cast_mask)
            tensors.append(board_to_tensor(b, c_turn, c_cast_str))
        batch = np.stack(tensors, axis=0)
        res = session.run(None, {'board_state': batch})
        pols = res[0]
        vals = res[1]
        for idx, (_, _, _, z_h) in enumerate(uncached):
            v = float(vals[idx, 0])
            eval_cache[z_h] = v
            policy_cache[z_h] = pols[idx]

    # Quiescence Search with ZERO board copies: returns (best_score, quiet_turn, quiet_cast_mask, quiet_z_hash, is_mate, best_line)
    def material_quiesce_leaf(cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash, c_turn, alpha=-100000, beta=100000, qdepth=3):
        my_kpos = w_kpos if c_turn == 'w' else b_kpos
        opp_turn = 'b' if c_turn == 'w' else 'w'
        in_check = is_square_attacked(board, my_kpos[0], my_kpos[1], opp_turn)

        if in_check:
            pseudo = generate_pseudo_legal_moves(board, c_turn, cast_mask, ep_col)
            scored_evasions = []
            for m in pseudo:
                target = board[m[2]][m[3]]
                v_val = PIECE_ABS_VALUES.get(target, 0) if target else 0
                a_val = PIECE_ABS_VALUES.get(board[m[0]][m[1]], 0) if board[m[0]][m[1]] else 0
                scored_evasions.append((v_val * 10 - a_val, m))
            scored_evasions.sort(key=lambda x: x[0], reverse=True)

            best_score = -200000
            best_leaf_info = (c_turn, cast_mask, z_hash, False, ())
            legal_evasions = 0

            for _, m in scored_evasions:
                new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, undo = make_move(
                    board, m[0], m[1], m[2], m[3], m[4] if len(m) > 4 else None,
                    cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash
                )
                chk_kpos = new_wk if c_turn == 'w' else new_bk
                if is_square_attacked(board, chk_kpos[0], chk_kpos[1], opp_turn):
                    unmake_move(board, m[0], m[1], m[2], m[3], undo)
                    continue

                legal_evasions += 1
                score, q_turn, q_cast_mask, q_z_hash, is_m, child_line = material_quiesce_leaf(
                    new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, opp_turn, -beta, -alpha, qdepth - 1
                )
                score = -score
                unmake_move(board, m[0], m[1], m[2], m[3], undo)

                if score > best_score:
                    best_score = score
                    best_leaf_info = (q_turn, q_cast_mask, q_z_hash, is_m, (m,) + child_line)
                if score > alpha:
                    alpha = score
                if alpha >= beta:
                    return (best_score, *best_leaf_info)

            if legal_evasions == 0:
                # Checkmate
                return -100000, c_turn, cast_mask, z_hash, True, ()
            return (best_score, *best_leaf_info)

        stand_pat = mat_score if c_turn == 'w' else -mat_score
        if stand_pat >= beta:
            return stand_pat, c_turn, cast_mask, z_hash, False, ()

        best_score = stand_pat
        best_leaf_info = (c_turn, cast_mask, z_hash, False, ())
        if stand_pat > alpha:
            alpha = stand_pat

        if qdepth <= 0:
            return (best_score, *best_leaf_info)

        caps = generate_captures_fast(board, c_turn, ep_col)
        if not caps:
            return (best_score, *best_leaf_info)

        caps.sort(key=lambda x: x[0], reverse=True)
        for c in caps:
            # Delta pruning
            if stand_pat + c[1] + 200 < alpha:
                continue
            new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, undo = make_move(
                board, c[2], c[3], c[4], c[5], c[6],
                cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash
            )
            chk_kpos = new_wk if c_turn == 'w' else new_bk
            if is_square_attacked(board, chk_kpos[0], chk_kpos[1], opp_turn):
                unmake_move(board, c[2], c[3], c[4], c[5], undo)
                continue

            score, q_turn, q_cast_mask, q_z_hash, is_m, child_line = material_quiesce_leaf(
                new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, opp_turn, -beta, -alpha, qdepth - 1
            )
            score = -score
            unmake_move(board, c[2], c[3], c[4], c[5], undo)

            if score > best_score:
                best_score = score
                move_tuple = (c[2], c[3], c[4], c[5], c[6])
                best_leaf_info = (q_turn, q_cast_mask, q_z_hash, is_m, (move_tuple,) + child_line)
            if score > alpha:
                alpha = score
            if alpha >= beta:
                return (best_score, *best_leaf_info)

        return (best_score, *best_leaf_info)

    def order_moves_inner(next_moves, tt_move, ply, z_h):
        scored = []
        killer = killer_moves.get(ply)
        cached_pol = policy_cache.get(z_h)
        is_4672 = len(cached_pol) == 4672 if cached_pol is not None else False

        for m in next_moves:
            fr, fc, tr, tc = m[0], m[1], m[2], m[3]
            promo = m[4] if len(m) > 4 else None
            # 1. TT move gets highest priority
            if tt_move and (fr, fc, tr, tc) == (tt_move[0], tt_move[1], tt_move[2], tt_move[3]):
                scored.append((1000000.0, m))
                continue

            s = 0.0
            if cached_pol is not None:
                if is_4672:
                    idx = MOVE_TO_4672_NORMAL[fr][fc][tr][tc]
                    if promo and promo in ('n', 'b', 'r'):
                        idx = uci_to_4672(chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + promo)
                    if idx is not None and idx < 4672:
                        s += float(cached_pol[idx]) * 300.0
                else:
                    idx = (fr * 8 + fc) * 64 + (tr * 8 + tc)
                    if idx < 4096:
                        s += float(cached_pol[idx]) * 300.0

            p = board[fr][fc]
            is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
            if is_promo:
                s += 4000.0
            target = board[tr][tc]
            if target:
                v_val = PIECE_ABS_VALUES.get(target, 0)
                a_val = PIECE_ABS_VALUES.get(p, 0) if p else 0
                s += (v_val * 10 - a_val + 2000.0)
            elif killer and (fr, fc, tr, tc) == killer:
                s += 1500.0
            else:
                s += history_table.get((fr, fc, tr, tc), 0)
                center_dist = abs(tr - 3.5) + abs(tc - 3.5)
                s += (7.0 - center_dist) * 2.0

            scored.append((s, m))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    def negamax(cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash, c_turn, depth, alpha, beta, ply):
        node_counter[0] += 1
        if (node_counter[0] & 15) == 0:
            if (time.time() - t0) * 1000 > time_limit_ms:
                time_expired[0] = True
                return alpha, None

        # Repetition check in search path or game history: draw
        if ply > 0 and (z_hash in path_hashes or z_hash in history_hashes):
            return 0.0, None

        # Insufficient material draw
        if non_king_mat in (0, 320, 330):
            return 0.0, None

        # TT probe
        hit, tt_depth, tt_score, tt_flag, tt_move = GLOBAL_TT.probe(z_hash, c_turn)
        if hit and tt_depth >= depth:
            actual_score = tt_score if c_turn == 'w' else -tt_score
            if tt_flag == TT_FLAG_EXACT:
                return actual_score, tt_move
            elif tt_flag == TT_FLAG_LOWER and actual_score >= beta:
                return actual_score, tt_move
            elif tt_flag == TT_FLAG_UPPER and actual_score <= alpha:
                return actual_score, tt_move

        my_kpos = w_kpos if c_turn == 'w' else b_kpos
        opp_turn = 'b' if c_turn == 'w' else 'w'
        in_check = is_square_attacked(board, my_kpos[0], my_kpos[1], opp_turn)

        # Static evaluation
        persp = 1.0 if c_turn == 'w' else -1.0
        q_tanh = float(math.tanh(mat_score / 400.0))
        static_eval = (persp * 0.30 * q_tanh)

        # Null Move Pruning (NMP) guarded by static evaluation
        if depth >= 3 and not in_check and non_king_mat > 800 and beta < 5000 and static_eval >= beta:
            R = 2
            null_hash = z_hash ^ ZOBRIST_TURN
            if 0 <= ep_col < 8:
                null_hash ^= ZOBRIST_EP[ep_col] ^ ZOBRIST_EP[8]
            val, _ = negamax(cast_mask, -1, w_kpos, b_kpos, mat_score, non_king_mat, null_hash, opp_turn, depth - 1 - R, -beta, -beta + 0.01, ply + 1)
            if time_expired[0]:
                return alpha, None
            if -val >= beta:
                return beta, None

        # Leaf evaluation
        if depth <= 0:
            mat_score_leaf, quiet_turn, quiet_cast_mask, quiet_z_hash, is_mate, best_line = material_quiesce_leaf(
                cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash, c_turn, -100000, 100000, qdepth=3
            )
            if abs(mat_score_leaf) >= 50000:
                mate_val = (10.0 - ply * 0.1) if mat_score_leaf > 0 else (-10.0 + ply * 0.1)
                return mate_val, None

            persp = 1.0 if c_turn == 'w' else -1.0
            q_tanh = float(math.tanh(mat_score_leaf / 400.0))
            mat_part = 0.30 * q_tanh

            # Lazy evaluation cutoff (no fake TT storage)
            if quiet_z_hash not in eval_cache:
                if mat_part + 0.70 <= alpha:
                    return mat_part + 0.70, None
                if mat_part - 0.70 >= beta:
                    return mat_part - 0.70, None

            # Reconstruct quiet board in-place ONLY if neural eval needed and not cached
            if quiet_z_hash not in eval_cache and best_line:
                undo_stack = []
                broken = False
                curr_c, curr_e, curr_wk, curr_bk, curr_m, curr_nkm, curr_z = cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash
                for lm in best_line:
                    lfr, lfc, ltr, ltc = lm[0], lm[1], lm[2], lm[3]
                    lpr = lm[4] if len(lm) > 4 else None
                    if board[lfr][lfc] is None:
                        broken = True
                        break
                    curr_c, curr_e, curr_wk, curr_bk, curr_m, curr_nkm, curr_z, u_inf = make_move(
                        board, lfr, lfc, ltr, ltc, lpr, curr_c, curr_e, curr_wk, curr_bk, curr_m, curr_nkm, curr_z
                    )
                    undo_stack.append((lfr, lfc, ltr, ltc, u_inf))

                if not broken:
                    neural_val = get_neural_val(board, quiet_turn, quiet_cast_mask, quiet_z_hash)
                else:
                    neural_val = 0.0

                # Unmake moves in reverse order
                for lfr, lfc, ltr, ltc, u_inf in reversed(undo_stack):
                    unmake_move(board, lfr, lfc, ltr, ltc, u_inf)
            else:
                neural_val = get_neural_val(board, quiet_turn, quiet_cast_mask, quiet_z_hash)

            leaf_eval = 0.70 * (persp * neural_val) + mat_part
            leaf_score_to_store = leaf_eval if c_turn == 'w' else -leaf_eval
            GLOBAL_TT.store(z_hash, 0, leaf_score_to_store, TT_FLAG_EXACT, None, c_turn)
            return leaf_eval, None

        pseudo_moves = generate_pseudo_legal_moves(board, c_turn, cast_mask, ep_col)
        if not pseudo_moves:
            if in_check:
                return -10.0 + ply * 0.1, None
            return 0.0, None

        scored_moves = order_moves_inner(pseudo_moves, tt_move, ply, z_hash)

        best_score = -9999.0
        best_move = None
        orig_alpha = alpha
        legal_count = 0

        path_hashes.add(z_hash)
        try:
            for move_idx, (_, m) in enumerate(scored_moves):
                fr, fc, tr, tc = m[0], m[1], m[2], m[3]
                promo = m[4] if len(m) > 4 else None

                new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, undo = make_move(
                    board, fr, fc, tr, tc, promo,
                    cast_mask, ep_col, w_kpos, b_kpos, mat_score, non_king_mat, z_hash
                )

                # Lazy Legality Check
                chk_kpos = new_wk if c_turn == 'w' else new_bk
                if is_square_attacked(board, chk_kpos[0], chk_kpos[1], opp_turn):
                    unmake_move(board, fr, fc, tr, tc, undo)
                    continue

                legal_count += 1
                captured_piece = undo[1]

                # PVS & Dynamic LMR
                if legal_count == 1:
                    val, _ = negamax(new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, opp_turn, depth - 1, -beta, -alpha, ply + 1)
                    score = -val
                else:
                    # Dynamic LMR from precomputed table
                    reduction = 0
                    if depth >= 2 and (move_idx + 1) >= 4 and not captured_piece and not in_check and not promo:
                        d_idx = min(depth, MAX_LMR_DEPTH - 1)
                        m_idx = min(move_idx + 1, MAX_LMR_MOVES - 1)
                        reduction = LMR_TABLE[d_idx][m_idx]
                        # Don't reduce into negative or zero depth
                        if reduction >= depth:
                            reduction = depth - 1

                    val, _ = negamax(new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, opp_turn, depth - 1 - reduction, -alpha - 0.01, -alpha, ply + 1)
                    score = -val
                    if score > alpha and (score < beta or reduction > 0):
                        val, _ = negamax(new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, opp_turn, depth - 1, -beta, -alpha, ply + 1)
                        score = -val

                unmake_move(board, fr, fc, tr, tc, undo)
                if time_expired[0]:
                    return alpha, None

                if score > best_score:
                    best_score = score
                    best_move = m
                if score > alpha:
                    alpha = score
                if alpha >= beta:
                    killer_moves[ply] = (fr, fc, tr, tc)
                    history_table[(fr, fc, tr, tc)] = history_table.get((fr, fc, tr, tc), 0) + depth * depth
                    break # Beta cutoff

            if legal_count == 0:
                if in_check:
                    return -10.0 + ply * 0.1, None
                return 0.0, None

            if time_expired[0]:
                return alpha, None

            flag = TT_FLAG_EXACT
            if best_score <= orig_alpha:
                flag = TT_FLAG_UPPER
            elif best_score >= beta:
                flag = TT_FLAG_LOWER
            score_to_store = best_score if c_turn == 'w' else -best_score
            GLOBAL_TT.store(z_hash, depth, score_to_store, flag, best_move, c_turn)
            return best_score, best_move
        finally:
            path_hashes.remove(z_hash)

    # Root iterative deepening with Aspiration Windows
    best_move_root = active_moves[int(np.argmax(root_priors))]
    best_val_root = float(root_val)
    move_scores = {}
    completed_depth = 0
    next_turn = 'b' if turn == 'w' else 'w'

    for d in range(1, max_depth + 1):
        if (time.time() - t0) * 1000 > time_limit_ms or time_expired[0]:
            break

        ordered_root = []
        for i, m in enumerate(active_moves):
            pScore = root_priors[i] * 100.0
            if best_move_root and (m[0], m[1], m[2], m[3]) == (best_move_root[0], best_move_root[1], best_move_root[2], best_move_root[3]):
                pScore += 50000.0
            ordered_root.append((pScore, m, root_priors[i]))
        ordered_root.sort(key=lambda x: x[0], reverse=True)

        # Aspiration Window
        if d >= 3:
            delta = 0.20
            alpha = max(-9999.0, best_val_root - delta)
            beta = min(9999.0, best_val_root + delta)
        else:
            alpha = -9999.0
            beta = 9999.0

        aspiration_alpha = alpha
        aspiration_beta = beta
        iter_scores = {}
        iter_best_move = None
        iter_best_val = -9999.0
        depth_aborted = False

        # Root batch prefetch for top candidate boards before search
        if d >= 2 and len(ordered_root) > 1:
            prefetch_tensors = []
            prefetch_hashes = []
            for _, pm, _ in ordered_root[:6]:
                pfr, pfc, ptr, ptc = pm[0], pm[1], pm[2], pm[3]
                ppromo = pm[4] if len(pm) > 4 else None
                pn_cast, pn_ep, pn_wk, pn_bk, pn_mat, pn_nkm, pn_z, p_undo = make_move(
                    board, pfr, pfc, ptr, ptc, ppromo,
                    cast_mask_root, ep_col_root, w_kpos_root, b_kpos_root, mat_score_root, non_king_mat_root, z_hash_root
                )
                if pn_z not in eval_cache:
                    c_cast_str = mask_to_castling(pn_cast)
                    prefetch_tensors.append(board_to_tensor(board, next_turn, c_cast_str))
                    prefetch_hashes.append(pn_z)
                unmake_move(board, pfr, pfc, ptr, ptc, p_undo)
            if len(prefetch_tensors) >= 2:
                batch = np.stack(prefetch_tensors, axis=0)
                b_res = session.run(None, {'board_state': batch})
                for b_i, b_h in enumerate(prefetch_hashes):
                    eval_cache[b_h] = float(b_res[1][b_i, 0])
                    policy_cache[b_h] = b_res[0][b_i]

        while True:
            for root_idx, (_, m, pri) in enumerate(ordered_root):
                if (time.time() - t0) * 1000 > time_limit_ms or time_expired[0]:
                    depth_aborted = True
                    break

                fr, fc, tr, tc = m[0], m[1], m[2], m[3]
                promo = m[4] if len(m) > 4 else None

                new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, undo = make_move(
                    board, fr, fc, tr, tc, promo,
                    cast_mask_root, ep_col_root, w_kpos_root, b_kpos_root, mat_score_root, non_king_mat_root, z_hash_root
                )

                if root_idx == 0:
                    val, _ = negamax(new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, next_turn, d - 1, -beta, -alpha, 1)
                    score = -val
                else:
                    val, _ = negamax(new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, next_turn, d - 1, -alpha - 0.01, -alpha, 1)
                    score = -val
                    if score > alpha and score < beta:
                        val, _ = negamax(new_cast, new_ep, new_wk, new_bk, new_mat, new_nkm, new_z, next_turn, d - 1, -beta, -alpha, 1)
                        score = -val

                unmake_move(board, fr, fc, tr, tc, undo)
                if time_expired[0]:
                    depth_aborted = True
                    break

                blended = score + 0.05 * pri
                iter_scores[(fr, fc, tr, tc)] = blended
                if blended > iter_best_val:
                    iter_best_val = blended
                    iter_best_move = m
                if score > alpha:
                    alpha = score

            if depth_aborted or time_expired[0]:
                break

            # Aspiration Window re-search check
            if d >= 3:
                if iter_best_val <= aspiration_alpha and aspiration_alpha > -9000.0:
                    alpha = -9999.0
                    aspiration_alpha = -9999.0
                    continue
                elif iter_best_val >= aspiration_beta and aspiration_beta < 9000.0:
                    beta = 9999.0
                    aspiration_beta = 9999.0
                    continue
            break

        if not depth_aborted and iter_best_move is not None:
            best_move_root = iter_best_move
            best_val_root = iter_best_val
            move_scores.update(iter_scores)
            completed_depth = d
        if depth_aborted or time_expired[0]:
            break

    results = []
    for m in active_moves:
        fr, fc, tr, tc = m[0], m[1], m[2], m[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        promo = m[4] if len(m) > 4 and m[4] else ('q' if is_promo else None)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + (promo if promo else '')
        score = move_scores.get((fr, fc, tr, tc), best_val_root if m == best_move_root else -999.0)
        results.append({
            'uci': uci, 'fromR': fr, 'fromC': fc, 'toR': tr, 'toC': tc,
            'promotion': promo,
            'score': score, 'visits': 100 if m == best_move_root else 1,
            'depth': completed_depth
        })
    results.sort(key=lambda x: (x['visits'] == 100, x['score']), reverse=True)
    dt = (time.time() - t0) * 1000
    return results, best_val_root, dt



class MCTSNode:
    def __init__(self, board, turn, castling, parent=None, move=None, prior=0.0):
        self.board = board
        self.turn = turn
        self.castling = castling
        self.parent = parent
        self.move = move
        self.prior = prior
        self.children = []
        self.visits = 0
        self.total_value = 0.0
        self.is_expanded = False

    def is_leaf(self):
        return not self.is_expanded or len(self.children) == 0

    def puct_score(self, parent_visits, c_puct=1.0, parent_q=0.0):
        if self.visits == 0:
            q_val = parent_q
        else:
            q_val = -(self.total_value / self.visits)
        u_val = c_puct * self.prior * (math.sqrt(parent_visits) / (1 + self.visits))
        return q_val + u_val

def mcts_search(session, fen, num_simulations=160, c_puct=1.0, history=None):
    t0 = time.time()
    
    # 1. Opening book check (0ms)
    parts = fen.split()
    book_key = ' '.join(parts[:4]) if len(parts) >= 4 else parts[0]
    if book_key in OPENING_BOOK:
        chosen = random.choice(OPENING_BOOK[book_key])
        move_obj = uci_to_move(chosen)
        return [move_obj], 0.0, 0.5

    # Build history set for repetition penalty
    history_set = set()
    history_counts = {}
    recent_keys = []
    if history:
        for h in history:
            if isinstance(h, str):
                hparts = h.split()
                if len(hparts) >= 2:
                    k = hparts[0] + ' ' + hparts[1]
                    history_set.add(k)
                    recent_keys.append(k)
                    history_counts[k] = history_counts.get(k, 0) + 1
                elif len(hparts) == 1:
                    history_set.add(hparts[0])
                    recent_keys.append(hparts[0])
                    history_counts[hparts[0]] = history_counts.get(hparts[0], 0) + 1
    last_own_key = recent_keys[-2] if len(recent_keys) >= 2 else None

    board, turn, castling, en_passant = fen_to_board(fen)

    # 1b. Theoretical Endgame Tablebase & Solver (0ms)
    eg_move = get_endgame_move(board, turn, castling, fen)
    if eg_move:
        eg_move['visits'] = 999
        eg_move['qValue'] = 1.0
        eg_move['policy'] = 1.0
        return [eg_move], 1.0, (time.time() - t0) * 1000

    legal_moves = get_legal_moves(board, turn, castling, en_passant)
    if not legal_moves:
        return [], 0.0, 0.0

    # 2. Instant checkmate attack check
    instant_mate = find_instant_mate(board, turn, castling)
    if instant_mate:
        fr, fc, tr, tc = instant_mate[0], instant_mate[1], instant_mate[2], instant_mate[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return [{
            'uci': uci,
            'fromR': fr, 'fromC': fc,
            'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'visits': 999,
            'score': 10000.0,
            'qValue': 1.0,
            'policy': 1.0,
            'isMate': True
        }], 1.0, (time.time() - t0) * 1000

    # 3. Forcing Checkmate-in-2 attack check
    mate_in_2 = find_mate_in_two(board, turn, castling)
    if mate_in_2:
        fr, fc, tr, tc = mate_in_2[0], mate_in_2[1], mate_in_2[2], mate_in_2[3]
        p = board[fr][fc]
        is_promo = p and p.lower() == 'p' and (tr == 0 or tr == 7)
        uci = chr(97 + fc) + str(8 - fr) + chr(97 + tc) + str(8 - tr) + ('q' if is_promo else '')
        return [{
            'uci': uci,
            'fromR': fr, 'fromC': fc,
            'toR': tr, 'toC': tc,
            'promotion': 'q' if is_promo else None,
            'visits': 999,
            'score': 9000.0,
            'qValue': 1.0,
            'policy': 1.0,
            'isMate': True
        }], 1.0, (time.time() - t0) * 1000

    # 4. Filter out fatal blunder moves that immediately allow opponent instant mate
    active_moves = filter_mating_blunders(board, turn, legal_moves, castling, en_passant)

    if len(active_moves) == 1:
        m = active_moves[0]
        p = board[m[0]][m[1]]
        is_promo = p and p.lower() == 'p' and (m[2] == 0 or m[2] == 7)
        uci = chr(97 + m[1]) + str(8 - m[0]) + chr(97 + m[3]) + str(8 - m[2]) + ('q' if is_promo else '')
        return [{
            'uci': uci,
            'fromR': m[0], 'fromC': m[1],
            'toR': m[2], 'toC': m[3],
            'promotion': 'q' if is_promo else None,
            'visits': 1,
            'score': 1.0,
            'qValue': 0.0
        }], 0.0, 0.0

    root = MCTSNode(board, turn, castling)
    inp = board_to_tensor(board, turn, castling)[np.newaxis, ...]
    out = session.run(None, {'board_state': inp})
    pol = out[0][0]
    val = float(out[1][0, 0])

    root_priors = compute_priors(board, turn, active_moves, pol, history_set, val, last_own_key, is_root=True)
    opp_turn = 'b' if turn == 'w' else 'w'
    for i, m in enumerate(active_moves):
        nb, ncast = simulate_move_full(board, m[0], m[1], m[2], m[3], castling, en_passant)
        p = board[m[0]][m[1]]
        is_promo = p and p.lower() == 'p' and (m[2] == 0 or m[2] == 7)
        uci = chr(97 + m[1]) + str(8 - m[0]) + chr(97 + m[3]) + str(8 - m[2]) + ('q' if is_promo else '')
        move_dict = {'uci': uci, 'fromR': m[0], 'fromC': m[1], 'toR': m[2], 'toC': m[3], 'pScore': root_priors[i], 'promotion': 'q' if is_promo else None}
        root.children.append(MCTSNode(nb, opp_turn, ncast, parent=root, move=move_dict, prior=root_priors[i]))
    root.is_expanded = True

    eval_cache = {}

    for sim in range(num_simulations):
        node = root
        sim_path_keys = set()
        sim_path_keys.add(board_to_simple_key(root.board, root.turn))
        is_cycle = False

        while not node.is_leaf():
            parent_q = -(node.total_value / node.visits) if node.visits > 0 else 0.0
            best_child = max(node.children, key=lambda c: c.puct_score(node.visits, c_puct, parent_q - 0.15))
            node = best_child
            child_key = board_to_simple_key(node.board, node.turn)
            if child_key in sim_path_keys:
                is_cycle = True
                break
            sim_path_keys.add(child_key)

        curr_turn = node.turn
        curr_key = board_to_simple_key(node.board, curr_turn)
        is_history_repetition = (node is not root and (curr_key in history_set))

        if is_cycle or is_history_repetition:
            engine_eval = val if node.turn == turn else -val
            in_eg = is_endgame_position(node.board)
            if in_eg:
                # In endgame, repeating moves when trying to win is treated as an almost decisive blunder
                leaf_eval = -0.85 if engine_eval >= -0.20 else 0.0
            else:
                leaf_eval = -0.30 if engine_eval >= -0.10 else 0.0
        else:
            is_check = is_king_in_check(node.board, curr_turn)
            next_legal = get_legal_moves(node.board, curr_turn, node.castling)

            # Terminal state check
            if not next_legal:
                if is_check:
                    # curr_turn is checkmated (-1.0 loss for curr_turn)
                    leaf_eval = -1.0
                else:
                    # Stalemate (0.0 draw)
                    leaf_eval = 0.0
            else:
                # Fast check if curr_turn has an instant winning mate-in-1
                sim_mate = find_instant_mate(node.board, curr_turn, node.castling)
                if sim_mate:
                    leaf_eval = 1.0
                else:
                    cache_key = (tuple(tuple(row) for row in node.board), curr_turn, node.castling)
                    if cache_key in eval_cache:
                        leaf_pol, nn_val = eval_cache[cache_key]
                    else:
                        inp = board_to_tensor(node.board, curr_turn, node.castling)[np.newaxis, ...]
                        out = session.run(None, {'board_state': inp})
                        leaf_pol = out[0][0]
                        nn_val = float(out[1][0, 0])
                        eval_cache[cache_key] = (leaf_pol, nn_val)

                    q_cp = quiesce(node.board, curr_turn, -10000, 10000, depth=2)
                    q_val = float(np.tanh(q_cp / 400.0))
                    p_val = nn_val if curr_turn == 'w' else -nn_val
                    # quiesce already returns score from curr_turn perspective (no double inversion for Black)
                    leaf_eval = 0.75 * p_val + 0.25 * q_val

                    child_priors = compute_priors(node.board, curr_turn, next_legal, leaf_pol, history_set, nn_val, is_root=False)
                    next_turn = 'b' if curr_turn == 'w' else 'w'
                    for ci, cm in enumerate(next_legal):
                        c_nb, c_cast = simulate_move_full(node.board, cm[0], cm[1], cm[2], cm[3], node.castling)
                        cp = node.board[cm[0]][cm[1]]
                        c_promo = cp and cp.lower() == 'p' and (cm[2] == 0 or cm[2] == 7)
                        c_uci = chr(97 + cm[1]) + str(8 - cm[0]) + chr(97 + cm[3]) + str(8 - cm[2]) + ('q' if c_promo else '')
                        c_dict = {'uci': c_uci, 'fromR': cm[0], 'fromC': cm[1], 'toR': cm[2], 'toC': cm[3], 'pScore': child_priors[ci], 'promotion': 'q' if c_promo else None}
                        node.children.append(MCTSNode(c_nb, next_turn, c_cast, parent=node, move=c_dict, prior=child_priors[ci]))
                    node.is_expanded = True

        # Backpropagation with alternating sign inversion
        back_node = node
        val_to_prop = leaf_eval
        while back_node is not None:
            back_node.visits += 1
            back_node.total_value += val_to_prop
            val_to_prop = -val_to_prop
            back_node = back_node.parent

    # Action selection strictly by visit count N, strongly penalizing repetitions especially in endgame
    def get_child_selection_score(c):
        q_mean = -(c.total_value / c.visits) if c.visits > 0 else 0.0
        eff_visits = float(c.visits)
        c_dest_key = board_to_simple_key(c.board, c.turn)
        if history_set and (c_dest_key in history_set):
            in_eg = is_endgame_position(c.board)
            rep_count = history_counts.get(c_dest_key, 0)
            is_osc = (last_own_key is not None and c_dest_key == last_own_key)
            if in_eg:
                eff_visits -= (2000.0 if (rep_count >= 2 or is_osc) else 500.0)
            else:
                if val >= -0.15:
                    eff_visits -= 100.0
        return (eff_visits, q_mean)

    root.children.sort(key=get_child_selection_score, reverse=True)
    results = []
    for c in root.children:
        q_mean = -(c.total_value / c.visits) if c.visits > 0 else 0.0
        c_dest_key = board_to_simple_key(c.board, c.turn)
        rep_pen = 0.0
        if history_set and (c_dest_key in history_set):
            in_eg = is_endgame_position(c.board)
            rep_count = history_counts.get(c_dest_key, 0)
            is_osc = (last_own_key is not None and c_dest_key == last_own_key)
            if in_eg:
                rep_pen = 50.0 if (rep_count >= 2 or is_osc) else 20.0
            else:
                rep_pen = 5.0
        results.append({
            'uci': c.move['uci'],
            'fromR': c.move['fromR'], 'fromC': c.move['fromC'],
            'toR': c.move['toR'], 'toC': c.move['toC'],
            'promotion': c.move.get('promotion'),
            'visits': c.visits,
            'qValue': q_mean,
            'policy': c.prior,
            'score': c.visits + 0.1 * q_mean - rep_pen
        })

    elapsed_ms = (time.time() - t0) * 1000
    return results, val, elapsed_ms

if __name__ == '__main__':
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fen = sys.argv[1] if len(sys.argv) > 1 else 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    model_ver = sys.argv[2] if len(sys.argv) > 2 else ('v1_7' if os.path.exists(os.path.join(root_dir, 'modular_chess_v1_7.onnx')) else ('v1_6' if os.path.exists(os.path.join(root_dir, 'modular_chess_v1_6.onnx')) else 'v1'))
    search_type = sys.argv[3] if len(sys.argv) > 3 else 'alphabeta'
    history_arg = sys.argv[4] if len(sys.argv) > 4 else None
    history = None
    if history_arg:
        try:
            history = json.loads(history_arg)
        except Exception:
            history = None

    if model_ver in ('v1_7', 'v1.7', 'neural-v1-7', 'neural-v1-7-alphabeta'):
        model_path = os.path.join(root_dir, 'modular_chess_v1_7.onnx')
        if not os.path.exists(model_path):
            model_path = os.path.join(root_dir, 'modular_chess_v1_6.onnx')
            if not os.path.exists(model_path):
                model_path = os.path.join(root_dir, 'modular_chess_v1_5.onnx')
                if not os.path.exists(model_path):
                    model_path = os.path.join(root_dir, 'modular_chess_v1.onnx')
    elif model_ver in ('v1_6', 'v1.6', 'neural-v1-6', 'neural-v1-6-alphabeta'):
        model_path = os.path.join(root_dir, 'modular_chess_v1_6.onnx')
        if not os.path.exists(model_path):
            model_path = os.path.join(root_dir, 'modular_chess_v1_5.onnx')
            if not os.path.exists(model_path):
                model_path = os.path.join(root_dir, 'modular_chess_v1.onnx')
    elif model_ver in ('v1_5', 'v1.5', 'neural-v1-5', 'neural-v1-5-mcts'):
        model_path = os.path.join(root_dir, 'modular_chess_v1_5.onnx')
        if not os.path.exists(model_path):
            model_path = os.path.join(root_dir, 'modular_chess_v1.onnx')
    else:
        model_path = os.path.join(root_dir, 'modular_chess_v1.onnx')

    session = create_onnx_session(model_path)
    
    if search_type in ('alphabeta', 'ab', 'policy_alphabeta'):
        top_moves, root_val, elapsed_ms = alphabeta_search(session, fen, max_depth=6, time_limit_ms=4000, history=history)
        completed_d = top_moves[0].get('depth', 6) if top_moves else 6
        print(json.dumps({'value': root_val, 'searchType': 'alphabeta', 'searchDepth': completed_d, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}))
    elif search_type == 'mcts':
        top_moves, root_val, elapsed_ms = mcts_search(session, fen, num_simulations=160, c_puct=1.0, history=history)
        print(json.dumps({'value': root_val, 'searchType': 'mcts', 'simulations': 160, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}))
    elif search_type in ('deep', 'minimax'):
        top_moves, root_val, elapsed_ms = deep_search_5ply(session, fen, top_k1=14, top_k2=8, top_k3=4, top_k4=3, history=history)
        print(json.dumps({'value': root_val, 'searchType': 'minimax', 'searchDepth': 5, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}))
    else:
        top_moves, root_val, elapsed_ms = alphabeta_search(session, fen, max_depth=6, time_limit_ms=4000, history=history)
        completed_d = top_moves[0].get('depth', 6) if top_moves else 6
        print(json.dumps({'value': root_val, 'searchType': 'alphabeta', 'searchDepth': completed_d, 'elapsedMs': elapsed_ms, 'topMoves': top_moves, 'modelVer': model_ver}))


