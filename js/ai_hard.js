/**
 * Hard AI (Powerful version)
 * Depth 3 search.
 */

const ChessAIHard = (() => {
    // For Node.js/Jest testing
    const _Logic = (typeof require !== 'undefined') ? require('./logic') : (typeof ChessLogic !== 'undefined' ? ChessLogic : null);
    const _Shared = (typeof require !== 'undefined') ? require('./ai_shared') : (typeof ChessAIShared !== 'undefined' ? ChessAIShared : null);
    const ChessLogic = _Logic;
    const ChessAIShared = _Shared;

    function getBestMove(color, depth = 3) {
        if (!_Logic || !_Shared) return null;
        const moves = _Logic.getAllLegalMoves(color);
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
            const origPiece = board[move.fromR][move.fromC];
            let piece = origPiece;
            const target = board[move.toR][move.toC];
            
            if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                piece = piece === 'P' ? 'Q' : 'q';
            }

            board[move.toR][move.toC] = piece;
            board[move.fromR][move.fromC] = null;

            const boardValue = ChessAIShared.minimax(board, 3, color !== 'w', -Infinity, Infinity, ChessLogic);

            board[move.fromR][move.fromC] = origPiece;
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

    const API = { getBestMove };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
