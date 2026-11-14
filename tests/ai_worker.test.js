/**
 * Tests for Web Worker Chess AI
 */

describe('Chess AI Worker', () => {
    let originalImportScripts;
    let originalPostMessage;
    let originalConsoleError;

    let initScriptsCalls = 0;
    let initScriptsArgs = [];
    let initWasmCalls = 0;

    beforeAll(() => {
        originalImportScripts = global.importScripts;
        originalPostMessage = global.postMessage;
        originalConsoleError = console.error;

        global.importScripts = jest.fn();
        global.postMessage = jest.fn();
        console.error = jest.fn();
        global.self = global;

        // Mock game dependencies in global scope
        global.ChessLogic = {
            loadState: jest.fn(),
            getFen: jest.fn().mockReturnValue('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        };
        global.ChessAIEasy = {
            getBestMove: jest.fn().mockReturnValue({ from: 'e2', to: 'e4', difficulty: 'easy' })
        };
        global.ChessAIMedium = {
            getBestMove: jest.fn().mockReturnValue({ from: 'e2', to: 'e4', difficulty: 'medium' })
        };
        global.ChessAIHard = {
            getBestMove: jest.fn().mockReturnValue({ from: 'e2', to: 'e4', difficulty: 'hard' })
        };
        global.ChessAIVeryHard = {
            getBestMove: jest.fn().mockReturnValue({ from: 'e2', to: 'e4', difficulty: 'very_hard' })
        };
        global.ChessWASM = {
            init: jest.fn().mockResolvedValue(true)
        };

        // Load the worker script which registers the onmessage handler
        require('../js/ai_worker');

        initScriptsCalls = global.importScripts.mock.calls.length;
        initScriptsArgs = global.importScripts.mock.calls[0] || [];
        initWasmCalls = global.ChessWASM.init.mock.calls.length;
    });

    afterAll(() => {
        global.importScripts = originalImportScripts;
        global.postMessage = originalPostMessage;
        console.error = originalConsoleError;

        delete global.self;
        delete global.ChessLogic;
        delete global.ChessAIEasy;
        delete global.ChessAIMedium;
        delete global.ChessAIHard;
        delete global.ChessAIVeryHard;
        delete global.ChessWASM;
        delete global.onmessage;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Worker should initialize ChessWASM', () => {
        expect(initScriptsCalls).toBe(1);
        expect(initWasmCalls).toBe(1);
    });

    test('Worker should import opening_book.js and endgame_book.js before ai_shared.js', () => {
        const openingIdx = initScriptsArgs.indexOf('books/opening_book.js');
        const endgameIdx = initScriptsArgs.indexOf('books/endgame_book.js');
        const sharedIdx = initScriptsArgs.indexOf('ai_shared.js');

        expect(openingIdx).toBeGreaterThanOrEqual(0);
        expect(endgameIdx).toBeGreaterThanOrEqual(0);
        expect(sharedIdx).toBeGreaterThan(openingIdx);
        expect(sharedIdx).toBeGreaterThan(endgameIdx);
    });

    test('Worker should return opening book move via ChessAIShared when available', () => {
        const bookMove = { fromR: 6, fromC: 4, toR: 4, toC: 4, promotion: null };
        global.ChessAIShared = {
            getOpeningBookMove: jest.fn().mockReturnValue(bookMove)
        };
        try {
            global.onmessage({ data: { state: { turn: 'w' }, difficulty: '3' } });
            expect(global.ChessAIShared.getOpeningBookMove).toHaveBeenCalled();
            expect(global.ChessAIHard.getBestMove).not.toHaveBeenCalled();
            expect(global.postMessage).toHaveBeenCalledWith({ bestMove: bookMove });
        } finally {
            delete global.ChessAIShared;
        }
    });

    test('Worker should handle difficulty 1 (Easy AI)', () => {
        const state = { turn: 'w' };
        global.onmessage({ data: { state, difficulty: '1' } });
        expect(global.ChessLogic.loadState).toHaveBeenCalledWith(state);
        expect(global.ChessAIEasy.getBestMove).toHaveBeenCalledWith('w');
        expect(global.postMessage).toHaveBeenCalledWith({ bestMove: { from: 'e2', to: 'e4', difficulty: 'easy' } });
    });

    test('Worker should handle difficulty 2 (Medium AI)', () => {
        const state = { turn: 'b' };
        global.onmessage({ data: { state, difficulty: '2' } });
        expect(global.ChessLogic.loadState).toHaveBeenCalledWith(state);
        expect(global.ChessAIMedium.getBestMove).toHaveBeenCalledWith('b');
        expect(global.postMessage).toHaveBeenCalledWith({ bestMove: { from: 'e2', to: 'e4', difficulty: 'medium' } });
    });

    test('Worker should handle difficulty 3 (Hard AI)', () => {
        const state = { turn: 'w' };
        global.onmessage({ data: { state, difficulty: '3' } });
        expect(global.ChessLogic.loadState).toHaveBeenCalledWith(state);
        expect(global.ChessAIHard.getBestMove).toHaveBeenCalledWith('w');
        expect(global.postMessage).toHaveBeenCalledWith({ bestMove: { from: 'e2', to: 'e4', difficulty: 'hard' } });
    });

    test('Worker should handle difficulty 4 (Very Hard AI)', () => {
        const state = { turn: 'b' };
        global.onmessage({ data: { state, difficulty: '4' } });
        expect(global.ChessLogic.loadState).toHaveBeenCalledWith(state);
        expect(global.ChessAIVeryHard.getBestMove).toHaveBeenCalledWith('b');
        expect(global.postMessage).toHaveBeenCalledWith({ bestMove: { from: 'e2', to: 'e4', difficulty: 'very_hard' } });
    });

    test('Worker should handle errors and post error message', () => {
        const originalChessLogic = global.ChessLogic;
        // Force error by deleting ChessLogic
        delete global.ChessLogic;

        global.onmessage({ data: { state: {}, difficulty: '1' } });

        expect(global.postMessage).toHaveBeenCalledWith({ error: 'ChessLogic is not defined in worker' });

        // Restore ChessLogic
        global.ChessLogic = originalChessLogic;
    });
});
