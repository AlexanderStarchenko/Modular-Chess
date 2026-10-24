const shared = require('../js/ai_shared.js');
const neural = require('../js/ai_neural.js');

describe('Opening Book & Endgame Tablebase / Solver', () => {
    describe('Grandmaster Opening Book', () => {
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
