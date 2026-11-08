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
        });
    });

    describe('UCI Move Parsing', () => {
        test('converts standard UCI moves to board coordinates', () => {
            const m = ChessSyzygy.parseUCI('e2e4');
            expect(m).toEqual({ fromR: 6, fromC: 4, toR: 4, toC: 4, promotion: null });

            const promo = ChessSyzygy.parseUCI('e7e8q');
            expect(promo).toEqual({ fromR: 1, fromC: 4, toR: 0, toC: 4, promotion: 'q' });
        });

        test('handles invalid or empty UCI strings', () => {
            expect(ChessSyzygy.parseUCI(null)).toBeNull();
            expect(ChessSyzygy.parseUCI('(none)')).toBeNull();
            expect(ChessSyzygy.parseUCI('zz99')).toBeNull();
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
