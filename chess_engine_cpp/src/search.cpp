#include "../include/search.h"
#include <iostream>
#include <algorithm>

const int INF = 1000000;

Move Search::find_best_move(int max_depth) {
    Move best_move_overall;
    nodes = 0;

    for (int depth = 1; depth <= max_depth; ++depth) {
        int alpha = -INF;
        int beta = INF;
        int best_score = -INF;
        Move best_move_current;

        auto moves = board.generate_legal_moves();
        order_moves(moves);

        for (const auto& m : moves) {
            int old_castling = board.get_castling_rights();
            Square old_ep = board.get_ep_square();
            Piece captured = board.get_piece_at(m.to);
            if (m.is_en_passant) captured = (board.get_side_to_move() == WHITE) ? B_PAWN : W_PAWN;

            board.make_move(m);
            int score = -negamax(depth - 1, -beta, -alpha);
            board.unmake_move(m, old_castling, old_ep, captured);

            if (score > best_score) {
                best_score = score;
                best_move_current = m;
            }
            if (score > alpha) alpha = score;
        }

        best_move_overall = best_move_current;
        
        std::cout << "info depth " << depth << " score cp " << best_score << " nodes " << nodes << std::endl;
    }

    return best_move_overall;
}

int Search::negamax(int depth, int alpha, int beta) {
    nodes++;
    if (depth == 0) return board.evaluate();

    auto moves = board.generate_legal_moves();
    if (moves.empty()) {
        // Checkmate or Stalemate
        Bitboard king_bb = board.get_bitboard(board.get_side_to_move() == WHITE ? W_KING : B_KING);
        Square king_sq = (Square)get_lsb(king_bb);
        if (board.is_square_attacked(king_sq, board.get_side_to_move() == WHITE ? BLACK : WHITE)) {
            return -100000 - depth; // Checkmate
        }
        return 0; // Stalemate
    }

    order_moves(moves);

    for (const auto& m : moves) {
        int old_castling = board.get_castling_rights();
        Square old_ep = board.get_ep_square();
        Piece captured = board.get_piece_at(m.to);
        if (m.is_en_passant) captured = (board.get_side_to_move() == WHITE) ? B_PAWN : W_PAWN;

        board.make_move(m);
        int score = -negamax(depth - 1, -beta, -alpha);
        board.unmake_move(m, old_castling, old_ep, captured);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }

    return alpha;
}

void Search::order_moves(std::vector<Move>& moves) {
    // Simple MVV-LVA (Most Valuable Victim - Least Valuable Aggressor)
    std::sort(moves.begin(), moves.end(), [&](const Move& a, const Move& b) {
        Piece cap_a = board.get_piece_at(a.to);
        Piece cap_b = board.get_piece_at(b.to);
        if (a.is_en_passant) cap_a = W_PAWN;
        if (b.is_en_passant) cap_b = W_PAWN;
        
        if (cap_a != cap_b) return cap_a > cap_b; // Very basic
        return false;
    });
}
