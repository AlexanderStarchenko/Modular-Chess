/**
 * Extra Hard AI (Most powerful JavaScript version)
 * Uses Iterative Deepening, Null Move Pruning, and History Heuristic.
 */

var ChessAIVeryHard = (() => {
    // For Node.js/Jest testing
    const _Logic = (typeof ChessLogic !== 'undefined' ? ChessLogic : (typeof require !== 'undefined' ? require('./logic') : null));
    const _Shared = (typeof ChessAIShared !== 'undefined' ? ChessAIShared : (typeof require !== 'undefined' ? require('./ai_shared') : null));

    let nodesVisited = 0;
    const historyTable = {}; // For history heuristic move ordering

    function getBestMove(color) {
        nodesVisited = 0;
        const board = _Logic.getBoard();
        const startTime = Date.now();
        const timeLimit = 2500; // 2.5 seconds per move

        if (typeof ChessWASM !== 'undefined' && ChessWASM.isLoaded()) {
            const gameState = _Logic.getState();
            let bestMoveGlobal = null;
            let depth = 1;
            while (depth <= 10) {
                const bestMove = ChessWASM.searchWASM(depth, color === 'w', -Infinity, Infinity, gameState);
                const value = ChessWASM.getSearchScore();
                if (Date.now() - startTime > timeLimit && depth >= 3 && bestMoveGlobal) break;
                bestMoveGlobal = bestMove;
                if (Math.abs(value) > 90000) break;
                depth++;
            }
            console.log(`Extra Hard AI (WASM): Depth ${depth-1}`);
            return bestMoveGlobal;
        }

        let bestMoveGlobal = null;
        let depth = 1;

        // Iterative Deepening
        while (depth <= 10) { 
            const { bestMove, value } = rootSearch(board, depth, color, startTime, timeLimit);
            
            // Allow minimum depth of 3 even if time is up (for better quality in sync mode)
            if (Date.now() - startTime > timeLimit && depth >= 3 && bestMoveGlobal) break;
            
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
        let moves = _Logic.getAllLegalMoves(color, false);
        if (moves.length === 0) return { bestMove: null, value: 0 };

        // Order moves using history and PST
        moves = orderMoves(moves, board, depth);

        let bestMoves = [];
        let bestValue = isMaximizing ? -Infinity : Infinity;

        for (const move of moves) {
            if (Date.now() - startTime > timeLimit && depth >= 3 && bestMoves.length > 0) break;

            const undoState = _Shared.applyMove(board, move);

            const value = _Shared.minimax(board, depth - 1, !isMaximizing, -Infinity, Infinity, _Logic);

            _Shared.undoMove(board, move, undoState);

            if (isMaximizing) {
                if (value > bestValue) {
                    bestValue = value;
                    bestMoves = [move];
                } else if (value === bestValue) {
                    bestMoves.push(move);
                }
            } else {
                if (value < bestValue) {
                    bestValue = value;
                    bestMoves = [move];
                } else if (value === bestValue) {
                    bestMoves.push(move);
                }
            }
        }
        
        // Pick a random move from the best ones
        const finalMove = bestMoves.length > 0 ? bestMoves[Math.floor(Math.random() * bestMoves.length)] : moves[0];
        return { bestMove: finalMove, value: bestValue };
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
