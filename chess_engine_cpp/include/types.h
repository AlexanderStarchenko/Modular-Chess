#ifndef TYPES_H
#define TYPES_H

#include <cstdint>

#ifdef _MSC_VER
#include <intrin.h>
#endif

typedef uint64_t Bitboard;

enum Color {
    WHITE, BLACK, COLOR_NB = 2
};

enum PieceType {
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, PIECE_TYPE_NB = 6
};

enum Piece {
    W_PAWN, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
    B_PAWN, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
    PIECE_NB = 12, NO_PIECE = 13
};

enum Square {
    SQ_A1, SQ_B1, SQ_C1, SQ_D1, SQ_E1, SQ_F1, SQ_G1, SQ_H1,
    SQ_A2, SQ_B2, SQ_C2, SQ_D2, SQ_E2, SQ_F2, SQ_G2, SQ_H2,
    SQ_A3, SQ_B3, SQ_C3, SQ_D3, SQ_E3, SQ_F3, SQ_G3, SQ_H3,
    SQ_A4, SQ_B4, SQ_C4, SQ_D4, SQ_E4, SQ_F4, SQ_G4, SQ_H4,
    SQ_A5, SQ_B5, SQ_C5, SQ_D5, SQ_E5, SQ_F5, SQ_G5, SQ_H5,
    SQ_A6, SQ_B6, SQ_C6, SQ_D6, SQ_E6, SQ_F6, SQ_G6, SQ_H6,
    SQ_A7, SQ_B7, SQ_C7, SQ_D7, SQ_E7, SQ_F7, SQ_G7, SQ_H7,
    SQ_A8, SQ_B8, SQ_C8, SQ_D8, SQ_E8, SQ_F8, SQ_G8, SQ_H8,
    SQ_NONE, SQUARE_NB = 64
};

enum CastlingRights {
    NO_CASTLING = 0,
    WHITE_OO = 1, WHITE_OOO = 2,
    BLACK_OO = 4, BLACK_OOO = 8,
    ANY_WHITE = WHITE_OO | WHITE_OOO,
    ANY_BLACK = BLACK_OO | BLACK_OOO
};

struct Move {
    Square from;
    Square to;
    Piece promotion;
    bool is_castling;
    bool is_en_passant;
    bool is_double_pawn_push;

    Move() : from(SQ_NONE), to(SQ_NONE), promotion(NO_PIECE), 
             is_castling(false), is_en_passant(false), is_double_pawn_push(false) {}

    Move(Square f, Square t, Piece p = NO_PIECE) : 
             from(f), to(t), promotion(p), 
             is_castling(false), is_en_passant(false), is_double_pawn_push(false) {}
};

inline Bitboard square_to_bb(Square sq) {
    return 1ULL << sq;
}

inline int get_lsb(Bitboard bb) {
#ifdef _MSC_VER
    unsigned long index;
    _BitScanForward64(&index, bb);
    return (int)index;
#else
    return __builtin_ctzll(bb);
#endif
}

inline int pop_lsb(Bitboard& bb) {
    int index = get_lsb(bb);
    bb &= (bb - 1);
    return index;
}

#endif // TYPES_H
