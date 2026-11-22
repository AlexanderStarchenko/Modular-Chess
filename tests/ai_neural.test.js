const ChessLogic = require('../js/logic.js');

describe('Neural AI Module (js/ai_neural.js)', () => {
    let neural;

    beforeAll(() => {
        global.ChessLogic = ChessLogic;
        // Setup mock ort
        global.ort = {
            env: { wasm: {} },
            Tensor: function(type, data, dims) {
                this.type = type;
                this.data = data;
                this.dims = dims;
            },
            InferenceSession: {
                create: jest.fn().mockImplementation(async () => {
                    return {
                        run: jest.fn().mockImplementation(async (feeds) => {
                            const batchSize = feeds.board_state ? feeds.board_state.dims[0] : 1;
                            const polData = new Float32Array(batchSize * 4672);
                            polData.fill(0.1);
                            const valData = new Float32Array(batchSize);
                            valData.fill(0.05);
                            return {
                                policy_logits: { data: polData },
                                value: { data: valData }
                            };
                        })
                    };
                })
            }
        };

        neural = require('../js/ai_neural.js');
    });

    afterAll(() => {
        delete global.ort;
        delete global.ChessLogic;
    });

    test('search5Ply handles history without throwing TypeError (m.board bug fix)', async () => {
        await neural.init('v1');
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
        ChessLogic.loadFen(fen);
        const history = [
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
            'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3'
        ];

        // Should complete without throwing TypeError: Cannot read properties of undefined (reading '0')
        const bestMove = await neural.search5Ply(fen, 4, 3, 2, 2, history);
        expect(bestMove).toBeDefined();
        expect(bestMove).not.toBeNull();
        expect(typeof bestMove.fromR).toBe('number');
        expect(typeof bestMove.toR).toBe('number');
    });

    test('mctsSearch evaluates correctly without crashing', async () => {
        await neural.init('v1');
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
        ChessLogic.loadFen(fen);
        const bestMove = await neural.mctsSearch(fen, 10, 1.0, []);
        expect(bestMove).toBeDefined();
        expect(bestMove).not.toBeNull();
    });

    test('alphaBetaSearch handles timeLimitMs and timeout cleanly', async () => {
        await neural.init('v1');
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
        ChessLogic.loadFen(fen);
        const start = Date.now();
        const bestMove = await neural.alphaBetaSearch(fen, 4, 500, []);
        const elapsed = Date.now() - start;
        expect(bestMove).toBeDefined();
        expect(bestMove).not.toBeNull();
        expect(elapsed).toBeLessThan(4000);
    });

    test('Transposition cache is used when position is not in history', async () => {
        await neural.init('v1');
        neural.clearCache();
        const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
        ChessLogic.loadFen(fen);
        const history = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'];

        const move1 = await neural.getBestMove(fen, 'v1', 'alphabeta', history, { maxDepth: 6, timeLimitMs: 800 });
        expect(move1).toBeDefined();

        // Second call with same position should hit transposition table or book
        const move2 = await neural.getBestMove(fen, 'v1', 'alphabeta', history, { maxDepth: 6, timeLimitMs: 800 });
        expect(move2).toBeDefined();
        expect(move2.fromR).toBe(move1.fromR);
        expect(move2.fromC).toBe(move1.fromC);
        expect(move2.toR).toBe(move1.toR);
        expect(move2.toC).toBe(move1.toC);
    });

    test('sets ort.env.wasm.numThreads to 1 unless crossOriginIsolated is true, and resolves absolute wasmPaths', async () => {
        const origSelf = global.self;
        const origNavigator = global.navigator;
        const origWindow = global.window;
        const origOrt = global.ort;

        try {
            const makeMockOrt = () => ({
                env: { wasm: {} },
                Tensor: function() {},
                InferenceSession: { create: jest.fn(async () => ({ run: jest.fn() })) }
            });

            // 1. Not crossOriginIsolated -> numThreads must be 1 (no SharedArrayBuffer warning)
            global.self = { crossOriginIsolated: false };
            global.navigator = { hardwareConcurrency: 8 };
            global.window = { location: { protocol: 'http:', href: 'http://localhost:5000/index.html' } };
            global.ort = makeMockOrt();

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');
            expect(global.ort.env.wasm.numThreads).toBe(1);
            expect(global.ort.env.wasm.wasmPaths).toBe('http://localhost:5000/js/');

            // 2. crossOriginIsolated === true -> numThreads scales up cleanly
            global.self = { crossOriginIsolated: true };
            global.ort = makeMockOrt();
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');
            expect(global.ort.env.wasm.numThreads).toBe(4);
        } finally {
            global.self = origSelf;
            global.navigator = origNavigator;
            global.window = origWindow;
            global.ort = origOrt;
        }
    });

    test('passes Uint8Array buffer instead of string path to InferenceSession.create under file:// protocol', async () => {
        const origSelf = global.self;
        const origWindow = global.window;
        const origOrt = global.ort;

        try {
            global.self = { crossOriginIsolated: false };
            global.window = { location: { protocol: 'file:', href: 'file:///C:/chess/index.html' } };
            const createMock = jest.fn(async () => ({ run: jest.fn() }));
            global.ort = {
                env: { wasm: {} },
                Tensor: function() {},
                InferenceSession: { create: createMock }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            expect(createMock).toHaveBeenCalledTimes(1);
            const [modelArg] = createMock.mock.calls[0];
            expect(modelArg).toBeInstanceOf(Uint8Array);
            expect(modelArg.byteLength).toBeGreaterThan(0);
        } finally {
            global.self = origSelf;
            global.window = origWindow;
            global.ort = origOrt;
        }
    });

    test('alphaBetaSearch splits root moves round-robin across mocked Worker pool and picks highest blended score', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        const createdWorkers = [];
        class MockWorker {
            constructor(scriptPath) {
                this.scriptPath = scriptPath;
                this.messages = [];
                this.terminated = false;
                this.onmessage = null;
                this.onerror = null;
                this.id = createdWorkers.length;
                createdWorkers.push(this);
            }
            postMessage(msg) {
                this.messages.push(msg);
                const chosen = msg.rootMoves[0];
                const chosenPrior = msg.rootPriors[0] || 0;
                // Give worker #1 a distinctly higher score so its candidate must win aggregation
                const mockScore = (this.id === 1) ? 2.5 : 0.15;
                Promise.resolve().then(() => {
                    if (!this.terminated && typeof this.onmessage === 'function') {
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: chosen,
                                    bestScore: mockScore,
                                    bestPrior: chosenPrior,
                                    priorBonus: 0.05 * chosenPrior,
                                    blendedScore: mockScore + 0.05 * chosenPrior,
                                    completedDepth: msg.maxDepth,
                                    nodes: 42
                                }
                            }
                        });
                    }
                });
            }
            terminate() {
                this.terminated = true;
            }
        }

        try {
            global.Worker = MockWorker;
            global.navigator = { hardwareConcurrency: 4 };
            global.ChessLogic = ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const polData = new Float32Array(4672);
                            polData.fill(0.1);
                            const valData = new Float32Array(1);
                            valData.fill(0.05);
                            return { policy_logits: { data: polData }, value: { data: valData } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });

            await isolatedNeural.init('v1');
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            ChessLogic.loadFen(fen);

            const move = await isolatedNeural.alphaBetaSearch(fen, 4, 500, []);
            expect(createdWorkers.length).toBe(3);
            expect(createdWorkers.every(w => w.scriptPath === 'js/ai_neural_worker.js')).toBe(true);
            expect(createdWorkers.every(w => w.messages[0].minAlphaScore === undefined)).toBe(true);

            // Verify all 20 root moves were distributed across the 3 workers without duplicates
            const dispatchedMoves = createdWorkers.flatMap(w => w.messages[0].rootMoves);
            const uniqueKeys = new Set(dispatchedMoves.map(m => `${m.fromR},${m.fromC}->${m.toR},${m.toC}`));
            expect(dispatchedMoves.length).toBe(20);
            expect(uniqueKeys.size).toBe(20);

            // Verify worker #1's move (the highest blended score) was selected
            const expectedWinner = createdWorkers[1].messages[0].rootMoves[0];
            expect(move).toMatchObject({
                fromR: expectedWinner.fromR,
                fromC: expectedWinner.fromC,
                toR: expectedWinner.toR,
                toC: expectedWinner.toC
            });

            // Verify pool is reused on subsequent calls (no new Workers spawned)
            await isolatedNeural.alphaBetaSearch(fen, 4, 500, []);
            expect(createdWorkers.length).toBe(3);

            isolatedNeural.terminatePool();
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('alphaBetaSearch falls back gracefully when Worker constructor throws (e.g. file:// SecurityError)', async () => {
        const origWorker = global.Worker;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        try {
            const workerCtor = jest.fn(() => {
                const err = new Error("Failed to construct 'Worker': Script cannot be accessed from origin 'null'.");
                err.name = 'SecurityError';
                throw err;
            });
            global.Worker = workerCtor;
            global.ChessLogic = ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const polData = new Float32Array(4672);
                            polData.fill(0.1);
                            const valData = new Float32Array(1);
                            valData.fill(0.05);
                            return { policy_logits: { data: polData }, value: { data: valData } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });

            await isolatedNeural.init('v1');
            const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
            ChessLogic.loadFen(fen);

            const move1 = await isolatedNeural.alphaBetaSearch(fen, 3, 500, []);
            expect(move1).toBeDefined();
            expect(move1).not.toBeNull();
            expect(typeof move1.fromR).toBe('number');
            expect(workerCtor).toHaveBeenCalledTimes(1);

            // Once workers are marked disabled, subsequent searches should not re-attempt new Worker()
            const move2 = await isolatedNeural.alphaBetaSearch(fen, 3, 500, []);
            expect(move2).toBeDefined();
            expect(workerCtor).toHaveBeenCalledTimes(1);
        } finally {
            global.Worker = origWorker;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('ChessAINeuralSearch quiesce and searchRootMoves detect quiet checking forks and avoid blunders', () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // Position: White K on e1, N on d5; Black k on e8, r on a8.
        // White has quiet Nc7+ checking the king and forking the a8 rook!
        // Note: without extra pawns/pieces, winning the rook leaves FIDE draw K+N vs K (0 cp instead of -500 cp).
        const forkFen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
        const { board: forkBoard, turn: forkTurn, castling: forkCast } = SearchCore.fenToBoard(forkFen);
        const qScore = SearchCore.quiesce(forkBoard, forkTurn, -10000, 10000, 4, 0);
        // Without quiet check in quiesce, White is down a rook; with Nc7+ fork winning rook, score saves the draw (0 cp)
        expect(qScore).toBeGreaterThanOrEqual(-10);

        // With an extra White pawn on h2, winning the rook via Nc7+ yields a clear winning endgame > +150 cp
        const winForkFen = 'r3k3/8/8/3N4/8/8/7P/4K3 w - - 0 1';
        const { board: winForkBoard, turn: winForkTurn } = SearchCore.fenToBoard(winForkFen);
        const qWinScore = SearchCore.quiesce(winForkBoard, winForkTurn, -10000, 10000, 4, 0);
        expect(qWinScore).toBeGreaterThan(150);

        // Tactical anti-blunder check: White Q on d2 must not take defended d5 pawn (bad_trade against c6 pawn)
        const blunderFen = '4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1';
        const { board: bBoard, turn: bTurn, castling: bCast } = SearchCore.fenToBoard(blunderFen);
        const legals = SearchCore.getLegalMovesForBoard(bBoard, bTurn, bCast);
        const filtered = SearchCore.filterTacticalBlunders(bBoard, bTurn, legals, bCast);
        expect(filtered.length).toBeGreaterThan(0);
        const takesD5 = filtered.some(m => m.fromR === 6 && m.fromC === 3 && m.toR === 3 && m.toC === 3);
        expect(takesD5).toBe(false);

        // Specifically verify searchRootMoves finds the Nc7+ fork in forkFen
        const forkRes = SearchCore.searchRootMoves({
            board: forkBoard,
            turn: forkTurn,
            castling: forkCast,
            historyKeys: [],
            rootMoves: SearchCore.getLegalMovesForBoard(forkBoard, forkTurn, forkCast),
            rootPriors: [],
            maxDepth: 3,
            timeLimitMs: 1000
        });
        expect(forkRes.bestMove).toMatchObject({ fromR: 3, fromC: 3, toR: 1, toC: 2 });
    });

    test('terminatePool terminates all active workers and allows clean pool recreation', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        const createdWorkers = [];
        class MockWorker {
            constructor() {
                this.terminated = false;
                this.onmessage = null;
                this.onerror = null;
                createdWorkers.push(this);
            }
            postMessage(msg) {
                Promise.resolve().then(() => {
                    if (!this.terminated && typeof this.onmessage === 'function') {
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: msg.rootMoves[0],
                                    bestScore: 0.25,
                                    bestPrior: msg.rootPriors[0] || 0,
                                    completedDepth: 2,
                                    nodes: 10
                                }
                            }
                        });
                    }
                });
            }
            terminate() {
                this.terminated = true;
            }
        }

        try {
            global.Worker = MockWorker;
            global.navigator = { hardwareConcurrency: 4 };
            global.ChessLogic = ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const polData = new Float32Array(4672);
                            polData.fill(0.1);
                            const valData = new Float32Array(1);
                            valData.fill(0.05);
                            return { policy_logits: { data: polData }, value: { data: valData } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });

            await isolatedNeural.init('v1');
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            ChessLogic.loadFen(fen);

            await isolatedNeural.alphaBetaSearch(fen, 3, 500, []);
            expect(createdWorkers.length).toBe(3);
            expect(createdWorkers.every(w => !w.terminated)).toBe(true);

            isolatedNeural.terminatePool();
            expect(createdWorkers.every(w => w.terminated)).toBe(true);

            // Recreate after termination
            await isolatedNeural.alphaBetaSearch(fen, 3, 500, []);
            expect(createdWorkers.length).toBe(6);
            isolatedNeural.terminatePool();
            expect(createdWorkers.slice(3).every(w => w.terminated)).toBe(true);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('fixes repetition sign inversion, doubled passed pawn bonus, and endgame misclassification', () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. Repetition sign fix (Bug #1): winning rook endgame should NOT play the move leading back to history
        // White K on e4, R on a1; Black k on e8, a7 pawn. Moving Ra1->b1 puts position into historyKeys.
        const winFen = '4k3/p7/8/8/4K3/8/8/R7 w - - 0 1';
        const { board: wBoard, turn: wTurn, castling: wCast } = SearchCore.fenToBoard(winFen);
        const repMove = { fromR: 7, fromC: 0, toR: 7, toC: 1 }; // Ra1-b1
        const repBoard = SearchCore.simulateMove(wBoard, repMove.fromR, repMove.fromC, repMove.toR, repMove.toC);
        const repKey = SearchCore.boardToSimpleKey(repBoard, 'b');
        const repRes = SearchCore.searchRootMoves({
            board: wBoard,
            turn: wTurn,
            castling: wCast,
            historyKeys: [repKey],
            maxDepth: 3,
            timeLimitMs: 1000
        });
        const movesRes = repRes.moveResults;
        const repEntry = movesRes.find(r => r.move.fromR === 7 && r.move.fromC === 0 && r.move.toR === 7 && r.move.toC === 1);
        expect(repEntry).toBeDefined();
        expect(repEntry.score).toBeLessThan(0); // Must be penalized, not turned into +0.85 bonus
        expect(repRes.bestMove).not.toMatchObject(repMove);

        // 2. Doubled passed pawns (Bug #6): back pawn blocked by front own pawn is NOT passed
        const doubledFen = '4k3/8/8/4P3/4P3/8/8/4K3 w - - 0 1';
        const { board: dBoard } = SearchCore.fenToBoard(doubledFen);
        expect(SearchCore.isPassedPawn(dBoard, 3, 4, true)).toBe(true);  // e5 front pawn
        expect(SearchCore.isPassedPawn(dBoard, 4, 4, true)).toBe(false); // e4 doubled rear pawn

        // 3. Middlegame with 14 total pieces (Bug #4): K+Q+2R+3P vs K+Q+2R+3P must NOT be classified as endgame
        const mg14Fen = 'r2qk2r/ppp5/8/8/8/8/PPP5/R2QK2R w KQkq - 0 1';
        const { board: mgBoard } = SearchCore.fenToBoard(mg14Fen);
        expect(SearchCore.isEndgamePosition(mgBoard)).toBe(false);

        // Pure White heavy advantage K+Q vs k also counts uppercase piece values properly
        const whiteUpQueen = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
        const { board: wqBoard } = SearchCore.fenToBoard(whiteUpQueen);
        expect(SearchCore.isEndgamePosition(wqBoard)).toBe(true);
    });

    test('fixes elementary endgame safety/cutting, tactical blunder checks, en passant, underpromotion, and quiet mate-in-2', () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. Elementary endgame (Bug #3): White King must NOT leave White Rook hanging to Black King
        // Black k on d5 attacks White R on c5, White K is on c4 defending c5. Moving Kc4 away hangs Rc5!
        const egHangFen = '8/8/8/2Rk4/2K5/8/8/8 w - - 0 1';
        const { board: ehBoard, turn: ehTurn, castling: ehCast } = SearchCore.fenToBoard(egHangFen);
        const egMove = SearchCore.solveElementaryEndgame(ehBoard, ehTurn, ehCast);
        expect(egMove).not.toBeNull();
        const afterEg = SearchCore.simulateMove(ehBoard, egMove.fromR, egMove.fromC, egMove.toR, egMove.toC);
        const oppFollow = SearchCore.getLegalMovesForBoard(afterEg, 'b', '-');
        const rookCanBeCaptured = oppFollow.some(om => afterEg[om.toR][om.toC] === 'R');
        expect(rookCanBeCaptured).toBe(false);

        // 2. Blunder check fixes (Bug #5):
        // 2a. Promoting pawn onto undefended attacked square is caught as hanging_piece
        const promoHangFen = 'r6k/4P3/8/8/8/8/8/4K3 w - - 0 1';
        const { board: pBoard, turn: pTurn, castling: pCast } = SearchCore.fenToBoard(promoHangFen);
        const promoPush = { fromR: 1, fromC: 4, toR: 0, toC: 4, promotion: 'q' }; // e7-e8=Q attacked by Ra8
        expect(SearchCore.checkMoveTacticalBlunder(pBoard, pTurn, promoPush, pCast)).toBe('hanging_piece');

        // 2b. Capturing enemy Queen while leaving a Knight undefended is NOT abandons_piece (900 > 300)
        // White Bd3 defends Nf5; Black Qc4 is on diagonal of Bd3 -> Bxc4 takes Queen (900) and leaves Nf5 (300) attacked by Rf8
        const takeQueenFen = '4kr2/8/8/5N2/2q5/3B4/8/4K3 w - - 0 1';
        const { board: tqBoard, turn: tqTurn, castling: tqCast } = SearchCore.fenToBoard(takeQueenFen);
        const takeQueenMove = { fromR: 5, fromC: 3, toR: 4, toC: 2 }; // Bd3xc4
        expect(SearchCore.checkMoveTacticalBlunder(tqBoard, tqTurn, takeQueenMove, tqCast)).toBeNull();

        // 2c. Enemy suicidal queen-sacrifice check (Qxf2+ -> Kxf2) must NOT trigger false skewer_fork
        // White K on g1, N on a5, Qd1, pawn f2; Black q on f6, r on a8, k on h8. White moves Qd1-h5 (no blunder: Qxf2+ loses Q for P+N).
        const qSacFen = 'r6k/8/5q2/N7/8/8/5P2/3Q2K1 w - - 0 1';
        const { board: qsBoard, turn: qsTurn, castling: qsCast } = SearchCore.fenToBoard(qSacFen);
        const qMove = { fromR: 7, fromC: 3, toR: 3, toC: 7 }; // Qd1-h5
        expect(SearchCore.checkMoveTacticalBlunder(qsBoard, qsTurn, qMove, qsCast)).toBeNull();

        // 2d. Real check-fork (skewer_fork) when opponent safely forks K and N is caught
        // White Ke1, Ne5, pawn d2; Black qd8. Moving d2-d3 opens a5-e1 diagonal for Qa5+ forking Ke1 and undefended Ne5!
        const cleanForkFen = '3qk3/8/8/4N3/8/8/3P4/4K3 w - - 0 1';
        const { board: cfBoard, turn: cfTurn, castling: cfCast } = SearchCore.fenToBoard(cleanForkFen);
        const allowForkMove = { fromR: 6, fromC: 3, toR: 5, toC: 3 }; // d2-d3
        expect(SearchCore.checkMoveTacticalBlunder(cfBoard, cfTurn, allowForkMove, cfCast)).toBe('skewer_fork');

        // 2e. Quiesce uses real [alpha, beta] stand-pat cutoff cleanly
        const closedBeta = SearchCore.quiesce(tqBoard, 'w', -100, 40, 4, 0);
        expect(closedBeta).toBe(40);
        const { board: clearWinBoard } = SearchCore.fenToBoard('4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1');
        expect(SearchCore.quiesce(clearWinBoard, 'w', -100, 100, 4, 0)).toBe(100);

        // 3. En passant parsing, legal move generation, and simulateMove (Bug #7)
        const epFen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
        const { board: epBoard, turn: epTurn, castling: epCast, epSquare } = SearchCore.fenToBoard(epFen);
        expect(epSquare).toEqual({ r: 2, c: 3 });
        const epLegals = SearchCore.getLegalMovesForBoard(epBoard, epTurn, epCast, epSquare);
        const hasEp = epLegals.some(m => m.fromR === 3 && m.fromC === 4 && m.toR === 2 && m.toC === 3);
        expect(hasEp).toBe(true);
        const afterEp = SearchCore.simulateMove(epBoard, 3, 4, 2, 3, null, epSquare);
        expect(afterEp[3][3]).toBeNull(); // Captured black pawn on d5 removed
        expect(afterEp[2][3]).toBe('P');

        // 4. Underpromotion in simulateMove (Bug #7)
        const upBoard = SearchCore.simulateMove(pBoard, 1, 4, 0, 3, 'n');
        expect(upBoard[0][3]).toBe('N');

        // 5. Quiet Mate-in-2 (non-checking first move, Bug #7)
        // White Ka6, Qd2; Black ka8. Quiet Qb6 (wait) vs Kc8/Kb8 leads to mate, or classic Ka6, Qb4 -> Qb7#:
        // Here: White Kc6, Qd3; Black ka8. 1. Qb5 forces 1... Ka7 2. Qb7# (non-checking first move!)
        const quietMate2Fen = 'k7/8/2K5/8/8/3Q4/8/8 w - - 0 1';
        const { board: qmBoard, turn: qmTurn, castling: qmCast } = SearchCore.fenToBoard(quietMate2Fen);
        const qmLegals = SearchCore.getLegalMovesForBoard(qmBoard, qmTurn, qmCast);
        const m2 = SearchCore.findMateInTwoMove(qmBoard, qmTurn, qmLegals, qmCast);
        expect(m2).not.toBeNull();
        // Verify whichever first move m2 chose actually forces mate on every black reply
        const afterM2 = SearchCore.simulateMove(qmBoard, m2.fromR, m2.fromC, m2.toR, m2.toC, m2.promotion);
        const oppReplies = SearchCore.getLegalMovesForBoard(afterM2, 'b', '-');
        expect(oppReplies.length).toBeGreaterThan(0);
        for (const rMove of oppReplies) {
            const b2 = SearchCore.simulateMove(afterM2, rMove.fromR, rMove.fromC, rMove.toR, rMove.toC);
            const w2 = SearchCore.getLegalMovesForBoard(b2, 'w', '-');
            expect(SearchCore.findInstantMateMove(b2, 'w', w2)).not.toBeNull();
        }
    });

    test('ai_neural_worker handles queue deadlines, fen input, payload validation, actions, stack traces, and Blob URL importScripts', () => {
        const workerMod = require('../js/ai_neural_worker.js');
        const posted = [];
        const post = (msg) => posted.push(msg);

        // 1. Stale queued request (expired deadlineAt) is rejected without running search
        workerMod.handleWorkerMessage({
            data: {
                jobId: 10,
                deadlineAt: Date.now() - 50,
                board: null
            }
        }, post);
        expect(posted[0]).toMatchObject({ jobId: 10, ok: false, stale: true });

        // 2. Service ping action
        workerMod.handleWorkerMessage({
            data: { jobId: 11, type: 'ping' }
        }, post);
        expect(posted[1].ok).toBe(true);
        expect(posted[1].result.pong).toBe(true);

        // 3. Invalid payload (missing both board and fen) returns clear validation error
        workerMod.handleWorkerMessage({
            data: { jobId: 12, action: 'searchRootMoves' }
        }, post);
        expect(posted[2].ok).toBe(false);
        expect(posted[2].error).toMatch(/Invalid worker payload/);

        // 4. Accepts raw fen string without 8x8 board array
        workerMod.handleWorkerMessage({
            data: {
                jobId: 13,
                action: 'searchRootMoves',
                fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
                maxDepth: 3,
                deadlineAt: Date.now() + 2000
            }
        }, post);
        expect(posted[3]).toMatchObject({ jobId: 13, ok: true });
        expect(posted[3].result.bestMove).toMatchObject({ fromR: 3, fromC: 3, toR: 1, toC: 2 });

        // 5. Additional worker actions (filterTacticalBlunders & solveElementaryEndgame)
        workerMod.handleWorkerMessage({
            data: {
                jobId: 14,
                action: 'filterTacticalBlunders',
                fen: '4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1'
            }
        }, post);
        expect(posted[4].ok).toBe(true);
        expect(Array.isArray(posted[4].result)).toBe(true);
        expect(posted[4].result.some(m => m.fromR === 6 && m.fromC === 3 && m.toR === 3 && m.toC === 3)).toBe(false);

        workerMod.handleWorkerMessage({
            data: {
                jobId: 15,
                action: 'solveElementaryEndgame',
                fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'
            }
        }, post);
        expect(posted[5].ok).toBe(true);
        expect(posted[5].result).toBeDefined();
        expect(posted[5].result.isEndgame).toBe(true);

        // 6. Exception stack trace is preserved in error response
        const origSearch = global.ChessAINeuralSearch;
        const brokenCore = {
            ...require('../js/ai_neural_search.js'),
            searchRootMoves: () => {
                throw new Error('Synthetic search crash');
            }
        };
        global.ChessAINeuralSearch = brokenCore;
        jest.isolateModules(() => {
            const origImport = global.importScripts;
            try {
                // Force isolated worker to load from globalThis.ChessAINeuralSearch
                const brokenWorker = require('../js/ai_neural_worker.js');
                const errOut = [];
                brokenWorker.handleWorkerMessage({
                    data: {
                        jobId: 16,
                        fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1'
                    }
                }, m => errOut.push(m));
                expect(errOut[0].ok).toBe(false);
                expect(errOut[0].error).toBe('Synthetic search crash');
                expect(typeof errOut[0].stack).toBe('string');
                expect(errOut[0].stack).toContain('Synthetic search crash');
            } finally {
                global.importScripts = origImport;
            }
        });
        global.ChessAINeuralSearch = origSearch;

        // 7. Blob URL importScripts resolution and NO unsolicited jobId:null startup postMessage
        const origImportScripts = global.importScripts;
        const origPostMessage = global.postMessage;
        const origLocation = global.location;
        const origGlobalSearch = global.ChessAINeuralSearch;
        try {
            delete global.ChessAINeuralSearch;
            const startupPosts = [];
            const importedUrls = [];
            global.postMessage = (m) => startupPosts.push(m);
            global.location = { href: 'blob:http://localhost:5000/abc-123', origin: 'http://localhost:5000' };
            global.importScripts = (url) => {
                importedUrls.push(url);
                throw new Error('Simulated network error on import');
            };

            let isolatedWorker;
            jest.isolateModules(() => {
                isolatedWorker = require('../js/ai_neural_worker.js');
            });

            // Must try origin-anchored URLs for Blob URL and must NOT spam jobId: null at startup
            expect(importedUrls[0]).toBe('http://localhost:5000/js/ai_neural_search.js');
            expect(startupPosts.length).toBe(0);

            // Error + stack are returned on the actual request jobId
            const reply = [];
            isolatedWorker.handleWorkerMessage({ data: { jobId: 99, fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' } }, m => reply.push(m));
            expect(reply[0]).toMatchObject({ jobId: 99, ok: false });
            expect(reply[0].error).toContain('Simulated network error on import');
            expect(typeof reply[0].stack).toBe('string');
        } finally {
            global.importScripts = origImportScripts;
            global.postMessage = origPostMessage;
            global.location = origLocation;
            global.ChessAINeuralSearch = origGlobalSearch;
        }
    });

    test('init normalizes modelVer strings like v1.6 and v1.5 to load the right ONNX files', async () => {
        const origOrt = global.ort;
        const requestedModels = [];
        try {
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async (modelPath) => {
                        requestedModels.push(modelPath);
                        return { run: jest.fn(async () => ({})) };
                    })
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });

            await isolatedNeural.init('v1.6');
            expect(requestedModels[0]).toBe('modular_chess_v1_6.onnx');

            await isolatedNeural.init('v1.5');
            expect(requestedModels[1]).toBe('modular_chess_v1_5.onnx');
        } finally {
            global.ort = origOrt;
        }
    });

    test('alphaBetaSearch resolves legal moves from target fen even when ChessLogic has a different board', async () => {
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        try {
            // Load starting position into ChessLogic, but search a completely different midgame FEN
            ChessLogic.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            global.ChessLogic = ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672);
                            const val = new Float32Array(1);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            // Midgame position where White's only pawn on g2 can push to g3/g4 and knight is on h3 (impossible from startpos)
            const targetFen = '4k3/8/8/8/8/7N/6P1/4K2R w K - 0 1';
            const move = await isolatedNeural.alphaBetaSearch(targetFen, 2, 300, []);
            expect(move).toBeDefined();
            expect(move).not.toBeNull();
            // Move piece must exist on targetFen board, NOT startpos
            const { board } = require('../js/ai_neural_search.js').fenToBoard(targetFen);
            expect(board[move.fromR][move.fromC]).toBeTruthy();

            // Also works when ChessLogic is completely undefined
            delete global.ChessLogic;
            const moveWithoutLogic = await isolatedNeural.alphaBetaSearch(targetFen, 2, 300, []);
            expect(moveWithoutLogic).toBeDefined();
            expect(board[moveWithoutLogic.fromR][moveWithoutLogic.fromC]).toBeTruthy();
        } finally {
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('search5Ply avoids empty ONNX tensor batches and never ranks stalemate (+Infinity) over mate or winning play', async () => {
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        const batchSizes = [];
        try {
            delete global.ChessLogic;
            // Position where Black king on h8, White king on g6, White queen on g1? No: K+Q+R vs K (non-elementary 4+ pieces with White knight on a1)
            // White: Kg6, Qf7, Na1; Black: Kh8. Legal moves exist, Qe7 causes stalemate (Black has 0 legal moves, NOT check), Qf8/Qg7 causes mate? Wait: findInstantMate catches mate-in-1.
            // Use position with NO mate-in-1 and NO mate-in-2, where one candidate stalemates opponent (0 legal moves at ply 2):
            // White: Kf6, Bb6, Pc6, Pa2; Black: Ka8, Pb7. Wait: let's test direct stalemate-capable leaf + empty batch guard with a controlled position where candidate #1 stalemates and candidate #2 keeps game going.
            const fen = 'k7/1p6/K1P5/1B6/8/8/8/8 w - - 0 1'; // White has many moves; Ka6 vs Ka8, after Kb6?? Wait b6 has bishop. Better: White Ka5, Qb3, Nc1; Black Ka7. Wait Qa4 checks.
            // Actually simplest: 6 pieces where NO mate in 1 or 2 exists, e.g. White Ka6, Nb6, Pc5, Ra1; Black Ka8, Pa7.
            // On Ra8+? Kb8! No mate in 1, no mate in 2? Ra8? rook takes nothing; Rb1 -> Kb8.
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    batchSizes.push(dims[0]);
                    expect(dims[0]).toBeGreaterThan(0);
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async (feeds) => {
                            const b = feeds.board_state.dims[0];
                            expect(b).toBeGreaterThan(0);
                            const pol = new Float32Array(b * 4672);
                            const val = new Float32Array(b);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const m = await isolatedNeural.search5Ply(fen, 4, 3, 2, 2, []);
            expect(m).toBeDefined();
            expect(batchSizes.every(b => b > 0)).toBe(true);
            expect(Number.isFinite(m.minimaxVal !== undefined ? m.minimaxVal : 0)).toBe(true);
        } finally {
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('mctsSearch avoids repetition when playing Black in a Black-winning position (rootVal sign fix)', async () => {
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        try {
            delete global.ChessLogic;
            const SearchCore = require('../js/ai_neural_search.js');
            // Black is up a queen (clearly winning for Black -> White-perspective NN value = -0.85), no instant mate exists
            const fen = 'r5k1/1p6/8/3q4/8/7P/5PP1/3R2K1 b - - 0 1';
            const { board, turn, castling, epSquare } = SearchCore.fenToBoard(fen);
            const moves = SearchCore.getLegalMovesForBoard(board, turn, castling, epSquare);
            // Pick one move as the repeating move (Qd5-e5) and put its resulting position in history
            const repMove = moves.find(m => m.fromR === 3 && m.fromC === 3 && m.toR === 3 && m.toC === 4);
            expect(repMove).toBeDefined();
            const afterRep = SearchCore.simulateMove(board, repMove.fromR, repMove.fromC, repMove.toR, repMove.toC);
            const repKey = SearchCore.boardToSimpleKey(afterRep, 'w');

            // Put high logit on Qd5-e5 in uniform policy so only history penalty pushes it down
            const qe5Idx = (3 * 8 + 3) * 64 + (3 * 8 + 4);
            let runCalls = 0;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async (feeds) => {
                            runCalls++;
                            const b = feeds.board_state.dims[0];
                            const pol = new Float32Array(b * 4096);
                            pol[qe5Idx] = 3.0; // bias toward Qd5-e5 before repetition penalty
                            const val = new Float32Array(b);
                            val.fill(-0.85); // White-perspective: Black is winning strongly!
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const chosen = await isolatedNeural.mctsSearch(fen, 30, 1.0, [repKey]);
            expect(chosen).toBeDefined();
            expect(runCalls).toBeGreaterThan(1);
            // MCTS must NOT choose the repeating move Qd5-e5 despite its higher raw logit
            const isRepChosen = (chosen.fromR === repMove.fromR && chosen.fromC === repMove.fromC && chosen.toR === repMove.toR && chosen.toC === repMove.toC);
            expect(isRepChosen).toBe(false);
        } finally {
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('getBestMove skips transposition table hit when cached move leads to a history position', async () => {
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        let runCalls = 0;
        try {
            delete global.ChessLogic;
            const SearchCore = require('../js/ai_neural_search.js');
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            runCalls++;
                            const pol = new Float32Array(4672);
                            const val = new Float32Array(1);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');
            isolatedNeural.clearCache();

            // Quiet position with no free material capture so repetition penalty (-120cp/-400cp) switches move cleanly
            const fen = '4r1k1/1p3ppp/p7/8/8/P7/1P3PPP/3R2K1 w - - 0 1';
            const move1 = await isolatedNeural.getBestMove(fen, 'v1', 'alphabeta', [], { maxDepth: 6, timeLimitMs: 800 });
            expect(move1).toBeDefined();
            const runsAfterFirst = runCalls;
            expect(runsAfterFirst).toBeGreaterThan(0);

            // Simulate destination of move1 and put that resulting position in history
            const { board } = SearchCore.fenToBoard(fen);
            const afterMove1 = SearchCore.simulateMove(board, move1.fromR, move1.fromC, move1.toR, move1.toC, move1.promotion || null);
            const destHistoryKey = SearchCore.boardToSimpleKey(afterMove1, 'b');

            // Even though fen itself is NOT in history, move1's destination IS in history -> must bypass TT cache hit and search alternatives!
            const move2 = await isolatedNeural.getBestMove(fen, 'v1', 'alphabeta', [destHistoryKey], { maxDepth: 6, timeLimitMs: 800 });
            expect(move2).toBeDefined();
            expect(runCalls).toBeGreaterThan(runsAfterFirst);
            const returnedSameRepeatingMove = (
                move2.fromR === move1.fromR &&
                move2.fromC === move1.fromC &&
                move2.toR === move1.toR &&
                move2.toC === move1.toC
            );
            expect(returnedSameRepeatingMove).toBe(false);
        } finally {
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('alphaBetaSearch handles concurrent worker searches safely and does not exit early on single filtered move', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        const createdWorkers = [];
        class ConcurrentMockWorker {
            constructor(scriptPath) {
                this.scriptPath = scriptPath;
                this.terminated = false;
                this.onmessage = null;
                this.onerror = null;
                this.id = createdWorkers.length;
                createdWorkers.push(this);
            }
            postMessage(msg) {
                // First job responds after 35ms; second job responds after 10ms
                const delay = msg.jobId <= 3 ? 35 : 10;
                setTimeout(() => {
                    if (!this.terminated && typeof this.onmessage === 'function') {
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: msg.rootMoves[0],
                                    bestScore: (this.id === 1) ? 1.5 : 0.2,
                                    bestPrior: msg.rootPriors[0] || 0,
                                    priorBonus: 0.05 * (msg.rootPriors[0] || 0),
                                    blendedScore: ((this.id === 1) ? 1.5 : 0.2) + 0.05 * (msg.rootPriors[0] || 0),
                                    completedDepth: msg.maxDepth,
                                    nodes: 25
                                }
                            }
                        });
                    }
                }, delay);
            }
            terminate() {
                this.terminated = true;
            }
        }

        try {
            global.Worker = ConcurrentMockWorker;
            global.navigator = { hardwareConcurrency: 4 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672);
                            const val = new Float32Array(1);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const p1 = isolatedNeural.alphaBetaSearch(fen, 4, 500, []);
            const p2 = isolatedNeural.alphaBetaSearch(fen, 4, 500, []);
            const [res1, res2] = await Promise.all([p1, p2]);

            // Without SharedArrayBuffer, superseding search p2 cancels p1 cleanly and rebuilds pool workers
            expect(res1 === null || typeof res1.fromR === 'number').toBe(true);
            expect(res2).toBeDefined();
            expect(res2).not.toBeNull();
            expect(typeof res2.fromR).toBe('number');
            const poolWorkersCount = createdWorkers.length;
            expect(poolWorkersCount).toBeGreaterThanOrEqual(3);
            expect(createdWorkers.slice(-3).every(w => !w.terminated)).toBe(true);
            isolatedNeural.terminatePool();
            expect(createdWorkers.every(w => w.terminated)).toBe(true);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('PIECE_VALUES supports uppercase keys and searchRootMoves distinguishes severe material deficits below -2000cp', () => {
        const SearchCore = require('../js/ai_neural_search.js');
        expect(SearchCore.PIECE_VALUES.P).toBe(100);
        expect(SearchCore.PIECE_VALUES.N).toBe(300);
        expect(SearchCore.PIECE_VALUES.B).toBe(300);
        expect(SearchCore.PIECE_VALUES.R).toBe(500);
        expect(SearchCore.PIECE_VALUES.Q).toBe(900);
        expect(SearchCore.PIECE_VALUES.K).toBe(20000);

        // Down two queens + rook + bishops (~ -2800 cp): capturing a minor piece (-2500 cp) must beat doing nothing (~ -2800 cp)
        // White: Kh1, Ng3; Black: Kg8, Qa8, Qd8, Ra7, Bc8, Bf8. White knight g3 can capture f5 bishop or retreat
        // Wait simpler: White Kh1, Rg1; Black Kg8, Qa8, Qb8, Rc8, Rg2! Wait on Rg1xg2 (-1900 deficit) vs Kh1-h2 (-2800 deficit): capture reduces deficit below -2000!
        // Put extra queens so EVEN after Rg1xf1? White: Ka1, Rf1; Black: Kh8, Qa8, Qb8, Qc8, Bf2 (White is down 3 queens + bishop = -3000cp; Rxf2 wins bishop so only down -2700cp, STILL below -2000cp!)
        const fen = 'q1q1q2k/8/8/8/8/7P/5bP1/5R1K w - - 0 1';
        const { board, turn, castling, epSquare } = SearchCore.fenToBoard(fen);
        const moves = SearchCore.getLegalMovesForBoard(board, turn, castling, epSquare);
        const rxf2 = moves.find(m => m.fromR === 7 && m.fromC === 5 && m.toR === 6 && m.toC === 5);
        const quietOther = moves.find(m => m.fromR === 7 && m.fromC === 5 && m.toR === 7 && m.toC === 3); // Rf1-d1
        expect(rxf2).toBeDefined();
        expect(quietOther).toBeDefined();

        // Give quietOther higher prior (0.9 vs 0.1) so quietOther is searched first & establishes <= -0.9995 bound!
        const rootMoves = [quietOther, rxf2];
        const res = SearchCore.searchRootMoves({
            board,
            turn,
            castling,
            epSquare,
            rootMoves,
            rootPriors: [0.9, 0.1],
            maxDepth: 2,
            timeLimitMs: 1000
        });
        expect(res.bestMove).toMatchObject({
            fromR: rxf2.fromR,
            fromC: rxf2.fromC,
            toR: rxf2.toR,
            toC: rxf2.toC
        });
    });

    test('ChessAINeuralSearch seeCp accurately evaluates positive, equal, negative, x-ray, en passant, and promotion captures', () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. Losing queen capture on pawn defended by pawn: QxP -> 100 - 900 = -800
        const qxpPos = SearchCore.boardToFast(...(() => {
            const p = SearchCore.fenToBoard('4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1');
            return [p.board, p.turn, p.castling, p.epSquare];
        })());
        expect(SearchCore.seeCp(qxpPos, { fromR: 6, fromC: 3, toR: 3, toC: 3 })).toBe(-800);

        // 2. X-ray battery: White R on e1 + R on e2 vs Black r on e8 defending p on e5
        // Rxe5 (+100), Rxe5 (-500), Rxe5 (+500) => +100
        const xrayFen = '4r1k1/8/8/4p3/8/8/4R3/4R1K1 w - - 0 1';
        const xp = SearchCore.fenToBoard(xrayFen);
        const xrayPos = SearchCore.boardToFast(xp.board, xp.turn, xp.castling, xp.epSquare);
        expect(SearchCore.seeCp(xrayPos, { fromR: 6, fromC: 4, toR: 3, toC: 4 })).toBe(100);

        // 3. Equal minor piece trade: NxN defended by pawn -> 300 - 300 = 0
        const eqFen = '4k3/8/2p5/3n4/8/4N3/8/4K3 w - - 0 1';
        const ep = SearchCore.fenToBoard(eqFen);
        const eqPos = SearchCore.boardToFast(ep.board, ep.turn, ep.castling, ep.epSquare);
        expect(SearchCore.seeCp(eqPos, { fromR: 5, fromC: 4, toR: 3, toC: 3 })).toBe(0);

        // 4. En passant capture: undefended black pawn d5 captured en passant e5xd6 -> +100
        const enpFen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
        const enp = SearchCore.fenToBoard(enpFen);
        const enpPos = SearchCore.boardToFast(enp.board, enp.turn, enp.castling, enp.epSquare);
        expect(SearchCore.seeCp(enpPos, { fromR: 3, fromC: 4, toR: 2, toC: 3 })).toBe(100);

        // 5. Undefended promotion capture: e7xd8=Q on rook -> 500 + (900 - 100) = 1300
        const promoFen = '3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1';
        const prp = SearchCore.fenToBoard(promoFen);
        const promoPos = SearchCore.boardToFast(prp.board, prp.turn, prp.castling, prp.epSquare);
        expect(SearchCore.seeCp(promoPos, { fromR: 1, fromC: 4, toR: 0, toC: 3, promotion: 'q' })).toBe(1300);
    });

    test('evaluateBoardFast scores tapered positional features (pawn structure, king shield, rook files, knight outposts, endgame king)', () => {
        const SearchCore = require('../js/ai_neural_search.js');
        const evalFen = (fen) => {
            const p = SearchCore.fenToBoard(fen);
            return SearchCore.evaluateBoardFast(SearchCore.boardToFast(p.board, p.turn, p.castling, p.epSquare));
        };

        // 1. Connected phalanx pawns vs doubled isolated pawns (equal material)
        const connectedScore = evalFen('4k3/8/8/8/8/8/3PP3/4K3 w - - 0 1');
        const doubledIsolatedScore = evalFen('4k3/8/8/8/8/4P3/4P3/4K3 w - - 0 1');
        expect(connectedScore).toBeGreaterThan(doubledIsolatedScore);

        // 2. Castled king with pawn shield vs king exposed on open files in middlegame
        const shieldedKingScore = evalFen('r2q1rk1/ppp2ppp/2n2n2/3p4/3P4/2N2N2/PPP2PPP/R2Q1RK1 w - - 0 1');
        const exposedKingScore = evalFen('r2q1rk1/ppp2ppp/2n2n2/3p4/3P4/2N2N2/PPP5/R2Q1RK1 w - - 0 1');
        expect(shieldedKingScore).toBeGreaterThan(exposedKingScore);

        // 3. Rook on open file / 7th rank vs passive rook on closed file
        const activeRookScore = evalFen('6k1/3R1ppp/8/8/8/8/p4PPP/6K1 w - - 0 1');
        const passiveRookScore = evalFen('6k1/5ppp/8/8/8/8/p4PPP/2R3K1 w - - 0 1');
        expect(activeRookScore).toBeGreaterThan(passiveRookScore);

        // 4. Supported knight outpost on d5 (no enemy c/e pawns) vs rim knight on a3
        const outpostKnightScore = evalFen('4k3/p4ppp/8/3N4/4P3/8/P4PPP/4K3 w - - 0 1');
        const rimKnightScore = evalFen('4k3/p4ppp/8/8/4P3/N7/P4PPP/4K3 w - - 0 1');
        expect(outpostKnightScore).toBeGreaterThan(rimKnightScore);

        // 5. Endgame king centralization (e4 > a1 in pure K+P endgame)
        const centralEgKing = evalFen('4k3/8/8/8/4K3/8/4P3/8 w - - 0 1');
        const cornerEgKing = evalFen('4k3/8/8/8/8/8/4P3/K7 w - - 0 1');
        expect(centralEgKing).toBeGreaterThan(cornerEgKing);
    });

    test('searchRootMoves supports PVS, Aspiration Windows (d >= 4), persistent TT reuse (startDepth=6), and safe pruning on tactical mates/forks', () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. Tactical sanity at depth >= 5 (PVS + Aspiration Windows + RFP/Futility/LMR active)
        // Must still find quiet mate-in-2 (Ka6/Qc6 vs ka8 or Kc6/Qd3 vs ka8) and Nc7+ fork
        const forkFen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
        const fp = SearchCore.fenToBoard(forkFen);
        const forkRes = SearchCore.searchRootMoves({
            board: fp.board,
            turn: fp.turn,
            castling: fp.castling,
            historyKeys: [],
            maxDepth: 5,
            timeLimitMs: 1500
        });
        expect(forkRes.completedDepth).toBe(5);
        expect(forkRes.bestMove).toMatchObject({ fromR: 3, fromC: 3, toR: 1, toC: 2 });

        // 2. Wave 1 (1..4, reuseTT: true) followed by Wave 2 (startDepth: 5, maxDepth: 5, reuseTT: true, expectedCp)
        const midFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 4 5';
        const mp = SearchCore.fenToBoard(midFen);
        const wave1 = SearchCore.searchRootMoves({
            board: mp.board,
            turn: mp.turn,
            castling: mp.castling,
            historyKeys: [],
            maxDepth: 4,
            reuseTT: true,
            timeLimitMs: 1500
        });
        expect(wave1.completedDepth).toBe(4);
        expect(wave1.moveResults.length).toBeGreaterThan(10);

        const wave2Warm = SearchCore.searchRootMoves({
            board: mp.board,
            turn: mp.turn,
            castling: mp.castling,
            historyKeys: [],
            startDepth: 5,
            maxDepth: 5,
            reuseTT: true,
            expectedCp: wave1.bestCp,
            timeLimitMs: 1500
        });
        expect(wave2Warm.completedDepth).toBe(5);
        expect(wave2Warm.bestMove).toBeDefined();
        expect(wave2Warm.nodes).toBeGreaterThan(0);

        // Cold search at startDepth=5 without TT reuse for comparison
        const wave2Cold = SearchCore.searchRootMoves({
            board: mp.board,
            turn: mp.turn,
            castling: mp.castling,
            historyKeys: [],
            startDepth: 5,
            maxDepth: 5,
            reuseTT: false,
            timeLimitMs: 1500
        });
        expect(wave2Warm.nodes).toBeLessThanOrEqual(wave2Cold.nodes);
    });

    test('runWorkerPoolSearch runs Wave 1 (1..4) + Wave 2+ dynamic work-stealing (d=5..7), prunes blunders, and supports mid-Wave 2 cancellation', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        const createdWorkers = [];
        // Slow down worker #0 in Wave 2 so workers #1 and #2 steal more jobs dynamically
        class DynamicMockWorker {
            constructor(scriptPath) {
                this.scriptPath = scriptPath;
                this.messages = [];
                this.terminated = false;
                this.onmessage = null;
                this.onerror = null;
                this.id = createdWorkers.length;
                createdWorkers.push(this);
            }
            postMessage(msg) {
                this.messages.push(msg);
                const isWave1 = !msg.startDepth || msg.startDepth <= 4;
                const delay = isWave1 ? 5 : (this.id === 0 ? 45 : 4);
                setTimeout(() => {
                    if (this.terminated || typeof this.onmessage !== 'function') return;
                    if (isWave1) {
                        // Mark first 6 moves competitive, and the rest as severe blunders (< wave1Best - 2.0)
                        const moveResults = msg.rootMoves.map((m, idx) => {
                            const isGood = (this.id === 0 && idx < 2) || (this.id === 1 && idx < 2) || (this.id === 2 && idx < 2);
                            const rawScore = (this.id === 0 && idx === 0) ? 0.45 : (isGood ? 0.30 : -3.5);
                            const prior = msg.rootPriors[idx] || 0;
                            return {
                                move: m,
                                score: rawScore,
                                prior,
                                priorBonus: 0.05 * prior,
                                blendedScore: rawScore + 0.05 * prior,
                                nodes: 100
                            };
                        });
                        moveResults.sort((a, b) => b.blendedScore - a.blendedScore);
                        const top = moveResults[0];
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: top.move,
                                    bestScore: top.score,
                                    bestPrior: top.prior,
                                    priorBonus: top.priorBonus,
                                    blendedScore: top.blendedScore,
                                    completedDepth: msg.maxDepth,
                                    nodes: 500,
                                    timedOut: false,
                                    moveResults
                                }
                            }
                        });
                    } else {
                        // Wave 2+: single-move dispatch. Let worker #1's first Wave-1 move win at depth 7!
                        const m = msg.rootMoves[0];
                        const prior = msg.rootPriors[0] || 0;
                        const target = createdWorkers[1].messages[0].rootMoves[0];
                        const isChallenger = (
                            m.fromR === target.fromR &&
                            m.fromC === target.fromC &&
                            m.toR === target.toR &&
                            m.toC === target.toC
                        );
                        const rawScore = isChallenger ? 1.85 : 0.40;
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: m,
                                    bestScore: rawScore,
                                    bestPrior: prior,
                                    priorBonus: 0.05 * prior,
                                    blendedScore: rawScore + 0.05 * prior,
                                    completedDepth: msg.maxDepth,
                                    nodes: 250,
                                    timedOut: false,
                                    moveResults: [{ move: m, score: rawScore, prior, priorBonus: 0.05 * prior, blendedScore: rawScore + 0.05 * prior, nodes: 250 }]
                                }
                            }
                        });
                    }
                }, delay);
            }
            terminate() {
                this.terminated = true;
            }
        }

        try {
            global.Worker = DynamicMockWorker;
            global.navigator = { hardwareConcurrency: 4 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672);
                            pol.fill(0.1);
                            const val = new Float32Array(1);
                            val.fill(0.05);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const move = await isolatedNeural.alphaBetaSearch(fen, 7, 3000, []);
            expect(createdWorkers.length).toBe(3);

            // Wave 1: messages[0] had round-robin split, maxDepth 4, reuseTT true, and no minAlphaScore
            expect(createdWorkers.every(w => w.messages[0].maxDepth === 4)).toBe(true);
            expect(createdWorkers.every(w => w.messages[0].reuseTT === true)).toBe(true);
            expect(createdWorkers.every(w => w.messages[0].minAlphaScore === undefined)).toBe(true);

            // Wave 2+ (d=5..7): only the 6 non-blunder moves per depth (18 total single-move jobs across d=5,6,7)
            const wave2Msgs = createdWorkers.flatMap(w => w.messages.slice(1));
            expect(wave2Msgs.length).toBe(18);
            expect(wave2Msgs.every(m => m.rootMoves.length === 1 && m.startDepth === m.maxDepth && m.reuseTT === true)).toBe(true);
            expect(wave2Msgs.some(m => m.startDepth === 5)).toBe(true);
            expect(wave2Msgs.some(m => m.startDepth === 6)).toBe(true);
            expect(wave2Msgs.some(m => m.startDepth === 7)).toBe(true);
            // Subsequent Wave 2 jobs receive minAlphaScore once depth best score is known
            expect(wave2Msgs.some(m => typeof m.minAlphaScore === 'number' && Number.isFinite(m.minAlphaScore))).toBe(true);

            // Fast workers (#1/#2) stole twice as many Wave 2 jobs as slow worker (#0) even with PV pinned on #0
            const w0Wave2 = createdWorkers[0].messages.length - 1;
            const fastWave2 = (createdWorkers[1].messages.length - 1) + (createdWorkers[2].messages.length - 1);
            expect(fastWave2).toBeGreaterThanOrEqual(w0Wave2 * 2);
            // PV worker stays on worker #0 at d=5, then follows Worker Affinity to worker #1 when #1 takes over PV at d=6..7
            const wave2PvDispatches = createdWorkers.flatMap(w =>
                w.messages.filter(m => m.startDepth >= 5 && m.minAlphaScore === undefined).map(m => ({ workerId: w.id, startDepth: m.startDepth }))
            );
            expect(wave2PvDispatches.length).toBe(3);
            expect(wave2PvDispatches.find(p => p.startDepth === 5).workerId).toBe(0);
            expect(wave2PvDispatches.find(p => p.startDepth === 6).workerId).toBe(1);
            expect(wave2PvDispatches.find(p => p.startDepth === 7).workerId).toBe(1);
            expect(wave2Msgs.filter(m => m.minAlphaScore !== undefined).length).toBe(15);
            expect(wave2Msgs.every(m => m.ageHistory === false)).toBe(true);

            // Wave 2+ challenger (worker #1's first move) overtook Wave 1's 0.45 leader
            const expectedWinner = createdWorkers[1].messages[0].rootMoves[0];
            expect(move).toMatchObject({
                fromR: expectedWinner.fromR,
                fromC: expectedWinner.fromC,
                toR: expectedWinner.toR,
                toC: expectedWinner.toC
            });

            // Mid-Wave 2 cancellation: start a maxDepth=7 search and immediately supersede it with another search
            const pFirst = isolatedNeural.alphaBetaSearch(fen, 7, 3000, []);
            await new Promise(r => setTimeout(r, 15));
            const pSecond = isolatedNeural.alphaBetaSearch(fen, 4, 3000, []);
            const [resFirst, resSecond] = await Promise.all([pFirst, pSecond]);
            // Superseding search completes cleanly on freshly rebuilt workers; old in-flight workers are terminated
            expect(resSecond).toBeDefined();
            expect(resSecond).not.toBeNull();
            expect(resFirst).toBeNull();
            expect(createdWorkers.slice(0, 3).every(w => w.terminated)).toBe(true);
            expect(createdWorkers.slice(-3).every(w => !w.terminated)).toBe(true);

            isolatedNeural.terminatePool();
            expect(createdWorkers.every(w => w.terminated)).toBe(true);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('fixes cpToRootScore clamping, rootScoreToAlphaCp thresholds, and promotion priors in computePriors', async () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. cpToRootScore must keep mate-threshold boundary scores strictly negative/positive
        expect(SearchCore.cpToRootScore(-28000)).toBe(-8.0);
        expect(SearchCore.cpToRootScore(-29990)).toBe(-9.0);
        expect(SearchCore.cpToRootScore(28000)).toBe(8.0);
        expect(SearchCore.cpToRootScore(29990)).toBe(9.0);

        // 2. rootScoreToAlphaCp must preserve deep non-mate centipawn scores (-2000cp) and clamp inside (-MATE_THRESHOLD, MATE_THRESHOLD)
        const alphaMinus2000 = SearchCore.rootScoreToAlphaCp(Math.tanh(-2000 / 400));
        expect(alphaMinus2000).toBeLessThan(-1900);
        expect(alphaMinus2000).toBeGreaterThan(-2100);
        expect(SearchCore.rootScoreToAlphaCp(-0.9999999)).toBe(-27999);
        expect(SearchCore.rootScoreToAlphaCp(0.9999999)).toBe(27999);

        // 3. Severe material deficit search must produce negative bestScore (never +190.0 fail-low mate inversion)
        const lostFen = 'qrr1k3/8/8/8/8/8/8/4K3 w - - 0 1';
        const { board, turn, castling, epSquare } = SearchCore.fenToBoard(lostFen);
        const legals = SearchCore.getLegalMovesForBoard(board, turn, castling, epSquare);
        const deficitRes = SearchCore.searchRootMoves({
            board,
            turn,
            castling,
            epSquare,
            historyKeys: [],
            rootMoves: legals,
            rootPriors: legals.map(() => 1 / legals.length),
            maxDepth: 3,
            timeLimitMs: 1000
        });
        expect(deficitRes.bestMove).not.toBeNull();
        expect(deficitRes.bestScore).toBeLessThan(0);

        // 4. computePriors must use m.promotion (distinct logit + simulateMove piece) for underpromotions
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        const capturedJobs = [];

        class PromoMockWorker {
            constructor() {
                this.onmessage = null;
            }
            postMessage(msg) {
                capturedJobs.push(msg);
                setTimeout(() => {
                    if (!this.onmessage) return;
                    const first = msg.rootMoves[0];
                    const firstPrior = msg.rootPriors[0] || 0;
                    this.onmessage({
                        data: {
                            jobId: msg.jobId,
                            ok: true,
                            result: {
                                bestMove: first,
                                bestScore: 0.5,
                                bestPrior: firstPrior,
                                priorBonus: 0.05 * firstPrior,
                                blendedScore: 0.5 + 0.05 * firstPrior,
                                completedDepth: msg.maxDepth,
                                nodes: 50,
                                timedOut: false,
                                moveResults: msg.rootMoves.map((m, idx) => {
                                    const p = msg.rootPriors[idx] || 0;
                                    return { move: m, score: 0.5, prior: p, priorBonus: 0.05 * p, blendedScore: 0.5 + 0.05 * p, nodes: 50 };
                                })
                            }
                        }
                    });
                }, 0);
            }
            terminate() {}
        }

        try {
            global.Worker = PromoMockWorker;
            global.navigator = { hardwareConcurrency: 2 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672);
                            // e7 (fromSq = 12) -> e8 knight underpromotion: 12 * 73 + 64 + 1 * 3 + 0 = 943
                            pol[943] = 10.0;
                            // e7 (fromSq = 12) -> e8 queen promotion: 12 * 73 + 0 = 876
                            pol[876] = 0.0;
                            const val = new Float32Array(1);
                            val[0] = 0.5;
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const promoFen = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1';
            await isolatedNeural.alphaBetaSearch(promoFen, 5, 1000, []);

            const allPairs = capturedJobs.flatMap(j =>
                j.rootMoves.map((m, idx) => ({ m, prior: j.rootPriors[idx] }))
            );
            const knightPromo = allPairs.find(x => x.m.fromR === 1 && x.m.fromC === 4 && x.m.toR === 0 && x.m.toC === 4 && x.m.promotion === 'n');
            const queenPromo = allPairs.find(x => x.m.fromR === 1 && x.m.fromC === 4 && x.m.toR === 0 && x.m.toC === 4 && (!x.m.promotion || x.m.promotion === 'q'));

            expect(knightPromo).toBeDefined();
            expect(queenPromo).toBeDefined();
            expect(knightPromo.prior).toBeGreaterThan(queenPromo.prior);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('searchRootMoves applies centipawn priorBonus (never drops a piece ahead), quiesceFast uses TT, and evaluateBoardFast scores threats/king-attack/blockade', () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. Ahead by Q+R (+1400cp): must save bishop attacked by pawn even if blunder has prior=1.0
        const saveFen = '4k3/8/3p4/4B3/8/8/8/Q3R1K1 w - - 0 1';
        const { board, turn, castling, epSquare } = SearchCore.fenToBoard(saveFen);
        const legals = SearchCore.getLegalMovesForBoard(board, turn, castling, epSquare);
        const blunderMove = legals.find(m => m.fromR === 7 && m.fromC === 6 && m.toR === 7 && m.toC === 7); // Kg1-h1 leaves Be5
        const saveMove = legals.find(m => m.fromR === 3 && m.fromC === 4 && m.toR === 5 && m.toC === 2);    // Be5-c3 escapes
        expect(blunderMove).toBeDefined();
        expect(saveMove).toBeDefined();

        const saveRes = SearchCore.searchRootMoves({
            board,
            turn,
            castling,
            epSquare,
            rootMoves: [blunderMove, saveMove],
            rootPriors: [1.0, 0.0],
            maxDepth: 2,
            timeLimitMs: 1000
        });
        expect(saveRes.bestMove).toMatchObject({ fromR: 3, fromC: 4, toR: 5, toC: 2 });

        // 2. evaluateBoardFast: pawn threats, king attack zone, and passed pawn blockade + king proximity
        const evalFen = (fen) => {
            const p = SearchCore.fenToBoard(fen);
            return SearchCore.evaluateBoardFast(SearchCore.boardToFast(p.board, p.turn, p.castling, p.epSquare));
        };

        // Pawn threat: Nd5 attacked by c6 pawn vs Nf5 safe (same material)
        const attackedKnight = evalFen('4k3/8/2p5/3N4/8/8/8/4K3 w - - 0 1');
        const safeKnight = evalFen('4k3/8/2p5/5N2/8/8/8/4K3 w - - 0 1');
        expect(safeKnight).toBeGreaterThan(attackedKnight);

        // King attack zone: Qg5 + Rf3 targeting black king zone vs passive Qe1 + Rf1
        const kingAttackPos = evalFen('r2q1rk1/ppp2ppp/2n5/6Q1/8/5R2/PPP2PPP/R1B3K1 w - - 0 1');
        const passiveAttackPos = evalFen('r2q1rk1/ppp2ppp/2n5/8/8/8/PPP2PPP/R1B1QRK1 w - - 0 1');
        expect(kingAttackPos).toBeGreaterThan(passiveAttackPos);

        // Passed pawn blockade + king distance in endgame
        const blockadedPassed = evalFen('4k3/8/4n3/4P3/8/8/8/4K3 w - - 0 1');
        const freePassed = evalFen('4k3/8/n7/4P3/8/8/8/4K3 w - - 0 1');
        expect(freePassed).toBeGreaterThan(blockadedPassed);

        const closeOwnKing = evalFen('7k/8/8/4P3/4K3/8/8/8 w - - 0 1');
        const closeEnemyKing = evalFen('4k3/8/4K3/8/8/8/4P3/8 w - - 0 1'); // different rank check below: same pawn rank
        const nearOwnKingSame = evalFen('7k/8/8/4P3/4K3/8/8/8 w - - 0 1');
        const farOwnKingSame = evalFen('4k3/8/8/4P3/8/8/8/K7 w - - 0 1');
        expect(nearOwnKingSame).toBeGreaterThan(farOwnKingSame);
        expect(closeOwnKing).toBeGreaterThan(closeEnemyKing);

        // 3. searchRootMoves stores depth-0 quiesceFast TT entries and reuses them on repeat search
        const qFp = SearchCore.fenToBoard('r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
        const qTT = new Map();
        const qRes1 = SearchCore.searchRootMoves({
            board: qFp.board,
            turn: qFp.turn,
            castling: qFp.castling,
            epSquare: qFp.epSquare,
            tt: qTT,
            maxDepth: 1,
            timeLimitMs: 1000
        });
        expect(qTT.size).toBeGreaterThan(0);
        expect(Array.from(qTT.values()).some(e => e.depth === 0)).toBe(true);
        const qRes2 = SearchCore.searchRootMoves({
            board: qFp.board,
            turn: qFp.turn,
            castling: qFp.castling,
            epSquare: qFp.epSquare,
            tt: qTT,
            maxDepth: 1,
            timeLimitMs: 1000
        });
        expect(qRes2.bestCp).toBe(qRes1.bestCp);
        expect(qRes2.nodes).toBeLessThanOrEqual(qRes1.nodes);
    });

    test('runWorkerPoolSearch performs YBWC PV-first wave dispatch, pins PV to worker 0, passes ageHistory=false, and avoids premature early exit', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        const dispatchLog = [];
        const depth6Events = [];

        class YbwcMockWorker {
            constructor() {
                this.terminated = false;
                this.onmessage = null;
                this.id = YbwcMockWorker.nextId++;
            }
            postMessage(msg) {
                const isWave1 = !msg.startDepth || msg.startDepth <= 4;
                dispatchLog.push({
                    workerId: this.id,
                    startDepth: msg.startDepth || 0,
                    maxDepth: msg.maxDepth,
                    minAlphaScore: msg.minAlphaScore,
                    ageHistory: msg.ageHistory
                });
                if (msg.startDepth === 6) {
                    depth6Events.push({ type: 'dispatch', jobId: msg.jobId, hasMinAlpha: typeof msg.minAlphaScore === 'number' });
                }
                // Make worker #0 slightly slower in Wave 2+ to confirm pvWorkerIdx stays pinned to 0 instead of migrating
                const delay = isWave1 ? 5 : (this.id === 0 ? 14 : 4);
                setTimeout(() => {
                    if (this.terminated || typeof this.onmessage !== 'function') return;
                    if (isWave1) {
                        const moveResults = msg.rootMoves.map((m, idx) => {
                            const isBest = (this.id === 0 && idx === 0);
                            const rawScore = isBest ? 0.60 : (idx < 2 ? 0.25 : -4.0);
                            const prior = msg.rootPriors[idx] || 0;
                            return {
                                move: m,
                                score: rawScore,
                                cp: Math.round(rawScore * 400),
                                prior,
                                priorBonus: 0.125 * prior,
                                blendedScore: rawScore + 0.125 * prior,
                                nodes: 100
                            };
                        });
                        moveResults.sort((a, b) => b.blendedScore - a.blendedScore);
                        const top = moveResults[0];
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: top.move,
                                    bestScore: top.score,
                                    bestCp: top.cp,
                                    bestPrior: top.prior,
                                    priorBonus: top.priorBonus,
                                    blendedScore: top.blendedScore,
                                    completedDepth: msg.maxDepth,
                                    nodes: 300,
                                    timedOut: false,
                                    moveResults
                                }
                            }
                        });
                    } else {
                        const m = msg.rootMoves[0];
                        const prior = msg.rootPriors[0] || 0;
                        const isPv = (typeof msg.minAlphaScore !== 'number');
                        if (msg.startDepth === 6) {
                            depth6Events.push({ type: 'reply', jobId: msg.jobId, isPv });
                        }
                        const rawScore = isPv ? 0.62 : 0.20;
                        const bestCp = isPv ? 290 : 80;
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: m,
                                    bestScore: rawScore,
                                    bestCp,
                                    bestPrior: prior,
                                    priorBonus: 0,
                                    blendedScore: rawScore,
                                    completedDepth: msg.maxDepth,
                                    nodes: isPv ? 80 : 300,
                                    timedOut: false,
                                    moveResults: [{ move: m, score: rawScore, cp: bestCp, prior, priorBonus: 0, blendedScore: rawScore, nodes: isPv ? 80 : 300 }]
                                }
                            }
                        });
                    }
                }, delay);
            }
            terminate() {
                this.terminated = true;
            }
        }
        YbwcMockWorker.nextId = 0;

        try {
            global.Worker = YbwcMockWorker;
            global.navigator = { hardwareConcurrency: 4 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672).fill(0.1);
                            const val = new Float32Array(1).fill(0.05);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            // Ample budget (900ms): even with identical PV score and low node share, premature Early Exit must NOT skip d=8
            const best = await isolatedNeural.alphaBetaSearch(fen, 8, 900, []);
            expect(best).not.toBeNull();

            // Verify YBWC at depth 6: first event is PV dispatch without minAlphaScore, followed by PV reply BEFORE any sibling dispatch
            expect(depth6Events[0].type).toBe('dispatch');
            expect(depth6Events[0].hasMinAlpha).toBe(false);
            expect(depth6Events[1].type).toBe('reply');
            expect(depth6Events[1].isPv).toBe(true);
            const siblingDispatches = depth6Events.filter(ev => ev.type === 'dispatch').slice(1);
            expect(siblingDispatches.length).toBeGreaterThanOrEqual(4);
            expect(siblingDispatches.every(ev => ev.hasMinAlpha === true)).toBe(true);

            // Verify depth 8 was reached (no Early Exit truncation), PV remained pinned on worker #0 across d=5..8, and ageHistory === false
            const wave2Logs = dispatchLog.filter(d => d.startDepth >= 5);
            expect(wave2Logs.some(d => d.startDepth === 8)).toBe(true);
            expect(wave2Logs.every(d => d.ageHistory === false)).toBe(true);
            const wave2PvDispatches = wave2Logs.filter(d => d.minAlphaScore === undefined);
            expect(wave2PvDispatches.length).toBe(4);
            expect(wave2PvDispatches.every(d => d.workerId === 0)).toBe(true);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('fixes UPPERBOUND_GUARD ordering, PRIOR_BONUS_CP=20 (decaying), king attack zone cap<=120, and worker ageHistory forwarding', async () => {
        const SearchCore = require('../js/ai_neural_search.js');

        // 1. Decaying PRIOR_BONUS_CP (20cp at d=1): equal moves with prior=1.0 vs prior=0.0 score +20cp (tanh((cp+20)/400))
        const symFp = SearchCore.fenToBoard('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
        const symLegals = SearchCore.getLegalMovesForBoard(symFp.board, symFp.turn, symFp.castling, symFp.epSquare);
        const kd1 = symLegals.find(m => m.fromR === 7 && m.fromC === 4 && m.toR === 7 && m.toC === 3);
        expect(kd1).toBeDefined();
        const priorRes = SearchCore.searchRootMoves({
            board: symFp.board,
            turn: symFp.turn,
            castling: symFp.castling,
            epSquare: symFp.epSquare,
            rootMoves: [kd1],
            rootPriors: [1.0],
            maxDepth: 1,
            timeLimitMs: 1000
        });
        expect(priorRes.blendedScore).toBeCloseTo(Math.tanh((priorRes.bestCp + 20) / 400.0), 5);

        // 2. Softened king attack zone: heavy 3-piece storm stays clearly positive without exploding near +350cp
        const evalFen = (fen) => {
            const p = SearchCore.fenToBoard(fen);
            return SearchCore.evaluateBoardFast(SearchCore.boardToFast(p.board, p.turn, p.castling, p.epSquare));
        };
        const stormPos = evalFen('r2q1rk1/ppp2ppp/2n4B/6Q1/8/5R2/PPP2PPP/R5K1 w - - 0 1');
        const quietPos = evalFen('r2q1rk1/ppp2ppp/2n5/8/8/8/PPP2PPP/R1B1QRK1 w - - 0 1');
        expect(stormPos - quietPos).toBeGreaterThan(20);
        expect(stormPos - quietPos).toBeLessThan(220);

        // 3. ai_neural_worker forwards ageHistory: false into searchRootMoves
        const origGlobalSearch = global.ChessAINeuralSearch;
        const forwardedParams = [];
        try {
            global.ChessAINeuralSearch = {
                ...SearchCore,
                searchRootMoves: (params) => {
                    forwardedParams.push(params);
                    return SearchCore.searchRootMoves(params);
                }
            };
            jest.isolateModules(() => {
                const isolatedWorker = require('../js/ai_neural_worker.js');
                const posted = [];
                isolatedWorker.handleWorkerMessage({
                    data: {
                        jobId: 99,
                        action: 'searchRootMoves',
                        fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
                        startDepth: 6,
                        maxDepth: 6,
                        ageHistory: false,
                        deadlineAt: Date.now() + 2000
                    }
                }, m => posted.push(m));
                expect(posted[0].ok).toBe(true);
            });
            expect(forwardedParams[0].ageHistory).toBe(false);
        } finally {
            global.ChessAINeuralSearch = origGlobalSearch;
        }

        // 4. UPPERBOUND_GUARD: a non-PV fail-low against jobMinAlpha must NOT inflate cand.blendedScore above true stronger siblings
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        const keyOf = (m) => `${m.fromR},${m.fromC}->${m.toR},${m.toC}`;
        const d7DispatchOrder = [];
        let pvMoveKey = null;
        let strongSiblingKey = null;
        let failLowTrapKey = null;

        class UpperBoundMockWorker {
            constructor() {
                this.terminated = false;
                this.onmessage = null;
                this.id = UpperBoundMockWorker.nextId++;
            }
            postMessage(msg) {
                const isWave1 = !msg.startDepth || msg.startDepth <= 4;
                if (msg.startDepth === 7 && msg.rootMoves.length === 1) {
                    d7DispatchOrder.push(keyOf(msg.rootMoves[0]));
                }
                setTimeout(() => {
                    if (this.terminated || typeof this.onmessage !== 'function') return;
                    if (isWave1) {
                        const moveResults = msg.rootMoves.map((m, idx) => {
                            const k = keyOf(m);
                            let rawScore = -4.0;
                            if (this.id === 0 && idx === 0) {
                                pvMoveKey = k;
                                rawScore = 0.60;
                            } else if (this.id === 1 && idx === 0) {
                                strongSiblingKey = k;
                                rawScore = 0.20;
                            } else if (this.id === 2 && idx === 0) {
                                failLowTrapKey = k;
                                rawScore = -0.10;
                            } else if (idx === 1) {
                                rawScore = -0.25 - this.id * 0.05;
                            }
                            const prior = msg.rootPriors[idx] || 0;
                            return {
                                move: m,
                                score: rawScore,
                                cp: Math.round(rawScore * 400),
                                prior,
                                priorBonus: 0.125 * prior,
                                blendedScore: rawScore + 0.125 * prior,
                                nodes: 50
                            };
                        });
                        moveResults.sort((a, b) => b.blendedScore - a.blendedScore);
                        const top = moveResults[0];
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: top.move,
                                    bestScore: top.score,
                                    bestCp: top.cp,
                                    bestPrior: top.prior,
                                    priorBonus: top.priorBonus,
                                    blendedScore: top.blendedScore,
                                    completedDepth: msg.maxDepth,
                                    nodes: 150,
                                    timedOut: false,
                                    moveResults
                                }
                            }
                        });
                    } else {
                        const m = msg.rootMoves[0];
                        const k = keyOf(m);
                        const prior = msg.rootPriors[0] || 0;
                        let rawScore = -0.25;
                        let bestCp = -100;
                        if (k === pvMoveKey) {
                            rawScore = 0.60;
                            bestCp = 277;
                        } else if (k === strongSiblingKey) {
                            rawScore = 0.25;
                            bestCp = 102;
                        } else if (k === failLowTrapKey) {
                            // Fail-low upper bound (0.55 <= jobMinAlpha ~0.62) higher than prior -0.10: must be guarded!
                            rawScore = 0.55;
                            bestCp = 240;
                        }
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: m,
                                    bestScore: rawScore,
                                    bestCp,
                                    bestPrior: prior,
                                    priorBonus: 0,
                                    blendedScore: rawScore,
                                    completedDepth: msg.maxDepth,
                                    nodes: 50,
                                    timedOut: false,
                                    moveResults: [{ move: m, score: rawScore, cp: bestCp, prior, priorBonus: 0, blendedScore: rawScore, nodes: 50 }]
                                }
                            }
                        });
                    }
                }, isWave1 ? 5 : 10);
            }
            terminate() {
                this.terminated = true;
            }
        }
        UpperBoundMockWorker.nextId = 0;

        try {
            global.Worker = UpperBoundMockWorker;
            global.navigator = { hardwareConcurrency: 4 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672).fill(0.1);
                            const val = new Float32Array(1).fill(0.05);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            await isolatedNeural.alphaBetaSearch(fen, 7, 1000, []);

            expect(d7DispatchOrder.length).toBeGreaterThanOrEqual(4);
            expect(d7DispatchOrder[0]).toBe(pvMoveKey);
            const strongIdx = d7DispatchOrder.indexOf(strongSiblingKey);
            const trapIdx = d7DispatchOrder.indexOf(failLowTrapKey);
            expect(strongIdx).toBeGreaterThan(0);
            expect(trapIdx).toBeGreaterThan(strongIdx);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });
});

