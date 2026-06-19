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

        // Need N+1 evaluations for N moves
        global.mockStockfishResponses = [
            { cp: 0 },         // pos1: start (White to move)
            { cp: -200 },      // pos2: after White's move. Black to move. Score is -200 from Black's perspective. 
                               // Meaning White's score is 200. Diff = 200 - 0 = +200 -> brilliant!
                               
            { cp: 300 },       // pos3: after Black's move. White to move. Score 300 from White's perspective.
                               // Meaning Black's score is -300. Before was -(-200) = +200. 
                               // Diff for Black = -300 - 200 = -500 -> blunder!
                               
            { cp: -400 },      // pos4: White to move? No, Black to move. Score -400 for Black. 
                               // White's score = 400. Before was 300. Diff = 400 - 300 = +100 -> good!
                               
            { cp: 500 },       // pos5: White to move. Score 500.
                               // Black's score = -500. Before was -(-400) = 400. Diff = -500 - (-400) = -100 -> mistake
                               
            { cp: -550 },      // pos6: Black to move. Score -550.
                               // White's score = +550. Before was 500. Diff = 550 - 500 = +50 -> good (wait, we want inaccuracy -50)
                               // Let's adjust diff for pos6. We want diff = -50 for White.
                               // Before is 500. We want White's score to be 450.
                               // Which means Black's score (cp) should be -450.
            
            { cp: 1000 },      // Let's replace pos6 response with { cp: -450 } below
        ];
        
        // Correcting the sequence for precise diffs
        // White move 1: diff +200 (brilliant). scoreBefore = 0. myScoreAfter = 200. evalAfter(Black) = -200.
        // Black move 1: diff -250 (blunder). scoreBefore = -200. myScoreAfter = -450. evalAfter(White) = 450.
        // White move 2: diff +100 (good). scoreBefore = 450. myScoreAfter = 550. evalAfter(Black) = -550.
        // Black move 2: diff -150 (mistake). scoreBefore = -550. myScoreAfter = -700. evalAfter(White) = 700.
        // White move 3: diff -50 (inaccuracy). scoreBefore = 700. myScoreAfter = 650. evalAfter(Black) = -650.
        // Black move 3: diff (mate). scoreBefore = -650. Black delivers mate: myScoreAfter = 10000. evalAfter(White) = mate -1
        
        global.mockStockfishResponses = [
            { cp: 0 },         // initial
            { cp: -200 },      // brilliant white
            { cp: 450 },       // blunder black
            { cp: -550 },      // good white
            { cp: 700 },       // mistake black
            { cp: -650 },      // inaccuracy white
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
});
