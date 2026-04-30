#ifndef BOARD_H
#define BOARD_H

#include "types.h"
#include <vector>
#include <string>
#include <iostream>

class Board {
public:
    Board();

    // Set a piece on a square
    void set_piece(Square sq, Piece pc);

    // Remove a piece from a square
    void remove_piece(Square sq);

    // Get the piece at a specific square
    Piece get_piece_at(Square sq) const;

    // Get the bitboard for a specific piece type and color
    Bitboard get_bitboard(Piece pc) const;

    // Get occupancy bitboards
    Bitboard get_occupancy(Color c) const;
    Bitboard get_total_occupancy() const;

    // Game state getters/setters
    Color get_side_to_move() const { return side_to_move; }
    void set_side_to_move(Color c) { side_to_move = c; }
    Square get_ep_square() const { return ep_square; }
    void set_ep_square(Square sq) { ep_square = sq; }
    int get_castling_rights() const { return castling_rights; }
    void set_castling_rights(int rights) { castling_rights = rights; }

    // Move generation
    std::vector<Move> generate_legal_moves();
    bool is_square_attacked(Square sq, Color attacker_color) const;
    
    // Evaluation
    int evaluate() const;

    // Making/Unmaking moves (necessary for legal move check)
    void make_move(const Move& m);
    void unmake_move(const Move& m, int prev_castling, Square prev_ep, Piece captured_piece);

    // UCI & FEN helpers
    void parse_fen(const std::string& fen);
    Move parse_move(const std::string& move_str);
    std::string move_to_string(const Move& m) const;

    // Clear the board
    void clear();

    // Debug: Print board to console
    void print() const;

private:
    Bitboard pieces[PIECE_NB];       // Bitboards for each piece type/color
    Bitboard color_occ[COLOR_NB];    // Combined occupancy for each color
    Bitboard total_occ;              // Total occupancy of the board
    Piece board_array[SQUARE_NB];    // Redundant array for fast piece lookup by square

    Color side_to_move;
    int castling_rights;
    Square ep_square;

    void update_occupancies();
    void generate_pseudo_legal_moves(std::vector<Move>& moves) const;
};

#endif // BOARD_H
