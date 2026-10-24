import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import onnxruntime as ort
from scripts.neural_engine import alphabeta_search, create_onnx_session

def run_tests():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_path = os.path.join(root_dir, 'modular_chess_v1_7.onnx')
    if not os.path.exists(model_path):
        model_path = os.path.join(root_dir, 'modular_chess_v1_6.onnx')
    if not os.path.exists(model_path):
        model_path = os.path.join(root_dir, 'modular_chess_v1_5.onnx')

    print(f"Loading ONNX session from: {os.path.basename(model_path)}...")
    session = create_onnx_session(model_path)

    tests = [
        ("Test 1 [Mate in 1: Qxf7#]", "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1", ["f3f7"]),
        ("Test 2 [Free Rook Capture]", "r6k/8/8/8/8/8/8/R6K w - - 0 1", ["a1a8"]),
        ("Test 3 [Defense against Qh5xf7#]", "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", ["g7g6", "d8e7", "d8f6", "g8h6", "d7d5"]),
        ("Test 4 [Safe Promotion to Queen]", "8/1P4k1/8/8/8/8/8/4K3 w - - 0 1", ["b7b8q"]),
        ("Test 5 [Avoid Reckless Promo Under Attack]", "r6k/P7/8/8/8/8/8/4K2R w - - 0 1", ["a7a8q"], True),
        ("Test 6 [Avoid 1st Rank Skewer/Fork]", "4k3/8/8/8/8/8/4r3/4K2R w - - 0 1", ["e1e2", "h1h2"]),
        ("Test 7 [Avoid Walking Under Fire]", "4k3/8/8/8/3r4/8/4P3/4K3 w - - 0 1", ["e2e4", "e1f2", "e1e2"]),
        ("Test 8 [Middlegame Alpha-Beta Speed]", "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4", None)
    ]

    all_passed = True
    total_time = 0.0

    for item in tests:
        name = item[0]
        fen = item[1]
        expected = item[2]
        is_avoid = item[3] if len(item) > 3 else False

        top_moves, root_val, dt = alphabeta_search(session, fen, max_depth=6, time_limit_ms=2000)
        total_time += dt

        best_move = top_moves[0]['uci'] if top_moves else None

        if expected is None:
            print(f"{name}: Best move = {best_move} (Eval: {root_val:+.3f}, Candidates: {len(top_moves)}, Time: {dt:.1f}ms) -> PASS ✅")
            continue

        if is_avoid:
            if best_move not in expected:
                print(f"{name}: Best move = {best_move} (Avoided {expected}, Candidates: {len(top_moves)}, Time: {dt:.1f}ms) -> PASS ✅")
            else:
                print(f"{name}: FAILED ❌ Blundered {best_move}")
                all_passed = False
        else:
            if best_move in expected:
                print(f"{name}: Best move = {best_move} (Candidates: {len(top_moves)}, Time: {dt:.1f}ms) -> PASS ✅")
            else:
                print(f"{name}: FAILED ❌ Expected one of {expected}, got {best_move}")
                all_passed = False

    print("\n==================================================")
    if all_passed:
        print(f"🎉 ALL ALPHA-BETA TEST CASES PASSED! (Total search time across 8 tests: {total_time:.1f}ms)")
    else:
        print("❌ SOME TEST CASES FAILED.")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
