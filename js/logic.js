/**
 * Chess Logic Module
 * Handles board state, move validation, and game rules.
 */

const ChessLogic = (() => {
    const PIECES = {
        EMPTY: null,
        W_PAWN: 'P', W_ROOK: 'R', W_KNIGHT: 'N', W_BISHOP: 'B', W_QUEEN: 'Q', W_KING: 'K',
        B_PAWN: 'p', B_ROOK: 'r', B_KNIGHT: 'n', B_BISHOP: 'b', B_QUEEN: 'q', B_KING: 'k'
    };

    let board = [];
    let turn = 'w'; // 'w' for white, 'b' for black

    // Castling rights: has the king/rook moved yet?
    let castlingRights = {};

    /**
     * Initializes the board with the starting position.
     */
    function initBoard() {
        board = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
        turn = 'w';
        castlingRights = {
            wKingMoved: false, bKingMoved: false,
            wRookAMoved: false, wRookHMoved: false,
            bRookAMoved: false, bRookHMoved: false
        };
    }

    /**
     * Returns the current board state.
     */
    function getBoard() {
        return board;
    }

    /**
     * Returns the current turn.
     */
    function getTurn() {
        return turn;
    }

    /**
     * Validates if a move is legal (basic movement rules).
     * @param {number} fromRow 
     * @param {number} fromCol 
     * @param {number} toRow 
     * @param {number} toCol 
     * @param {boolean} ignoreTurn
     * @returns {boolean}
     */
    function isValidMoveInternal(fromRow, fromCol, toRow, toCol, ignoreTurn = false) {
        const piece = board[fromRow][fromCol];
        if (!piece) return false;

        // Check turn
        const isWhite = piece === piece.toUpperCase();
        if (!ignoreTurn && ((isWhite && turn !== 'w') || (!isWhite && turn !== 'b'))) return false;

        const targetPiece = board[toRow][toCol];
        if (targetPiece) {
            const isTargetWhite = targetPiece === targetPiece.toUpperCase();
            if (isWhite === isTargetWhite) return false; // Cannot capture own piece
        }

        // Basic move rules (simplified for now)
        const dRow = toRow - fromRow;
        const dCol = toCol - fromCol;

        switch (piece.toLowerCase()) {
            case 'p': // Pawn
                return validatePawnMove(fromRow, fromCol, toRow, toCol, isWhite);
            case 'r': // Rook
                return validateRookMove(fromRow, fromCol, toRow, toCol);
            case 'n': // Knight
                return validateKnightMove(dRow, dCol);
            case 'b': // Bishop
                return validateBishopMove(fromRow, fromCol, toRow, toCol);
            case 'q': // Queen
                return validateRookMove(fromRow, fromCol, toRow, toCol) || validateBishopMove(fromRow, fromCol, toRow, toCol);
            case 'k': // King
                // Normal king move
                if (Math.abs(dRow) <= 1 && Math.abs(dCol) <= 1) return true;
                // Castling: king moves exactly 2 squares horizontally
                if (Math.abs(dRow) === 0 && Math.abs(dCol) === 2) {
                    return isCastlingValid(fromRow, fromCol, toCol, isWhite);
                }
                return false;
        }

        return false;
    }

    function validatePawnMove(fR, fC, tR, tC, isWhite) {
        const direction = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;
        const dRow = tR - fR;
        const dCol = tC - fC;

        // Move forward
        if (dCol === 0 && !board[tR][tC]) {
            if (dRow === direction) return true;
            if (fR === startRow && dRow === 2 * direction && !board[fR + direction][fC]) return true;
        }

        // Capture
        if (Math.abs(dCol) === 1 && dRow === direction && board[tR][tC]) {
            return true;
        }

        return false;
    }

    function validateKnightMove(dR, dC) {
        return (Math.abs(dR) === 2 && Math.abs(dC) === 1) || (Math.abs(dR) === 1 && Math.abs(dC) === 2);
    }

    function validateRookMove(fR, fC, tR, tC) {
        if (fR !== tR && fC !== tC) return false;
        const stepR = fR === tR ? 0 : (tR > fR ? 1 : -1);
        const stepC = fC === tC ? 0 : (tC > fC ? 1 : -1);

        let curR = fR + stepR;
        let curC = fC + stepC;

        while (curR !== tR || curC !== tC) {
            if (board[curR][curC]) return false; // Path blocked
            curR += stepR;
            curC += stepC;
        }
        return true;
    }

    function validateBishopMove(fR, fC, tR, tC) {
        if (Math.abs(tR - fR) !== Math.abs(tC - fC)) return false;
        const stepR = tR > fR ? 1 : -1;
        const stepC = tC > fC ? 1 : -1;

        let curR = fR + stepR;
        let curC = fC + stepC;

        while (curR !== tR || curC !== tC) {
            if (board[curR][curC]) return false; // Path blocked
            curR += stepR;
            curC += stepC;
        }
        return true;
    }

    /**
     * Validates castling move.
     * toCol is 2 (queenside) or 6 (kingside).
     */
    function isCastlingValid(row, kingCol, toCol, isWhite) {
        const color = isWhite ? 'w' : 'b';

        // King must not have moved
        if (isWhite && castlingRights.wKingMoved) return false;
        if (!isWhite && castlingRights.bKingMoved) return false;

        const isKingside = toCol > kingCol; // toCol === 6
        const rookCol = isKingside ? 7 : 0;

        // Rook must not have moved
        if (isWhite) {
            if (isKingside && castlingRights.wRookHMoved) return false;
            if (!isKingside && castlingRights.wRookAMoved) return false;
        } else {
            if (isKingside && castlingRights.bRookHMoved) return false;
            if (!isKingside && castlingRights.bRookAMoved) return false;
        }

        // Check the rook is actually there
        const expectedRook = isWhite ? 'R' : 'r';
        if (board[row][rookCol] !== expectedRook) return false;

        // All squares between king and rook must be empty
        const minC = Math.min(kingCol, rookCol) + 1;
        const maxC = Math.max(kingCol, rookCol);
        for (let c = minC; c < maxC; c++) {
            if (board[row][c] !== null) return false;
        }

        // King must not currently be in check
        if (isKingInCheck(color)) return false;

        // King must not pass through or land on a checked square
        const step = isKingside ? 1 : -1;
        for (let c = kingCol + step; c !== toCol + step; c += step) {
            // Simulate king on square c
            const origKing = board[row][kingCol];
            board[row][kingCol] = null;
            board[row][c] = origKing;
            const inCheck = isKingInCheck(color);
            board[row][c] = null;
            board[row][kingCol] = origKing;
            if (inCheck) return false;
        }

        return true;
    }

    function isKingInCheck(color) {
        const kingChar = color === 'w' ? 'K' : 'k';
        let kingR = -1, kingC = -1;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === kingChar) {
                    kingR = r;
                    kingC = c;
                    break;
                }
            }
            if (kingR !== -1) break;
        }

        if (kingR === -1) return false;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p) {
                    const isPWhite = p === p.toUpperCase();
                    if ((color === 'w' && !isPWhite) || (color === 'b' && isPWhite)) {
                        if (isValidMoveInternal(r, c, kingR, kingC, true)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function isLegalMove(fromRow, fromCol, toRow, toCol) {
        if (!isValidMoveInternal(fromRow, fromCol, toRow, toCol)) return false;

        const piece = board[fromRow][fromCol];
        const targetPiece = board[toRow][toCol];
        
        // Simulate move
        board[toRow][toCol] = piece;
        board[fromRow][fromCol] = null;

        const isWhite = piece === piece.toUpperCase();
        const inCheck = isKingInCheck(isWhite ? 'w' : 'b');

        // Revert move
        board[fromRow][fromCol] = piece;
        board[toRow][toCol] = targetPiece;

        return !inCheck;
    }

    function getAllLegalMoves(color) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const isPieceWhite = piece === piece.toUpperCase();
                    if ((color === 'w' && isPieceWhite) || (color === 'b' && !isPieceWhite)) {
                        for (let tr = 0; tr < 8; tr++) {
                            for (let tc = 0; tc < 8; tc++) {
                                if (isLegalMove(r, c, tr, tc)) {
                                    moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                                }
                            }
                        }
                    }
                }
            }
        }
        return moves;
    }

    const PIECE_VALUES = {
        'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900,
        'P': 10, 'N': 30, 'B': 30, 'R': 50, 'Q': 90, 'K': 900
    };

    function evaluateBoard() {
        let total = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const val = PIECE_VALUES[piece] || 0;
                    total += (piece === piece.toUpperCase()) ? val : -val;
                }
            }
        }
        return total;
    }

    function minimax(depth, isMaximizing, alpha, beta) {
        if (depth === 0) return evaluateBoard();

        const moves = getAllLegalMoves(isMaximizing ? 'w' : 'b');
        if (moves.length === 0) {
            if (isKingInCheck(isMaximizing ? 'w' : 'b')) return isMaximizing ? -10000 : 10000;
            return 0; // Stalemate
        }

        if (isMaximizing) {
            let bestEval = -Infinity;
            for (const move of moves) {
                const piece = board[move.fromR][move.fromC];
                const target = board[move.toR][move.toC];
                board[move.toR][move.toC] = piece;
                board[move.fromR][move.fromC] = null;
                
                const evaluation = minimax(depth - 1, false, alpha, beta);
                
                board[move.fromR][move.fromC] = piece;
                board[move.toR][move.toC] = target;
                
                bestEval = Math.max(bestEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            return bestEval;
        } else {
            let bestEval = Infinity;
            for (const move of moves) {
                const piece = board[move.fromR][move.fromC];
                const target = board[move.toR][move.toC];
                board[move.toR][move.toC] = piece;
                board[move.fromR][move.fromC] = null;
                
                const evaluation = minimax(depth - 1, true, alpha, beta);
                
                board[move.fromR][move.fromC] = piece;
                board[move.toR][move.toC] = target;
                
                bestEval = Math.min(bestEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            return bestEval;
        }
    }

    function getBestMove(color, difficulty = 2) {
        const moves = getAllLegalMoves(color);
        if (moves.length === 0) return null;

        // Difficulty 1: Easy (Depth 1, occasionally random)
        // Difficulty 2: Medium (Depth 2)
        // Difficulty 3: Hard (Depth 3)
        let depth = parseInt(difficulty);
        
        // On easy mode, 30% chance to just pick a random move
        if (depth === 1 && Math.random() < 0.3) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        let bestMove = null;
        let bestValue = color === 'w' ? -Infinity : Infinity;

        // Shuffle moves to add some randomness to equal evaluations
        moves.sort(() => Math.random() - 0.5);

        for (const move of moves) {
            const piece = board[move.fromR][move.fromC];
            const target = board[move.toR][move.toC];
            board[move.toR][move.toC] = piece;
            board[move.fromR][move.fromC] = null;

            const boardValue = minimax(depth, color !== 'w', -Infinity, Infinity);

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

    /**
     * Executes a move on the board.
     */
    function movePiece(fromRow, fromCol, toRow, toCol) {
        if (isLegalMove(fromRow, fromCol, toRow, toCol)) {
            let piece = board[fromRow][fromCol];
            
            // Pawn promotion
            if (piece.toLowerCase() === 'p' && (toRow === 0 || toRow === 7)) {
                piece = piece === 'P' ? 'Q' : 'q';
            }

            // Handle castling: if king moves 2 squares, also move the rook
            if (piece.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2) {
                const isKingside = toCol > fromCol;
                const rookFromCol = isKingside ? 7 : 0;
                const rookToCol = isKingside ? 5 : 3;
                board[fromRow][rookToCol] = board[fromRow][rookFromCol];
                board[fromRow][rookFromCol] = null;
            }

            board[toRow][toCol] = piece;
            board[fromRow][fromCol] = null;

            // Update castling rights
            if (piece === 'K') castlingRights.wKingMoved = true;
            if (piece === 'k') castlingRights.bKingMoved = true;
            if (fromRow === 7 && fromCol === 0) castlingRights.wRookAMoved = true;
            if (fromRow === 7 && fromCol === 7) castlingRights.wRookHMoved = true;
            if (fromRow === 0 && fromCol === 0) castlingRights.bRookAMoved = true;
            if (fromRow === 0 && fromCol === 7) castlingRights.bRookHMoved = true;

            turn = turn === 'w' ? 'b' : 'w';
            return true;
        }
        return false;
    }

    return {
        initBoard,
        getBoard,
        getTurn,
        movePiece,
        getBestMove,
        isValidMove: isLegalMove,
        isKingInCheck
    };
})();

// Initialize game on load
ChessLogic.initBoard();
