const ChessLogic = require('../js/logic.js');
const fs = require('fs');

const rawEndgames = [
    // --- 1. LUCENA POSITIONS (BRIDGE TECHNIQUE) ---
    // White passed pawn on 7th rank, King on 8th rank, Rook on 1st rank.
    // 1. Re4! Black king checks, White King steps out to 7th, then 6th, and Rook on 4th shields the king!
    { fen: '4K3/4P3/8/3k4/8/8/1r6/4R3 w - -', moves: ['e1e4'] },
    { fen: '4K3/4P3/3k4/8/4R3/8/1r6/8 w - -', moves: ['e4d4'] },
    { fen: '4K3/4P3/8/8/8/8/1r6/4R2k w - -', moves: ['e1e4'] },
    { fen: '3K4/3P4/8/2k5/8/8/1r6/3R4 w - -', moves: ['d1d4'] },
    { fen: '3K4/3P4/2k5/8/3R4/8/1r6/8 w - -', moves: ['d4c4'] },
    { fen: '5K2/5P2/8/4k3/8/8/1r6/5R2 w - -', moves: ['f1f4'] },
    { fen: '5K2/5P2/4k3/8/5R2/8/1r6/8 w - -', moves: ['f4e4'] },
    { fen: '2K5/2P5/8/1k6/8/8/1r6/2R5 w - -', moves: ['c1c4'] },
    { fen: '2K5/2P5/1k6/8/2R5/8/1r6/8 w - -', moves: ['c4b4'] },
    { fen: '1K6/1P6/8/k7/8/8/2r5/1R6 w - -', moves: ['b1b4'] },
    { fen: '6K1/6P1/8/5k2/8/8/1r6/6R1 w - -', moves: ['g1g4'] },

    // Lucena for Black:
    { fen: '4r3/1R6/8/8/3K4/8/4p3/4k3 b - -', moves: ['e8e5'] },
    { fen: '8/1R6/8/4r3/8/3K4/4p3/4k3 b - -', moves: ['e5d5'] },
    { fen: '3r4/1R6/8/8/2K5/8/3p4/3k4 b - -', moves: ['d8d5'] },
    { fen: '5r2/1R6/8/8/4K3/8/5p2/5k2 b - -', moves: ['f8f5'] },
    { fen: '2r5/1R6/8/8/1K6/8/2p5/2k5 b - -', moves: ['c8c5'] },

    // --- 2. PHILIDOR DEFENSE (6TH RANK CUTOFF & BACK CHECKS) ---
    // Defending King in front of pawn. Defending Rook on 6th rank prevents enemy King advance.
    { fen: '4k3/8/r7/4P3/8/8/4R3/4K3 b - -', moves: ['a6a1', 'a6h6'] },
    { fen: '4k3/8/1r6/4P3/8/8/4R3/4K3 b - -', moves: ['b6b1', 'b6h6'] },
    { fen: '4k3/8/2r5/4P3/8/8/4R3/4K3 b - -', moves: ['c6c1', 'c6h6'] },
    { fen: '4k3/8/5r2/4P3/8/8/4R3/4K3 b - -', moves: ['f6f1', 'f6h6'] },
    { fen: '4k3/8/6r1/4P3/8/8/4R3/4K3 b - -', moves: ['g6g1', 'g6h6'] },
    { fen: '4k3/8/7r/4P3/8/8/4R3/4K3 b - -', moves: ['h6h1'] },
    { fen: '3k4/8/r7/3P4/8/8/3R4/3K4 b - -', moves: ['a6a1', 'a6h6'] },
    { fen: '3k4/8/1r6/3P4/8/8/3R4/3K4 b - -', moves: ['b6b1', 'b6h6'] },
    { fen: '5k2/8/r7/5P2/8/8/5R2/5K2 b - -', moves: ['a6a1', 'a6h6'] },
    { fen: '5k2/8/1r6/5P2/8/8/5R2/5K2 b - -', moves: ['b6b1', 'b6h6'] },
    { fen: '2k5/8/r7/2P5/8/8/2R5/2K5 b - -', moves: ['a6a1', 'a6h6'] },

    // When White pushes pawn to 6th rank, Black drops rook to 1st rank for endless rear checks:
    { fen: '4k3/8/4P3/5K2/8/8/8/r7 b - -', moves: ['a1a5', 'a1f1'] },
    { fen: '4k3/8/4P3/3K4/8/8/8/r7 b - -', moves: ['a1a6', 'a1d1'] },
    { fen: '4k3/8/4P3/5K2/8/8/8/1r6 b - -', moves: ['b1b5', 'b1f1'] },
    { fen: '4k3/8/4P3/3K4/8/8/8/1r6 b - -', moves: ['b1b6', 'b1d1'] },
    { fen: '4k3/8/4P3/5K2/8/8/8/7r b - -', moves: ['h1h5', 'h1f1'] },
    { fen: '3k4/8/3P4/4K3/8/8/8/r7 b - -', moves: ['a1a5', 'a1e1'] },
    { fen: '3k4/8/3P4/2K5/8/8/8/r7 b - -', moves: ['a1a6', 'a1c1'] },

    // --- 3. KING & PAWN VS KING (OPPOSITION & KEY SQUARES) ---
    // Vertical opposition: Attacking King takes opposition when defending king is on 8th rank
    { fen: '4k3/8/8/4K3/4P3/8/8/8 w - -', moves: ['e5e6', 'e5d5', 'e5f5'] },
    { fen: '3k4/8/8/3K3/3P4/8/8/8 w - -', moves: ['d5d6', 'd5c5', 'd5e5'] },
    { fen: '5k2/8/8/5K2/5P2/8/8/8 w - -', moves: ['f5f6', 'f5e5', 'f5g5'] },
    { fen: '2k5/8/8/2K5/2P5/8/8/8 w - -', moves: ['c5c6', 'c5b5', 'c5d5'] },
    { fen: '1k6/8/8/1K6/1P6/8/8/8 w - -', moves: ['b5b6', 'b5a5', 'b5c5'] },
    { fen: '6k1/8/8/6K1/6P1/8/8/8 w - -', moves: ['g5g6', 'g5f5', 'g5h5'] },

    // Defending King takes opposition:
    { fen: '4k3/8/4P3/4K3/8/8/8/8 b - -', moves: ['e8e7'] },
    { fen: '3k4/8/3P4/3K4/8/8/8/8 b - -', moves: ['d8d7'] },
    { fen: '5k2/8/5P2/5K2/8/8/8/8 b - -', moves: ['f8f7'] },
    { fen: '2k5/8/2P5/2K5/8/8/8/8 b - -', moves: ['c8c7'] },
    { fen: '1k6/8/1P6/1K6/8/8/8/8 b - -', moves: ['b8b7'] },
    { fen: '6k1/8/6P1/6K1/8/8/8/8 b - -', moves: ['g8g7'] },

    // Key squares: King on 6th rank in front of pawn wins regardless of who moves:
    { fen: '8/4k3/4K3/8/4P3/8/8/8 w - -', moves: ['e6d5', 'e6f5'] },
    { fen: '8/3k4/3K4/8/3P4/8/8/8 w - -', moves: ['d6c5', 'd6e5'] },
    { fen: '8/5k2/5K2/8/5P2/8/8/8 w - -', moves: ['f6e5', 'f6g5'] },
    { fen: '8/2k5/2K5/8/2P5/8/8/8 w - -', moves: ['c6b5', 'c6d5'] },

    // King advancing ahead of pawn:
    { fen: '8/8/4k3/8/4K3/4P3/8/8 w - -', moves: ['e4d4', 'e4f4'] },
    { fen: '8/8/3k4/8/3K4/3P4/8/8 w - -', moves: ['d4c4', 'd4e4'] },
    { fen: '8/8/5k2/8/5K2/5P2/8/8 w - -', moves: ['f4e4', 'f4g4'] },
    { fen: '8/8/2k5/8/2K5/2P5/8/8 w - -', moves: ['c4b4', 'c4d4'] },

    // Pawn push when safe:
    { fen: '8/8/4k3/4P3/4K3/8/8/8 w - -', moves: ['e4f4', 'e4d4'] },
    { fen: '8/8/3k4/3P4/3K4/8/8/8 w - -', moves: ['d4c4', 'd4e4'] },

    // Triangulation:
    { fen: '8/8/8/3k4/8/3K4/3P4/8 w - -', moves: ['d3e3'] },
    { fen: '8/8/8/4k3/8/4K3/4P3/8 w - -', moves: ['e3f3'] },
    { fen: '8/8/8/2k5/8/2K5/2P5/8 w - -', moves: ['c3d3'] },

    // --- 4. QUEEN VS PAWN ON 7TH RANK ---
    // Central & Knight pawns (White Queen steps in front):
    { fen: '8/4P3/8/8/8/4K3/8/3Q3k w - -', moves: ['d1f3', 'd1e2'] },
    { fen: '8/3P4/8/8/8/3K4/8/4Q2k w - -', moves: ['e1e2', 'e1f2'] },
    { fen: '8/1P6/8/8/8/1K6/8/5Q1k w - -', moves: ['f1b1', 'f1f3'] },
    { fen: '8/6P1/8/8/8/6K1/8/1Q5k w - -', moves: ['b1g1', 'b1f1'] },
    // Bishop & Rook pawns:
    { fen: '8/2P5/8/8/8/2K5/8/4Q2k w - -', moves: ['e1c1', 'e1e4'] },
    { fen: '8/5P2/8/8/8/5K2/8/3Q3k w - -', moves: ['d1f1', 'd1d4'] },
    { fen: '8/P7/8/8/8/1K6/8/5Q1k w - -', moves: ['f1a1', 'f1f3'] },
    { fen: '8/7P/8/8/8/6K1/8/1Q5k w - -', moves: ['b1h1', 'b1f1'] },

    // --- 5. RÉTI ENDGAME STUDY ---
    { fen: '7K/8/8/1p6/8/8/P7/7k w - -', moves: ['h8g7'] },
    { fen: '8/6K1/8/1p6/8/8/P7/7k w - -', moves: ['g7f6'] },
    { fen: '8/8/5K2/1p6/8/8/P7/7k w - -', moves: ['f6e5', 'f6e6'] },

    // --- 6. ELEMENTARY CHECKMATES ---
    // K+Q vs K:
    { fen: '8/8/8/8/8/5k2/8/4K2Q w - -', moves: ['h1h3', 'h1f1'] },
    { fen: '8/8/8/8/8/4k3/8/4K1Q1 w - -', moves: ['g1e3'] },
    { fen: '8/8/8/8/8/8/5k2/6Q1 w - -', moves: ['g1g2'] },
    // K+R vs K:
    { fen: '4k3/8/8/8/8/8/4R3/4K3 w - -', moves: ['e2e3', 'e1f2'] },
    { fen: '4k3/8/8/8/4R3/8/8/4K3 w - -', moves: ['e4e5', 'e1f2'] },
    { fen: '4k3/8/4R3/8/8/8/8/4K3 w - -', moves: ['e6e7', 'e1d2'] },
    { fen: '8/4k3/8/3K4/4R3/8/8/8 w - -', moves: ['e4e5', 'd5c5'] },
    { fen: '8/4k3/8/4K3/8/8/8/R7 w - -', moves: ['a1a7'] },
    // Two Rooks (Ladder Mate):
    { fen: '8/8/8/8/4k3/8/R7/R3K3 w - -', moves: ['a2a4'] },
    { fen: '8/8/8/8/4k3/R7/8/R3K3 w - -', moves: ['a1a2'] },
    { fen: '8/8/8/4k3/R7/1R6/8/4K3 w - -', moves: ['a4a5'] },
    { fen: '8/8/4k3/R7/8/1R6/8/4K3 w - -', moves: ['b3b6'] },
    { fen: '8/4k3/1R6/R7/8/8/8/4K3 w - -', moves: ['a5a7'] },
    { fen: '4k3/R7/1R6/8/8/8/8/4K3 w - -', moves: ['b6b8'] }
];

