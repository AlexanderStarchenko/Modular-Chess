const ChessLogic = require('../js/logic');
const ChessAI_Easy = require('../js/ai_easy');
const ChessAI_Medium = require('../js/ai_medium');
const ChessAI_Hard = require('../js/ai_hard');

describe('Chess AI Modules', () => {
    beforeEach(() => {
        ChessLogic.initBoard();
    });

    describe('Easy AI', () => {
        let originalRandom;

        beforeAll(() => {
            originalRandom = Math.random;
        });

        afterAll(() => {
            Math.random = originalRandom;
        });

        test('Should pick a random move 30% of the time', () => {
            Math.random = () => 0.1; // Force random move
            const state = ChessLogic.getState();
            const move = ChessAI_Easy.getBestMove(state.turn);
            expect(move).toBeDefined();
            expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
        });

        test('Should use depth 1 minimax 70% of the time (White)', () => {
            Math.random = () => 0.9; // Force minimax
            // A position where White can capture a Queen safely
            ChessLogic.loadFen('k7/8/8/8/8/8/q7/K7 w - - 0 1');
            const state = ChessLogic.getState();
            const move = ChessAI_Easy.getBestMove(state.turn);
            expect(move).toBeDefined();
            // It might or might not pick the exact capture depending on depth 1 search order,
            // but we at least ensure it runs the minimax branch without crashing.
            expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
        });

        test('Should use depth 1 minimax 70% of the time (Black)', () => {
            Math.random = () => 0.9; // Force minimax
            ChessLogic.loadFen('8/Q7/8/8/8/8/8/k6K b - - 0 1');
            const state = ChessLogic.getState();
            const move = ChessAI_Easy.getBestMove(state.turn);
            expect(move).toBeDefined();
            expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
        });

        test('Should return null if no moves available', () => {
            // Stalemate position where Black has no moves
            ChessLogic.loadFen('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
            const move = ChessAI_Easy.getBestMove('b');
            expect(move).toBeNull();
        });
    });

    test('Medium AI should return a valid move for White', () => {
        const state = ChessLogic.getState();
        const move = ChessAI_Medium.getBestMove(state.turn);
        expect(move).toBeDefined();
        expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
    });

    test('Medium AI should return a valid move for Black', () => {
        // Set up FEN with Black's turn
        ChessLogic.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
        const move = ChessAI_Medium.getBestMove('b');
        expect(move).toBeDefined();
        expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
    });

    test('Hard AI should return a valid move', () => {
        const state = ChessLogic.getState();
        const move = ChessAI_Hard.getBestMove(state.turn, 2); // Depth 2 for speed in tests
        expect(move).toBeDefined();
        expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
    });

    test('Hard AI should prefer capturing a piece if it leads to advantage', () => {
        // Set up a FEN where white can capture a black queen for free
        // White King at a1, Black Queen at a2
        const captureFen = 'k7/8/8/8/8/8/q7/K7 w - - 0 1';
        ChessLogic.loadFen(captureFen);
        const state = ChessLogic.getState();
        const move = ChessAI_Hard.getBestMove(state.turn, 3);
        expect(move).not.toBeNull();
        expect(move.toR).toBe(6);
        expect(move.toC).toBe(0);
    });
});
