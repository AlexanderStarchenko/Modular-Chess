#include "../include/board.h"
#include <iostream>
#include <iomanip>
#include <cmath>
#include <algorithm>

Board::Board() {
    clear();
}

void Board::clear() {
    for (int i = 0; i < PIECE_NB; ++i) pieces[i] = 0ULL;
    for (int i = 0; i < COLOR_NB; ++i) color_occ[i] = 0ULL;
    total_occ = 0ULL;
    for (int i = 0; i < SQUARE_NB; ++i) board_array[i] = NO_PIECE;
    side_to_move = WHITE;
    castling_rights = ANY_WHITE | ANY_BLACK;
    ep_square = SQ_NONE;
}

void Board::set_piece(Square sq, Piece pc) {
    if (sq == SQ_NONE) return;

    // Remove existing piece if any
    if (board_array[sq] != NO_PIECE) {
        remove_piece(sq);
    }

    Bitboard mask = square_to_bb(sq);
    pieces[pc] |= mask;
    board_array[sq] = pc;

    Color c = (pc < B_PAWN) ? WHITE : BLACK;
    color_occ[c] |= mask;
    total_occ |= mask;
}

void Board::remove_piece(Square sq) {
    if (sq == SQ_NONE || board_array[sq] == NO_PIECE) return;

    Piece pc = board_array[sq];
    Bitboard mask = ~square_to_bb(sq);
    
    pieces[pc] &= mask;
    board_array[sq] = NO_PIECE;

    Color c = (pc < B_PAWN) ? WHITE : BLACK;
    color_occ[c] &= mask;
    total_occ &= mask;
}

Piece Board::get_piece_at(Square sq) const {
    return board_array[sq];
}

bool Board::is_square_attacked(Square sq, Color attacker_color) const {
    Bitboard target_bb = square_to_bb(sq);
    
    // Attacks from Pawns
    if (attacker_color == WHITE) {
        // White pawns attacking 'sq' must be at sq-9 or sq-7
        if (sq >= 8) {
            if (sq % 8 != 0 && (pieces[W_PAWN] & square_to_bb((Square)(sq - 9)))) return true;
            if (sq % 8 != 7 && (pieces[W_PAWN] & square_to_bb((Square)(sq - 7)))) return true;
        }
    } else {
        // Black pawns attacking 'sq' must be at sq+7 or sq+9
        if (sq <= 55) {
            if (sq % 8 != 0 && (pieces[B_PAWN] & square_to_bb((Square)(sq + 7)))) return true;
            if (sq % 8 != 7 && (pieces[B_PAWN] & square_to_bb((Square)(sq + 9)))) return true;
        }
    }

    // Attacks from Knights, Kings, and Sliding pieces...
    // (Simplified for brevity: in a real engine these would use precalculated tables)
    static const int knight_offsets[] = {-17, -15, -10, -6, 6, 10, 15, 17};
    Bitboard knights = pieces[attacker_color == WHITE ? W_KNIGHT : B_KNIGHT];
    for (int off : knight_offsets) {
        int target = sq + off;
        if (target >= 0 && target < 64) {
            // Check for file wrapping
            int sq_f = sq % 8, target_f = target % 8;
            if (std::abs(sq_f - target_f) <= 2 && (knights & square_to_bb((Square)target))) return true;
        }
    }

    // Slider attacks (Bishops, Rooks, Queens)
    // Simplified ray casting for now
    static const int directions[] = {8, -8, 1, -1, 7, -7, 9, -9};
    for (int i = 0; i < 8; ++i) {
        int d = directions[i];
        for (int step = 1; step < 8; ++step) {
            int target = sq + d * step;
            if (target < 0 || target >= 64) break;
            // File wrapping check
            if ((d == 1 || d == -1 || d == 7 || d == -7 || d == 9 || d == -9)) {
                if (std::abs((target - d) % 8 - target % 8) > 1) break;
            }
            
            Piece p = board_array[target];
            if (p != NO_PIECE) {
                Color c = (p < B_PAWN) ? WHITE : BLACK;
                if (c == attacker_color) {
                    PieceType pt = (PieceType)(p % 6);
                    if (pt == QUEEN) return true;
                    if (i < 4 && pt == ROOK) return true;
                    if (i >= 4 && pt == BISHOP) return true;
                }
                break; // Blocked by any piece
            }
        }
    }

    // King attacks
    static const int king_offsets[] = {-9, -8, -7, -1, 1, 7, 8, 9};
    Bitboard king = pieces[attacker_color == WHITE ? W_KING : B_KING];
    for (int off : king_offsets) {
        int target = sq + off;
        if (target >= 0 && target < 64) {
            if (std::abs(sq % 8 - target % 8) <= 1 && (king & square_to_bb((Square)target))) return true;
        }
    }

    return false;
}

