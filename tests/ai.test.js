const ChessLogic = require('../js/logic');
const ChessAI_Easy = require('../js/ai_easy');
const ChessAI_Medium = require('../js/ai_medium');
const ChessAI_Hard = require('../js/ai_hard');

describe('Chess AI Modules', () => {
    beforeEach(() => {
        ChessLogic.initBoard();
    });

    test('Easy AI should return a valid move', () => {
        const state = ChessLogic.getState();
        const move = ChessAI_Easy.getBestMove(state.turn);
        expect(move).toBeDefined();
        expect(ChessLogic.isValidMove(move.fromR, move.fromC, move.toR, move.toC)).toBe(true);
    });

    test('Medium AI should return a valid move', () => {
        const state = ChessLogic.getState();
        const move = ChessAI_Medium.getBestMove(state.turn);
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
