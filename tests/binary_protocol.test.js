const BinaryProtocol = require('../js/lib/binary_protocol');

describe('Universal Binary Protocol', () => {
    test('Square <-> Index Conversion', () => {
        expect(BinaryProtocol.squareToIndex('a1')).toBe(0);
        expect(BinaryProtocol.squareToIndex('h8')).toBe(63);
        expect(BinaryProtocol.squareToIndex('e4')).toBe(28); // e = 4, 4 = 3 -> 3 * 8 + 4 = 28
        expect(BinaryProtocol.squareToIndex(null)).toBe(255);
        expect(BinaryProtocol.squareToIndex('invalid')).toBe(255);

        expect(BinaryProtocol.indexToSquare(0)).toBe('a1');
        expect(BinaryProtocol.indexToSquare(63)).toBe('h8');
        expect(BinaryProtocol.indexToSquare(28)).toBe('e4');
        expect(BinaryProtocol.indexToSquare(255)).toBeNull();
    });

    test('Move Packing and Unpacking', () => {
        const originalMove = {
            from: 'e2',
            to: 'e4',
            piece: 'wp',
            promotion: null,
            timers: {
                white: 299,
                black: 300,
                inc: 2,
                running: true
            }
        };

        const packed = BinaryProtocol.packMove(originalMove);
        expect(packed.length).toBe(15);

        const unpacked = BinaryProtocol.unpackMove(packed);
        expect(unpacked).toMatchObject(originalMove);
    });

    test('Move Packing and Unpacking with Promotion', () => {
        const promoMove = {
            from: 'd7',
            to: 'd8',
            piece: 'bp',
            promotion: 'q',
            timers: {
                white: 10,
                black: 25,
                inc: 0,
                running: false
            }
        };

        const packed = BinaryProtocol.packMove(promoMove);
        expect(packed.length).toBe(15);

        const unpacked = BinaryProtocol.unpackMove(packed);
        expect(unpacked).toMatchObject(promoMove);
    });

    test('Full State Sync Packing and Unpacking', () => {
        // Construct a sample board
        const board = new Array(64).fill(null);
        board[0] = 'wr';
        board[4] = 'wk';
        board[7] = 'wr';
        board[8] = 'wp';
        board[56] = 'br';
        board[60] = 'bk';
        board[63] = 'br';

        const originalState = {
            board,
            turn: 'b',
            castling: {
                wKing: true,
                wQueen: false,
                bKing: true,
                bQueen: true
            },
            enPassant: 'e3',
            halfmoveClock: 4,
            fullmoveNumber: 12,
            timers: {
                white: 180,
                black: 164,
                inc: 5,
                running: true
            }
        };

        const packed = BinaryProtocol.packState(originalState);
        expect(packed.length).toBe(81);

        const unpacked = BinaryProtocol.unpackState(packed);
        expect(unpacked).toMatchObject(originalState);
    });

    test('JSON Buffer Unpacking (Node.js Buffer Serialization)', () => {
        const originalMove = {
            from: 'e2',
            to: 'e4',
            piece: 'wp',
            promotion: null,
            timers: { white: 299, black: 300, inc: 2, running: true }
        };

        const packed = BinaryProtocol.packMove(originalMove);
        // Simulate JSON representation: { type: 'Buffer', data: [...] }
        const jsonSerializedBuffer = {
            type: 'Buffer',
            data: Array.from(packed)
        };

        // Convert the JSON representation to Uint8Array/ArrayBuffer as parsePayload does
        const parsedArrayBuffer = new Uint8Array(jsonSerializedBuffer.data).buffer;
        const unpacked = BinaryProtocol.unpackMove(parsedArrayBuffer);
        
        expect(unpacked).toMatchObject(originalMove);
    });

    test('2D Move Packing and Unpacking (Row/Col Representation)', () => {
        const move2D = {
            fromRow: 6,
            fromCol: 4,
            toRow: 4,
            toCol: 4,
            timers: { white: 299, black: 300, inc: 2, running: true }
        };

        const packed = BinaryProtocol.packMove(move2D);
        expect(packed.length).toBe(15);

        const unpacked = BinaryProtocol.unpackMove(packed);
        expect(unpacked.fromRow).toBe(6);
        expect(unpacked.fromCol).toBe(4);
        expect(unpacked.toRow).toBe(4);
        expect(unpacked.toCol).toBe(4);
        expect(unpacked.from).toBe('e2');
        expect(unpacked.to).toBe('e4');
        expect(unpacked.timers).toEqual(move2D.timers);
    });

    test('2D State Packing and Unpacking (getState/loadState representation)', () => {
        const board2D = Array.from({ length: 8 }, () => new Array(8).fill(null));
        board2D[7][4] = 'K'; // White King (e1)
        board2D[7][0] = 'R'; // White Rook (a1)
        board2D[0][4] = 'k'; // Black King (e8)

        const state2D = {
            boardState: {
                board: board2D,
                turn: 'w',
                castlingRights: {
                    wKingMoved: false,
                    wRookHMoved: true, // King side rook moved, no king side castling
                    wRookAMoved: false,
                    bKingMoved: true, // Black king moved, no castling
                    bRookHMoved: false,
                    bRookAMoved: false
                },
                enPassantSquare: { row: 5, col: 4 }, // e3
                halfMoveClock: 3
            },
            moveCount: 15,
            timers: { white: 180, black: 120, inc: 3, running: true }
        };

        const packed = BinaryProtocol.packState(state2D);
        expect(packed.length).toBe(81);

        const unpacked = BinaryProtocol.unpackState(packed);
        
        // Check that unpacked 2D board matches original
        expect(unpacked.boardState.board[7][4]).toBe('K');
        expect(unpacked.boardState.board[7][0]).toBe('R');
        expect(unpacked.boardState.board[0][4]).toBe('k');
        
        // Check castlingRights mapping
        expect(unpacked.boardState.castlingRights.wKingMoved).toBe(false);
        expect(unpacked.boardState.castlingRights.wRookHMoved).toBe(true);
        expect(unpacked.boardState.castlingRights.wRookAMoved).toBe(false);
        expect(unpacked.boardState.castlingRights.bKingMoved).toBe(true);

        // Check enPassant and clocks
        expect(unpacked.boardState.enPassantSquare).toEqual({ row: 5, col: 4 });
        expect(unpacked.boardState.halfMoveClock).toBe(3);
        
        // Check captures (White has captured standard set except 1 white Rook and 1 white King; Black captured nothing)
        // 32 standard pieces, only K, R, k are on the board, so captures lists are populated
        expect(unpacked.captures.white.length).toBe(15); // Black has only king left, 15 black pieces captured by White
        expect(unpacked.captures.black.length).toBe(14); // White has king and rook left, 14 white pieces captured by Black
    });

    test('Move Packing and Unpacking without timers', () => {
        const moveNoTimers = {
            from: 'e2',
            to: 'e4',
            piece: 'wp',
            promotion: null
        };
        const packed = BinaryProtocol.packMove(moveNoTimers);
        const unpacked = BinaryProtocol.unpackMove(packed);
        expect(unpacked.from).toBe('e2');
        expect(unpacked.to).toBe('e4');
        expect(unpacked.timers.white).toBe(0);
        expect(unpacked.timers.black).toBe(0);
        expect(unpacked.timers.inc).toBe(0);
        expect(unpacked.timers.running).toBe(false);
    });

    test('State Packing with castling, enPassant string, and timers in boardState', () => {
        const board = new Array(64).fill(null);
        board[4] = 'wk';
        board[60] = 'bk';
        const state = {
            boardState: {
                board,
                turn: 'w',
                castling: {
                    wKing: true,
                    wQueen: true,
                    bKing: false,
                    bQueen: false
                },
                enPassant: 'e3',
                halfmoveClock: 2,
                timers: {
                    white: 100,
                    black: 150,
                    inc: 0,
                    running: false
                }
            }
        };

        const packed = BinaryProtocol.packState(state);
        const unpacked = BinaryProtocol.unpackState(packed);
        expect(unpacked.boardState.enPassantSquare).toEqual({ row: 5, col: 4 });
        expect(unpacked.boardState.castlingRights.wKingMoved).toBe(false);
        expect(unpacked.boardState.castlingRights.bKingMoved).toBe(true);
        expect(unpacked.timers.white).toBe(100);
        expect(unpacked.timers.black).toBe(150);
    });

    test('Helper functions with invalid/edge piece inputs', () => {
        const board = new Array(64).fill('invalid-piece');
        const state = { board, turn: 'w' };
        const packed = BinaryProtocol.packState(state);
        const unpacked = BinaryProtocol.unpackState(packed);
        expect(unpacked.boardState.board.every(row => row.every(cell => cell === null))).toBe(true);
    });
});