void Board::make_move(const Move& m) {
    Piece p = board_array[m.from];
    Piece captured = board_array[m.to];

    // En Passant capture
    if (m.is_en_passant) {
        Square cap_sq = (side_to_move == WHITE) ? (Square)(m.to - 8) : (Square)(m.to + 8);
        remove_piece(cap_sq);
    } else if (captured != NO_PIECE) {
        remove_piece(m.to);
    }

    // Castling
    if (m.is_castling) {
        if (m.to == SQ_G1) { remove_piece(SQ_H1); set_piece(SQ_F1, W_ROOK); }
        else if (m.to == SQ_C1) { remove_piece(SQ_A1); set_piece(SQ_D1, W_ROOK); }
        else if (m.to == SQ_G8) { remove_piece(SQ_H8); set_piece(SQ_F8, B_ROOK); }
        else if (m.to == SQ_C8) { remove_piece(SQ_A8); set_piece(SQ_D8, B_ROOK); }
    }

    remove_piece(m.from);
    if (m.promotion != NO_PIECE) set_piece(m.to, m.promotion);
    else set_piece(m.to, p);

    // Update EP square
    ep_square = m.is_double_pawn_push ? (side_to_move == WHITE ? (Square)(m.from + 8) : (Square)(m.from - 8)) : SQ_NONE;

    // Update castling rights (simplified: should check if king/rook moved)
    if (p == W_KING) castling_rights &= ~ANY_WHITE;
    else if (p == B_KING) castling_rights &= ~ANY_BLACK;
    else if (m.from == SQ_A1) castling_rights &= ~WHITE_OOO;
    else if (m.from == SQ_H1) castling_rights &= ~WHITE_OO;
    else if (m.from == SQ_A8) castling_rights &= ~BLACK_OOO;
    else if (m.from == SQ_H8) castling_rights &= ~BLACK_OO;

    side_to_move = (side_to_move == WHITE) ? BLACK : WHITE;
}

// In a real engine, unmake_move would restore the full state from a history stack.
// For this example, we'll just handle it by restoring piece positions.
void Board::unmake_move(const Move& m, int prev_castling, Square prev_ep, Piece captured_piece) {
    side_to_move = (side_to_move == WHITE) ? BLACK : WHITE;
    
    Piece moved_p = board_array[m.to];
    remove_piece(m.to);
    
    if (m.promotion != NO_PIECE) {
        set_piece(m.from, (side_to_move == WHITE) ? W_PAWN : B_PAWN);
    } else {
        set_piece(m.from, moved_p);
    }

    if (m.is_en_passant) {
        Square cap_sq = (side_to_move == WHITE) ? (Square)(m.to - 8) : (Square)(m.to + 8);
        set_piece(cap_sq, (side_to_move == WHITE) ? B_PAWN : W_PAWN);
    } else if (captured_piece != NO_PIECE) {
        set_piece(m.to, captured_piece);
    }

    if (m.is_castling) {
        if (m.to == SQ_G1) { remove_piece(SQ_F1); set_piece(SQ_H1, W_ROOK); }
        else if (m.to == SQ_C1) { remove_piece(SQ_D1); set_piece(SQ_A1, W_ROOK); }
        else if (m.to == SQ_G8) { remove_piece(SQ_F8); set_piece(SQ_H8, B_ROOK); }
        else if (m.to == SQ_C8) { remove_piece(SQ_D8); set_piece(SQ_A8, B_ROOK); }
    }

    castling_rights = prev_castling;
    ep_square = prev_ep;
}

