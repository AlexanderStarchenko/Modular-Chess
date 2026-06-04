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

    // Helper to map piece characters to code
    function pieceToCode(piece) {
        if (!piece) return 0;
        const color = piece === piece.toUpperCase() ? 'w' : 'b';
        const type = piece.toLowerCase();
        return PIECE_TO_BYTE[color + type] || 0;
    }

    // Helper to map code back to piece character
    function codeToPiece(code) {
        const pieceStr = BYTE_TO_PIECE[code];
        if (!pieceStr) return null;
        const color = pieceStr[0];
        const type = pieceStr[1];
        return color === 'w' ? type.toUpperCase() : type.toLowerCase();
    }

    /**
     * Packs chess move data into a 15-byte Uint8Array
     * @param {Object} move 
     * @returns {Uint8Array}
     */
    function packMove(move) {
        const buffer = new ArrayBuffer(15);
        const view = new DataView(buffer);

        let fromIdx = 255;
        let toIdx = 255;

        if (move.fromRow !== undefined && move.fromCol !== undefined) {
            fromIdx = (7 - move.fromRow) * 8 + move.fromCol;
        } else if (move.from) {
            fromIdx = squareToIndex(move.from);
        }

        if (move.toRow !== undefined && move.toCol !== undefined) {
            toIdx = (7 - move.toRow) * 8 + move.toCol;
        } else if (move.to) {
            toIdx = squareToIndex(move.to);
        }

        // Byte 0: from index
        view.setUint8(0, fromIdx);
        // Byte 1: to index
        view.setUint8(1, toIdx);

        // Byte 2: piece byte representation
        let pieceByte = 0;
        if (move.piece) {
            pieceByte = PIECE_TO_BYTE[move.piece] || pieceToCode(move.piece);
        }
        view.setUint8(2, pieceByte);

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

        const fromIdx = view.getUint8(0);
        const toIdx = view.getUint8(1);

        const from = indexToSquare(fromIdx);
        const to = indexToSquare(toIdx);

        let fromRow = undefined;
        let fromCol = undefined;
        if (fromIdx !== 255) {
            fromRow = 7 - Math.floor(fromIdx / 8);
            fromCol = fromIdx % 8;
        }

        let toRow = undefined;
        let toCol = undefined;
        if (toIdx !== 255) {
            toRow = 7 - Math.floor(toIdx / 8);
            toCol = toIdx % 8;
        }

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
            fromRow,
            fromCol,
            toRow,
            toCol,
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

        const boardState = state.boardState || state;
        const board = boardState.board;

        // Bytes 0-63: board (64 bytes)
        if (Array.isArray(board)) {
            if (Array.isArray(board[0])) {
                // 2D Array (8x8)
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const piece = board[r][c];
                        const idx = (7 - r) * 8 + c;
                        view.setUint8(idx, pieceToCode(piece));
                    }
                }
            } else {
                // 1D Array (64 elements)
                for (let i = 0; i < 64; i++) {
                    const piece = board[i];
                    view.setUint8(i, PIECE_TO_BYTE[piece] || pieceToCode(piece));
                }
            }
        }

        // Byte 64: turn (0: white, 1: black)
        const turn = boardState.turn || 'w';
        view.setUint8(64, turn === 'b' ? 1 : 0);

        // Byte 65: castling mask
        let castlingMask = 0;
        const castlingRights = boardState.castlingRights;
        const castling = boardState.castling;
        if (castlingRights) {
            const wKing = !castlingRights.wKingMoved && !castlingRights.wRookHMoved;
            const wQueen = !castlingRights.wKingMoved && !castlingRights.wRookAMoved;
            const bKing = !castlingRights.bKingMoved && !castlingRights.bRookHMoved;
            const bQueen = !castlingRights.bKingMoved && !castlingRights.bRookAMoved;
            if (wKing) castlingMask |= 1;
            if (wQueen) castlingMask |= 2;
            if (bKing) castlingMask |= 4;
            if (bQueen) castlingMask |= 8;
        } else if (castling) {
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
            if (typeof ep === 'object' && ep.row !== undefined && ep.col !== undefined) {
                enPassantIdx = (7 - ep.row) * 8 + ep.col;
            } else if (typeof ep === 'string') {
                enPassantIdx = squareToIndex(ep);
            }
        }
        view.setUint8(66, enPassantIdx);

        // Byte 67: halfmoveClock
        const halfmove = boardState.halfMoveClock !== undefined ? boardState.halfMoveClock : (boardState.halfmoveClock || 0);
        view.setUint8(67, halfmove);

        // Bytes 68-69: fullmoveNumber (Uint16)
        const moveCount = state.moveCount !== undefined ? state.moveCount : (boardState.moveCount || 0);
        const fullmove = boardState.fullmoveNumber || (1 + Math.floor(moveCount / 2));
        view.setUint16(68, fullmove, true);

        // Timers
        const timers = state.timers || boardState.timers;
        const whiteTime = timers ? Math.round(timers.white) : 0;
        const blackTime = timers ? Math.round(timers.black) : 0;
        const inc = timers ? Math.round(timers.inc) : 0;
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
     * Unpacks full game state from an 81-byte ArrayBuffer/Uint8Array
     * @param {ArrayBuffer|Uint8Array|Buffer} data 
     * @returns {Object}
     */
    function unpackState(data) {
        const arrayBuf = data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
        const view = new DataView(arrayBuf);

        const board1D = new Array(64);
        const board2D = Array.from({ length: 8 }, () => new Array(8).fill(null));

        for (let i = 0; i < 64; i++) {
            const val = view.getUint8(i);
            board1D[i] = BYTE_TO_PIECE[val] || null;
            const r = 7 - Math.floor(i / 8);
            const c = i % 8;
            board2D[r][c] = codeToPiece(val);
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
        const enPassantSquare = enPassantIdx !== 255 ? {
            row: 7 - Math.floor(enPassantIdx / 8),
            col: enPassantIdx % 8
        } : null;

        const halfmoveClock = view.getUint8(67);
        const halfMoveClock = halfmoveClock;

        const fullmoveNumber = view.getUint16(68, true);

        const white = view.getUint32(70, true);
        const black = view.getUint32(74, true);
        const inc = view.getUint16(78, true);
        const running = view.getUint8(80) === 1;

        // Reconstruct captures dynamically from board state
        const standardCounts = {
            'P': 8, 'N': 2, 'B': 2, 'R': 2, 'Q': 1, 'K': 1,
            'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1, 'k': 1
        };
        const actualCounts = {
            'P': 0, 'N': 0, 'B': 0, 'R': 0, 'Q': 0, 'K': 0,
            'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0
        };
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board2D[r][c];
                if (piece && actualCounts[piece] !== undefined) {
                    actualCounts[piece]++;
                }
            }
        }

        const capturedByWhite = [];
        const capturedByBlack = [];

        const blackPieceTypes = ['p', 'n', 'b', 'r', 'q'];
        blackPieceTypes.forEach(p => {
            const missing = standardCounts[p] - actualCounts[p];
            for (let i = 0; i < missing; i++) {
                capturedByWhite.push(p);
            }
        });

        const whitePieceTypes = ['P', 'N', 'B', 'R', 'Q'];
        whitePieceTypes.forEach(p => {
            const missing = standardCounts[p] - actualCounts[p];
            for (let i = 0; i < missing; i++) {
                capturedByBlack.push(p.toLowerCase());
            }
        });

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
