/**
 * Unit tests for ChessAIManager
 */

describe('ChessAIManager', () => {
    let ChessAIManager;
    let mockLogic;
    let mockEasy;
    let mockMedium;
    let mockHard;
    let mockVeryHard;
    let mockShared;
    let mockNeural;
    let mockUnreal;

    beforeEach(() => {
        jest.resetModules();

        mockLogic = {
            getTurn: jest.fn(() => 'w'),
            getFen: jest.fn(() => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        };
        global.ChessLogic = mockLogic;

        mockEasy = {
            getBestMove: jest.fn((turn) => ({ fromR: 6, fromC: 4, toR: 4, toC: 4, engine: 'easy', turn }))
        };
        global.ChessAIEasy = mockEasy;

        mockMedium = {
            getBestMove: jest.fn((turn) => ({ fromR: 6, fromC: 3, toR: 4, toC: 3, engine: 'medium', turn }))
        };
        global.ChessAIMedium = mockMedium;

        mockHard = {
            getBestMove: jest.fn((turn) => ({ fromR: 7, fromC: 1, toR: 5, toC: 2, engine: 'hard', turn }))
        };
        global.ChessAIHard = mockHard;

        mockVeryHard = {
            getBestMove: jest.fn((turn) => ({ fromR: 7, fromC: 6, toR: 5, toC: 5, engine: 'very_hard', turn }))
        };
        global.ChessAIVeryHard = mockVeryHard;

        mockShared = {
            getOpeningBookMove: jest.fn(() => null)
        };
        global.ChessAIShared = mockShared;

        mockNeural = {
            getBestMove: jest.fn(() => Promise.resolve({ fromR: 6, fromC: 4, toR: 4, toC: 4, engine: 'neural' }))
        };
        global.ChessAINeural = mockNeural;

        mockUnreal = {
            getBestMove: jest.fn(() => Promise.resolve({ fromR: 6, fromC: 4, toR: 4, toC: 4, engine: 'unreal' }))
        };
        global.ChessAIUnreal = mockUnreal;

        ChessAIManager = require('../js/ai_manager');
    });

    afterEach(() => {
        delete global.ChessLogic;
        delete global.ChessAIEasy;
        delete global.ChessAIMedium;
        delete global.ChessAIHard;
        delete global.ChessAIVeryHard;
        delete global.ChessAIShared;
        delete global.ChessAINeural;
        delete global.ChessAIUnreal;
    });

    test('1. getFallbackPCMove uses target FEN turn instead of global ChessLogic when FEN is passed', () => {
        // Global logic says 'w', but FEN says 'b'
        mockLogic.getTurn.mockReturnValue('w');
        const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

        const move = ChessAIManager.getFallbackPCMove('1', blackFen);
        expect(move.turn).toBe('b');
        expect(mockEasy.getBestMove).toHaveBeenCalledWith('b');
    });

    test('2. getFallbackPCMove queries opening book with target FEN', () => {
        const customFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
        mockShared.getOpeningBookMove.mockReturnValueOnce({ fromR: 7, fromC: 6, toR: 5, toC: 5, book: true });

        const move = ChessAIManager.getFallbackPCMove('2', customFen);
        expect(mockShared.getOpeningBookMove).toHaveBeenCalledWith(customFen);
        expect(move).toEqual({ fromR: 7, fromC: 6, toR: 5, toC: 5, book: true });
    });

    test('3. getFallbackPCMove handles difficulty 4 and 5 with ChessAIVeryHard', () => {
        const move4 = ChessAIManager.getFallbackPCMove('4');
        expect(move4.engine).toBe('very_hard');

        const move5 = ChessAIManager.getFallbackPCMove('5');
        expect(move5.engine).toBe('very_hard');
    });

    test('4. getFallbackPCMove gracefully falls back to default engine for neural-* or unknown difficulty', () => {
        const move = ChessAIManager.getFallbackPCMove('neural-v1-7');
        expect(move).not.toBeNull();
        expect(move.engine).toBe('medium');
    });

    test('5. getBestMove parses regex modelVer and searchType for neural difficulty', async () => {
        await ChessAIManager.getBestMove('some_fen', 'neural-v1-7-mcts');
        expect(mockNeural.getBestMove).toHaveBeenCalledWith(
            'some_fen',
            'v1_7',
            'mcts',
            []
        );

        await ChessAIManager.getBestMove('some_fen', 'neural-v1-6-minimax');
        expect(mockNeural.getBestMove).toHaveBeenCalledWith(
            'some_fen',
            'v1_6',
            'minimax',
            []
        );

        await ChessAIManager.getBestMove('some_fen', 'neural');
        expect(mockNeural.getBestMove).toHaveBeenCalledWith(
            'some_fen',
            'v1',
            'alphabeta',
            []
        );
    });

    test('6. getBestMove falls back when neural AI rejects or times out', async () => {
        mockNeural.getBestMove.mockRejectedValueOnce(new Error('Neural network error'));
        const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

        const move = await ChessAIManager.getBestMove(blackFen, 'neural-v1-7');
        expect(move).not.toBeNull();
        expect(move.turn).toBe('b');
    });

    test('7. getHint handles Stockfish error and safely returns fallback move', async () => {
        mockUnreal.getBestMove.mockRejectedValueOnce(new Error('Worker crashed'));
        const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

        const hint = await ChessAIManager.getHint(blackFen);
        expect(hint).not.toBeNull();
        expect(hint.engine).toBe('very_hard');
        expect(hint.turn).toBe('b');
    });

    test('8. getHint handles Stockfish returning null and falls back', async () => {
        mockUnreal.getBestMove.mockResolvedValueOnce(null);
        const hint = await ChessAIManager.getHint('fen_w w - - 0 1');
        expect(hint).not.toBeNull();
        expect(hint.engine).toBe('very_hard');
    });
});