const validatedEndgames = {};
let validCount = 0;
let errCount = 0;

for (const item of rawEndgames) {
    const fen = item.fen;
    ChessLogic.loadFen(fen);
    const validMoves = [];
    for (const uci of item.moves) {
        const fc = uci.charCodeAt(0) - 97;
        const fr = 8 - parseInt(uci[1], 10);
        const tc = uci.charCodeAt(2) - 97;
        const tr = 8 - parseInt(uci[3], 10);
        const ok = ChessLogic.movePiece(fr, fc, tr, tc);
        if (!ok) {
            console.error(`Invalid move: ${uci} in FEN: ${fen}`);
            errCount++;
        } else {
            validMoves.push(uci);
            validCount++;
        }
        ChessLogic.loadFen(fen);
    }
    if (validMoves.length > 0) {
        const parts = fen.split(/\s+/);
        const normalized = parts.slice(0, 4).join(' ');
        validatedEndgames[normalized] = validMoves;
    }
}

console.log(`Validated ${validCount} moves across ${Object.keys(validatedEndgames).length} endgame positions. Errors: ${errCount}`);

if (errCount === 0) {
    fs.writeFileSync('scripts/generated_endgame.json', JSON.stringify(validatedEndgames, null, 2));
    console.log('Saved scripts/generated_endgame.json successfully!');
}
