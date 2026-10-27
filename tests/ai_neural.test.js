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
});
