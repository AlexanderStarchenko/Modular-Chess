/**
 * Shared AI Logic
 * Contains minimax algorithm and board evaluation.
 */

var ChessAIShared = (() => {
    const PIECE_VALUES = {
        'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
        'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
    };

    const pstPawn = [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ];

    const pstKnight = [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ];

    const pstBishop = [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ];

    const pstRook = [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
    ];

    const pstQueen = [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ];

    const pstKing = [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
    ];

    function evaluateBoard(board) {
        if (typeof ChessWASM !== 'undefined' && ChessWASM.isLoaded()) {
            return ChessWASM.evaluateMaterial(board);
        }
        let totalEvaluation = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                totalEvaluation += getPieceValue(board[r][c], r, c);
            }
        }
        return totalEvaluation;
    }

    function getPieceValue(piece, r, c) {
        if (!piece) return 0;
        
        const isWhite = piece === piece.toUpperCase();
        const type = piece.toLowerCase();
        let value = PIECE_VALUES[type] || 0;

        // Add positional bonus
        if (type === 'p') value += isWhite ? pstPawn[r][c] : pstPawn[7-r][c];
        else if (type === 'n') value += isWhite ? pstKnight[r][c] : pstKnight[7-r][c];
        else if (type === 'b') value += isWhite ? pstBishop[r][c] : pstBishop[7-r][c];
        else if (type === 'r') value += isWhite ? pstRook[r][c] : pstRook[7-r][c];
        else if (type === 'q') value += isWhite ? pstQueen[r][c] : pstQueen[7-r][c];
        else if (type === 'k') value += isWhite ? pstKing[r][c] : pstKing[7-r][c];

        return isWhite ? value : -value;
    }

    function applyMove(board, move) {
        const orig = board[move.fromR][move.fromC];
        const target = board[move.toR][move.toC];
        const isWhite = orig === orig.toUpperCase();
        
        let epCaptured = null;
        let epR = -1;
        
        // En Passant
        if (orig.toLowerCase() === 'p' && target === null && move.fromC !== move.toC) {
            epR = isWhite ? move.toR + 1 : move.toR - 1;
            epCaptured = board[epR][move.toC];
            board[epR][move.toC] = null;
        }
        
        // Castling
        let rookFromC = -1;
        let rookToC = -1;
        if (orig.toLowerCase() === 'k' && Math.abs(move.fromC - move.toC) === 2) {
            const isKingside = move.toC > move.fromC;
            rookFromC = isKingside ? 7 : 0;
            rookToC = isKingside ? 5 : 3;
            board[move.fromR][rookToC] = board[move.fromR][rookFromC];
            board[move.fromR][rookFromC] = null;
        }

        // Promotion
        let placedPiece = orig;
        if (orig.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
            placedPiece = isWhite ? 'Q' : 'q';
        }
        
        board[move.toR][move.toC] = placedPiece;
        board[move.fromR][move.fromC] = null;
        
        return { orig, target, epCaptured, epR, rookFromC, rookToC };
    }

    function undoMove(board, move, undoState) {
        board[move.fromR][move.fromC] = undoState.orig;
        board[move.toR][move.toC] = undoState.target;
        
        if (undoState.epCaptured) {
            board[undoState.epR][move.toC] = undoState.epCaptured;
        }
        
        if (undoState.rookFromC !== -1) {
            board[move.fromR][undoState.rookFromC] = board[move.fromR][undoState.rookToC];
            board[move.fromR][undoState.rookToC] = null;
        }
    }

    function quiesce(board, alpha, beta, isMaximizing, logic) {
        let standPat = evaluateBoard(board);
        if (isMaximizing) {
            if (standPat >= beta) return beta;
            if (alpha < standPat) alpha = standPat;
            
            const moves = logic.getAllLegalMoves('w', true).filter(m => {
                const orig = board[m.fromR][m.fromC];
                const isEP = orig && orig.toLowerCase() === 'p' && board[m.toR][m.toC] === null && m.fromC !== m.toC;
                return board[m.toR][m.toC] !== null || isEP;
            });
            for (const move of moves) {
                const undoState = applyMove(board, move);
                const score = quiesce(board, alpha, beta, false, logic);
                undoMove(board, move, undoState);
                
                if (score >= beta) return beta;
                if (score > alpha) alpha = score;
            }
            return alpha;
        } else {
            if (standPat <= alpha) return alpha;
            if (beta > standPat) beta = standPat;
            
            const moves = logic.getAllLegalMoves('b', true).filter(m => {
                const orig = board[m.fromR][m.fromC];
                const isEP = orig && orig.toLowerCase() === 'p' && board[m.toR][m.toC] === null && m.fromC !== m.toC;
                return board[m.toR][m.toC] !== null || isEP;
            });
            for (const move of moves) {
                const undoState = applyMove(board, move);
                const score = quiesce(board, alpha, beta, true, logic);
                undoMove(board, move, undoState);
                
                if (score <= alpha) return alpha;
                if (score < beta) beta = score;
            }
            return beta;
        }
    }

    function minimax(board, depth, isMaximizing, alpha, beta, logic) {
        if (typeof ChessWASM !== 'undefined' && ChessWASM.isLoaded()) {
            const state = logic.getState();
            state.board = board;
            state.turn = isMaximizing ? 'w' : 'b';
            ChessWASM.searchWASM(depth, isMaximizing, alpha, beta, state);
            return ChessWASM.getSearchScore();
        }

        const color = isMaximizing ? 'w' : 'b';
        const moves = logic.getAllLegalMoves(color, true);

        if (moves.length === 0) {
            if (logic.isKingInCheck(color)) return isMaximizing ? -100000 : 100000;
            return 0;
        }

        if (depth === 0) return quiesce(board, alpha, beta, isMaximizing, logic);

        // Simple move ordering: captures first
        moves.sort((a, b) => {
            const valA = board[a.toR][a.toC] ? PIECE_VALUES[board[a.toR][a.toC].toLowerCase()] : 0;
            const valB = board[b.toR][b.toC] ? PIECE_VALUES[board[b.toR][b.toC].toLowerCase()] : 0;
            return valB - valA;
        });

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                const undoState = applyMove(board, move);
                const score = minimax(board, depth - 1, false, alpha, beta, logic);
                undoMove(board, move, undoState);
                maxEval = Math.max(maxEval, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                const undoState = applyMove(board, move);
                const score = minimax(board, depth - 1, true, alpha, beta, logic);
                undoMove(board, move, undoState);
                minEval = Math.min(minEval, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    const ChessOpeningBook = {
        // Starting position
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "c2c4"],
        
        // 1. e4 responses
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "c7c5", "e7e6", "c7c6"],
        
        // 1. e4 e5
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "f2f4", "d2d4"],
        
        // 1. e4 e5 2. Nf3
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "d7d6", "g8f6"],
        
        // 1. e4 e5 2. Nf3 Nc6
        "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": ["b1c3", "f1b5", "f1c4", "d2d4"],
        
        // Ruy Lopez: 1. e4 e5 2. Nf3 Nc6 3. Bb5
        "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": ["a7a6", "g8f6", "f7f5"],
        
        // Italian Game: 1. e4 e5 2. Nf3 Nc6 3. Bc4
        "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": ["g8f6", "f1c5"],
        
        // Sicilian Defense: 1. e4 c5
        "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6": ["g1f3", "b1c3", "c2c3"],
        
        // Sicilian Open: 1. e4 c5 2. Nf3
        "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["d7d6", "e7e6", "b8c6"],
        
        // Sicilian Open: 1. e4 c5 2. Nf3 d6 3. d4
        "rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": ["c5d4"],
        
        // Sicilian Open: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4
        "rnbqkbnr/pp2pppp/3p4/8/3N4/8/PPP2PPP/RNBQKB1R b KQkq -": ["g8f6"],

        // French Defense: 1. e4 e6
        "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d4", "b1c3"],

        // French Defense: 1. e4 e6 2. d4 d5
        "rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6": ["b1c3", "e4d5", "e4e5"],
        
        // Caro-Kann: 1. e4 c6
        "rnbqkbnr/pp1ppppp/2p7/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d4", "b1c3"],
        
        // Caro-Kann: 1. e4 c6 2. d4 d5
        "rnbqkbnr/ppp1pppp/8/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6": ["b1c3", "e4e5"],

        // Queen's Gambit: 1. d4 d5 2. c4
        "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3": ["e7e6", "c7c6", "d5c4"]
    };

    function parseUciMove(moveStr) {
        const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
        const fromC = files[moveStr[0]];
        const fromR = 8 - parseInt(moveStr[1]);
        const toC = files[moveStr[2]];
        const toR = 8 - parseInt(moveStr[3]);
        const promotion = moveStr.length > 4 ? moveStr[4] : null;
        return { fromR, fromC, toR, toC, promotion };
    }

    function getOpeningBookMove(fen) {
        if (!fen) return null;
        const parts = fen.split(/\s+/);
        // We only match first 4 parts of FEN (board state, turn, castling rights, ep square)
        const normalized = parts.slice(0, 4).join(' ');
        const moves = ChessOpeningBook[normalized];
        if (moves && moves.length > 0) {
            const selected = moves[Math.floor(Math.random() * moves.length)];
            return parseUciMove(selected);
        }
        return null;
    }

    const API = { evaluateBoard, minimax, applyMove, undoMove, quiesce, getOpeningBookMove };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