std::vector<Move> Board::generate_legal_moves() {
    std::vector<Move> pseudo_moves;
    generate_pseudo_legal_moves(pseudo_moves);
    
    std::vector<Move> legal_moves;
    for (const auto& m : pseudo_moves) {
        int old_castling = castling_rights;
        Square old_ep = ep_square;
        Piece captured = board_array[m.to];
        if (m.is_en_passant) captured = (side_to_move == WHITE) ? B_PAWN : W_PAWN;

        make_move(m);
        
        // Find king of the side that just moved
        Color side_just_moved = (side_to_move == WHITE) ? BLACK : WHITE;
        Bitboard king_bb = pieces[side_just_moved == WHITE ? W_KING : B_KING];
        Square king_sq = (Square)get_lsb(king_bb);

        if (!is_square_attacked(king_sq, side_to_move)) {
            legal_moves.push_back(m);
        }
        
        unmake_move(m, old_castling, old_ep, captured);
    }
    return legal_moves;
}

void Board::generate_pseudo_legal_moves(std::vector<Move>& moves) const {
    Color us = side_to_move;
    Color them = (us == WHITE) ? BLACK : WHITE;
    Bitboard our_pieces = color_occ[us];
    Bitboard their_pieces = color_occ[them];
    Bitboard occ = total_occ;

    for (int p_idx = 0; p_idx < 6; ++p_idx) {
        PieceType pt = (PieceType)p_idx;
        Piece pc = (us == WHITE) ? (Piece)pt : (Piece)(pt + 6);
        Bitboard bb = pieces[pc];

        while (bb) {
            Square from = (Square)pop_lsb(bb);
            
            if (pt == PAWN) {
                // Pawn moves are special
                int dir = (us == WHITE) ? 8 : -8;
                Square to = (Square)(from + dir);
                if (board_array[to] == NO_PIECE) {
                    // Single push
                    if ((us == WHITE && to >= SQ_A8) || (us == BLACK && to <= SQ_H1)) {
                        // Promotion
                        Piece promos[] = {us == WHITE ? W_QUEEN : B_QUEEN, us == WHITE ? W_ROOK : B_ROOK, us == WHITE ? W_BISHOP : B_BISHOP, us == WHITE ? W_KNIGHT : B_KNIGHT};
                        for (auto p : promos) moves.push_back(Move(from, to, p));
                    } else {
                        moves.push_back(Move(from, to));
                        // Double push
                        if ((us == WHITE && from >= SQ_A2 && from <= SQ_H2) || (us == BLACK && from >= SQ_A7 && from <= SQ_H7)) {
                            Square to2 = (Square)(from + 2 * dir);
                            if (board_array[to2] == NO_PIECE) {
                                Move m(from, to2);
                                m.is_double_pawn_push = true;
                                moves.push_back(m);
                            }
                        }
                    }
                }
                // Captures
                int caps[] = {dir - 1, dir + 1};
                for (int c_off : caps) {
                    int to_idx = from + c_off;
                    if (to_idx < 0 || to_idx >= 64 || std::abs((to_idx % 8) - (from % 8)) > 1) continue;
                    Square to_sq = (Square)to_idx;
                    if (board_array[to_sq] != NO_PIECE && ((board_array[to_sq] < B_PAWN) != (us == WHITE))) {
                        if ((us == WHITE && to_sq >= SQ_A8) || (us == BLACK && to_sq <= SQ_H1)) {
                             Piece promos[] = {us == WHITE ? W_QUEEN : B_QUEEN, us == WHITE ? W_ROOK : B_ROOK, us == WHITE ? W_BISHOP : B_BISHOP, us == WHITE ? W_KNIGHT : B_KNIGHT};
                             for (auto p : promos) moves.push_back(Move(from, to_sq, p));
                        } else {
                            moves.push_back(Move(from, to_sq));
                        }
                    } else if (to_sq == ep_square) {
                        Move m(from, to_sq);
                        m.is_en_passant = true;
                        moves.push_back(m);
                    }
                }
            } else if (pt == KNIGHT || pt == KING) {
                static const int knight_offs[] = {-17, -15, -10, -6, 6, 10, 15, 17};
                static const int king_offs[] = {-9, -8, -7, -1, 1, 7, 8, 9};
                const int* offsets = (pt == KNIGHT) ? knight_offs : king_offs;
                int count = (pt == KNIGHT) ? 8 : 8;

                for (int i = 0; i < count; ++i) {
                    int to_idx = from + offsets[i];
                    if (to_idx < 0 || to_idx >= 64 || std::abs((to_idx % 8) - (from % 8)) > 2) continue;
                    Square to_sq = (Square)to_idx;
                    if (!(our_pieces & square_to_bb(to_sq))) {
                        moves.push_back(Move(from, to_sq));
                    }
                }
                
                if (pt == KING) {
                    // Castling
                    if (us == WHITE) {
                        if ((castling_rights & WHITE_OO) && !(occ & (square_to_bb(SQ_F1) | square_to_bb(SQ_G1)))) {
                            if (!is_square_attacked(SQ_E1, BLACK) && !is_square_attacked(SQ_F1, BLACK)) {
                                Move m(SQ_E1, SQ_G1); m.is_castling = true; moves.push_back(m);
                            }
                        }
                        if ((castling_rights & WHITE_OOO) && !(occ & (square_to_bb(SQ_D1) | square_to_bb(SQ_C1) | square_to_bb(SQ_B1)))) {
                            if (!is_square_attacked(SQ_E1, BLACK) && !is_square_attacked(SQ_D1, BLACK)) {
                                Move m(SQ_E1, SQ_C1); m.is_castling = true; moves.push_back(m);
                            }
                        }
                    } else {
                        if ((castling_rights & BLACK_OO) && !(occ & (square_to_bb(SQ_F8) | square_to_bb(SQ_G8)))) {
                            if (!is_square_attacked(SQ_E8, WHITE) && !is_square_attacked(SQ_F8, WHITE)) {
                                Move m(SQ_E8, SQ_G8); m.is_castling = true; moves.push_back(m);
                            }
                        }
                        if ((castling_rights & BLACK_OOO) && !(occ & (square_to_bb(SQ_D8) | square_to_bb(SQ_C8) | square_to_bb(SQ_B8)))) {
                            if (!is_square_attacked(SQ_E8, WHITE) && !is_square_attacked(SQ_D8, WHITE)) {
                                Move m(SQ_E8, SQ_C8); m.is_castling = true; moves.push_back(m);
                            }
                        }
                    }
                }
            } else {
                // Sliding pieces (Bishop, Rook, Queen)
                static const int dirs[] = {8, -8, 1, -1, 7, -7, 9, -9};
                int start = (pt == ROOK) ? 0 : (pt == BISHOP ? 4 : 0);
                int end = (pt == ROOK) ? 4 : (pt == BISHOP ? 8 : 8);

                for (int i = start; i < end; ++i) {
                    int d = dirs[i];
                    for (int step = 1; step < 8; ++step) {
                        int to_idx = from + d * step;
                        if (to_idx < 0 || to_idx >= 64) break;
                        if ((d == 1 || d == -1 || d == 7 || d == -7 || d == 9 || d == -9) && std::abs((to_idx - d) % 8 - to_idx % 8) > 1) break;
                        
                        Square to_sq = (Square)to_idx;
                        if (board_array[to_sq] == NO_PIECE) {
                            moves.push_back(Move(from, to_sq));
                        } else {
                            if ((board_array[to_sq] < B_PAWN) != (us == WHITE)) {
                                moves.push_back(Move(from, to_sq));
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
}

// Material weights
const int MG_PIECE_VALUES[] = {100, 320, 330, 500, 900, 20000};

// Piece-Square Tables (simplified)
const int PST_PAWN[64] = {
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
};

const int PST_KNIGHT[64] = {
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
};

int Board::evaluate() const {
    int score = 0;
    
    for (int p_idx = 0; p_idx < 6; ++p_idx) {
        PieceType pt = (PieceType)p_idx;
        Bitboard white_bb = pieces[p_idx]; // W_PAWN to W_KING
        Bitboard black_bb = pieces[p_idx + 6]; // B_PAWN to B_KING
        
        while (white_bb) {
            int sq = pop_lsb(white_bb);
            score += MG_PIECE_VALUES[pt];
            if (pt == PAWN) score += PST_PAWN[sq];
            else if (pt == KNIGHT) score += PST_KNIGHT[sq];
        }
        
        while (black_bb) {
            int sq = pop_lsb(black_bb);
            // Black's PST is mirrored
            int mirror_sq = ((7 - (sq / 8)) * 8) + (sq % 8);
            score -= MG_PIECE_VALUES[pt];
            if (pt == PAWN) score -= PST_PAWN[mirror_sq];
            else if (pt == KNIGHT) score -= PST_KNIGHT[mirror_sq];
        }
    }
    
    return (side_to_move == WHITE) ? score : -score;
}

void Board::parse_fen(const std::string& fen) {
    clear();
    int idx = 0;
    int r = 7, f = 0;
    while (idx < fen.length() && fen[idx] != ' ') {
        if (fen[idx] == '/') { r--; f = 0; }
        else if (isdigit(fen[idx])) { f += fen[idx] - '0'; }
        else {
            Piece pc;
            switch (fen[idx]) {
                case 'P': pc = W_PAWN; break; case 'N': pc = W_KNIGHT; break;
                case 'B': pc = W_BISHOP; break; case 'R': pc = W_ROOK; break;
                case 'Q': pc = W_QUEEN; break; case 'K': pc = W_KING; break;
                case 'p': pc = B_PAWN; break; case 'n': pc = B_KNIGHT; break;
                case 'b': pc = B_BISHOP; break; case 'r': pc = B_ROOK; break;
                case 'q': pc = B_QUEEN; break; case 'k': pc = B_KING; break;
                default: pc = NO_PIECE; break;
            }
            if (pc != NO_PIECE) set_piece((Square)(r * 8 + f), pc);
            f++;
        }
        idx++;
    }
    
    if (idx < fen.length()) idx++; // Skip space
    if (idx < fen.length()) {
        side_to_move = (fen[idx] == 'w') ? WHITE : BLACK;
        idx += 2;
    }

    castling_rights = NO_CASTLING;
    while (idx < fen.length() && fen[idx] != ' ') {
        if (fen[idx] == 'K') castling_rights |= WHITE_OO;
        else if (fen[idx] == 'Q') castling_rights |= WHITE_OOO;
        else if (fen[idx] == 'k') castling_rights |= BLACK_OO;
        else if (fen[idx] == 'q') castling_rights |= BLACK_OOO;
        idx++;
    }

    if (idx < fen.length()) idx++;
    if (idx < fen.length() && fen[idx] != '-') {
        int f_ep = fen[idx] - 'a';
        int r_ep = fen[idx + 1] - '1';
        ep_square = (Square)(r_ep * 8 + f_ep);
    }
}

Move Board::parse_move(const std::string& move_str) {
    auto moves = generate_legal_moves();
    int from_f = move_str[0] - 'a', from_r = move_str[1] - '1';
    int to_f = move_str[2] - 'a', to_r = move_str[3] - '1';
    Square from = (Square)(from_r * 8 + from_f);
    Square to = (Square)(to_r * 8 + to_f);
    Piece promo = NO_PIECE;
    if (move_str.length() == 5) {
        char p = move_str[4];
        if (p == 'q') promo = (side_to_move == WHITE) ? W_QUEEN : B_QUEEN;
        else if (p == 'r') promo = (side_to_move == WHITE) ? W_ROOK : B_ROOK;
        else if (p == 'b') promo = (side_to_move == WHITE) ? W_BISHOP : B_BISHOP;
        else if (p == 'n') promo = (side_to_move == WHITE) ? W_KNIGHT : B_KNIGHT;
    }

    for (const auto& m : moves) {
        if (m.from == from && m.to == to && m.promotion == promo) return m;
    }
    return Move();
}

std::string Board::move_to_string(const Move& m) const {
    if (m.from == SQ_NONE) return "0000";
    std::string s = "";
    s += (char)('a' + (m.from % 8));
    s += (char)('1' + (m.from / 8));
    s += (char)('a' + (m.to % 8));
    s += (char)('1' + (m.to / 8));
    if (m.promotion != NO_PIECE) {
        char pt[] = "pnbrqkpnbrqk";
        s += pt[m.promotion];
    }
    return s;
}
