#ifndef UCI_H
#define UCI_H

#include "board.h"
#include "search.h"
#include <sstream>

class UCI {
public:
    UCI();
    void loop();

private:
    Board board;
    Search search;

    void parse_position(std::stringstream& ss);
    void parse_go(std::stringstream& ss);
};

#endif // UCI_H
