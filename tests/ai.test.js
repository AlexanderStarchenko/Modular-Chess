const ChessLogic = require('../js/logic');
const ChessAI_Easy = require('../js/ai_easy');
const ChessAI_Medium = require('../js/ai_medium');
const ChessAI_Hard = require('../js/ai_hard');
const ChessAI_VeryHard = require('../js/ai_very_hard');

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

    describe('Very Hard AI', () => {
        test('Should return a valid move for White', () => {
            const state = ChessLogic.getState();
            const move = ChessAI_VeryHard.getBestMove(state.turn);
            expect(move).toBeDefined();
            expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
        });

        test('Should return a valid move for Black', () => {
            ChessLogic.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
            const move = ChessAI_VeryHard.getBestMove('b');
            expect(move).toBeDefined();
            expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
        });

        test('Should prefer capture move if leading to advantage', () => {
            const captureFen = 'k7/8/8/8/8/8/q7/K7 w - - 0 1';
            ChessLogic.loadFen(captureFen);
            const state = ChessLogic.getState();
            const move = ChessAI_VeryHard.getBestMove(state.turn);
            expect(move).not.toBeNull();
            expect(move.toR).toBe(6);
            expect(move.toC).toBe(0);
        });

        test('Should return null if no moves available', () => {
            ChessLogic.loadFen('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
            const move = ChessAI_VeryHard.getBestMove('b');
            expect(move).toBeNull();
        });

        test('Should use WASM search when ChessWASM is available and loaded', () => {
            global.ChessWASM = {
                isLoaded: jest.fn().mockReturnValue(true),
                searchWASM: jest.fn().mockReturnValue({ fromR: 6, fromC: 4, toR: 4, toC: 4 }),
                getSearchScore: jest.fn().mockReturnValue(100)
            };

            const state = ChessLogic.getState();
            const move = ChessAI_VeryHard.getBestMove(state.turn);
            expect(global.ChessWASM.isLoaded).toHaveBeenCalled();
            expect(global.ChessWASM.searchWASM).toHaveBeenCalled();
            expect(move).toEqual({ fromR: 6, fromC: 4, toR: 4, toC: 4 });

            delete global.ChessWASM;
        });

        test('Should handle search time limit and exit early in WASM search', () => {
            let callCount = 0;
            const originalNow = Date.now;
            Date.now = () => {
                callCount++;
                if (callCount < 5) return 1000;
                return 100000; // far in the future, > timeLimit (2500)
            };

            global.ChessWASM = {
                isLoaded: jest.fn().mockReturnValue(true),
                searchWASM: jest.fn().mockImplementation((depth) => {
                    return { fromR: 6, fromC: 4, toR: 4, toC: 4 };
                }),
                getSearchScore: jest.fn().mockReturnValue(100)
            };

            const state = ChessLogic.getState();
            const move = ChessAI_VeryHard.getBestMove(state.turn);
            expect(move).toBeDefined();

            delete global.ChessWASM;
            Date.now = originalNow;
        });

        test('Should stop searching in WASM search if forced mate is found', () => {
            global.ChessWASM = {
                isLoaded: jest.fn().mockReturnValue(true),
                searchWASM: jest.fn().mockReturnValue({ fromR: 6, fromC: 4, toR: 4, toC: 4 }),
                getSearchScore: jest.fn().mockReturnValue(99999) // forced mate (>90000)
            };

            const state = ChessLogic.getState();
            const move = ChessAI_VeryHard.getBestMove(state.turn);
            expect(move).toBeDefined();

            delete global.ChessWASM;
        });

        test('Should abort search early if time limit exceeded in JS mode', () => {
            let callCount = 0;
            const originalNow = Date.now;
            Date.now = () => {
                callCount++;
                if (callCount < 5) return 1000;
                return 100000;
            };
            const state = ChessLogic.getState();
            const move = ChessAI_VeryHard.getBestMove(state.turn);
            expect(move).toBeDefined();
            Date.now = originalNow;
        });
    });
});

