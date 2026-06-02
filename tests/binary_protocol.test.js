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
        expect(unpacked).toEqual(originalMove);
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
        expect(unpacked).toEqual(promoMove);
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
        expect(unpacked).toEqual(originalState);
    });
});
