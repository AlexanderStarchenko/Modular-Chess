/**
 * Medium AI (Middle version)
 * Depth 2 search.
 */

const ChessAIMedium = (() => {
    // For Node.js/Jest testing
    const _Logic = (typeof require !== 'undefined') ? require('./logic') : (typeof ChessLogic !== 'undefined' ? ChessLogic : null);
    const _Shared = (typeof require !== 'undefined') ? require('./ai_shared') : (typeof ChessAIShared !== 'undefined' ? ChessAIShared : null);
    const ChessLogic = _Logic;
    const ChessAIShared = _Shared;

    function getBestMove(color) {
        if (!_Logic || !_Shared) return null;
        const moves = _Logic.getAllLegalMoves(color);
        if (moves.length === 0) return null;

        const board = ChessLogic.getBoard();
        let bestMove = null;
        let bestValue = color === 'w' ? -Infinity : Infinity;

        // Shuffle moves for variety
        moves.sort(() => Math.random() - 0.5);

        for (const move of moves) {
            const origPiece = board[move.fromR][move.fromC];
            let piece = origPiece;
            const target = board[move.toR][move.toC];
            
            if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                piece = piece === 'P' ? 'Q' : 'q';
            }

            board[move.toR][move.toC] = piece;
            board[move.fromR][move.fromC] = null;

            const boardValue = ChessAIShared.minimax(board, 2, color !== 'w', -Infinity, Infinity, ChessLogic);

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
