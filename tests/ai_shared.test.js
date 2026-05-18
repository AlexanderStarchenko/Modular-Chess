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

    test('applyMove & undoMove: En Passant handling', () => {
        // En Passant setup: White pawn on E5, Black pawn on D5 (just moved D7-D5)
        const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
        ChessLogic.loadFen(fen);
        const board = ChessLogic.getBoard();
        
        // White Pawn E5 (row 3, col 4) captures D5 (row 3, col 3) En Passant, moving to D6 (row 2, col 3)
        const epMove = { fromR: 3, fromC: 4, toR: 2, toC: 3 };
        
        // Apply move
        const undoState = ChessAIShared.applyMove(board, epMove);
        expect(board[2][3]).toBe('P'); // Pawn moved to D6
        expect(board[3][4]).toBeNull(); // E5 empty
        expect(board[3][3]).toBeNull(); // Captured Black pawn on D5 is removed
        expect(undoState.epCaptured).toBe('p');
        
        // Undo move
        ChessAIShared.undoMove(board, epMove, undoState);
        expect(board[3][4]).toBe('P'); // E5 restored
        expect(board[3][3]).toBe('p'); // D5 restored
        expect(board[2][3]).toBeNull(); // D6 cleared
    });

    test('applyMove & undoMove: Castling handling', () => {
        // White Kingside castling setup
        const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
        ChessLogic.loadFen(fen);
        const board = ChessLogic.getBoard();
        
        // White King on E1 (7, 4) castles Kingside to G1 (7, 6)
        const castlingMove = { fromR: 7, fromC: 4, toR: 7, toC: 6 };
        
        // Apply move
        const undoState = ChessAIShared.applyMove(board, castlingMove);
        expect(board[7][6]).toBe('K'); // King on G1
        expect(board[7][5]).toBe('R'); // Rook on F1
        expect(board[7][4]).toBeNull(); // E1 empty
        expect(board[7][7]).toBeNull(); // H1 empty
        
        // Undo move
        ChessAIShared.undoMove(board, castlingMove, undoState);
        expect(board[7][4]).toBe('K'); // King back to E1
        expect(board[7][7]).toBe('R'); // Rook back to H1
        expect(board[7][6]).toBeNull();
        expect(board[7][5]).toBeNull();
    });

    test('applyMove & undoMove: Pawn Promotion handling', () => {
        // White pawn on A7 about to promote on A8
        const fen = '8/P7/k8/8/8/8/8/4K3 w - - 0 1';
        ChessLogic.loadFen(fen);
        const board = ChessLogic.getBoard();
        
        // Move Pawn A7 (1, 0) to A8 (0, 0)
        const promoMove = { fromR: 1, fromC: 0, toR: 0, toC: 0 };
        
        // Apply move (should auto-promote to Queen in AI simulation)
        const undoState = ChessAIShared.applyMove(board, promoMove);
        expect(board[0][0]).toBe('Q'); // Queen on A8
        expect(board[1][0]).toBeNull(); // A7 empty
        
        // Undo move
        ChessAIShared.undoMove(board, promoMove, undoState);
        expect(board[1][0]).toBe('P'); // Pawn back to A7
        expect(board[0][0]).toBeNull(); // A8 cleared
    });

    test('quiesce: limits evaluation search to capture chains', () => {
        // A position with multiple hanging captures
        // White Bishop can capture Black Knight.
        const captureFen = '4k3/8/8/3n4/4B3/8/8/4K3 w - - 0 1';
        ChessLogic.loadFen(captureFen);
        const board = ChessLogic.getBoard();
        
        // Quiescence search for white (isMaximizing=true)
        const whiteScore = ChessAIShared.quiesce(board, -Infinity, Infinity, true, ChessLogic);
        expect(whiteScore).toBeGreaterThan(0); // Should favor capturing the knight

        // Load turn for black (Rook on e7 can capture Bishop on e5)
        ChessLogic.loadFen('4k3/4r3/8/4B3/8/8/8/4K3 b - - 0 1');
        const boardBlack = ChessLogic.getBoard();
        
        // Quiescence search for black (isMaximizing=false)
        const blackScore = ChessAIShared.quiesce(boardBlack, -Infinity, Infinity, false, ChessLogic);
        expect(blackScore).toBeLessThan(0); // Should account for the black rook vs white bishop capture options
    });
});

