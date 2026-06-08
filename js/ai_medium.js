/**
 * Medium AI (Middle version)
 * Depth 2 search.
 */

var ChessAIMedium = (() => {
    // For Node.js/Jest testing
    const _Logic = (typeof ChessLogic !== 'undefined' ? ChessLogic : (typeof require !== 'undefined' ? require('./logic') : null));
    const _Shared = (typeof ChessAIShared !== 'undefined' ? ChessAIShared : (typeof require !== 'undefined' ? require('./ai_shared') : null));

    function getBestMove(color) {
        if (!_Logic || !_Shared) return null;
        const moves = _Logic.getAllLegalMoves(color);
        if (moves.length === 0) return null;

        if (typeof ChessWASM !== 'undefined' && ChessWASM.isLoaded()) {
            return ChessWASM.searchWASM(2, color === 'w', -Infinity, Infinity, _Logic.getState());
        }

        const board = _Logic.getBoard();
        let bestMove = null;
        let bestValue = color === 'w' ? -Infinity : Infinity;

        // Shuffle moves for variety
        moves.sort(() => Math.random() - 0.5);

        for (const move of moves) {
            const undoState = _Shared.applyMove(board, move);

            const boardValue = _Shared.minimax(board, 2, color !== 'w', -Infinity, Infinity, _Logic);

            _Shared.undoMove(board, move, undoState);

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
