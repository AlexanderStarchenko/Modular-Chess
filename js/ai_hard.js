/**
 * Hard AI (Powerful version)
 * Depth 3 search.
 */

const ChessAIHard = (() => {
    function getBestMove(color) {
        const moves = ChessLogic.getAllLegalMoves(color);
        if (moves.length === 0) return null;

        const board = ChessLogic.getBoard();
        let bestMove = null;
        let bestValue = color === 'w' ? -Infinity : Infinity;

        // We can shuffle slightly for variety if scores are equal, 
        // but it's better to just rely on the alpha-beta if we want pure strength.
        // Let's order moves properly. We'll use a local basic ordering to avoid 
        // modifying ai_shared just to expose orderMoves.
        const PIECE_VALUES = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };
        moves.forEach(m => {
            let score = 0;
            const target = board[m.toR][m.toC];
            if (target) {
                const attacker = board[m.fromR][m.fromC];
                score = 100 * (PIECE_VALUES[target.toLowerCase()] || 0) - (PIECE_VALUES[attacker.toLowerCase()] || 0);
            }
            // Add slight randomness to score to add variety among equal moves
            m.score = score + Math.random();
        });
        moves.sort((a, b) => b.score - a.score);

        for (const move of moves) {
            const piece = board[move.fromR][move.fromC];
            const target = board[move.toR][move.toC];
            board[move.toR][move.toC] = piece;
            board[move.fromR][move.fromC] = null;

            const boardValue = ChessAIShared.minimax(board, 4, color !== 'w', -Infinity, Infinity, ChessLogic);

            board[move.fromR][move.fromC] = piece;
            board[move.toR][move.toC] = target;

            if (color === 'w') {
                if (boardValue > bestValue) {
                    bestValue = boardValue;
                    bestMove = move;
                }
            } else {
                if (boardValue < bestValue) {
                    bestValue = boardValue;
                    bestMove = move;
                }
            }
        }
        return bestMove;
    }

    return { getBestMove };
})();
