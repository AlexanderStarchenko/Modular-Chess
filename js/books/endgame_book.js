/**
 * Chess Endgame Tablebase Module
 * Contains curated endgame tablebase positions (Lucena, Philidor, K+P vs K, K+Q vs K, K+R vs K, etc.)
 * and move lookup helpers.
 */

var ChessEndgameModule = (() => {
    const ChessEndgameTablebase = {
    "4K3/4P3/8/3k4/8/8/1r6/4R3 w - -": [
        "e1e4"
    ],
    "4K3/4P3/3k4/8/4R3/8/1r6/8 w - -": [
        "e4d4"
    ],
    "4K3/4P3/8/8/8/8/1r6/4R2k w - -": [
        "e1e4"
    ],
    "3K4/3P4/8/2k5/8/8/1r6/3R4 w - -": [
        "d1d4"
    ],
    "3K4/3P4/2k5/8/3R4/8/1r6/8 w - -": [
        "d4c4"
    ],
    "5K2/5P2/8/4k3/8/8/1r6/5R2 w - -": [
        "f1f4"
    ],
    "5K2/5P2/4k3/8/5R2/8/1r6/8 w - -": [
        "f4e4"
    ],
    "2K5/2P5/8/1k6/8/8/1r6/2R5 w - -": [
        "c1c4"
    ],
    "2K5/2P5/1k6/8/2R5/8/1r6/8 w - -": [
        "c4b4"
    ],
    "1K6/1P6/8/k7/8/8/2r5/1R6 w - -": [
        "b1b4"
    ],
    "6K1/6P1/8/5k2/8/8/1r6/6R1 w - -": [
        "g1g4"
    ],
    "4r3/1R6/8/8/3K4/8/4p3/4k3 b - -": [
        "e8e5"
    ],
    "8/1R6/8/4r3/8/3K4/4p3/4k3 b - -": [
        "e5d5"
    ],
    "3r4/1R6/8/8/2K5/8/3p4/3k4 b - -": [
        "d8d5"
    ],
    "5r2/1R6/8/8/4K3/8/5p2/5k2 b - -": [
        "f8f5"
    ],
    "2r5/1R6/8/8/1K6/8/2p5/2k5 b - -": [
        "c8c5"
    ],
    "4k3/8/r7/4P3/8/8/4R3/4K3 b - -": [
        "a6a1",
        "a6h6"
    ],
    "4k3/8/1r6/4P3/8/8/4R3/4K3 b - -": [
        "b6b1",
        "b6h6"
    ],
    "4k3/8/2r5/4P3/8/8/4R3/4K3 b - -": [
        "c6c1",
        "c6h6"
    ],
    "4k3/8/5r2/4P3/8/8/4R3/4K3 b - -": [
        "f6f1",
        "f6h6"
    ],
    "4k3/8/6r1/4P3/8/8/4R3/4K3 b - -": [
        "g6g1",
        "g6h6"
    ],
    "4k3/8/7r/4P3/8/8/4R3/4K3 b - -": [
        "h6h1"
    ],
    "3k4/8/r7/3P4/8/8/3R4/3K4 b - -": [
        "a6a1",
        "a6h6"
    ],
    "3k4/8/1r6/3P4/8/8/3R4/3K4 b - -": [
        "b6b1",
        "b6h6"
    ],
    "5k2/8/r7/5P2/8/8/5R2/5K2 b - -": [
        "a6a1",
        "a6h6"
    ],
    "5k2/8/1r6/5P2/8/8/5R2/5K2 b - -": [
        "b6b1",
        "b6h6"
    ],
    "2k5/8/r7/2P5/8/8/2R5/2K5 b - -": [
        "a6a1",
        "a6h6"
    ],
    "4k3/8/4P3/5K2/8/8/8/r7 b - -": [
        "a1a5",
        "a1f1"
    ],
    "4k3/8/4P3/3K4/8/8/8/r7 b - -": [
        "a1a6",
        "a1d1"
    ],
    "4k3/8/4P3/5K2/8/8/8/1r6 b - -": [
        "b1b5",
        "b1f1"
    ],
    "4k3/8/4P3/3K4/8/8/8/1r6 b - -": [
        "b1b6",
        "b1d1"
    ],
    "4k3/8/4P3/5K2/8/8/8/7r b - -": [
        "h1h5",
        "h1f1"
    ],
    "3k4/8/3P4/4K3/8/8/8/r7 b - -": [
        "a1a5",
        "a1e1"
    ],
    "3k4/8/3P4/2K5/8/8/8/r7 b - -": [
        "a1a6",
        "a1c1"
    ],
    "4k3/8/8/4K3/4P3/8/8/8 w - -": [
        "e5e6",
        "e5d5",
        "e5f5"
    ],
    "3k4/8/8/3K3/3P4/8/8/8 w - -": [
        "d5d6",
        "d5c5",
        "d5e5"
    ],
    "5k2/8/8/5K2/5P2/8/8/8 w - -": [
        "f5f6",
        "f5e5",
        "f5g5"
    ],
    "2k5/8/8/2K5/2P5/8/8/8 w - -": [
        "c5c6",
        "c5b5",
        "c5d5"
    ],
    "1k6/8/8/1K6/1P6/8/8/8 w - -": [
        "b5b6",
        "b5a5",
        "b5c5"
    ],
    "6k1/8/8/6K1/6P1/8/8/8 w - -": [
        "g5g6",
        "g5f5",
        "g5h5"
    ],
    "4k3/8/4P3/4K3/8/8/8/8 b - -": [
        "e8e7"
    ],
    "3k4/8/3P4/3K4/8/8/8/8 b - -": [
        "d8d7"
    ],
    "5k2/8/5P2/5K2/8/8/8/8 b - -": [
        "f8f7"
    ],
    "2k5/8/2P5/2K5/8/8/8/8 b - -": [
        "c8c7"
    ],
    "1k6/8/1P6/1K6/8/8/8/8 b - -": [
        "b8b7"
    ],
    "6k1/8/6P1/6K1/8/8/8/8 b - -": [
        "g8g7"
    ],
    "8/4k3/4K3/8/4P3/8/8/8 w - -": [
        "e6d5",
        "e6f5"
    ],
    "8/3k4/3K4/8/3P4/8/8/8 w - -": [
        "d6c5",
        "d6e5"
    ],
    "8/5k2/5K2/8/5P2/8/8/8 w - -": [
        "f6e5",
        "f6g5"
    ],
    "8/2k5/2K5/8/2P5/8/8/8 w - -": [
        "c6b5",
        "c6d5"
    ],
    "8/8/4k3/8/4K3/4P3/8/8 w - -": [
        "e4d4",
        "e4f4"
    ],
    "8/8/3k4/8/3K4/3P4/8/8 w - -": [
        "d4c4",
        "d4e4"
    ],
    "8/8/5k2/8/5K2/5P2/8/8 w - -": [
        "f4e4",
        "f4g4"
    ],
    "8/8/2k5/8/2K5/2P5/8/8 w - -": [
        "c4b4",
        "c4d4"
    ],
    "8/8/4k3/4P3/4K3/8/8/8 w - -": [
        "e4f4",
        "e4d4"
    ],
    "8/8/3k4/3P4/3K4/8/8/8 w - -": [
        "d4c4",
        "d4e4"
    ],
    "8/8/8/3k4/8/3K4/3P4/8 w - -": [
        "d3e3"
    ],
    "8/8/8/4k3/8/4K3/4P3/8 w - -": [
        "e3f3"
    ],
    "8/8/8/2k5/8/2K5/2P5/8 w - -": [
        "c3d3"
    ],
    "8/4P3/8/8/8/4K3/8/3Q3k w - -": [
        "d1f3",
        "d1e2"
    ],
    "8/3P4/8/8/8/3K4/8/4Q2k w - -": [
        "e1e2",
        "e1f2"
    ],
    "8/1P6/8/8/8/1K6/8/5Q1k w - -": [
        "f1b1",
        "f1f3"
    ],
    "8/6P1/8/8/8/6K1/8/1Q5k w - -": [
        "b1g1",
        "b1f1"
    ],
    "8/2P5/8/8/8/2K5/8/4Q2k w - -": [
        "e1c1",
        "e1e4"
    ],
    "8/5P2/8/8/8/5K2/8/3Q3k w - -": [
        "d1f1",
        "d1d4"
    ],
    "8/P7/8/8/8/1K6/8/5Q1k w - -": [
        "f1a1",
        "f1f3"
    ],
    "8/7P/8/8/8/6K1/8/1Q5k w - -": [
        "b1h1",
        "b1f1"
    ],
    "7K/8/8/1p6/8/8/P7/7k w - -": [
        "h8g7"
    ],
    "8/6K1/8/1p6/8/8/P7/7k w - -": [
        "g7f6"
    ],
    "8/8/5K2/1p6/8/8/P7/7k w - -": [
        "f6e5",
        "f6e6"
    ],
    "8/8/8/8/8/5k2/8/4K2Q w - -": [
        "h1h3",
        "h1f1"
    ],
    "8/8/8/8/8/4k3/8/4K1Q1 w - -": [
        "g1e3"
    ],
    "8/8/8/8/8/8/5k2/6Q1 w - -": [
        "g1g2"
    ],
    "4k3/8/8/8/8/8/4R3/4K3 w - -": [
        "e2e3",
        "e1f2"
    ],
    "4k3/8/8/8/4R3/8/8/4K3 w - -": [
        "e4e5",
        "e1f2"
    ],
    "4k3/8/4R3/8/8/8/8/4K3 w - -": [
        "e6e7",
        "e1d2"
    ],
    "8/4k3/8/3K4/4R3/8/8/8 w - -": [
        "e4e5",
        "d5c5"
    ],
    "8/4k3/8/4K3/8/8/8/R7 w - -": [
        "a1a7"
    ],
    "8/8/8/8/4k3/8/R7/R3K3 w - -": [
        "a2a4"
    ],
    "8/8/8/8/4k3/R7/8/R3K3 w - -": [
        "a1a2"
    ],
    "8/8/8/4k3/R7/1R6/8/4K3 w - -": [
        "a4a5"
    ],
    "8/8/4k3/R7/8/1R6/8/4K3 w - -": [
        "b3b6"
    ],
    "8/4k3/1R6/R7/8/8/8/4K3 w - -": [
        "a5a7"
    ],
    "4k3/R7/1R6/8/8/8/8/4K3 w - -": [
        "b6b8"
    ]
    };

    function parseUciMove(moveStr) {
        const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
        const fromC = files[moveStr[0]];
        const fromR = 8 - parseInt(moveStr[1]);
        const toC = files[moveStr[2]];
        const toR = 8 - parseInt(moveStr[3]);
        const promotion = moveStr.length > 4 ? moveStr[4] : null;
        return { fromR, fromC, toR, toC, promotion };
    }

    function getEndgameTablebaseMove(fen) {
        if (!fen) return null;
        const parts = fen.split(/\s+/);
        const normalized = parts.slice(0, 4).join(' ');
        const moves = ChessEndgameTablebase[normalized];
        if (moves && moves.length > 0) {
            const selected = moves[Math.floor(Math.random() * moves.length)];
            const m = parseUciMove(selected);
            m.isEndgame = true;
            return m;
        }
        return null;
    }

    function getEndgameMove(fen, logic) {
        const tbMove = getEndgameTablebaseMove(fen);
        if (tbMove) return tbMove;
        return null;
    }

    const API = { ChessEndgameTablebase, getEndgameTablebaseMove, getEndgameMove, parseUciMove };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();

if (typeof globalThis !== 'undefined') {
    globalThis.ChessEndgameModule = ChessEndgameModule;
}
