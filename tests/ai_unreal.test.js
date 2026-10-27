/**
 * Tests for ChessAIUnreal
 */

// Mock global Worker
global.Worker = jest.fn().mockImplementation(function() {
    return {
        onmessage: null,
        postMessage: jest.fn(function(msg) {
            if (typeof msg === 'string' && msg.startsWith('go')) {
                setTimeout(() => {
                    if (this.onmessage) {
                        this.onmessage({ data: 'bestmove e2e4' });
                    }
                }, 0);
            }
        })
    };
});

const ChessAIUnreal = require('../js/ai_unreal');

describe('ChessAIUnreal', () => {
    test('getBestMove should return parsed move for standard UCI string', async () => {
        const move = await ChessAIUnreal.getBestMove('startpos FEN...', 20, 50);
        expect(move).toEqual({
            fromR: 6, // 8 - 2
            fromC: 4, // e -> 4
            toR: 4,   // 8 - 4
            toC: 4    // e -> 4
        });
    });

    test('getBestMove should return null if already thinking', async () => {
        // Trigger a thinking state
        const promise1 = ChessAIUnreal.getBestMove('startpos FEN...', 20, 50);
        // While thinking, getBestMove should resolve to null immediately
        const promise2 = ChessAIUnreal.getBestMove('startpos FEN...', 20, 50);
        
        expect(await promise2).toBeNull();
        await promise1;
    });

    test('getBestMove should handle (none) bestmove gracefully', async () => {
        // Change mock implementation once to return (none)
        global.Worker.mockImplementationOnce(function() {
            return {
                onmessage: null,
                postMessage: jest.fn(function(msg) {
                    if (typeof msg === 'string' && msg.startsWith('go')) {
                        setTimeout(() => {
                            if (this.onmessage) {
                                this.onmessage({ data: 'bestmove (none)' });
                            }
                        }, 0);
                    }
                })
            };
        });

        // We use jest.isolateModules to get a fresh instance of ChessAIUnreal so it creates a new worker
        let IsolatedChessAIUnreal;
        jest.isolateModules(() => {
            IsolatedChessAIUnreal = require('../js/ai_unreal');
        });

        const move = await IsolatedChessAIUnreal.getBestMove('startpos FEN...', 20, 50);
        expect(move).toBeNull();
    });

    test('getBestMove should handle malformed or empty moveStr gracefully', async () => {
        global.Worker.mockImplementationOnce(function() {
            return {
                onmessage: null,
                postMessage: jest.fn(function(msg) {
                    if (typeof msg === 'string' && msg.startsWith('go')) {
                        setTimeout(() => {
                            if (this.onmessage) {
                                this.onmessage({ data: 'bestmove ab' }); // invalid too short
                            }
                        }, 0);
                    }
                })
            };
        });

        let IsolatedChessAIUnreal;
        jest.isolateModules(() => {
            IsolatedChessAIUnreal = require('../js/ai_unreal');
        });

        const move = await IsolatedChessAIUnreal.getBestMove('startpos FEN...', 20, 50);
        expect(move).toBeNull();
    });

    test('terminate should stop active stockfish worker and reset state', async () => {
        const terminateMock = jest.fn();
        global.Worker.mockImplementationOnce(function() {
            return {
                onmessage: null,
                postMessage: jest.fn(),
                terminate: terminateMock
            };
        });

        let IsolatedChessAIUnreal;
        jest.isolateModules(() => {
            IsolatedChessAIUnreal = require('../js/ai_unreal');
        });

        // Trigger worker creation
        IsolatedChessAIUnreal.getBestMove('startpos FEN...', 20, 50);
        IsolatedChessAIUnreal.terminate();

        expect(terminateMock).toHaveBeenCalled();
    });
});
