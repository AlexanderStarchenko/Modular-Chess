/**
 * Universal Binary Protocol for Chess Networking
 * Packs/unpacks chess moves and state syncs into native ArrayBuffers.
 */

const BinaryProtocol = (() => {
    // 1-to-1 square mappings (e.g. 'e2' -> 12, null -> 255)
    function squareToIndex(sq) {
        if (!sq || sq.length < 2) return 255;
        const file = sq.charCodeAt(0) - 97; // 'a' is 97
        const rank = sq.charCodeAt(1) - 49; // '1' is 49
        if (file < 0 || file > 7 || rank < 0 || rank > 7) return 255;
        return rank * 8 + file;
    }

    function indexToSquare(idx) {
        if (idx === 255 || idx < 0 || idx > 63) return null;
        const file = String.fromCharCode(97 + (idx % 8));
        const rank = String.fromCharCode(49 + Math.floor(idx / 8));
        return file + rank;
    }

    // Piece types to small codes
    // 'wp' -> 1, 'wn' -> 2, 'wb' -> 3, 'wr' -> 4, 'wq' -> 5, 'wk' -> 6
    // 'bp' -> 7, 'bn' -> 8, 'bb' -> 9, 'br' -> 10, 'bq' -> 11, 'bk' -> 12
    const PIECE_TO_BYTE = {
        'wp': 1, 'wn': 2, 'wb': 3, 'wr': 4, 'wq': 5, 'wk': 6,
        'bp': 7, 'bn': 8, 'bb': 9, 'br': 10, 'bq': 11, 'bk': 12
    };

    const BYTE_TO_PIECE = {
        1: 'wp', 2: 'wn', 3: 'wb', 4: 'wr', 5: 'wq', 6: 'wk',
        7: 'bp', 8: 'bn', 9: 'bb', 10: 'br', 11: 'bq', 12: 'bk'
    };

    /**
     * Packs chess move data into a 15-byte Uint8Array
     * @param {Object} move 
     * @returns {Uint8Array}
     */
    function packMove(move) {
        const buffer = new ArrayBuffer(15);
        const view = new DataView(buffer);

        // Byte 0: from index
        view.setUint8(0, squareToIndex(move.from));
        // Byte 1: to index
        view.setUint8(1, squareToIndex(move.to));
        // Byte 2: piece byte representation
        view.setUint8(2, PIECE_TO_BYTE[move.piece] || 0);
        // Byte 3: promotion piece code (0 if none, else char code)
        let promoByte = 0;
        if (move.promotion) {
            promoByte = move.promotion.charCodeAt(0);
        }
        view.setUint8(3, promoByte);

        // Timers
        const whiteTime = move.timers ? Math.round(move.timers.white) : 0;
        const blackTime = move.timers ? Math.round(move.timers.black) : 0;
        const inc = move.timers ? Math.round(move.timers.inc) : 0;
        const running = (move.timers && move.timers.running) ? 1 : 0;

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
     * Unpacks chess move data from a 15-byte Uint8Array/ArrayBuffer
     * @param {ArrayBuffer|Uint8Array|Buffer} data 
     * @returns {Object}
     */
    function unpackMove(data) {
        const arrayBuf = data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
        const view = new DataView(arrayBuf);

        const from = indexToSquare(view.getUint8(0));
        const to = indexToSquare(view.getUint8(1));
        const piece = BYTE_TO_PIECE[view.getUint8(2)] || null;

        const promoCode = view.getUint8(3);
        const promotion = promoCode === 0 ? null : String.fromCharCode(promoCode);

        const white = view.getUint32(4, true);
        const black = view.getUint32(8, true);
        const inc = view.getUint16(12, true);
        const running = view.getUint8(14) === 1;

        return {
            from,
            to,
            piece,
            promotion,
            timers: { white, black, inc, running }
        };
    }

    /**
     * Packs full game state into an 81-byte Uint8Array
     * @param {Object} state 
     * @returns {Uint8Array}
     */
    function packState(state) {
        const buffer = new ArrayBuffer(81);
        const view = new DataView(buffer);

        // Bytes 0-63: board (64 bytes)
        for (let i = 0; i < 64; i++) {
            const piece = state.board[i];
            view.setUint8(i, PIECE_TO_BYTE[piece] || 0);
        }

        // Byte 64: turn (0: white, 1: black)
        view.setUint8(64, state.turn === 'b' ? 1 : 0);

        // Byte 65: castling mask
        let castlingMask = 0;
        if (state.castling) {
            if (state.castling.wKing) castlingMask |= 1;
            if (state.castling.wQueen) castlingMask |= 2;
            if (state.castling.bKing) castlingMask |= 4;
            if (state.castling.bQueen) castlingMask |= 8;
        }
        view.setUint8(65, castlingMask);

        // Byte 66: enPassant index (0-63 or 255)
        view.setUint8(66, squareToIndex(state.enPassant));

        // Byte 67: halfmoveClock
        view.setUint8(67, state.halfmoveClock || 0);

        // Bytes 68-69: fullmoveNumber (Uint16)
        view.setUint16(68, state.fullmoveNumber || 1, true);

        // Timers
        const whiteTime = state.timers ? Math.round(state.timers.white) : 0;
        const blackTime = state.timers ? Math.round(state.timers.black) : 0;
        const inc = state.timers ? Math.round(state.timers.inc) : 0;
        const running = (state.timers && state.timers.running) ? 1 : 0;

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
     * Unpacks full game state from an 81-byte ArrayBuffer/Uint8Array
     * @param {ArrayBuffer|Uint8Array|Buffer} data 
     * @returns {Object}
     */
    function unpackState(data) {
        const arrayBuf = data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
        const view = new DataView(arrayBuf);

        // Bytes 0-63: board (64 bytes)
        const board = new Array(64);
        for (let i = 0; i < 64; i++) {
            const val = view.getUint8(i);
            board[i] = BYTE_TO_PIECE[val] || null;
        }

        // Byte 64: turn
        const turn = view.getUint8(64) === 1 ? 'b' : 'w';

        // Byte 65: castling
        const castlingMask = view.getUint8(65);
        const castling = {
            wKing: (castlingMask & 1) !== 0,
            wQueen: (castlingMask & 2) !== 0,
            bKing: (castlingMask & 4) !== 0,
            bQueen: (castlingMask & 8) !== 0
        };

        // Byte 66: enPassant
        const enPassant = indexToSquare(view.getUint8(66));

        // Byte 67: halfmoveClock
        const halfmoveClock = view.getUint8(67);

        // Bytes 68-69: fullmoveNumber
        const fullmoveNumber = view.getUint16(68, true);

        // Timers
        const white = view.getUint32(70, true);
        const black = view.getUint32(74, true);
        const inc = view.getUint16(78, true);
        const running = view.getUint8(80) === 1;

        return {
            board,
            turn,
            castling,
            enPassant,
            halfmoveClock,
            fullmoveNumber,
            timers: { white, black, inc, running }
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
