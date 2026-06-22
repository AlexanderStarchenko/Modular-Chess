/**
 * Tests for AnalysisManager
 */

// Provide a minimal window/navigator global for the module
global.window = global.window || {};
global.navigator = global.navigator || { hardwareConcurrency: 2 };

// Queue of responses for the mock worker to send
global.mockStockfishResponses = [];

global.Worker = jest.fn().mockImplementation(function() {
    return {
        onmessage: null,
        postMessage: jest.fn(function(msg) {
            if (typeof msg === 'string' && msg.startsWith('go')) {
                setTimeout(() => {
                    const response = global.mockStockfishResponses.shift() || { cp: 0, bestmove: 'e2e4' };
                    if (this.onmessage) {
                        if (response.mate !== undefined) {
                            this.onmessage({ data: `info depth 8 score mate ${response.mate}` });
                        } else {
                            this.onmessage({ data: `info depth 8 score cp ${response.cp}` });
                        }
                        this.onmessage({ data: `bestmove ${response.bestmove}` });
                    }
                }, 0);
            }
        }),
        terminate: jest.fn()
    };
});

const AnalysisManager = require('../js/analysis_manager');

describe('AnalysisManager', () => {
    afterEach(() => {
        global.mockStockfishResponses = [];
    });

    test('analyzeGame should handle empty history', (done) => {
        AnalysisManager.analyzeGame([], null, (stats) => {
            expect(stats).toBeDefined();
            expect(stats.moves).toEqual([]);
            expect(stats.whiteAccuracy).toBe(100);
            expect(stats.blackAccuracy).toBe(100);
            done();
        });
    });

    test('analyzeGame calculates brilliant, good, and blunder qualities correctly', (done) => {
        const history = [
            { beforeFen: 'pos1', fen: 'pos2', move: { uci: 'a1' } }, // White move: brilliant
            { beforeFen: 'pos2', fen: 'pos3', move: { uci: 'a2' } }, // Black move: blunder
            { beforeFen: 'pos3', fen: 'pos4', move: { uci: 'a3' } }, // White move: good
            { beforeFen: 'pos4', fen: 'pos5', move: { uci: 'a4' } }, // Black move: mistake
            { beforeFen: 'pos5', fen: 'pos6', move: { uci: 'a5' } }, // White move: inaccuracy
            { beforeFen: 'pos6', fen: 'pos7', move: { uci: 'a6' } }, // Black move: checkmate
        ];

        // Correcting the sequence for precise diffs
        // White move 0: diff +200 (brilliant). scoreBefore = 0. myScoreAfter = 200. evalAfter(Black) = -200.
        // Black move 1: diff -250 (blunder). scoreBefore = -200. myScoreAfter = -450. evalAfter(White) = 450.
        // White move 2: diff -30 (good). scoreBefore = 450. myScoreAfter = 420. evalAfter(Black) = -420.
        // Black move 2: diff -150 (mistake). scoreBefore = -420. myScoreAfter = -570. evalAfter(White) = 570.
        // White move 3: diff -70 (inaccuracy). scoreBefore = 570. myScoreAfter = 500. evalAfter(Black) = -500.
        // Black move 3: diff (mate). scoreBefore = -500. Black delivers mate: myScoreAfter = 9999. evalAfter(White) = mate -1
        
        global.mockStockfishResponses = [
            { cp: 0 },         // initial
            { cp: -200 },      // brilliant white
            { cp: 450 },       // blunder black
            { cp: -420 },      // good white
            { cp: 570 },       // mistake black
            { cp: -500 },      // inaccuracy white
            { mate: -1 },      // mate black
        ];

        AnalysisManager.analyzeGame(history, null, (stats) => {
            expect(stats).toBeDefined();
            expect(stats.moves.length).toBe(6);
            
            expect(stats.moves[0].qualityClass).toBe('brilliant');
            expect(stats.moves[1].qualityClass).toBe('blunder');
            expect(stats.moves[2].qualityClass).toBe('good');
            expect(stats.moves[3].qualityClass).toBe('mistake');
            expect(stats.moves[4].qualityClass).toBe('inaccuracy');
            
            // Check that summary correctly counted them
            expect(stats.summary.white.brilliant).toBe(1);
            expect(stats.summary.white.good).toBe(1);
            expect(stats.summary.white.inaccuracy).toBe(1);
            expect(stats.summary.black.blunder).toBe(1);
            expect(stats.summary.black.mistake).toBe(1);
            
            done();
        });
    });

    test('analyzeGame identifies best and excellent moves correctly', (done) => {
        const history = [
            { beforeFen: 'pos1', fen: 'pos2', move: { uci: 'e2e4' } }, // White plays best move
            { beforeFen: 'pos2', fen: 'pos3', move: { uci: 'g8f6' } }, // Black plays excellent move (diff = -5)
        ];

        global.mockStockfishResponses = [
            { cp: 0, bestmove: 'e2e4' },     // pos1 (White to move, best is e2e4)
            { cp: -20, bestmove: 'e7e5' },    // pos2 (Black to move, score -20, best is e7e5 - played g8f6 instead)
            { cp: -15, bestmove: 'd2d4' },    // pos3 (White to move, score -15, best is d2d4)
        ];

        AnalysisManager.analyzeGame(history, null, (stats) => {
            try {
                expect(stats).toBeDefined();
                expect(stats.moves.length).toBe(2);
                
                expect(stats.moves[0].qualityClass).toBe('best');
                expect(stats.moves[0].accuracy).toBe(100);
                
                expect(stats.moves[1].qualityClass).toBe('excellent');
                expect(stats.moves[1].accuracy).toBeGreaterThanOrEqual(95);
                
                expect(stats.moves[0].nextBestMove).toBe('e7e5');
                expect(stats.moves[1].nextBestMove).toBe('d2d4');
                
                expect(stats.summary.white.best).toBe(1);
                expect(stats.summary.black.excellent).toBe(1);
                
                done();
            } catch (err) {
                done(err);
            }
        });
    });

    test('evaluateFen handles engine timeout gracefully', async () => {
        jest.useFakeTimers();
        
        let IsolatedAnalysisManager;
        jest.isolateModules(() => {
            IsolatedAnalysisManager = require('../js/analysis_manager');
        });

        // Mock worker to do nothing when receiving messages (never responds)
        global.Worker.mockImplementationOnce(function() {
            return {
                onmessage: null,
                postMessage: jest.fn(),
                terminate: jest.fn()
            };
        });

        // Trigger evaluation
        const evalPromise = IsolatedAnalysisManager.evaluateFen('startpos', 8);

        // Fast-forward time past the 1500ms timeout
        jest.advanceTimersByTime(1600);

        const result = await evalPromise;
        expect(result).toEqual({ cp: 0, mate: null, bestmove: null });
        
        jest.useRealTimers();
    });

    test('analyzeGame should return immediately if already analyzing', () => {
        // Mock worker to do nothing when receiving messages (never responds)
        global.Worker.mockImplementationOnce(function() {
            return {
                onmessage: null,
                postMessage: jest.fn(),
                terminate: jest.fn()
            };
        });

        let IsolatedAnalysisManager;
        jest.isolateModules(() => {
            IsolatedAnalysisManager = require('../js/analysis_manager');
        });

        const history = [{ beforeFen: 'pos1', fen: 'pos2', move: { uci: 'a1' } }];
        let callCount = 0;
        
        IsolatedAnalysisManager.analyzeGame(history, null, () => {
            callCount++;
        });

        // Call while isAnalyzing is true
        IsolatedAnalysisManager.analyzeGame(history, null, () => {
            callCount++;
        });

        expect(callCount).toBe(0);
    });

    test('getScoreValue correctly formats negative mate values', (done) => {
        let IsolatedAnalysisManager;
        jest.isolateModules(() => {
            IsolatedAnalysisManager = require('../js/analysis_manager');
        });

        const history = [
            { beforeFen: 'pos1', fen: 'pos2', move: { uci: 'a1' } }
        ];

        global.mockStockfishResponses = [
            { cp: 0 },
            { mate: -2 }
        ];

        IsolatedAnalysisManager.analyzeGame(history, null, (stats) => {
            expect(stats.moves[0].scoreAfter).toBe(9998);
            done();
        });
    });

    test('stopAnalysis terminates worker and cancels active analysis', (done) => {
        let IsolatedAnalysisManager;
        jest.isolateModules(() => {
            IsolatedAnalysisManager = require('../js/analysis_manager');
        });

        const history = [
            { beforeFen: 'pos1', fen: 'pos2', move: { uci: 'a1' } },
            { beforeFen: 'pos2', fen: 'pos3', move: { uci: 'a2' } }
        ];

        // Mock responses for analysis
        global.mockStockfishResponses = [
            { cp: 0 },
            { cp: 10 }
        ];

        // We will intercept the worker creation to spy on terminate
        let createdWorker = null;
        const originalWorker = global.Worker;
        global.Worker = jest.fn().mockImplementation(function() {
            createdWorker = {
                onmessage: null,
                postMessage: jest.fn(),
                terminate: jest.fn()
            };
            return createdWorker;
        });

        let completed = false;
        IsolatedAnalysisManager.analyzeGame(history, null, (stats) => {
            completed = true;
        });

        // Trigger stopAnalysis immediately
        IsolatedAnalysisManager.stopAnalysis();

        expect(createdWorker).not.toBeNull();
        expect(createdWorker.terminate).toHaveBeenCalled();

        setTimeout(() => {
            expect(completed).toBe(false);
            global.Worker = originalWorker; // Restore original mock
            done();
        }, 50);
    });

    test('evaluateFen handles engine timeout by sending stop and using the bestmove returned from engine', async () => {
        jest.useFakeTimers();
        
        let IsolatedAnalysisManager;
        jest.isolateModules(() => {
            IsolatedAnalysisManager = require('../js/analysis_manager');
        });

        let stopSent = false;

        global.Worker.mockImplementationOnce(function() {
            const workerInstance = {
                onmessage: null,
                postMessage: jest.fn((msg) => {
                    if (msg === 'stop') {
                        stopSent = true;
                        // Simulate Stockfish replying with bestmove after stop
                        setTimeout(() => {
                            if (workerInstance.onmessage) {
                                workerInstance.onmessage({ data: 'bestmove e2e4' });
                            }
                        }, 50);
                    }
                }),
                terminate: jest.fn()
            };
            return workerInstance;
        });

        const evalPromise = IsolatedAnalysisManager.evaluateFen('startpos', 8);

        // Fast-forward past the 800ms timeout
        jest.advanceTimersByTime(850);
        expect(stopSent).toBe(true);

        // Now fast-forward another 100ms to allow the bestmove response to process
        jest.advanceTimersByTime(100);

        const result = await evalPromise;
        expect(result).toEqual({ cp: 0, mate: null, bestmove: 'e2e4' });
        
        jest.useRealTimers();
    });
});