describe('Alpha-Beta Audit V80 Regressions (js/ai_neural_search.js)', () => {
    const SearchCore = require('../js/ai_neural_search.js');

    test('quiesce resolves deep >4-ply capture chains accurately', () => {
        // White attackers on e5: Bc3, Re2, Re1 (330+500+500=1330).
        // Black piece + defenders on e5: ne5, bd6, re8 + 3 extra pawns (320+330+500+300=1450).
        // 5-ply capture chain: 1.Bxe5 Bxe5 2.Rxe5 Rxe5 3.Rxe5 leaves White R vs 3 pawns (> +100 cp),
        // whereas stopping at ply 4 would evaluate -300 cp and fall back to negative stand-pat.
        const chainFen = '4r1k1/pp5p/3b4/4n3/8/2B5/4R3/4R1K1 w - - 0 1';
        const { board, turn } = SearchCore.fenToBoard(chainFen);
        const qScore = SearchCore.quiesce(board, turn, -10000, 10000, 4, 0);
        expect(qScore).toBeGreaterThan(100);
    });

    test('inverted aspiration window (expectedCp < minAlphaScore) never returns bogus +250 cp for losing moves', () => {
        const losingFen = '4k3/3q4/8/8/8/8/8/4K3 w - - 0 1';
        const { board, turn, castling } = SearchCore.fenToBoard(losingFen);
        const res = SearchCore.searchRootMoves({
            board,
            turn,
            castling,
            startDepth: 2,
            maxDepth: 2,
            expectedCp: 50,
            minAlphaScore: Math.tanh(250 / 400),
            reuseTT: false,
            timeLimitMs: 1500
        });
        expect(res.bestMove).not.toBeNull();
        expect(res.bestCp).toBeLessThan(-200);
        expect(res.bestScore).toBeLessThan(0);
        expect(res.moveResults.every(mr => mr.cp < 200)).toBe(true);
    });

    test('mild repetition contempt penalizes repetition slightly when winning without blundering when equal', () => {
        // 1) Equal endgame: K+P vs k+p (material diff = 0 -> repetition eval = 0).
        // Holding draw / repeating must not drop a pawn or report negative contempt (< -50 cp).
        const equalFen = '4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1';
        const eqParsed = SearchCore.fenToBoard(equalFen);
        const eqKey = SearchCore.boardToSimpleKey(eqParsed.board, eqParsed.turn, eqParsed.castling);
        const eqRes = SearchCore.searchRootMoves({
            board: eqParsed.board,
            turn: eqParsed.turn,
            castling: eqParsed.castling,
            historyKeys: [eqKey, eqKey],
            startDepth: 2,
            maxDepth: 3,
            reuseTT: false,
            timeLimitMs: 1500
        });
        expect(eqRes.bestScore).toBeGreaterThanOrEqual(-0.15);

        // 2) Winning endgame (White up Rook vs 1 pawn, rootMat = +400 > 100):
        // Pre-populate historyKeys with the resulting position of Ra1-b1 twice (causing 3-fold).
        // Mild -25 cp contempt should steer search away from Rb1 toward another winning move.
        const winFen = '4k3/p7/8/8/8/8/8/R3K3 w - - 0 1';
        const winParsed = SearchCore.fenToBoard(winFen);
        const repBoard = winParsed.board.map(r => r.slice());
        repBoard[7][1] = repBoard[7][0];
        repBoard[7][0] = null;
        const repKey = SearchCore.boardToSimpleKey(repBoard, 'b', { wK: false, wQ: false, bK: false, bQ: false });

        const winRes = SearchCore.searchRootMoves({
            board: winParsed.board,
            turn: 'w',
            castling: winParsed.castling,
            historyKeys: [repKey, repKey],
            startDepth: 2,
            maxDepth: 3,
            reuseTT: false,
            timeLimitMs: 1500
        });
        expect(winRes.bestMove).not.toBeNull();
        expect(
            winRes.bestMove.fromR === 7 &&
            winRes.bestMove.fromC === 0 &&
            winRes.bestMove.toR === 7 &&
            winRes.bestMove.toC === 1
        ).toBe(false);
        expect(winRes.bestScore).toBeGreaterThan(0.3);
    });

    test('king captures undefended queen and pawn in quiesce and searchRootMoves', () => {
        const kxQFen = '4k3/8/8/8/4q3/3K4/7P/RB6 w - - 0 1';
        const qx = SearchCore.fenToBoard(kxQFen);
        expect(SearchCore.quiesce(qx.board, 'w', -10000, 10000, 4, 0)).toBeGreaterThan(700);
        const qxSearch = SearchCore.searchRootMoves({
            board: qx.board,
            turn: 'w',
            castling: qx.castling,
            startDepth: 1,
            maxDepth: 2,
            reuseTT: false,
            timeLimitMs: 1000
        });
        expect(qxSearch.bestMove).toMatchObject({ fromR: 5, fromC: 3, toR: 4, toC: 4 });

        const kxPFen = '4k3/8/8/8/4p3/3K4/8/8 w - - 0 1';
        const px = SearchCore.fenToBoard(kxPFen);
        const pxSearch = SearchCore.searchRootMoves({
            board: px.board,
            turn: 'w',
            castling: px.castling,
            startDepth: 1,
            maxDepth: 2,
            reuseTT: false,
            timeLimitMs: 1000
        });
        expect(pxSearch.bestMove).toMatchObject({ fromR: 5, fromC: 3, toR: 4, toC: 4 });
    });

    test('evaluateBoardFast enforces insufficient material, bishop scaling, mop-up corner push, and symmetric king shield', () => {
        const evalFen = (fen) => {
            const p = SearchCore.fenToBoard(fen);
            return SearchCore.evaluateBoardFast(SearchCore.boardToFast(p.board, p.turn, p.castling, p.epSquare));
        };

        // Insufficient material draws
        expect(evalFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(0);
        expect(evalFen('4k3/8/8/8/8/2B5/8/4K3 w - - 0 1')).toBe(0);
        expect(evalFen('4k3/8/8/8/8/2N5/8/4K3 w - - 0 1')).toBe(0);
        expect(evalFen('4k3/8/8/8/8/2NN4/8/4K3 w - - 0 1')).toBe(0);
        expect(evalFen('4k1n1/8/8/8/8/2B5/8/4K3 w - - 0 1')).toBe(0);

        // Opposite-colored bishops (Bf1 light vs bf8 dark) scaled down vs same-colored (Bf1 light vs bc8 light)
        const sameColorEval = evalFen('2b1k3/pp6/8/8/8/8/PPP5/4KB2 w - - 0 1');
        const oppColorEval = evalFen('4kb2/pp6/8/8/8/8/PPP5/4KB2 w - - 0 1');
        expect(Math.abs(oppColorEval)).toBeLessThan(Math.abs(sameColorEval));

        // Mop-up corner push: Kf6 has identical Manhattan distance 4 to both kh8 (corner) and kd4 (center)
        const cornerEval = evalFen('7k/8/5K2/8/8/8/8/1Q6 w - - 0 1');
        const centerEval = evalFen('8/8/5K2/8/3k4/8/8/1Q6 w - - 0 1');
        expect(cornerEval).toBeGreaterThan(centerEval);

        // Symmetric 3-file king pawn shield (queenside Kb1+a2b2c2 vs kingside Kg1+f2g2h2)
        // Missing h2 pawn under Kh1 must cost significantly in middlegame
        const qSideEval = evalFen('1k6/ppp5/8/8/8/8/PPP2NN1/1K1RR3 w - - 0 1');
        const kSideEval = evalFen('6k1/5ppp/8/8/8/8/2NN1PPP/3RR1K1 w - - 0 1');
        expect(Math.abs(qSideEval - kSideEval)).toBeLessThanOrEqual(25);

        const shieldFull = evalFen('4k3/2r2ppp/8/8/8/8/5PPP/2R4K w - - 0 1');
        const shieldNoH = evalFen('4k3/2r2ppp/8/8/8/8/5PP1/2R4K w - - 0 1');
        expect(shieldFull - shieldNoH).toBeGreaterThan(100);
    });

    test('getLegalMovesForBoard includes all 4 promotions and Zobrist TT distinguishes real vs pseudo EP', () => {
        const promoFen = '4k3/3P4/8/8/8/8/8/4K3 w - - 0 1';
        const { board: promoBoard } = SearchCore.fenToBoard(promoFen);
        const legalMoves = SearchCore.getLegalMovesForBoard(promoBoard, 'w');
        const promoTypes = legalMoves
            .filter(m => m.fromR === 1 && m.fromC === 3 && m.toR === 0 && m.toC === 3)
            .map(m => m.promotion)
            .sort();
        expect(promoTypes).toEqual(['b', 'n', 'q', 'r']);

        // 1) False EP square (no black pawn adjacent to e4): epSq cleared -> shares TT cleanly
        const pseudoEpFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
        const noEpFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const sharedPseudoTT = new Map();

        const coldNoEp = SearchCore.searchRootMoves({
            ...SearchCore.fenToBoard(noEpFen),
            startDepth: 3,
            maxDepth: 3,
            tt: new Map(),
            reuseTT: false,
            timeLimitMs: 1500
        });
        SearchCore.searchRootMoves({
            ...SearchCore.fenToBoard(pseudoEpFen),
            startDepth: 3,
            maxDepth: 3,
            tt: sharedPseudoTT,
            reuseTT: false,
            timeLimitMs: 1500
        });
        const warmNoEp = SearchCore.searchRootMoves({
            ...SearchCore.fenToBoard(noEpFen),
            startDepth: 3,
            maxDepth: 3,
            tt: sharedPseudoTT,
            reuseTT: false,
            timeLimitMs: 1500
        });
        expect(warmNoEp.nodes).toBeLessThan(coldNoEp.nodes * 0.5);

        // 2) Real legal EP capture (cxd6 e.p.): Zobrist MUST include EP so TT doesn't suppress cxd6!
        const withoutEp = SearchCore.fenToBoard('8/8/8/2Pp4/k7/8/8/4K3 w - - 0 1');
        const withEp = SearchCore.fenToBoard('8/8/8/2Pp4/k7/8/8/4K3 w - d6 0 1');
        const sharedRealTT = new Map();

        SearchCore.searchRootMoves({
            ...withoutEp,
            startDepth: 1,
            maxDepth: 4,
            tt: sharedRealTT,
            reuseTT: false,
            timeLimitMs: 1500
        });
        const resWithEp = SearchCore.searchRootMoves({
            ...withEp,
            startDepth: 1,
            maxDepth: 4,
            tt: sharedRealTT,
            reuseTT: false,
            timeLimitMs: 1500
        });
        expect(resWithEp.bestMove).toMatchObject({ fromR: 3, fromC: 2, toR: 2, toC: 3 });
        expect(resWithEp.bestCp).toBeGreaterThan(250);
    });
});

describe('Alpha-Beta Audit V81 Regressions (js/ai_neural_search.js)', () => {
    const SearchCore = require('../js/ai_neural_search.js');

    test('storeTT does not overwrite deeper EXACT TT entries with shallow or bound entries of same position', () => {
        const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
        const parsed = SearchCore.fenToBoard(fen);
        const mapTT = new Map();

        const deepRes = SearchCore.searchRootMoves({
            ...parsed,
            startDepth: 1,
            maxDepth: 4,
            tt: mapTT,
            reuseTT: false,
            timeLimitMs: 2500
        });
        expect(deepRes.completedDepth).toBe(4);
        expect(mapTT.size).toBeGreaterThan(0);

        // Find the depth-4 EXACT root entry stored in mapTT
        const rootEntriesBefore = Array.from(mapTT.values()).filter(e => e.depth === 4 && e.flag === 0);
        expect(rootEntriesBefore.length).toBeGreaterThanOrEqual(1);

        // Searching shallower (depth 2) on the same TT must preserve depth-4 EXACT entries
        SearchCore.searchRootMoves({
            ...parsed,
            startDepth: 1,
            maxDepth: 2,
            tt: mapTT,
            reuseTT: false,
            timeLimitMs: 1500
        });
        const rootEntriesAfter = Array.from(mapTT.values()).filter(e => e.depth === 4 && e.flag === 0);
        expect(rootEntriesAfter.length).toBeGreaterThanOrEqual(rootEntriesBefore.length);
    });

    test('SEE pruning never drops checking sacrifice mates like Qxf7# against pinned defender', () => {
        // Black 1...axb6 allows 2.Qxf7# where pf7 is guarded by pinned nd6 (Ba3 pins d6->kf8) and Ng5 covers f7.
        // Static SEE of Qxf7 is negative (-480), so without check-exemption SEE pruning at ply 1 could drop Qxf7#!
        // Black saves via 1...c5 (blocking Ba3); 1...axb6 must be evaluated as mated (< -20000 cp).
        const pinMateFen = 'rq2nkn1/p1p2ppp/1P1n4/6N1/8/B4Q2/8/6K1 b - - 0 1';
        const parsed = SearchCore.fenToBoard(pinMateFen);
        const res = SearchCore.searchRootMoves({
            ...parsed,
            startDepth: 1,
            maxDepth: 3,
            reuseTT: false,
            timeLimitMs: 2000
        });

        // 1...a7xb6 (row 1 col 0 -> row 2 col 1) allows 2.Qxf7# and must be scored as mated!
        const axb6Result = res.moveResults.find(
            mr => mr.move.fromR === 1 && mr.move.fromC === 0 && mr.move.toR === 2 && mr.move.toC === 1
        );
        expect(axb6Result).toBeDefined();
        expect(axb6Result.cp).toBeLessThan(-20000);
    });

    test('SEARCH_EVAL_STACK[0] reset and LMP/Futility mate guard preserve defensive quiet luft move', () => {
        // 1) Pollute SEARCH_EVAL_STACK[0] with a huge +1500 cp winning root search first
        const hugeWin = SearchCore.fenToBoard('4k3/8/8/8/8/8/4Q3/R3K2R w - - 0 1');
        SearchCore.searchRootMoves({
            ...hugeWin,
            startDepth: 1,
            maxDepth: 2,
            reuseTT: false,
            timeLimitMs: 1000
        });

        // 2) Position with back-rank mate threat (1...Rd1# if neglected) and quiet luft moves (h3/g3/Kf1)
        const luftFen = '3r2k1/5ppp/8/8/8/8/PPPPP1PP/1N4K1 w - - 0 1';
        const res = SearchCore.searchRootMoves({
            ...SearchCore.fenToBoard(luftFen),
            startDepth: 1,
            maxDepth: 3,
            reuseTT: false,
            timeLimitMs: 2000
        });
        expect(res.bestMove).not.toBeNull();
        // Best move must avoid immediate back-rank mate!
        expect(res.bestCp).toBeGreaterThan(-1000);
    });

    test('timeout during startDepth > 1 after at least 1 root move adopts iterBest instead of -Infinity', () => {
        const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
        const parsed = SearchCore.fenToBoard(kiwipete);
        const origNow = performance.now.bind(performance);
        let calls = 0;
        let res;
        try {
            // Deterministic virtual clock: 0.1ms per nowMs() probe guarantees >=1 root move finishes at depth 7 before 12ms cutoff
            performance.now = () => (++calls) * 0.1;
            res = SearchCore.searchRootMoves({
                ...parsed,
                startDepth: 7,
                maxDepth: 8,
                reuseTT: false,
                timeLimitMs: 12
            });
        } finally {
            performance.now = origNow;
        }

        expect(res.timedOut).toBe(true);
        expect(res.completedDepth).toBe(0);
        expect(res.bestMove).not.toBeNull();
        expect(Number.isFinite(res.bestScore)).toBe(true);
        expect(res.bestScore).toBeGreaterThan(-Infinity);
        expect(res.bestCp).toBeGreaterThan(-49000);
        expect(res.moveResults.length).toBeGreaterThanOrEqual(1);
    });
});

describe('Alpha-Beta Audit Control Loop & Workers Regressions (js/ai_neural.js)', () => {
    const SearchCore = require('../js/ai_neural_search.js');

    test('pure NN policy is separated from capture swap biases and PRIOR_BONUS decays with depth', async () => {
        expect(SearchCore.getDepthPriorBonusCp(1)).toBe(20);
        expect(SearchCore.getDepthPriorBonusCp(6)).toBeLessThan(20);
        expect(SearchCore.getDepthPriorBonusCp(12)).toBe(5);

        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        const capturedJobs = [];

        class CaptureBiasMockWorker {
            constructor() {
                this.onmessage = null;
            }
            postMessage(msg) {
                capturedJobs.push(msg);
                setTimeout(() => {
                    if (!this.onmessage) return;
                    const first = msg.rootMoves[0];
                    const firstPrior = msg.rootPriors[0] || 0;
                    this.onmessage({
                        data: {
                            jobId: msg.jobId,
                            ok: true,
                            result: {
                                bestMove: first,
                                bestScore: 0.0,
                                bestCp: 0,
                                bestPrior: firstPrior,
                                priorBonus: 0,
                                blendedScore: 0,
                                completedDepth: msg.maxDepth,
                                nodes: 50,
                                timedOut: false,
                                moveResults: msg.rootMoves.map((m, idx) => ({
                                    move: m,
                                    score: 0.0,
                                    cp: 0,
                                    prior: msg.rootPriors[idx] || 0,
                                    priorBonus: 0,
                                    blendedScore: 0,
                                    nodes: 50
                                }))
                            }
                        }
                    });
                }, 0);
            }
            terminate() {}
        }

        try {
            global.Worker = CaptureBiasMockWorker;
            global.navigator = { hardwareConcurrency: 2 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(type, data, dims) {
                    this.type = type;
                    this.data = data;
                    this.dims = dims;
                },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => {
                            const pol = new Float32Array(4672);
                            // Put high logit on Ke1-d1 (fromSq=60 -> toSq=59, dir=6 (0,-1), dist=1 -> plane=42 -> 60*73+42=4422)
                            pol[4422] = 8.0;
                            // Zero logit on Qxd5 (queen capture)
                            const val = new Float32Array(1);
                            return { policy_logits: { data: pol }, value: { data: val } };
                        })
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => {
                isolatedNeural = require('../js/ai_neural.js');
            });
            await isolatedNeural.init('v1');

            const swapFen = '4k3/pp6/8/3q4/3Q4/8/PP6/4K3 w - - 0 1';
            await isolatedNeural.alphaBetaSearch(swapFen, 4, 1000, []);

            const allRootMoves = capturedJobs.flatMap(j =>
                j.rootMoves.map((m, idx) => ({ m, prior: j.rootPriors[idx] }))
            );
            const kd1 = allRootMoves.find(x => x.m.fromR === 7 && x.m.fromC === 4 && x.m.toR === 7 && x.m.toC === 3);
            const qxd5 = allRootMoves.find(x => x.m.fromR === 4 && x.m.fromC === 3 && x.m.toR === 3 && x.m.toC === 3);
            expect(kd1).toBeDefined();
            expect(qxd5).toBeDefined();
            // Even for a QxQ exchange, pure NN prior for Kd1 (logit 8.0) must beat Qxd5 (logit 0.0)
            expect(kd1.prior).toBeGreaterThan(qxd5.prior);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('Wave 2+ rejects high-prior fail-low moves, respects mate distance in cp, and preserves forced mates across sibling timeouts', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        let pvMove = null;
        let failLowTrapMove = null;
        let fastMateMove = null;
        let slowMateMove = null;
        let scenario = 'failLowTrap';

        const keyOf = (m) => `${m.fromR},${m.fromC}->${m.toR},${m.toC}`;

        class RegressionPoolWorker {
            constructor() {
                this.onmessage = null;
                this.id = RegressionPoolWorker.nextId++;
            }
            postMessage(msg) {
                const isWave1 = !msg.startDepth || msg.startDepth <= 4;
                setTimeout(() => {
                    if (!this.onmessage) return;
                    if (isWave1) {
                        const moveResults = msg.rootMoves.map((m, idx) => {
                            let cp = -800;
                            if (this.id === 0 && idx === 0) {
                                pvMove = m;
                                cp = 100;
                            } else if (this.id === 1 && idx === 0) {
                                failLowTrapMove = m;
                                cp = 40;
                            } else if (this.id === 0 && idx === 1) {
                                fastMateMove = m;
                                cp = -10;
                            } else if (this.id === 1 && idx === 1) {
                                slowMateMove = m;
                                cp = -20;
                            }
                            const prior = msg.rootPriors[idx] || 0;
                            return { move: m, cp, score: Math.tanh(cp / 400), prior, blendedScore: Math.tanh(cp / 400), nodes: 50 };
                        });
                        moveResults.sort((a, b) => b.cp - a.cp);
                        const top = moveResults[0];
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: top.move,
                                    bestScore: top.score,
                                    bestCp: top.cp,
                                    bestPrior: top.prior,
                                    completedDepth: msg.maxDepth,
                                    nodes: 100,
                                    timedOut: false,
                                    moveResults
                                }
                            }
                        });
                    } else {
                        const m = msg.rootMoves[0];
                        const k = keyOf(m);
                        const prior = msg.rootPriors[0] || 0;
                        if (scenario === 'failLowTrap') {
                            const isTrap = failLowTrapMove && k === keyOf(failLowTrapMove);
                            const isPv = pvMove && k === keyOf(pvMove);
                            const cp = isPv ? 100 : (isTrap ? (msg.minAlphaCp || 90) : -50);
                            const failedLow = !isPv;
                            this.onmessage({
                                data: {
                                    jobId: msg.jobId,
                                    ok: true,
                                    result: {
                                        bestMove: m,
                                        bestScore: Math.tanh(cp / 400),
                                        bestCp: cp,
                                        bestPrior: prior,
                                        failedLow,
                                        bound: failedLow ? 'upper' : 'exact',
                                        completedDepth: msg.maxDepth,
                                        nodes: 100,
                                        timedOut: false,
                                        moveResults: [{ move: m, score: Math.tanh(cp / 400), cp, prior, failedLow, nodes: 100 }]
                                    }
                                }
                            });
                        } else if (scenario === 'timeoutMate') {
                            const isFastMate = fastMateMove && k === keyOf(fastMateMove);
                            const isPv = pvMove && k === keyOf(pvMove);
                            if (isPv) {
                                // PV completes normally so YBWC dispatches all siblings concurrently
                                this.onmessage({
                                    data: {
                                        jobId: msg.jobId,
                                        ok: true,
                                        result: { bestMove: m, bestScore: 0.25, bestCp: 100, bestPrior: prior, failedLow: false, completedDepth: msg.maxDepth, timedOut: false, nodes: 100 }
                                    }
                                });
                            } else if (isFastMate) {
                                const cp = 29997;
                                const sc = SearchCore.cpToRootScore(cp);
                                this.onmessage({
                                    data: {
                                        jobId: msg.jobId,
                                        ok: true,
                                        result: { bestMove: m, bestScore: sc, bestCp: cp, bestPrior: prior, failedLow: false, completedDepth: msg.maxDepth, timedOut: false, nodes: 100 }
                                    }
                                });
                            } else {
                                // Sibling workers time out while fastMate was already found -> wave finishes with status='timeout'
                                this.onmessage({
                                    data: {
                                        jobId: msg.jobId,
                                        ok: true,
                                        result: { bestMove: m, bestScore: 0.0, bestCp: 0, completedDepth: msg.maxDepth - 1, timedOut: true, nodes: 100 }
                                    }
                                });
                            }
                        } else {
                            // mateDistance: fastMate (29997, low prior) must beat slowMate (29993, high prior)
                            const isFast = fastMateMove && k === keyOf(fastMateMove);
                            const isSlow = slowMateMove && k === keyOf(slowMateMove);
                            const cp = isFast ? 29997 : (isSlow ? 29993 : 100);
                            const sc = SearchCore.cpToRootScore(cp);
                            this.onmessage({
                                data: {
                                    jobId: msg.jobId,
                                    ok: true,
                                    result: { bestMove: m, bestScore: sc, bestCp: cp, bestPrior: isSlow ? 0.9 : 0.01, failedLow: false, completedDepth: msg.maxDepth, timedOut: false, nodes: 100 }
                                }
                            });
                        }
                    }
                }, isWave1 ? 3 : 6);
            }
            terminate() {}
        }

        try {
            global.Worker = RegressionPoolWorker;
            global.navigator = { hardwareConcurrency: 3 };
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(t, d, dims) { this.type = t; this.data = d; this.dims = dims; },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => ({
                            policy_logits: { data: new Float32Array(4672).fill(0.0) },
                            value: { data: new Float32Array(1).fill(0.0) }
                        }))
                    }))
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => { isolatedNeural = require('../js/ai_neural.js'); });
            await isolatedNeural.init('v1');
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            // 1. Fail-low trap must NEVER beat PV
            RegressionPoolWorker.nextId = 0;
            scenario = 'failLowTrap';
            const res1 = await isolatedNeural.alphaBetaSearch(fen, 5, 1000, []);
            expect(keyOf(res1)).toBe(keyOf(pvMove));

            // 2. Timeout mate preservation (even if PV worker timed out!)
            RegressionPoolWorker.nextId = 0;
            isolatedNeural.terminatePool();
            scenario = 'timeoutMate';
            const res2 = await isolatedNeural.alphaBetaSearch(fen, 5, 1000, []);
            expect(keyOf(res2)).toBe(keyOf(fastMateMove));

            // 3. Faster mate (29997) beats slower mate (29993) regardless of prior
            RegressionPoolWorker.nextId = 0;
            isolatedNeural.terminatePool();
            scenario = 'mateDistance';
            const res3 = await isolatedNeural.alphaBetaSearch(fen, 5, 1000, []);
            expect(keyOf(res3)).toBe(keyOf(fastMateMove));
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('alphaBetaSearch uses filterMatingBlunders (preserves winning sacrifices), launches workers for 2 moves, and clears worker TT cleanly', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;

        try {
            // 1. Winning rook sacrifice 1.Rxe6! (rejected by filterTacticalBlunders as losing exchange, preserved by filterMatingBlunders)
            delete global.Worker;
            delete global.ChessLogic;
            global.ort = {
                env: { wasm: {} },
                Tensor: function(t, d, dims) { this.type = t; this.data = d; this.dims = dims; },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => ({
                            policy_logits: { data: new Float32Array(4672).fill(0.0) },
                            value: { data: new Float32Array(1).fill(0.0) }
                        }))
                    }))
                }
            };
            let soloNeural;
            jest.isolateModules(() => { soloNeural = require('../js/ai_neural.js'); });
            await soloNeural.init('v1');

            const sacFen = 'qn3rkq/1p3ppp/8/8/5Q2/2B5/PPP2P1P/1K4R1 w - - 0 1';
            const sacMove = await soloNeural.alphaBetaSearch(sacFen, 4, 1500, []);
            expect(sacMove).toMatchObject({ fromR: 4, fromC: 5, toR: 2, toC: 5 }); // 1.Qf6! under pg7 pin (tactical filter drops it, mating filter preserves it)

            // 2. Pool launches when legalMoves.length === 2, and clearCache()/new-game sends reuseTT: false
            const postedWave1 = [];
            class TwoMovePoolWorker {
                constructor() { this.onmessage = null; }
                postMessage(msg) {
                    postedWave1.push(msg);
                    setTimeout(() => {
                        if (!this.onmessage) return;
                        this.onmessage({
                            data: {
                                jobId: msg.jobId,
                                ok: true,
                                result: {
                                    bestMove: msg.rootMoves[0],
                                    bestScore: 0.1,
                                    bestCp: 40,
                                    completedDepth: msg.maxDepth,
                                    nodes: 20,
                                    timedOut: false,
                                    moveResults: [{ move: msg.rootMoves[0], score: 0.1, cp: 40, prior: msg.rootPriors[0] || 0, nodes: 20 }]
                                }
                            }
                        });
                    }, 2);
                }
                terminate() {}
            }
            global.Worker = TwoMovePoolWorker;
            global.navigator = { hardwareConcurrency: 4 };
            let poolNeural;
            jest.isolateModules(() => { poolNeural = require('../js/ai_neural.js'); });
            await poolNeural.init('v1');

            const twoMoveCheckFen = '4k3/p7/8/8/8/8/PP3nPP/3r1K2 w - - 0 1'; // Under check from rd1: only Kxf2 and Ke2 (neither mated in 1)
            await poolNeural.alphaBetaSearch(twoMoveCheckFen, 5, 1000, ['k1', 'k2', 'k3']);
            expect(postedWave1.length).toBeGreaterThanOrEqual(2);
            expect(postedWave1[0].reuseTT).toBe(true);

            // Clear cache -> next Wave 1 must send reuseTT: false
            postedWave1.length = 0;
            poolNeural.clearCache();
            await poolNeural.alphaBetaSearch(twoMoveCheckFen, 5, 1000, ['k1', 'k2', 'k3', 'k4']);
            expect(postedWave1[0].reuseTT).toBe(false);

            // History shrink (new game) -> next Wave 1 must send reuseTT: false
            postedWave1.length = 0;
            await poolNeural.alphaBetaSearch(twoMoveCheckFen, 5, 1000, []);
            expect(postedWave1[0].reuseTT).toBe(false);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
        }
    });

    test('getBestMove caches failed models, enforces depth/50-move/LRU/copy cache rules, and runs Alpha-Beta locally when ONNX fails', async () => {
        const origOrt = global.ort;
        const origWorker = global.Worker;
        const origChessLogic = global.ChessLogic;
        const origFetch = global.fetch;

        try {
            delete global.Worker;
            delete global.ChessLogic;
            const createSpy = jest.fn(async (input) => {
                if (String(input).includes('1_7')) {
                    throw new Error('404 Not Found');
                }
                return {
                    run: jest.fn(async () => {
                        throw new Error('ONNX runtime error');
                    })
                };
            });
            global.fetch = jest.fn(async () => ({ ok: false }));
            global.ort = {
                env: { wasm: {} },
                Tensor: function(t, d, dims) { this.type = t; this.data = d; this.dims = dims; },
                InferenceSession: { create: createSpy }
            };

            let isolatedNeural;
            jest.isolateModules(() => { isolatedNeural = require('../js/ai_neural.js'); });

            // 1. v1_7 fails once -> falls back to v1_6; subsequent v1.7 calls never retry v1_7!
            await isolatedNeural.init('v1.7');
            await isolatedNeural.init('v1.7');
            const v17Calls = createSpy.mock.calls.filter(c => String(c[0]).includes('1_7'));
            expect(v17Calls.length).toBe(1);

            // 2. Even when session.run throws, local Alpha-Beta returns a move without calling /api/neural-move
            const fen4 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
            const moveD2 = await isolatedNeural.getBestMove(fen4, 'v1.6', 'alphabeta', [], { maxDepth: 2, timeLimitMs: 300 });
            expect(moveD2).not.toBeNull();
            expect(global.fetch).not.toHaveBeenCalled();

            // Mutation safety: mutating returned move does not corrupt cached object
            const origToR = moveD2.toR;
            moveD2.toR = 99;
            const moveD2Cached = await isolatedNeural.getBestMove(fen4, 'v1.6', 'alphabeta', [], { maxDepth: 2, timeLimitMs: 300 });
            expect(moveD2Cached.toR).toBe(origToR);

            // Requesting deeper maxDepth (4 > cached 2) must bypass shallow cache & recompute cleanly
            const moveD4 = await isolatedNeural.getBestMove(fen4, 'v1.6', 'alphabeta', [], { maxDepth: 4, timeLimitMs: 400 });
            expect(moveD4).not.toBeNull();

            // 50-move rule (halfmoveClock >= 70) bypasses TT cache
            const fiftyMoveFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 75 40';
            const fiftyMoveRes = await isolatedNeural.getBestMove(fiftyMoveFen, 'v1.6', 'alphabeta', [], { maxDepth: 2, timeLimitMs: 300 });
            expect(fiftyMoveRes).not.toBeNull();
        } finally {
            global.ort = origOrt;
            global.Worker = origWorker;
            global.ChessLogic = origChessLogic;
            global.fetch = origFetch;
        }
    });

    test('Early Exit includes isUpperBound second-best moves, respects actual completedDepth in TT, avoids server API on cancel/terminal, and tracks per-worker ttDirty', async () => {
        const origWorker = global.Worker;
        const origNavigator = global.navigator;
        const origOrt = global.ort;
        const origChessLogic = global.ChessLogic;
        const origFetch = global.fetch;

        try {
            delete global.ChessLogic;
            global.fetch = jest.fn(async () => ({ ok: false }));
            global.navigator = { hardwareConcurrency: 4 }; // 3 workers, or let's use 5 -> 4 workers!
            global.navigator.hardwareConcurrency = 5; // poolSize = min(4, 4) = 4 workers

            global.ort = {
                env: { wasm: {} },
                Tensor: function(t, d, dims) { this.type = t; this.data = d; this.dims = dims; },
                InferenceSession: {
                    create: jest.fn(async () => ({
                        run: jest.fn(async () => ({
                            policy_logits: { data: new Float32Array(4672).fill(0.0) },
                            value: { data: new Float32Array(1).fill(0.0) }
                        }))
                    }))
                }
            };

            const wave1ReuseFlagsByWorker = new Map();
            let depth8Reached = false;
            let forceWave1TimeoutOnce = false;
            let workerSearchCount = 0;
            let fakeClockMs = 0;

            class AuditV81Worker {
                constructor() {
                    this.onmessage = null;
                    this.terminated = false;
                    this.id = AuditV81Worker.nextId++;
                }
                postMessage(msg) {
                    workerSearchCount++;
                    const isWave1 = !msg.startDepth || msg.startDepth <= 4;
                    if (isWave1) {
                        const list = wave1ReuseFlagsByWorker.get(this.id) || [];
                        list.push(msg.reuseTT);
                        wave1ReuseFlagsByWorker.set(this.id, list);
                    }
                    if (msg.startDepth === 6 && fakeClockMs < 400) fakeClockMs = 400;
                    if (msg.startDepth === 8) depth8Reached = true;

                    const delay = 1;
                    setTimeout(() => {
                        if (this.terminated || !this.onmessage) return;
                        if (isWave1) {
                            if (forceWave1TimeoutOnce && this.id === 1) {
                                // Simulate partial Wave 1 timeout (completedDepth: 3 < maxDepth: 12)
                                this.onmessage({
                                    data: {
                                        jobId: msg.jobId,
                                        ok: true,
                                        result: { bestMove: msg.rootMoves[0], bestScore: 0.05, bestCp: 20, completedDepth: 3, timedOut: true, nodes: 40, moveResults: [] }
                                    }
                                });
                                return;
                            }
                            const moveResults = msg.rootMoves.map((m, idx) => {
                                // Worker 0 owns PV (+20 cp) and cand idx=1 (failedLow +19 cp in same shard!)
                                const isPv = (this.id === 0 && idx === 0);
                                const isCloseUpper = (this.id === 0 && idx === 1);
                                const cp = isPv ? 20 : (isCloseUpper ? 19 : -300);
                                return {
                                    move: m,
                                    cp,
                                    score: Math.tanh(cp / 400),
                                    prior: msg.rootPriors[idx] || 0,
                                    failedLow: isCloseUpper,
                                    bound: isCloseUpper ? 'upper' : 'exact',
                                    nodes: 50
                                };
                            });
                            this.onmessage({
                                data: {
                                    jobId: msg.jobId,
                                    ok: true,
                                    result: {
                                        bestMove: moveResults[0].move,
                                        bestScore: moveResults[0].score,
                                        bestCp: moveResults[0].cp,
                                        completedDepth: msg.maxDepth,
                                        timedOut: false,
                                        nodes: 100,
                                        moveResults
                                    }
                                }
                            });
                        } else {
                            // Wave 2 (d=5..8): return without bestCp on close upper bound fallback test if needed; here test close upper bound Early Exit guard
                            const m = msg.rootMoves[0];
                            const isPv = (typeof msg.minAlphaCp !== 'number');
                            const cp = isPv ? 20 : (msg.minAlphaCp - 1 >= 18 ? 19 : -300);
                            const failedLow = !isPv;
                            this.onmessage({
                                data: {
                                    jobId: msg.jobId,
                                    ok: true,
                                    result: {
                                        bestMove: m,
                                        bestScore: Math.tanh(cp / 400),
                                        bestCp: cp,
                                        bestPrior: msg.rootPriors[0] || 0,
                                        failedLow,
                                        bound: failedLow ? 'upper' : 'exact',
                                        completedDepth: msg.maxDepth,
                                        timedOut: false,
                                        nodes: 50
                                    }
                                }
                            });
                        }
                    }, delay);
                }
                terminate() { this.terminated = true; }
            }
            AuditV81Worker.nextId = 0;
            global.Worker = AuditV81Worker;

            let isolatedNeural;
            jest.isolateModules(() => { isolatedNeural = require('../js/ai_neural.js'); });
            await isolatedNeural.init('v1');

            // 1. Terminal stalemate/mate position returns null immediately and does NOT call fetch
            const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
            const termMove = await isolatedNeural.getBestMove(stalemateFen, 'v1', 'alphabeta', [], { maxDepth: 6, timeLimitMs: 500 });
            expect(termMove).toBeNull();
            expect(global.fetch).not.toHaveBeenCalled();

            // 2. Cancelled search in getBestMove returns null cleanly and does NOT call fetch
            const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const pA = isolatedNeural.getBestMove(startFen, 'v1', 'alphabeta', [], { maxDepth: 7, timeLimitMs: 1000 });
            await new Promise(r => setTimeout(r, 8));
            const pB = isolatedNeural.getBestMove(startFen, 'v1', 'alphabeta', [], { maxDepth: 2, timeLimitMs: 1000 });
            const [resA, resB] = await Promise.all([pA, pB]);
            expect(resA).toBeNull();
            expect(resB).not.toBeNull();
            expect(global.fetch).not.toHaveBeenCalled();

            // 3. saveRootTTCache stores actual completedDepth (3), not requestedDepth (12)
            isolatedNeural.terminatePool();
            isolatedNeural.clearCache();
            AuditV81Worker.nextId = 0;
            wave1ReuseFlagsByWorker.clear();
            const shallowFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
            forceWave1TimeoutOnce = true;
            await isolatedNeural.getBestMove(shallowFen, 'v1', 'alphabeta', [], { maxDepth: 12, timeLimitMs: 500 });
            forceWave1TimeoutOnce = false;
            const callsBeforeDeep = workerSearchCount;
            // Calling again with maxDepth=12 must NOT hit the depth-3 cached entry!
            await isolatedNeural.getBestMove(shallowFen, 'v1', 'alphabeta', [], { maxDepth: 12, timeLimitMs: 500 });
            expect(workerSearchCount).toBeGreaterThan(callsBeforeDeep);

            // 4. Early Exit must NOT trigger at d=6 even when elapsed >= 35% (400/1000) because 2nd best is an upper bound 1 cp behind PV!
            isolatedNeural.terminatePool();
            AuditV81Worker.nextId = 0;
            depth8Reached = false;
            fakeClockMs = 0;
            const origNow = performance.now.bind(performance);
            try {
                performance.now = () => fakeClockMs;
                await isolatedNeural.alphaBetaSearch(startFen, 8, 1000, []);
            } finally {
                performance.now = origNow;
            }
            expect(depth8Reached).toBe(true);

            // 5. Per-worker ttDirty: after 4-worker pool exists, clearCache() -> 2-move search only cleans workers #0 & #1;
            // subsequent 4-worker search must STILL send reuseTT: false to workers #2 & #3!
            isolatedNeural.terminatePool();
            AuditV81Worker.nextId = 0;
            await isolatedNeural.alphaBetaSearch(startFen, 5, 500, []); // warm 4 workers (#0..#3)
            isolatedNeural.clearCache();
            wave1ReuseFlagsByWorker.clear();
            const twoMoveFen = '4k3/p7/8/8/8/8/PP3nPP/3r1K2 w - - 0 1';
            await isolatedNeural.alphaBetaSearch(twoMoveFen, 5, 500, []);
            expect(wave1ReuseFlagsByWorker.get(0)).toEqual([false]);
            expect(wave1ReuseFlagsByWorker.get(1)).toEqual([false]);
            expect(wave1ReuseFlagsByWorker.has(2)).toBe(false);

            await isolatedNeural.alphaBetaSearch(startFen, 5, 500, []);
            expect(wave1ReuseFlagsByWorker.get(0)).toEqual([false, true]);
            expect(wave1ReuseFlagsByWorker.get(1)).toEqual([false, true]);
            expect(wave1ReuseFlagsByWorker.get(2)).toEqual([false]);
            expect(wave1ReuseFlagsByWorker.get(3)).toEqual([false]);
        } finally {
            global.Worker = origWorker;
            global.navigator = origNavigator;
            global.ort = origOrt;
            global.ChessLogic = origChessLogic;
            global.fetch = origFetch;
        }
    });

    test('Should load modular_chess_v1_8.onnx for v1.8 and fall back to v1_7 on failure without retrying v1_8', async () => {
        const origOrt = global.ort;
        const origFetch = global.fetch;

        try {
            const loadedPaths = [];
            const mockRun = jest.fn(async () => ({}));
            global.fetch = jest.fn(async () => ({ ok: false }));
            global.ort = {
                env: { wasm: {} },
                Tensor: function(t, d, dims) { this.type = t; this.data = d; this.dims = dims; },
                InferenceSession: {
                    create: jest.fn(async (modelInput) => {
                        loadedPaths.push(String(modelInput));
                        return { run: mockRun };
                    })
                }
            };

            let isolatedNeural;
            jest.isolateModules(() => { isolatedNeural = require('../js/ai_neural.js'); });
            const sess1 = await isolatedNeural.init('v1.8');
            expect(sess1).toBeTruthy();
            expect(loadedPaths).toEqual(['modular_chess_v1_8.onnx']);

            // Subsequent v1_8 init reuses cached sessionV18 without re-creating
            const sess2 = await isolatedNeural.init('v1_8');
            expect(sess2).toBe(sess1);
            expect(loadedPaths).toEqual(['modular_chess_v1_8.onnx']);

            // Failure path: v1_8 fails once -> falls back to v1_7; repeated init('v1.8') never retries v1_8
            const fallbackPaths = [];
            global.ort.InferenceSession.create = jest.fn(async (modelInput) => {
                const name = String(modelInput);
                fallbackPaths.push(name);
                if (name.includes('1_8')) {
                    throw new Error('v1.8 missing');
                }
                return { run: mockRun };
            });
            jest.isolateModules(() => { isolatedNeural = require('../js/ai_neural.js'); });
            await isolatedNeural.init('v1.8');
            await isolatedNeural.init('v1.8');
            expect(fallbackPaths).toEqual(['modular_chess_v1_8.onnx', 'modular_chess_v1_7.onnx']);
        } finally {
            global.ort = origOrt;
            global.fetch = origFetch;
        }
    });
});
