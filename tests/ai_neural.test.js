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

        const move1 = await neural.getBestMove(fen, 'v1', 'alphabeta', history);
        expect(move1).toBeDefined();

        // Second call with same position should hit transposition table or book
        const move2 = await neural.getBestMove(fen, 'v1', 'alphabeta', history);
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
});
