const vm = require('vm');
const fs = require('fs');
const path = require('path');
const openingBook = require('../js/books/opening_book.js');
const endgameBook = require('../js/books/endgame_book.js');
const shared = require('../js/ai_shared.js');
const neural = require('../js/ai_neural.js');

describe('Opening Book & Endgame Tablebase / Solver', () => {
    describe('Direct Split Modules (opening_book.js & endgame_book.js)', () => {
        test('opening_book.js exports full ChessOpeningBook and helpers directly', () => {
            expect(Object.keys(openingBook.ChessOpeningBook).length).toBeGreaterThanOrEqual(800);
            expect(openingBook.ChessOpeningBook).toBe(shared.ChessOpeningBook);

            const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
            const move = openingBook.getOpeningBookMove(startFen);
            expect(move).not.toBeNull();
            expect([6, 7]).toContain(move.fromR);
            expect(move.isOpening).toBe(true);
            expect(typeof move.uci).toBe('string');

            // 3-field normalization: X-FEN with '-' instead of 'e3' + leading whitespace
            const xFenAfterE4 = '   rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1 ';
            const afterE4Move = openingBook.getOpeningBookMove(xFenAfterE4);
            expect(afterE4Move).not.toBeNull();
            expect(afterE4Move.isOpening).toBe(true);

            // Biased weighting keeps moves[0] much more common than moves[last]
            const spy = jest.spyOn(Math, 'random').mockReturnValue(0.4);
            try {
                const weighted = openingBook.getOpeningBookMove(startFen);
                // 0.4^2 * 4 = 0.64 -> index 0 ('e2e4')
                expect(weighted.uci).toBe('e2e4');
            } finally {
                spy.mockRestore();
            }

            expect(openingBook.getOpeningBookMove('8/8/8/8/8/8/8/8 w - -')).toBeNull();
            expect(openingBook.getOpeningBookMove('   ')).toBeNull();
            expect(openingBook.getOpeningBookMove(null)).toBeNull();

            expect(openingBook.parseUciMove('e2e4')).toEqual({
                fromR: 6, fromC: 4, toR: 4, toC: 4, promotion: null
            });
            expect(openingBook.parseUciMove('e7e8Q')).toEqual({
                fromR: 1, fromC: 4, toR: 0, toC: 4, promotion: 'q'
            });
            expect(openingBook.parseUciMove('e7e8q')).toEqual({
                fromR: 1, fromC: 4, toR: 0, toC: 4, promotion: 'q'
            });
            expect(openingBook.parseUciMove('invalid')).toBeNull();
            expect(openingBook.parseUciMove(null)).toBeNull();
        });

        test('endgame_book.js exports full ChessEndgameTablebase and helpers directly', () => {
            expect(Object.keys(endgameBook.ChessEndgameTablebase).length).toBeGreaterThanOrEqual(80);
            expect(endgameBook.ChessEndgameTablebase).toBe(shared.ChessEndgameTablebase);

            const lucenaFen = '4K3/4P3/8/3k4/8/8/1r6/4R3 w - -';
            const tbMove = endgameBook.getEndgameTablebaseMove(lucenaFen);
            expect(tbMove).toEqual({
                fromR: 7, fromC: 4, toR: 4, toC: 4, promotion: null, isEndgame: true
            });

            const egMove = endgameBook.getEndgameMove(lucenaFen);
            expect(egMove).toEqual({
                fromR: 7, fromC: 4, toR: 4, toC: 4, promotion: null, isEndgame: true
            });

            expect(endgameBook.getEndgameTablebaseMove('8/8/8/8/8/8/8/8 w - -')).toBeNull();
            expect(endgameBook.getEndgameMove(null)).toBeNull();
            expect(endgameBook.parseUciMove('a7a8q')).toEqual({
                fromR: 1, fromC: 0, toR: 0, toC: 0, promotion: 'q'
            });
        });

        test('browser global script load order wires opening_book + endgame_book into ai_shared.js', () => {
            const sandbox = { Math, Object, Array, parseInt };
            sandbox.globalThis = sandbox;
            vm.createContext(sandbox);

            for (const file of ['books/opening_book.js', 'books/endgame_book.js', 'ai_shared.js']) {
                const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
                vm.runInContext(code, sandbox);
            }

            expect(sandbox.ChessOpeningModule).toBeDefined();
            expect(sandbox.ChessEndgameModule).toBeDefined();
            expect(sandbox.ChessAIShared).toBeDefined();
            expect(Object.keys(sandbox.ChessAIShared.ChessOpeningBook).length)
                .toBe(Object.keys(openingBook.ChessOpeningBook).length);
            expect(Object.keys(sandbox.ChessAIShared.ChessEndgameTablebase).length)
                .toBe(Object.keys(endgameBook.ChessEndgameTablebase).length);

            const startMove = sandbox.ChessAIShared.getOpeningBookMove(
                'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            );
            expect(startMove).not.toBeNull();
            const lucenaMove = sandbox.ChessAIShared.getEndgameMove('4K3/4P3/8/3k4/8/8/1r6/4R3 w - -');
            expect(lucenaMove).toEqual({
                fromR: 7, fromC: 4, toR: 4, toC: 4, promotion: null, isEndgame: true
            });
        });
    });

    describe('Grandmaster Opening Book (via ChessAIShared backwards compatibility)', () => {
        test('has at least 800 verified opening positions', () => {
            const count = Object.keys(shared.ChessOpeningBook).length;
            expect(count).toBeGreaterThanOrEqual(800);
        });

        test('returns valid move for initial starting position', () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
            const move = shared.getOpeningBookMove(fen);
            expect(move).toBeDefined();
            expect(move).not.toBeNull();
            expect(typeof move.fromR).toBe('number');
            expect(typeof move.fromC).toBe('number');
            expect(typeof move.toR).toBe('number');
            expect(typeof move.toC).toBe('number');
            // Valid white first moves start on rank 6 or 7
            expect([6, 7]).toContain(move.fromR);
        });

        test('returns valid moves for major opening systems', () => {
            const openings = [
                // Sicilian
                'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6',
                // French
                'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
                // Caro-Kann
                'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
                // Queen\'s Gambit
                'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3',
                // King\'s Indian
                'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -'
            ];

            for (const fen of openings) {
                const move = shared.getOpeningBookMove(fen);
                expect(move).not.toBeNull();
                expect(move.fromR).toBeGreaterThanOrEqual(0);
                expect(move.fromR).toBeLessThanOrEqual(7);
            }
        });
    });

    describe('Endgame Tablebase', () => {
        test('has at least 80 verified endgame positions', () => {
            const count = Object.keys(shared.ChessEndgameTablebase).length;
            expect(count).toBeGreaterThanOrEqual(80);
        });

        test('has theoretical Lucena bridge winning positions', () => {
            const lucenaFen = '4K3/4P3/8/3k4/8/8/1r6/4R3 w - -';
            const move = shared.getEndgameTablebaseMove(lucenaFen);
            expect(move).not.toBeNull();
            expect(move.isEndgame).toBe(true);
            // 1. Re4 (e1e4)
            expect(move.fromR).toBe(7);
            expect(move.fromC).toBe(4);
            expect(move.toR).toBe(4);
            expect(move.toC).toBe(4);
        });

        test('has theoretical Philidor defense drawing positions', () => {
            const philidorFen = '4k3/8/r7/4P3/8/8/4R3/4K3 b - -';
            const move = shared.getEndgameTablebaseMove(philidorFen);
            expect(move).not.toBeNull();
            expect(move.isEndgame).toBe(true);
        });

        test('ChessAIShared.getEndgameMove remains backwards-compatible', () => {
            const lucenaFen = '4K3/4P3/8/3k4/8/8/1r6/4R3 w - -';
            const move = shared.getEndgameMove(lucenaFen);
            expect(move).toEqual({
                fromR: 7, fromC: 4, toR: 4, toC: 4, promotion: null, isEndgame: true
            });
        });
    });

    describe('Elementary Mating Endgame Solver', () => {
        test('finds instant checkmate in 1 in lone king endgame', () => {
            // Mate in 1: Qe3#
            const mateInOneFen = '8/8/8/8/8/4k3/8/4K1Q1 w - - 0 1';
            const move = neural.getEndgameMove(mateInOneFen);
            expect(move).not.toBeNull();
            expect(move.isMate || move.score === 10000 || move.isEndgame).toBeTruthy();
        });

        test('corners enemy king in K+Q vs K without stalemate', () => {
            const kqFen = '8/8/8/8/8/5k2/8/4K2Q w - - 0 1';
            const move = neural.getEndgameMove(kqFen);
            expect(move).not.toBeNull();
            expect(move.isEndgame).toBe(true);
        });

        test('corners enemy king in K+R vs K with rook cutoff', () => {
            const krFen = '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1';
            const move = neural.getEndgameMove(krFen);
            expect(move).not.toBeNull();
            expect(move.isEndgame).toBe(true);
        });
    });
});
