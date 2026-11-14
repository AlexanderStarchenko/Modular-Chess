const ChessSyzygy = require('../js/syzygy.js');

describe('Syzygy Endgame Tablebases (Up to 7 pieces)', () => {
    describe('Board State & Piece Counting', () => {
        test('correctly counts pieces in start position', () => {
            const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            expect(ChessSyzygy.countPieces(startFen)).toBe(32);
            expect(ChessSyzygy.isTablebasePosition(startFen)).toBe(false);
        });

        test('identifies tablebase endgame positions (<= 7 pieces)', () => {
            const kpkFen = '4k3/8/4P3/4K3/8/8/8/8 w - - 0 1'; // 3 pieces
            expect(ChessSyzygy.countPieces(kpkFen)).toBe(3);
            expect(ChessSyzygy.isTablebasePosition(kpkFen)).toBe(true);

            const sevenPieceFen = '4k3/8/8/8/2P1P1P1/8/8/K3Q1R1 w - - 0 1'; // 6 pieces
            expect(ChessSyzygy.isTablebasePosition(sevenPieceFen)).toBe(true);

            const eightPieceFen = '4k3/8/8/2P1P1P1/2P5/8/8/K3Q1R1 w - - 0 1'; // 8 pieces
            expect(ChessSyzygy.isTablebasePosition(eightPieceFen)).toBe(false);
        });

        test('rejects malformed or non-chess strings', () => {
            expect(ChessSyzygy.isTablebasePosition('')).toBe(false);
            expect(ChessSyzygy.isTablebasePosition(null)).toBe(false);
            expect(ChessSyzygy.isTablebasePosition('some_fen')).toBe(false);
            // Castling rights are unsupported by Syzygy
            expect(ChessSyzygy.isTablebasePosition('4k3/8/8/8/8/8/4P3/R3K3 w Q - 0 1')).toBe(false);
            // Must have exactly one king of each color
            expect(ChessSyzygy.isTablebasePosition('4k3/8/8/8/8/8/4K3/4K3 w - - 0 1')).toBe(false);
            expect(ChessSyzygy.isTablebasePosition('8/8/8/8/8/8/4P3/4K3 w - - 0 1')).toBe(false);
        });
    });

    describe('UCI Move Parsing', () => {
        test('converts standard UCI moves to board coordinates', () => {
            const m = ChessSyzygy.parseUCI('e2e4');
            expect(m).toEqual({ fromR: 6, fromC: 4, toR: 4, toC: 4, promotion: null });

            const promo = ChessSyzygy.parseUCI('e7e8q');
            expect(promo).toEqual({ fromR: 1, fromC: 4, toR: 0, toC: 4, promotion: 'q' });
        });

        test('handles invalid or out-of-bounds UCI strings', () => {
            expect(ChessSyzygy.parseUCI(null)).toBeNull();
            expect(ChessSyzygy.parseUCI('(none)')).toBeNull();
            expect(ChessSyzygy.parseUCI('zz99')).toBeNull();
            expect(ChessSyzygy.parseUCI('a9a0')).toBeNull();
            expect(ChessSyzygy.parseUCI('e1e9')).toBeNull();
            expect(ChessSyzygy.parseUCI('e7e8x')).toBeNull();
        });
    });

    describe('Best Move Selection Logic', () => {
        test('selects move with fastest checkmate (lowest |dtm|) for winning positions', () => {
            const mockData = {
                category: 'win',
                moves: [
                    { uci: 'e5d5', category: 'loss', dtz: -6, dtm: -30 },
                    { uci: 'e5f6', category: 'loss', dtz: -2, dtm: -26 }, // Fastest win
                    { uci: 'e5d4', category: 'draw', dtz: 0, dtm: 0 }
                ]
            };
            const best = ChessSyzygy.pickBestMove(mockData);
            expect(best.uci).toBe('e5f6');
        });

        test('always prefers immediate checkmate even when dtm is null', () => {
            const mockData = {
                category: 'win',
                moves: [
                    { uci: 'e5f6', category: 'loss', dtz: -1, dtm: null, checkmate: false },
                    { uci: 'd6h6', category: 'loss', dtz: -1, dtm: null, checkmate: true, san: 'Qh6#' }
                ]
            };
            const best = ChessSyzygy.pickBestMove(mockData);
            expect(best.uci).toBe('d6h6');
        });

        test('prefers zeroing moves (pawn promotion/capture) over king shuffle when dtm is null', () => {
            const mockData = {
                category: 'win',
                moves: [
                    { uci: 'g5g6', category: 'loss', dtz: -2, dtm: null, zeroing: false },
                    { uci: 'h7h8q', category: 'loss', dtz: -14, dtm: null, zeroing: true }
                ]
            };
            const best = ChessSyzygy.pickBestMove(mockData);
            expect(best.uci).toBe('h7h8q');
        });

        test('supports hyphenated Lichess categories and cursed-win/blessed-loss', () => {
            const maybeWinData = {
                category: 'maybe-win',
                moves: [
                    { uci: 'a1a2', category: 'draw', dtz: 0, dtm: null },
                    { uci: 'b1c3', category: 'syzygy-loss', dtz: -4, dtm: null, zeroing: false }
                ]
            };
            expect(ChessSyzygy.pickBestMove(maybeWinData).uci).toBe('b1c3');

            const blessedLossData = {
                category: 'blessed-loss',
                moves: [
                    { uci: 'e2e4', category: 'cursed-win', dtz: 10, dtm: null, zeroing: true },
                    { uci: 'e1d2', category: 'cursed-win', dtz: 80, dtm: null, zeroing: false }
                ]
            };
            expect(ChessSyzygy.pickBestMove(blessedLossData).uci).toBe('e1d2');
        });

        test('prefers precise_dtz over dtz and does not mutate input moves', () => {
            const inputMoves = [
                { uci: 'e7d8', category: 'win', dtz: 3, precise_dtz: 12, dtm: null, zeroing: false },
                { uci: 'e7d7', category: 'win', dtz: 3, precise_dtz: 27, dtm: null, zeroing: false }
            ];
            const snapshot = JSON.stringify(inputMoves);
            const best = ChessSyzygy.pickBestMove({ category: 'loss', moves: inputMoves });
            expect(best.uci).toBe('e7d7');
            expect(JSON.stringify(inputMoves)).toBe(snapshot);
        });

        test('selects longest resistance (highest |dtm|) for losing positions', () => {
            const mockData = {
                category: 'loss',
                moves: [
                    { uci: 'e7d8', category: 'win', dtz: 3, dtm: 23 },
                    { uci: 'e7d7', category: 'win', dtz: 3, dtm: 27 }, // Longest resistance
                    { uci: 'e7f7', category: 'win', dtz: 3, dtm: 25 }
                ]
            };
            const best = ChessSyzygy.pickBestMove(mockData);
            expect(best.uci).toBe('e7d7');
        });

        test('selects drawing moves for drawn positions', () => {
            const mockData = {
                category: 'draw',
                moves: [
                    { uci: 'e4f4', category: 'draw', dtz: 0, dtm: 0 },
                    { uci: 'e4d5', category: 'draw', dtz: 0, dtm: 0 }
                ]
            };
            const best = ChessSyzygy.pickBestMove(mockData);
            expect(best.category).toBe('draw');
        });

        test('prefers zeroing moves in cursed-win and prioritizes blessed-loss > draw > cursed-win in draw', () => {
            const cursedWinData = {
                category: 'cursed-win',
                moves: [
                    { uci: 'e5f6', category: 'blessed-loss', dtz: -2, dtm: null, zeroing: false },
                    { uci: 'h7h8q', category: 'blessed-loss', dtz: -40, dtm: null, zeroing: true }
                ]
            };
            expect(ChessSyzygy.pickBestMove(cursedWinData).uci).toBe('h7h8q');

            const unsortedDraw1 = {
                category: 'draw',
                moves: [
                    { uci: 'a1a2', category: 'cursed-win', dtz: 10 },
                    { uci: 'b1b2', category: 'draw', dtz: 0 },
                    { uci: 'c1c2', category: 'blessed-loss', dtz: -50 }
                ]
            };
            expect(ChessSyzygy.pickBestMove(unsortedDraw1).uci).toBe('c1c2');

            const unsortedDraw2 = {
                category: 'draw',
                moves: [
                    { uci: 'a1a2', category: 'cursed-win', dtz: 10 },
                    { uci: 'b1b2', category: 'draw', dtz: 0 }
                ]
            };
            expect(ChessSyzygy.pickBestMove(unsortedDraw2).uci).toBe('b1b2');
        });
    });

    describe('Cache Normalization, Deduplication & Rate Limiting', () => {
        const originalFetch = global.fetch;

        beforeEach(() => {
            ChessSyzygy.clearCache();
        });

        afterEach(() => {
            global.fetch = originalFetch;
            ChessSyzygy.clearCache();
        });

        test('normalizes FEN key ignoring fullmove number and deduplicates in-flight requests', async () => {
            let calls = 0;
            global.fetch = jest.fn(async () => {
                calls++;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        category: 'win',
                        moves: [{ uci: 'e5f6', category: 'loss', dtz: -2, dtm: -20 }]
                    })
                };
            });

            const fenMove10 = '8/3k4/8/4K3/4P3/8/8/8 w - - 0 10';
            const fenMove42 = '8/3k4/8/4K3/4P3/8/8/8 w - - 0 42';

            // Simultaneous parallel probes share one in-flight request
            const [m1, m2] = await Promise.all([
                ChessSyzygy.probe(fenMove10),
                ChessSyzygy.probe(fenMove42)
            ]);

            expect(calls).toBe(1);
            expect(m1.uci).toBe('e5f6');
            expect(m2.uci).toBe('e5f6');
        });

        test('backs off Lichess requests after HTTP 429 without calling relative URL in Node', async () => {
            const fetchedUrls = [];
            global.fetch = jest.fn(async (url) => {
                fetchedUrls.push(url);
                return {
                    ok: false,
                    status: 429,
                    headers: { get: () => '60' }
                };
            });

            const res1 = await ChessSyzygy.probe('8/3k4/8/4K3/4P3/8/8/8 w - - 0 1');
            const res2 = await ChessSyzygy.probe('8/3k4/8/4K3/4P3/8/8/8 w - - 1 2');

            expect(res1).toBeNull();
            expect(res2).toBeNull();
            expect(fetchedUrls.length).toBe(1); // 2nd probe skipped Lichess during cooldown, no /api/tablebase in Node
            expect(fetchedUrls[0]).toContain('tablebase.lichess.ovh');
        });
    });

    describe('End-to-End Probing', () => {
        test('probes winning King+Pawn vs King opposition', async () => {
            // White king on e5, pawn on e4, Black king on d7 -> White to move: 1.Kf6 wins!
            const winFen = '8/3k4/8/4K3/4P3/8/8/8 w - - 0 1';
            const move = await ChessSyzygy.probe(winFen);
            expect(move).not.toBeNull();
            expect(move.isSyzygy).toBe(true);
            expect(move.uci).toBe('e5f6');
            expect(move.fromR).toBe(3);
            expect(move.fromC).toBe(4);
            expect(move.toR).toBe(2);
            expect(move.toC).toBe(5);
        }, 10000);
    });
});
