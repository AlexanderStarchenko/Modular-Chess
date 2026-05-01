/**
 * Shared AI Utilities for Chess
 * Contains minimax algorithm and board evaluation.
 */

var ChessAIShared = (() => {
    const PIECE_VALUES = {
        'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900,
        'P': 10, 'N': 30, 'B': 30, 'R': 50, 'Q': 90, 'K': 900
    };

    const pstPawn = [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
    ];

    const pstKnight = [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ];

    const pstBishop = [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ];

    const pstRook = [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [ 0,  0,  0,  5,  5,  0,  0,  0]
    ];

    const pstQueen = [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ];

    const pstKing = [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20]
    ];

    const pstMap = {
        'P': pstPawn, 'N': pstKnight, 'B': pstBishop, 'R': pstRook, 'Q': pstQueen, 'K': pstKing
    };

    /**
     * Evaluates the board based on material and piece positions.
     */
    function evaluateBoard(board) {
        let total = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const isWhite = piece === piece.toUpperCase();
                    const val = PIECE_VALUES[piece] || 0;
                    
                    const pst = pstMap[piece.toUpperCase()];
                    const pstVal = pst ? (isWhite ? pst[r][c] : pst[7 - r][c]) : 0;
                    
                    const score = val + pstVal;
                    total += isWhite ? score : -score;
                }
            }
        }
        return total;
    }

    function orderMoves(moves, board) {
        moves.forEach(m => {
            let score = 0;
            const target = board[m.toR][m.toC];
            if (target) {
                const attacker = board[m.fromR][m.fromC];
                score = 100 * (PIECE_VALUES[target.toLowerCase()] || 0) - (PIECE_VALUES[attacker.toLowerCase()] || 0);
            }
            m.score = score;
        });
        return moves.sort((a, b) => b.score - a.score);
    }

    /**
     * Quiescence search to resolve horizon effect by evaluating all captures.
     */
    function quiesce(board, alpha, beta, isMaximizing, logic) {
        const standPat = evaluateBoard(board);
        
        if (isMaximizing) {
            if (standPat >= beta) return beta;
            if (alpha < standPat) alpha = standPat;
        } else {
            if (standPat <= alpha) return alpha;
            if (beta > standPat) beta = standPat;
        }

        let moves = logic.getAllLegalMoves(isMaximizing ? 'w' : 'b');
        // Filter only capturing moves for quiescence
        moves = moves.filter(m => board[m.toR][m.toC] !== null);
        moves = orderMoves(moves, board);

        if (isMaximizing) {
            for (const move of moves) {
                const origPiece = board[move.fromR][move.fromC];
                let piece = origPiece;
                const target = board[move.toR][move.toC];
                
                // Simulate pawn promotion to Queen
                if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                    piece = piece === 'P' ? 'Q' : 'q';
                }

                board[move.toR][move.toC] = piece;
                board[move.fromR][move.fromC] = null;
                
                const score = quiesce(board, alpha, beta, false, logic);
                
                board[move.fromR][move.fromC] = origPiece;
                board[move.toR][move.toC] = target;
                
                if (score >= beta) return beta;
                if (score > alpha) alpha = score;
            }
            return alpha;
        } else {
            for (const move of moves) {
                const origPiece = board[move.fromR][move.fromC];
                let piece = origPiece;
                const target = board[move.toR][move.toC];
                
                if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                    piece = piece === 'P' ? 'Q' : 'q';
                }

                board[move.toR][move.toC] = piece;
                board[move.fromR][move.fromC] = null;
                
                const score = quiesce(board, alpha, beta, true, logic);
                
                board[move.fromR][move.fromC] = origPiece;
                board[move.toR][move.toC] = target;
                
                if (score <= alpha) return alpha;
                if (score < beta) beta = score;
            }
            return beta;
        }
    }

    /**
     * Minimax algorithm with Alpha-Beta pruning and Quiescence search.
     */
    function minimax(board, depth, isMaximizing, alpha, beta, logic) {
        if (depth === 0) {
            // Drop into quiescence search to avoid horizon effect
            return quiesce(board, alpha, beta, isMaximizing, logic);
        }

        let moves = logic.getAllLegalMoves(isMaximizing ? 'w' : 'b');
        if (moves.length === 0) {
            if (logic.isKingInCheck(isMaximizing ? 'w' : 'b')) return isMaximizing ? -10000 : 10000;
            return 0; // Stalemate
        }

        moves = orderMoves(moves, board);

        if (isMaximizing) {
            let bestEval = -Infinity;
            for (const move of moves) {
                const origPiece = board[move.fromR][move.fromC];
                let piece = origPiece;
                const target = board[move.toR][move.toC];

                if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                    piece = piece === 'P' ? 'Q' : 'q';
                }

                board[move.toR][move.toC] = piece;
                board[move.fromR][move.fromC] = null;
                
                const evaluation = minimax(board, depth - 1, false, alpha, beta, logic);
                
                board[move.fromR][move.fromC] = origPiece;
                board[move.toR][move.toC] = target;
                
                bestEval = Math.max(bestEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            return bestEval;
        } else {
            let bestEval = Infinity;
            for (const move of moves) {
                const origPiece = board[move.fromR][move.fromC];
                let piece = origPiece;
                const target = board[move.toR][move.toC];

                if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
                    piece = piece === 'P' ? 'Q' : 'q';
                }

                board[move.toR][move.toC] = piece;
                board[move.fromR][move.fromC] = null;
                
                const evaluation = minimax(board, depth - 1, true, alpha, beta, logic);
                
                board[move.fromR][move.fromC] = origPiece;
                board[move.toR][move.toC] = target;
                
                bestEval = Math.min(bestEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            return bestEval;
        }
    }

    return {
        minimax,
        evaluateBoard
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ChessAIShared;
