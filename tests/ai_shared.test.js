/**
 * Advanced Chess AI Shared Logic Tests
 */
const ChessLogic = require('../js/logic.js');
const ChessAIShared = require('../js/ai_shared.js');

describe('ChessAIShared - Engine IQ & Evaluation', () => {
    beforeEach(() => {
        ChessLogic.initBoard();
    });

    test('evaluateBoard: Materialistic symmetry', () => {
        const board = ChessLogic.getBoard();
        const evaluation = ChessAIShared.evaluateBoard(board);
        expect(evaluation).toBe(0);
    });

    test('evaluateBoard: Center control bonus (Knight)', () => {
        ChessLogic.loadFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
        const board = ChessLogic.getBoard();
        
        board[7][0] = 'N'; // White Knight on A1
        const edgeEval = ChessAIShared.evaluateBoard(board);

        board[7][0] = null;
        board[4][4] = 'N'; // White Knight on E4
        const centerEval = ChessAIShared.evaluateBoard(board);

        expect(centerEval).toBeGreaterThan(edgeEval);
    });

    test('minimax: Detects forced mate in 1', () => {
        // White to move, mate in 1 via Qg7#
        const mateIn1 = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
        ChessLogic.loadFen(mateIn1);
        const board = ChessLogic.getBoard();
        
        // At depth 1, white should find the mate score
        const score = ChessAIShared.minimax(board, 1, true, -Infinity, Infinity, ChessLogic);
        expect(score).toBe(100000);
    });

    test('minimax: Detects black checkmate (White has no moves)', () => {
        // Back-rank mate: White King on G1 is mated by Black Rook on A1.
        // White pawns on F2, G2, H2 block all escape squares.
        const blackMatesFen = '6k1/5ppp/8/8/8/8/5PPP/r5K1 w - - 0 1';
        ChessLogic.loadFen(blackMatesFen);
        const board = ChessLogic.getBoard();

        // White to move (isMaximizing=true), but white is mated
        const score = ChessAIShared.minimax(board, 1, true, -Infinity, Infinity, ChessLogic);
        expect(score).toBe(-100000);
    });

    test('Stalemate detection', () => {
        const stalemateFen = 'k7/1Q6/8/8/8/8/8/K7 b - - 0 1';
        ChessLogic.loadFen(stalemateFen);
        const board = ChessLogic.getBoard();
        
        const score = ChessAIShared.minimax(board, 1, false, -Infinity, Infinity, ChessLogic);
        expect(score).toBe(0);
    });
});
