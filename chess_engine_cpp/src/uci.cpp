#include "../include/uci.h"
#include <iostream>
#include <string>
#include <sstream>
#include <vector>

UCI::UCI() : search(board) {}

void UCI::loop() {
    std::string line, cmd;
    while (std::getline(std::cin, line)) {
        std::stringstream ss(line);
        ss >> cmd;

        if (cmd == "uci") {
            std::cout << "id name MyChessEngine" << std::endl;
            std::cout << "id author Alexander" << std::endl;
            std::cout << "uciok" << std::endl;
        } else if (cmd == "isready") {
            std::cout << "readyok" << std::endl;
        } else if (cmd == "position") {
            parse_position(ss);
        } else if (cmd == "go") {
            parse_go(ss);
        } else if (cmd == "quit") {
            break;
        } else if (cmd == "ucinewgame") {
            board.parse_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        }
    }
}

void UCI::parse_position(std::stringstream& ss) {
    std::string type, fen;
    ss >> type;
    if (type == "startpos") {
        board.parse_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        ss >> type; // Try to read "moves"
    } else if (type == "fen") {
        std::string part;
        while (ss >> part && part != "moves") {
            fen += part + " ";
        }
        board.parse_fen(fen);
        if (part == "moves") type = "moves";
    }

    if (type == "moves" || (!ss.eof())) {
        std::string move_str;
        while (ss >> move_str) {
            Move m = board.parse_move(move_str);
            if (m.from != SQ_NONE) board.make_move(m);
        }
    }
}

void UCI::parse_go(std::stringstream& ss) {
    int depth = 6; // Default depth
    std::string token;
    while (ss >> token) {
        if (token == "depth") ss >> depth;
        // Handle wtime, btime etc. later if needed
    }

    Move best = search.find_best_move(depth);
    std::cout << "bestmove " << board.move_to_string(best) << std::endl;
}
