#ifndef SEARCH_H
#define SEARCH_H

#include "board.h"
#include <climits>
#include <vector>

class Search {
public:
    Search(Board& b) : board(b), nodes(0) {}

    // Main entry point for iterative deepening
    Move find_best_move(int max_depth);

private:
    Board& board;
    long long nodes;

    // Negamax with Alpha-Beta
    int negamax(int depth, int alpha, int beta);
    
    // Simple move ordering
    void order_moves(std::vector<Move>& moves);
};

#endif // SEARCH_H
