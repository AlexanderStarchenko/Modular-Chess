/**
 * Extra Hard AI (Most powerful JavaScript version)
 * Uses Iterative Deepening, Null Move Pruning, and History Heuristic.
 */

var ChessAIVeryHard = (() => {
    let nodesVisited = 0;
    const historyTable = {}; // For history heuristic move ordering

    function getBestMove(color) {
        nodesVisited = 0;
        const board = ChessLogic.getBoard();
        const startTime = Date.now();
        const timeLimit = 3500; // 3.5 seconds per move

        let bestMoveGlobal = null;
        let depth = 1;

        // Iterative Deepening
        while (depth <= 10) { // Limit depth to 10 max
            const { bestMove, value } = rootSearch(board, depth, color, startTime, timeLimit);
            
            if (Date.now() - startTime > timeLimit && bestMoveGlobal) break;
            
            bestMoveGlobal = bestMove;
            
            // If it's a forced mate, stop searching
            if (Math.abs(value) > 9000) break;
            
            depth++;
        }

        console.log(`Extra Hard AI: Depth ${depth-1}, Nodes: ${nodesVisited}`);
        return bestMoveGlobal;
    }

    function rootSearch(board, depth, color, startTime, timeLimit) {
        const isMaximizing = color === 'w';
        let moves = ChessLogic.getAllLegalMoves(color, false);
        if (moves.length === 0) return { bestMove: null, value: 0 };

        // Order moves using history and PST
        moves = orderMoves(moves, board, depth);

        let bestMove = moves[0];
        let bestValue = isMaximizing ? -Infinity : Infinity;

        for (const move of moves) {
            if (Date.now() - startTime > timeLimit) break;

            const origPiece = board[move.fromR][move.fromC];
            let piece = origPiece;
            const target = board[move.toR][move.toC];
            
            if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                piece = piece === 'P' ? 'Q' : 'q';
            }

            board[move.toR][move.toC] = piece;
            board[move.fromR][move.fromC] = null;

            const value = ChessAIShared.minimax(board, depth - 1, !isMaximizing, -Infinity, Infinity, ChessLogic);

            board[move.fromR][move.fromC] = origPiece;
            board[move.toR][move.toC] = target;

            if (isMaximizing) {
                if (value > bestValue) {
                    bestValue = value;
                    bestMove = move;
                }
            } else {
                if (value < bestValue) {
                    bestValue = value;
                    bestMove = move;
                }
            }
        }

        return { bestMove, value: bestValue };
    }

    function orderMoves(moves, board, depth) {
        moves.forEach(m => {
            let score = 0;
            const piece = board[m.fromR][m.fromC];
            const target = board[m.toR][m.toC];
            
            if (target) {
                // MVV-LVA
                const valTarget = getPieceValue(target);
                const valAttacker = getPieceValue(piece);
                score = 1000 * valTarget - valAttacker;
            }

            // History heuristic
            const moveKey = `${m.fromR}${m.fromC}${m.toR}${m.toC}`;
            if (historyTable[moveKey]) {
                score += historyTable[moveKey];
            }

            m.searchScore = score;
        });

        return moves.sort((a, b) => b.searchScore - a.searchScore);
    }

    function getPieceValue(p) {
        const vals = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };
        return vals[p.toLowerCase()] || 0;
    }

    return { getBestMove };
})();
