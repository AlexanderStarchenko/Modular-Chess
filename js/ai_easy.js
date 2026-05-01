/**
 * Easy AI (Light version)
 * Depth 1 with 30% randomness.
 */

var ChessAIEasy = (() => {
    // For Node.js/Jest testing
    const _Logic = (typeof require !== 'undefined') ? require('./logic') : (typeof ChessLogic !== 'undefined' ? ChessLogic : null);
    const _Shared = (typeof require !== 'undefined') ? require('./ai_shared') : (typeof ChessAIShared !== 'undefined' ? ChessAIShared : null);

    function getBestMove(color) {
        if (!_Logic) return null;
        const moves = _Logic.getAllLegalMoves(color);
        if (moves.length === 0) return null;

        // 30% chance to just pick a random move
        if (Math.random() < 0.3) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        const board = _Logic.getBoard();
        let bestMove = null;
        let bestValue = color === 'w' ? -Infinity : Infinity;

        // Shuffle moves for variety
        moves.sort(() => Math.random() - 0.5);

        for (const move of moves) {
            const piece = board[move.fromR][move.fromC];
            const target = board[move.toR][move.toC];
            board[move.toR][move.toC] = piece;
            board[move.fromR][move.fromC] = null;

            const boardValue = _Shared.minimax(board, 1, color !== 'w', -Infinity, Infinity, _Logic);

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
    const API = { getBestMove };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
