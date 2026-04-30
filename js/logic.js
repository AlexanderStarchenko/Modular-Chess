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
    let listeners = [];
    let gameHistory = [];

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
        gameHistory = [];
        notifyChange();
    }

    /**
     * Returns the current board state.
     */
    function getBoard() {
        return board;
    }

    function cloneBoard(src = board) {
        return src.map(row => row.slice());
    }

    function getState() {
        return {
            board: cloneBoard(),
            turn,
            castlingRights: { ...castlingRights },
            gameHistory: getGameHistory()
        };
    }

    function loadState(state) {
        if (!state || !Array.isArray(state.board) || state.board.length !== 8) {
            return false;
        }

        board = cloneBoard(state.board);
        turn = state.turn === 'b' ? 'b' : 'w';
        castlingRights = { ...castlingRights, ...(state.castlingRights || {}) };
        if (Array.isArray(state.gameHistory)) {
            gameHistory = state.gameHistory.map(entry => ({ ...entry, move: { ...entry.move } }));
        }
        notifyChange();
        return true;
    }

    function loadFen(fen, options = {}) {
        if (typeof fen !== 'string') return false;

        const parts = fen.trim().split(/\s+/);
        const rows = (parts[0] || '').split('/');
        if (rows.length !== 8) return false;

        const nextBoard = rows.map(row => {
            const parsed = [];
            row.split('').forEach(char => {
                if (/\d/.test(char)) {
                    for (let i = 0; i < Number(char); i++) parsed.push(null);
                } else {
                    parsed.push(char);
                }
            });
            return parsed;
        });

        if (nextBoard.some(row => row.length !== 8)) return false;

        board = nextBoard;
        turn = parts[1] === 'b' ? 'b' : 'w';
        const rights = parts[2] || '-';
        castlingRights = {
            wKingMoved: !rights.includes('K') && !rights.includes('Q'),
            bKingMoved: !rights.includes('k') && !rights.includes('q'),
            wRookAMoved: !rights.includes('Q'),
            wRookHMoved: !rights.includes('K'),
            bRookAMoved: !rights.includes('q'),
            bRookHMoved: !rights.includes('k')
        };

        if (!options.keepHistory) gameHistory = [];
        notifyChange();
        return true;
    }

    function boardToFen() {
        const rows = board.map(row => {
            let empty = 0;
            let fenRow = '';

            row.forEach(piece => {
                if (!piece) {
                    empty++;
                    return;
                }
                if (empty > 0) {
                    fenRow += empty;
                    empty = 0;
                }
                fenRow += piece;
            });

            return fenRow + (empty > 0 ? empty : '');
        });

        const rights = [
            !castlingRights.wKingMoved && !castlingRights.wRookHMoved && board[7][7] === 'R' ? 'K' : '',
            !castlingRights.wKingMoved && !castlingRights.wRookAMoved && board[7][0] === 'R' ? 'Q' : '',
            !castlingRights.bKingMoved && !castlingRights.bRookHMoved && board[0][7] === 'r' ? 'k' : '',
            !castlingRights.bKingMoved && !castlingRights.bRookAMoved && board[0][0] === 'r' ? 'q' : ''
        ].join('') || '-';

        return `${rows.join('/')} ${turn} ${rights} - 0 1`;
    }

    function getGameHistory() {
        return gameHistory.map(entry => ({ ...entry, move: { ...entry.move } }));
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.push(listener);
        return () => {
            listeners = listeners.filter(fn => fn !== listener);
        };
    }

    function notifyChange() {
        const snapshot = getState();
        listeners.forEach(listener => {
            try {
                listener(snapshot);
            } catch (err) {
                // Keep the game running even if a listener fails.
                console.error('ChessLogic listener error:', err);
            }
        });
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

        const isWhite = color === 'w';
        
        // 1. Knight jumps
        const knightJumps = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        const oppKnight = isWhite ? 'n' : 'N';
        for (const [dr, dc] of knightJumps) {
            const r = kingR + dr;
            const c = kingC + dc;
            if (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === oppKnight) return true;
        }

        // 2. Pawns
        const pawnDir = isWhite ? -1 : 1;
        const oppPawn = isWhite ? 'p' : 'P';
        if (kingR + pawnDir >= 0 && kingR + pawnDir < 8) {
            if (kingC - 1 >= 0 && board[kingR + pawnDir][kingC - 1] === oppPawn) return true;
            if (kingC + 1 < 8 && board[kingR + pawnDir][kingC + 1] === oppPawn) return true;
        }

        // 3. Rays (Rook, Bishop, Queen)
        const dirs = [
            [-1, 0], [1, 0], [0, -1], [0, 1], // Orthogonal
            [-1, -1], [-1, 1], [1, -1], [1, 1] // Diagonal
        ];
        const oppRook = isWhite ? 'r' : 'R';
        const oppBishop = isWhite ? 'b' : 'B';
        const oppQueen = isWhite ? 'q' : 'Q';
        const oppKing = isWhite ? 'k' : 'K';

        for (let i = 0; i < dirs.length; i++) {
            const [dr, dc] = dirs[i];
            let r = kingR + dr;
            let c = kingC + dc;
            let dist = 1;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const piece = board[r][c];
                if (piece) {
                    if (piece === oppQueen) return true;
                    if (i < 4 && piece === oppRook) return true;
                    if (i >= 4 && piece === oppBishop) return true;
                    if (dist === 1 && piece === oppKing) return true;
                    break;
                }
                r += dr;
                c += dc;
                dist++;
            }
        }

        return false;
    }

    function isLegalMove(fromRow, fromCol, toRow, toCol, ignoreTurn = false) {
        if (!isValidMoveInternal(fromRow, fromCol, toRow, toCol, ignoreTurn)) return false;

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

    function getPseudoLegalMoves(r, c, piece) {
        const moves = [];
        const isWhite = piece === piece.toUpperCase();
        const p = piece.toLowerCase();
        
        function addIfValid(tr, tc) {
            if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
                const target = board[tr][tc];
                if (!target || (target === target.toUpperCase()) !== isWhite) {
                    moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                }
            }
        }

        function addRay(dr, dc) {
            let tr = r + dr;
            let tc = c + dc;
            while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
                const target = board[tr][tc];
                if (!target) {
                    moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                } else {
                    if ((target === target.toUpperCase()) !== isWhite) {
                        moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                    }
                    break;
                }
                tr += dr;
                tc += dc;
            }
        }

        if (p === 'p') {
            const dir = isWhite ? -1 : 1;
            const startRow = isWhite ? 6 : 1;
            // Forward 1
            if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
                moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c });
                // Forward 2
                if (r === startRow && !board[r + 2 * dir][c]) {
                    moves.push({ fromR: r, fromC: c, toR: r + 2 * dir, toC: c });
                }
            }
            // Captures
            if (r + dir >= 0 && r + dir < 8) {
                if (c - 1 >= 0 && board[r + dir][c - 1] && (board[r + dir][c - 1] === board[r + dir][c - 1].toUpperCase()) !== isWhite) {
                    moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c - 1 });
                }
                if (c + 1 < 8 && board[r + dir][c + 1] && (board[r + dir][c + 1] === board[r + dir][c + 1].toUpperCase()) !== isWhite) {
                    moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c + 1 });
                }
            }
        } else if (p === 'n') {
            const knightJumps = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
            for (const [dr, dc] of knightJumps) addIfValid(r + dr, c + dc);
        } else if (p === 'b') {
            const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const [dr, dc] of dirs) addRay(dr, dc);
        } else if (p === 'r') {
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of dirs) addRay(dr, dc);
        } else if (p === 'q') {
            const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of dirs) addRay(dr, dc);
        } else if (p === 'k') {
            const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of dirs) addIfValid(r + dr, c + dc);
            
            // Castling
            if (isWhite && !castlingRights.wKingMoved) {
                if (!castlingRights.wRookHMoved && !board[7][5] && !board[7][6] && board[7][7] === 'R') {
                    moves.push({ fromR: r, fromC: c, toR: 7, toC: 6 });
                }
                if (!castlingRights.wRookAMoved && !board[7][1] && !board[7][2] && !board[7][3] && board[7][0] === 'R') {
                    moves.push({ fromR: r, fromC: c, toR: 7, toC: 2 });
                }
            } else if (!isWhite && !castlingRights.bKingMoved) {
                if (!castlingRights.bRookHMoved && !board[0][5] && !board[0][6] && board[0][7] === 'r') {
                    moves.push({ fromR: r, fromC: c, toR: 0, toC: 6 });
                }
                if (!castlingRights.bRookAMoved && !board[0][1] && !board[0][2] && !board[0][3] && board[0][0] === 'r') {
                    moves.push({ fromR: r, fromC: c, toR: 0, toC: 2 });
                }
            }
        }
        return moves;
    }

    function getAllLegalMoves(color, ignoreTurn = true) {
        const legalMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const isPieceWhite = piece === piece.toUpperCase();
                    if ((color === 'w' && isPieceWhite) || (color === 'b' && !isPieceWhite)) {
                        const candidates = getPseudoLegalMoves(r, c, piece);
                        for (const move of candidates) {
                            if (isLegalMove(move.fromR, move.fromC, move.toR, move.toC, ignoreTurn)) {
                                legalMoves.push(move);
                            }
                        }
                    }
                }
            }
        }
        return legalMoves;
    }





    /**
     * Executes a move on the board.
     */
    function movePiece(fromRow, fromCol, toRow, toCol) {
        if (isLegalMove(fromRow, fromCol, toRow, toCol)) {
            const beforeFen = boardToFen();
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
            gameHistory.push({
                fen: boardToFen(),
                beforeFen,
                move: { fromRow, fromCol, toRow, toCol, uci: coordsToUci(fromRow, fromCol, toRow, toCol) }
            });
            notifyChange();
            return true;
        }
        return false;
    }

    function coordsToUci(fromRow, fromCol, toRow, toCol) {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        return `${files[fromCol]}${8 - fromRow}${files[toCol]}${8 - toRow}`;
    }

    return {
        initBoard,
        getBoard,
        getTurn,
        getState,
        loadState,
        loadFen,
        getFen: boardToFen,
        getGameHistory,
        subscribe,
        movePiece,
        getAllLegalMoves,
        isValidMove: isLegalMove,
        isKingInCheck
    };
})();

// Initialize game on load
ChessLogic.initBoard();
