const ChessLogic = require('../js/logic');

describe('ChessLogic', () => {
    beforeEach(() => {
        ChessLogic.initBoard();
    });

    test('Initial board should have 32 pieces', () => {
        const board = ChessLogic.getBoard();
        let pieceCount = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c]) pieceCount++;
            }
        }
        expect(pieceCount).toBe(32);
    });

    test('White should move first', () => {
        expect(ChessLogic.getTurn()).toBe('w');
    });

    test('Should detect legal pawn moves', () => {
        // White pawn at e2 to e4
        expect(ChessLogic.isValidMove(6, 4, 4, 4)).toBe(true);
        // White pawn at e2 to e5 (too far)
        expect(ChessLogic.isValidMove(6, 4, 3, 4)).toBe(false);
    });

    test('Should update turn after a move', () => {
        ChessLogic.movePiece(6, 4, 4, 4);
        expect(ChessLogic.getTurn()).toBe('b');
    });

    test('Should generate correct FEN for starting position', () => {
        const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        expect(ChessLogic.getFen()).toBe(startFen);
    });

    test('Should load game state from FEN correctly', () => {
        const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
        ChessLogic.loadFen(fen);
        const board = ChessLogic.getBoard();
        // Check pawn at e4
        expect(board[4][4]).toBe('P');
        // Check pawn at c5
        expect(board[3][2]).toBe('p');
        expect(ChessLogic.getTurn()).toBe('w');
    });

    test('Should detect king in check', () => {
        // Load a position where white king is in check by black queen
        const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5P2/PPPP2PP/RNBQKBNR w KQkq - 0 1';
        ChessLogic.loadFen(fen);
        expect(ChessLogic.isKingInCheck('w')).toBe(true);
    });

    test('Should not allow moves that leave king in check', () => {
        // Position where white king is in check
        const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5P2/PPPP2PP/RNBQKBNR w KQkq - 0 1';
        ChessLogic.loadFen(fen);
        // Try to move a pawn that doesn't resolve check
        expect(ChessLogic.isValidMove(6, 0, 5, 0)).toBe(false);
    });
    test('Should detect stalemate', () => {
        // Position where black is in stalemate (no moves, not in check)
        // White: K on f7, Q on g6. Black: K on h8.
        const fen = '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1';
        ChessLogic.loadFen(fen);
        
        let gameStatus = null;
        ChessLogic.subscribe(state => gameStatus = state.status);
        
        // This is already stalemate for black. To trigger notifyChange with status, 
        // we can re-load or just check the status if logic allows.
        // Actually, movePiece triggers the status check. 
        // Let's set a position 1 move away from stalemate.
        const nearStalemate = '7k/5K2/8/8/8/8/6Q1/8 w - - 0 1';
        ChessLogic.loadFen(nearStalemate);
        ChessLogic.movePiece(6, 6, 2, 6); // Qg2 to Qg6
        
        expect(gameStatus).toBe('stalemate');
    });

    test('Should detect three-fold repetition', () => {
        ChessLogic.initBoard(); // Starting position (1st time)
        
        let gameStatus = null;
        ChessLogic.subscribe(state => gameStatus = state.status);

        // Move knights back and forth
        ChessLogic.movePiece(7, 1, 5, 2); // Nb1-c3 (1. Nc3)
        ChessLogic.movePiece(0, 1, 2, 2); // Nb8-c6 (1... Nc6)
        ChessLogic.movePiece(5, 2, 7, 1); // Nc3-b1 (2. Nb1)
        ChessLogic.movePiece(2, 2, 0, 1); // Nc6-b8 (2... Nb8) - Position repeats 2nd time
        
        expect(gameStatus).toBeNull();

        ChessLogic.movePiece(7, 1, 5, 2); // 3. Nc3
        ChessLogic.movePiece(0, 1, 2, 2); // 3... Nc6
        ChessLogic.movePiece(5, 2, 7, 1); // 4. Nb1
        ChessLogic.movePiece(2, 2, 0, 1); // 4... Nb8 - Position repeats 3rd time
        
        expect(gameStatus).toBe('repetition');
        expect(gameStatus).toBe('repetition');
    });

    test('Should detect En Passant capture', () => {
        // White pawn moves e2-e4
        // Black pawn moves d7-d5
        // White pawn moves e4-e5
        // Black pawn moves f7-f5 (double jump)
        // White captures f6 (en passant)
        ChessLogic.loadFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
        expect(ChessLogic.isValidMove(3, 4, 2, 5)).toBe(true);
        
        ChessLogic.movePiece(3, 4, 2, 5);
        const board = ChessLogic.getBoard();
        // Check if black pawn at f5 was removed
        expect(board[3][5]).toBeNull();
        // Check if white pawn moved to f6
        expect(board[2][5]).toBe('P');
    });

    test('Should reset half-move clock on pawn move or capture', () => {
        ChessLogic.initBoard();
        ChessLogic.movePiece(6, 4, 4, 4); // Pawn move
        expect(ChessLogic.getState().halfMoveClock).toBe(0);

        ChessLogic.movePiece(1, 1, 3, 1); // Pawn move
        expect(ChessLogic.getState().halfMoveClock).toBe(0);

        ChessLogic.movePiece(7, 1, 5, 2); // Knight move
        expect(ChessLogic.getState().halfMoveClock).toBe(1);
    });

    test('Should detect 50-move rule draw', () => {
        // Start with a position where we have 99 half-moves (with pawns to avoid insufficient material)
        ChessLogic.loadFen('k7/8/8/8/p7/8/P7/K7 w - - 99 50');
        
        let gameStatus = null;
        ChessLogic.subscribe(state => gameStatus = state.status);
        
        ChessLogic.movePiece(7, 0, 7, 1); // White king moves
        expect(gameStatus).toBe('50moves');
    });

    test('Should not allow castling through check', () => {
        // Black rook at f1, white king at e1. White tries to castle kingside (e1-g1)
        const fen = 'rnbqk1nr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK1NR w KQkq - 0 1';
        ChessLogic.loadFen(fen);
        // Add a black rook at f8 to control f1? No, let's just place a piece.
        ChessLogic.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1');
        // Black rook at f8
        const board = ChessLogic.getBoard();
        board[0][5] = 'r'; // Black rook at f1-file but at row 0.
        // Let's place it at f2 to attack f1.
        board[6][5] = 'r';
        expect(ChessLogic.isValidMove(7, 4, 7, 6)).toBe(false);
    });

    test('Should successfully perform kingside and queenside castling', () => {
        // White to castle kingside, Black to castle queenside
        ChessLogic.loadFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
        
        // White castles kingside (e1 to g1)
        expect(ChessLogic.isValidMove(7, 4, 7, 6)).toBe(true);
        expect(ChessLogic.movePiece(7, 4, 7, 6)).toBe(true);
        
        const board1 = ChessLogic.getBoard();
        expect(board1[7][6]).toBe('K'); // King at g1
        expect(board1[7][5]).toBe('R'); // Rook at f1
        expect(board1[7][7]).toBeNull(); // Corner is empty
        
        // Black castles queenside (e8 to c8)
        expect(ChessLogic.isValidMove(0, 4, 0, 2)).toBe(true);
        expect(ChessLogic.movePiece(0, 4, 0, 2)).toBe(true);
        
        const board2 = ChessLogic.getBoard();
        expect(board2[0][2]).toBe('k'); // King at c8
        expect(board2[0][3]).toBe('r'); // Rook at d8
        expect(board2[0][0]).toBeNull(); // Corner is empty
    });

    test('Should return false when movePiece is given an invalid move', () => {
        ChessLogic.initBoard();
        // Trying to move a white knight to a white pawn
        expect(ChessLogic.movePiece(7, 1, 6, 1)).toBe(false);
    });

    test('Should save and load full state correctly', () => {
        ChessLogic.initBoard();
        ChessLogic.movePiece(6, 4, 4, 4); // e4
        const state = ChessLogic.getState();
        
        // Mess up the board
        ChessLogic.initBoard();
        
        // Load the state
        const loaded = ChessLogic.loadState(state);
        expect(loaded).toBe(true);
        
        expect(ChessLogic.getTurn()).toBe('b');
        expect(ChessLogic.getBoard()[4][4]).toBe('P');
        
        const history = ChessLogic.getGameHistory();
        expect(history.length).toBe(1);
        expect(history[0].move.uci).toBe('e2e4');
    });

    test('Should handle invalid state in loadState', () => {
        expect(ChessLogic.loadState(null)).toBe(false);
        expect(ChessLogic.loadState({ board: [] })).toBe(false); // Invalid board
    });

    test('Should detect insufficient material draw', () => {
        // King vs King
        ChessLogic.loadFen('k7/8/8/8/8/8/8/K7 w - - 0 1');
        let gameStatus = null;
        ChessLogic.subscribe(state => gameStatus = state.status);
        ChessLogic.movePiece(7, 0, 7, 1);
        expect(gameStatus).toBe('material');

        // King + Knight vs King
        ChessLogic.loadFen('k7/8/8/8/8/8/8/K1N5 w - - 0 1');
        gameStatus = null;
        ChessLogic.movePiece(7, 0, 7, 1);
        expect(gameStatus).toBe('material');

        // King + Bishop vs King + Bishop (same color squares)
        ChessLogic.loadFen('k4b2/8/8/8/8/8/8/K1B5 w - - 0 1');
        gameStatus = null;
        ChessLogic.movePiece(7, 0, 7, 1);
        expect(gameStatus).toBe('material');
    });

    test('Should lose castling rights when rook is captured on starting square', () => {
        // White: King on e1, Rook on a1. Black: Bishop on f6 (can capture on a1)
        ChessLogic.loadFen('r3k2r/8/5b2/8/8/8/8/R3K2R b KQkq - 0 1');
        
        // Black captures White's rook on a1 (Bxa1)
        // a1 is row 7, col 0. f6 is row 2, col 5
        const success = ChessLogic.movePiece(2, 5, 7, 0); 
        expect(success).toBe(true);
        
        const state = ChessLogic.getState();
        // White's queenside rook is captured, so castling right is lost (wRookAMoved should be true)
        expect(state.castlingRights.wRookAMoved).toBe(true);
    });

    test('loadState and loadFen should notify subscribers of game status immediately', () => {
        let status = null;
        const unsubscribe = ChessLogic.subscribe(state => {
            status = state.status;
        });

        // Load a stalemate position FEN
        ChessLogic.loadFen('k7/8/8/8/8/6q1/8/7K w - - 0 1');
        expect(status).toBe('stalemate');

        // Load an ongoing state
        ChessLogic.initBoard();
        const ongoingState = ChessLogic.getState();

        // Load a stalemate state
        ChessLogic.loadFen('k7/8/8/8/8/6q1/8/7K w - - 0 1');
        
        // Now call loadState with the ongoing state
        ChessLogic.loadState(ongoingState);
        expect(status).toBe(null); // Ongoing game status is null

        unsubscribe();
    });

    test('loadFen with skipRecord: true should not increment position count or trigger repetition draw', () => {
        ChessLogic.initBoard();
        const fen = ChessLogic.getFen();
        const simpleFen = fen.split(' ').slice(0, 4).join(' ');
        
        // Load the same FEN multiple times with skipRecord: true
        ChessLogic.loadFen(fen, { keepHistory: true, skipRecord: true });
        ChessLogic.loadFen(fen, { keepHistory: true, skipRecord: true });
        ChessLogic.loadFen(fen, { keepHistory: true, skipRecord: true });
        
        const state = ChessLogic.getState();
        expect(state.positionHistory[simpleFen]).toBe(1); // Position count remains 1, not 4
    });
});
