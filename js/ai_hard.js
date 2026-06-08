/**
 * Hard AI (Powerful version)
 * Depth 3 search.
 */

var ChessAIHard = (() => {
    // For Node.js/Jest testing
    const _Logic = (typeof ChessLogic !== 'undefined' ? ChessLogic : (typeof require !== 'undefined' ? require('./logic') : null));
    const _Shared = (typeof ChessAIShared !== 'undefined' ? ChessAIShared : (typeof require !== 'undefined' ? require('./ai_shared') : null));

    function getBestMove(color, depth = 3) {
        if (!_Logic || !_Shared) return null;
        const moves = _Logic.getAllLegalMoves(color);
        if (moves.length === 0) return null;

        if (typeof ChessWASM !== 'undefined' && ChessWASM.isLoaded()) {
            return ChessWASM.searchWASM(depth, color === 'w', -Infinity, Infinity, _Logic.getState());
        }

        const board = _Logic.getBoard();
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
            const undoState = _Shared.applyMove(board, move);

            const boardValue = _Shared.minimax(board, depth, color !== 'w', -Infinity, Infinity, _Logic);

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
