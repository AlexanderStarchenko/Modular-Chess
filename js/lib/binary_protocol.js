/**
 * Universal Binary Protocol for Chess Networking
 * Packs/unpacks chess moves and state syncs into native ArrayBuffers.
 */

const BinaryProtocol = (() => {
    // Предвычисленный массив клеток (0 аллокаций при чтении)
    const INDEX_TO_SQUARE = Array.from({ length: 64 }, (_, i) => 
        String.fromCharCode(97 + (i & 7)) + String.fromCharCode(49 + (i >> 3))
    );

    function squareToIndex(sq) {
        if (!sq || typeof sq !== 'string' || sq.length !== 2) return 255;
        const file = sq.charCodeAt(0) - 97; // 'a' is 97
        const rank = sq.charCodeAt(1) - 49; // '1' is 49
        if (file < 0 || file > 7 || rank < 0 || rank > 7) return 255;
        return (rank << 3) | file;
    }

    function indexToSquare(idx) {
        return (idx >= 0 && idx < 64) ? INDEX_TO_SQUARE[idx] : null;
    }

    // Piece types to small codes
    // 'wp'/'P' -> 1, 'wn'/'N' -> 2, 'wb'/'B' -> 3, 'wr'/'R' -> 4, 'wq'/'Q' -> 5, 'wk'/'K' -> 6
    // 'bp'/'p' -> 7, 'bn'/'n' -> 8, 'bb'/'b' -> 9, 'br'/'r' -> 10, 'bq'/'q' -> 11, 'bk'/'k' -> 12
    const PIECE_TO_BYTE = Object.assign(Object.create(null), {
        'wp': 1, 'wn': 2, 'wb': 3, 'wr': 4, 'wq': 5, 'wk': 6,
        'bp': 7, 'bn': 8, 'bb': 9, 'br': 10, 'bq': 11, 'bk': 12,
        'P': 1, 'N': 2, 'B': 3, 'R': 4, 'Q': 5, 'K': 6,
        'p': 7, 'n': 8, 'b': 9, 'r': 10, 'q': 11, 'k': 12
    });

    const BYTE_TO_PIECE_STR = [
        null, 'wp', 'wn', 'wb', 'wr', 'wq', 'wk',
        'bp', 'bn', 'bb', 'br', 'bq', 'bk'
    ];

    const BYTE_TO_PIECE_CHAR = [
        null, 'P', 'N', 'B', 'R', 'Q', 'K',
        'p', 'n', 'b', 'r', 'q', 'k'
    ];

    // Вынесенные константы для исключения аллокаций внутри unpackState
    const BLACK_PIECES = ['n', 'b', 'r', 'q'];
    const VALID_PROMOS = new Set([113, 114, 98, 110, 81, 82, 66, 78]); // q,r,b,n,Q,R,B,N

    function getSafeView(data, minByteLength) {
        if (!data) return null;
        if (ArrayBuffer.isView(data)) {
            if (data.byteLength < minByteLength) return null;
            return new DataView(data.buffer, data.byteOffset, data.byteLength);
        }
        if (data instanceof ArrayBuffer) {
            if (data.byteLength < minByteLength) return null;
            return new DataView(data);
        }
        return null;
    }

    function clampUint32(val) {
        const n = Number(val);
        return Number.isFinite(n) ? Math.min(4294967295, Math.max(0, Math.round(n))) : 0;
    }

    function clampUint16(val, min = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? Math.min(65535, Math.max(min, Math.round(n))) : min;
    }

    function clampUint8(val, min = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? Math.min(255, Math.max(min, Math.round(n))) : min;
    }

    /**
     * Packs chess move data into a 15-byte Uint8Array
     * Supports both { fromRow, fromCol, toRow, toCol } and { fromR, fromC, toR, toC } or { from, to }
     * @param {Object} move 
     * @returns {Uint8Array}
     */
    function packMove(move) {
        const buffer = new ArrayBuffer(15);
        const view = new DataView(buffer);

        let fromIdx = 255;
        let toIdx = 255;

        if (move) {
            const fR = move.fromR ?? move.fromRow;
            const fC = move.fromC ?? move.fromCol;
            if (Number.isInteger(fR) && Number.isInteger(fC) && fR >= 0 && fR <= 7 && fC >= 0 && fC <= 7) {
                fromIdx = ((7 - fR) << 3) | fC;
            } else if (typeof move.from === 'string') {
                fromIdx = squareToIndex(move.from);
            }

            const tR = move.toR ?? move.toRow;
            const tC = move.toC ?? move.toCol;
            if (Number.isInteger(tR) && Number.isInteger(tC) && tR >= 0 && tR <= 7 && tC >= 0 && tC <= 7) {
                toIdx = ((7 - tR) << 3) | tC;
            } else if (typeof move.to === 'string') {
                toIdx = squareToIndex(move.to);
            }
        }

        // Byte 0: from index
        view.setUint8(0, fromIdx);
        // Byte 1: to index
        view.setUint8(1, toIdx);

        // Byte 2: piece byte representation
        let pieceByte = 0;
        if (move && move.piece) {
            pieceByte = PIECE_TO_BYTE[move.piece] || 0;
        }
        view.setUint8(2, pieceByte);

        // Byte 3: promotion piece code (0 if none, else char code)
        let promoByte = 0;
        if (move && move.promotion && typeof move.promotion === 'string') {
            promoByte = move.promotion.charCodeAt(0);
        }
        view.setUint8(3, promoByte);

        // Timers (safely clamped against negative network skew, NaN, and Uint32 wrap-around)
        const timers = move ? move.timers : null;
        const whiteTime = timers ? clampUint32(timers.white) : 0;
        const blackTime = timers ? clampUint32(timers.black) : 0;
        const inc = timers ? clampUint16(timers.inc) : 0;
        const running = (timers && timers.running) ? 1 : 0;

        // Bytes 4-7: timers.white
        view.setUint32(4, whiteTime, true);
        // Bytes 8-11: timers.black
        view.setUint32(8, blackTime, true);
        // Bytes 12-13: timers.inc
        view.setUint16(12, inc, true);
        // Byte 14: timers.running
        view.setUint8(14, running);

        return new Uint8Array(buffer);
    }

    /**
     * Unpacks chess move data from a 15-byte Uint8Array/ArrayBuffer without unnecessary slice copies
     * Returns both fromRow/fromCol and fromR/fromC for complete module interoperability.
     * @param {ArrayBuffer|Uint8Array|Buffer} data 
     * @returns {Object|null}
     */
    function unpackMove(data) {
        const view = getSafeView(data, 15);
        if (!view) return null;

        const fromIdx = view.getUint8(0);
        const toIdx = view.getUint8(1);

        const from = indexToSquare(fromIdx);
        const to = indexToSquare(toIdx);

        let fromRow, fromCol, fromR, fromC;
        if (fromIdx < 64) {
            fromRow = fromR = 7 - (fromIdx >> 3);
            fromCol = fromC = fromIdx & 7;
        }

        let toRow, toCol, toR, toC;
        if (toIdx < 64) {
            toRow = toR = 7 - (toIdx >> 3);
            toCol = toC = toIdx & 7;
        }

        const piece = BYTE_TO_PIECE_STR[view.getUint8(2)] || null;

        const promoCode = view.getUint8(3);
        const promotion = VALID_PROMOS.has(promoCode) ? String.fromCharCode(promoCode) : null;

        const white = view.getUint32(4, true);
        const black = view.getUint32(8, true);
        const inc = view.getUint16(12, true);
        const running = view.getUint8(14) === 1;

        return {
            from,
            to,
            fromRow,
            fromCol,
            toRow,
            toCol,
            fromR,
            fromC,
            toR,
            toC,
            piece,
            promotion,
            timers: { white, black, inc, running }
        };
    }

    /**
     * Packs full game state into an 81-byte Uint8Array
     * Supports castling both as FEN-string ('KQkq') and object ({ wKing, ... } / castlingRights)
     * @param {Object} state 
     * @returns {Uint8Array}
     */
    function packState(state) {
        const buffer = new ArrayBuffer(81);
        const view = new DataView(buffer);

        const boardState = (state && state.boardState) ? state.boardState : (state || {});
        const board = boardState.board;

        // Bytes 0-63: board (64 bytes)
        if (Array.isArray(board)) {
            if (Array.isArray(board[0])) {
                // 2D Array (8x8)
                for (let r = 0; r < 8; r++) {
                    const row = board[r];
                    if (Array.isArray(row)) {
                        for (let c = 0; c < 8; c++) {
                            const piece = row[c];
                            const idx = ((7 - r) << 3) | c;
                            view.setUint8(idx, PIECE_TO_BYTE[piece] || 0);
                        }
                    }
                }
            } else {
                // 1D Array (64 elements)
                for (let i = 0; i < 64; i++) {
                    const piece = board[i];
                    view.setUint8(i, PIECE_TO_BYTE[piece] || 0);
                }
            }
        }

        // Byte 64: turn (0: white, 1: black)
        const turn = boardState.turn || 'w';
        view.setUint8(64, turn === 'b' ? 1 : 0);

        // Byte 65: castling mask (supports FEN string 'KQkq' or object formats)
        let castlingMask = 0;
        const castling = boardState.castling;
        const castlingRights = boardState.castlingRights;

        if (typeof castling === 'string') {
            if (castling.includes('K')) castlingMask |= 1;
            if (castling.includes('Q')) castlingMask |= 2;
            if (castling.includes('k')) castlingMask |= 4;
            if (castling.includes('q')) castlingMask |= 8;
        } else if (typeof castlingRights === 'string') {
            if (castlingRights.includes('K')) castlingMask |= 1;
            if (castlingRights.includes('Q')) castlingMask |= 2;
            if (castlingRights.includes('k')) castlingMask |= 4;
            if (castlingRights.includes('q')) castlingMask |= 8;
        } else if (castlingRights && typeof castlingRights === 'object') {
            const wKing = !castlingRights.wKingMoved && !castlingRights.wRookHMoved;
            const wQueen = !castlingRights.wKingMoved && !castlingRights.wRookAMoved;
            const bKing = !castlingRights.bKingMoved && !castlingRights.bRookHMoved;
            const bQueen = !castlingRights.bKingMoved && !castlingRights.bRookAMoved;
            if (wKing) castlingMask |= 1;
            if (wQueen) castlingMask |= 2;
            if (bKing) castlingMask |= 4;
            if (bQueen) castlingMask |= 8;
        } else if (castling && typeof castling === 'object') {
            if (castling.wKing) castlingMask |= 1;
            if (castling.wQueen) castlingMask |= 2;
            if (castling.bKing) castlingMask |= 4;
            if (castling.bQueen) castlingMask |= 8;
        }
        view.setUint8(65, castlingMask);

        // Byte 66: enPassant index (0-63 or 255)
        let enPassantIdx = 255;
        const ep = boardState.enPassantSquare || boardState.enPassant;
        if (ep) {
            if (typeof ep === 'object' && Number.isInteger(ep.row) && Number.isInteger(ep.col) &&
                ep.row >= 0 && ep.row <= 7 && ep.col >= 0 && ep.col <= 7) {
                enPassantIdx = ((7 - ep.row) << 3) | ep.col;
            } else if (typeof ep === 'string') {
                enPassantIdx = squareToIndex(ep);
            }
        }
        view.setUint8(66, enPassantIdx);

        // Byte 67: halfmoveClock
        const halfmove = boardState.halfMoveClock !== undefined ? boardState.halfMoveClock : (boardState.halfmoveClock || 0);
        view.setUint8(67, clampUint8(halfmove, 0));

        // Bytes 68-69: fullmoveNumber (Uint16)
        const moveCount = (state && state.moveCount !== undefined) ? state.moveCount : (boardState.moveCount || 0);
        const fullmove = boardState.fullmoveNumber || (1 + Math.floor(moveCount / 2));
        view.setUint16(68, clampUint16(fullmove, 1), true);

        // Timers (safely clamped against underflow/NaN/overflow)
        const timers = (state && state.timers) || boardState.timers;
        const whiteTime = timers ? clampUint32(timers.white) : 0;
        const blackTime = timers ? clampUint32(timers.black) : 0;
        const inc = timers ? clampUint16(timers.inc) : 0;
        const running = (timers && timers.running) ? 1 : 0;

        // Bytes 70-73: timers.white
        view.setUint32(70, whiteTime, true);
        // Bytes 74-77: timers.black
        view.setUint32(74, blackTime, true);
        // Bytes 78-79: timers.inc
        view.setUint16(78, inc, true);
        // Byte 80: timers.running
        view.setUint8(80, running);

        return new Uint8Array(buffer);
    }

    /**
     * Unpacks full game state from an 81-byte ArrayBuffer/Uint8Array in a single high-speed pass.
     * Accurately calculates captures without distorting pawns after promotions.
     * @param {ArrayBuffer|Uint8Array|Buffer} data 
     * @returns {Object|null}
     */
    function unpackState(data) {
        const view = getSafeView(data, 81);
        if (!view) return null;

        const board1D = new Array(64);
        const board2D = [
            new Array(8), new Array(8), new Array(8), new Array(8),
            new Array(8), new Array(8), new Array(8), new Array(8)
        ];

        const counts = new Uint8Array(13);

        // Single pass for 1D, 2D boards and counts
        for (let i = 0; i < 64; i++) {
            const val = view.getUint8(i);
            board1D[i] = BYTE_TO_PIECE_STR[val] || null;
            const pieceChar = BYTE_TO_PIECE_CHAR[val] || null;
            board2D[7 - (i >> 3)][i & 7] = pieceChar;
            if (val >= 1 && val <= 12) {
                counts[val]++;
            }
        }

        const turn = view.getUint8(64) === 1 ? 'b' : 'w';

        const castlingMask = view.getUint8(65);
        const castling = {
            wKing: (castlingMask & 1) !== 0,
            wQueen: (castlingMask & 2) !== 0,
            bKing: (castlingMask & 4) !== 0,
            bQueen: (castlingMask & 8) !== 0
        };

        const castlingRights = {
            wKingMoved: !(castling.wKing || castling.wQueen),
            wRookHMoved: !castling.wKing,
            wRookAMoved: !castling.wQueen,
            bKingMoved: !(castling.bKing || castling.bQueen),
            bRookHMoved: !castling.bKing,
            bRookAMoved: !castling.bQueen
        };

        const enPassantIdx = view.getUint8(66);
        const enPassant = indexToSquare(enPassantIdx);
        const enPassantSquare = enPassantIdx < 64 ? {
            row: 7 - (enPassantIdx >> 3),
            col: enPassantIdx & 7
        } : null;

        const halfmoveClock = view.getUint8(67);
        const halfMoveClock = halfmoveClock;

        const fullmoveNumber = Math.max(1, view.getUint16(68, true));

        const white = view.getUint32(70, true);
        const black = view.getUint32(74, true);
        const inc = view.getUint16(78, true);
        const running = view.getUint8(80) === 1;

        const capturedByWhite = [];
        const capturedByBlack = [];

        // Count promoted pieces for White (pieces exceeding initial count came from pawns)
        const whitePromotions = Math.max(0, counts[5] - 1) +
                                Math.max(0, counts[4] - 2) +
                                Math.max(0, counts[3] - 2) +
                                Math.max(0, counts[2] - 2);

        // Count promoted pieces for Black
        const blackPromotions = Math.max(0, counts[11] - 1) +
                                Math.max(0, counts[10] - 2) +
                                Math.max(0, counts[9] - 2) +
                                Math.max(0, counts[8] - 2);

        // Black pieces captured by White:
        const blackPawnsCaptured = Math.max(0, 8 - counts[7] - blackPromotions);
        for (let i = 0; i < blackPawnsCaptured; i++) {
            capturedByWhite.push('p');
        }

        // Коды 8(n), 9(b), 10(r), 11(q)
        for (let j = 0; j < 4; j++) {
            const p = BLACK_PIECES[j];
            const std = j === 3 ? 1 : 2;
            const missing = Math.max(0, std - counts[8 + j]);
            for (let i = 0; i < missing; i++) {
                capturedByWhite.push(p);
            }
        }

        // White pieces captured by Black:
        const whitePawnsCaptured = Math.max(0, 8 - counts[1] - whitePromotions);
        for (let i = 0; i < whitePawnsCaptured; i++) {
            capturedByBlack.push('p');
        }

        // Коды 2(N), 3(B), 4(R), 5(Q)
        for (let j = 0; j < 4; j++) {
            const pLower = BLACK_PIECES[j];
            const std = j === 3 ? 1 : 2;
            const missing = Math.max(0, std - counts[2 + j]);
            for (let i = 0; i < missing; i++) {
                capturedByBlack.push(pLower);
            }
        }

        const captures = {
            white: capturedByWhite,
            black: capturedByBlack
        };

        const boardState = {
            board: board2D,
            turn,
            castlingRights,
            enPassantSquare,
            halfMoveClock,
            gameHistory: []
        };

        return {
            board: board1D,
            turn,
            castling,
            enPassant,
            halfmoveClock,
            fullmoveNumber,
            timers: { white, black, inc, running },

            // Properties for client state synchronization
            boardState,
            captures,
            history: '',
            moveCount: (fullmoveNumber - 1) * 2 + (turn === 'b' ? 1 : 0)
        };
    }

    return {
        squareToIndex,
        indexToSquare,
        packMove,
        unpackMove,
        packState,
        unpackState
    };
})();

// CommonJS support for Node.js server
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinaryProtocol;
}
