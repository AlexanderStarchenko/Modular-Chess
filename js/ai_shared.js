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
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": [
        "e2e4",
        "d2d4",
        "c2c4",
        "g1f3"
    ],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": [
        "e7e5",
        "c7c5",
        "e7e6",
        "c7c6",
        "d7d5",
        "g8f6",
        "d7d6",
        "g7g6"
    ],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": [
        "g1f3",
        "b1c3",
        "f2f4"
    ],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": [
        "b8c6",
        "g8f6",
        "d7d6"
    ],
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "f1b5",
        "f1c4",
        "d2d4",
        "b1c3"
    ],
    "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "a7a6",
        "g8f6",
        "d7d6"
    ],
    "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "b5a4",
        "b5c6"
    ],
    "r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "g8f6"
    ],
    "r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq -": [
        "f8e7",
        "f6e4"
    ],
    "r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq -": [
        "f1e1"
    ],
    "r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq -": [
        "b7b5"
    ],
    "r1bqk2r/2ppbppp/p1n2n2/1p2p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 w kq b6": [
        "a4b3"
    ],
    "r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq -": [
        "d7d6",
        "e8g8"
    ],
    "r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w kq -": [
        "c2c3"
    ],
    "r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 b kq -": [
        "e8g8"
    ],
    "r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - -": [
        "h2h3"
    ],
    "r1bq1rk1/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w - -": [
        "c2c3"
    ],
    "r1bq1rk1/2ppbppp/p1n2n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 b - -": [
        "d7d5"
    ],
    "r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - d6": [
        "e4d5"
    ],
    "r1bq1rk1/2p1bppp/p1n2n2/1p1Pp3/8/1BP2N2/PP1P1PPP/RNBQR1K1 b - -": [
        "f6d5"
    ],
    "r1bqkb1r/1ppp1ppp/p1n5/4p3/B3n3/5N2/PPPP1PPP/RNBQ1RK1 w kq -": [
        "d2d4"
    ],
    "r1bqkb1r/1ppp1ppp/p1n5/4p3/B2Pn3/5N2/PPP2PPP/RNBQ1RK1 b kq d3": [
        "b7b5"
    ],
    "r1bqkb1r/2pp1ppp/p1n5/1p2p3/B2Pn3/5N2/PPP2PPP/RNBQ1RK1 w kq b6": [
        "a4b3"
    ],
    "r1bqkb1r/2pp1ppp/p1n5/1p2p3/3Pn3/1B3N2/PPP2PPP/RNBQ1RK1 b kq -": [
        "d7d5"
    ],
    "r1bqkb1r/2p2ppp/p1n5/1p1pp3/3Pn3/1B3N2/PPP2PPP/RNBQ1RK1 w kq d6": [
        "d4e5"
    ],
    "r1bqkb1r/2p2ppp/p1n5/1p1pP3/4n3/1B3N2/PPP2PPP/RNBQ1RK1 b kq -": [
        "c8e6"
    ],
    "r1bqkbnr/1ppp1ppp/p1B5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "d7c6"
    ],
    "r1bqkbnr/1pp2ppp/p1p5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "d2d4"
    ],
    "r1bqkbnr/1pp2ppp/p1p5/4p3/3PP3/5N2/PPP2PPP/RNBQK2R b KQkq d3": [
        "e5d4"
    ],
    "r1bqkbnr/1pp2ppp/p1p5/8/3pP3/5N2/PPP2PPP/RNBQK2R w KQkq -": [
        "d1d4"
    ],
    "r1bqkbnr/1pp2ppp/p1p5/8/3QP3/5N2/PPP2PPP/RNB1K2R b KQkq -": [
        "d8d4"
    ],
    "r1b1kbnr/1pp2ppp/p1p5/8/3qP3/5N2/PPP2PPP/RNB1K2R w KQkq -": [
        "f3d4"
    ],
    "r1b1kbnr/1pp2ppp/p1p5/8/3NP3/8/PPP2PPP/RNB1K2R b KQkq -": [
        "c8d7"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq -": [
        "f6e4"
    ],
    "r1bqkb1r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQ1RK1 w kq -": [
        "d2d4"
    ],
    "r1bqkb1r/pppp1ppp/2n5/1B2p3/3Pn3/5N2/PPP2PPP/RNBQ1RK1 b kq d3": [
        "f8e7"
    ],
    "r1bqk2r/ppppbppp/2n5/1B2p3/3Pn3/5N2/PPP2PPP/RNBQ1RK1 w kq -": [
        "d1e2"
    ],
    "r1bqk2r/ppppbppp/2n5/1B2p3/3Pn3/5N2/PPP1QPPP/RNB2RK1 b kq -": [
        "e4d6"
    ],
    "r1bqk2r/ppppbppp/2nn4/1B2p3/3P4/5N2/PPP1QPPP/RNB2RK1 w kq -": [
        "b5c6"
    ],
    "r1bqk2r/ppppbppp/2Bn4/4p3/3P4/5N2/PPP1QPPP/RNB2RK1 b kq -": [
        "b7c6"
    ],
    "r1bqk2r/p1ppbppp/2pn4/4p3/3P4/5N2/PPP1QPPP/RNB2RK1 w kq -": [
        "d4e5"
    ],
    "r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "d2d4"
    ],
    "r1bqkbnr/ppp2ppp/2np4/1B2p3/3PP3/5N2/PPP2PPP/RNBQK2R b KQkq d3": [
        "c8d7"
    ],
    "r2qkbnr/pppb1ppp/2np4/1B2p3/3PP3/5N2/PPP2PPP/RNBQK2R w KQkq -": [
        "b1c3"
    ],
    "r2qkbnr/pppb1ppp/2np4/1B2p3/3PP3/2N2N2/PPP2PPP/R1BQK2R b KQkq -": [
        "g8f6"
    ],
    "r2qkb1r/pppb1ppp/2np1n2/1B2p3/3PP3/2N2N2/PPP2PPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "r2qkb1r/pppb1ppp/2np1n2/1B2p3/3PP3/2N2N2/PPP2PPP/R1BQ1RK1 b kq -": [
        "f8e7"
    ],
    "r2qk2r/pppbbppp/2np1n2/1B2p3/3PP3/2N2N2/PPP2PPP/R1BQ1RK1 w kq -": [
        "f1e1"
    ],
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "f8c5",
        "g8f6"
    ],
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "c2c3",
        "b2b4"
    ],
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq -": [
        "g8f6"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq -": [
        "d2d3",
        "d2d4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R b KQkq -": [
        "d7d6",
        "e8g8"
    ],
    "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 b kq -": [
        "a7a6"
    ],
    "r1bqk2r/1pp2ppp/p1np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w kq -": [
        "c4b3"
    ],
    "r1bqk2r/1pp2ppp/p1np1n2/2b1p3/4P3/1BPP1N2/PP3PPP/RNBQ1RK1 b kq -": [
        "c5a7"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2BPP3/2P2N2/PP3PPP/RNBQK2R b KQkq d3": [
        "e5d4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/2b5/2BpP3/2P2N2/PP3PPP/RNBQK2R w KQkq -": [
        "c3d4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/2b5/2BPP3/5N2/PP3PPP/RNBQK2R b KQkq -": [
        "c5b4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/8/1bBPP3/5N2/PP3PPP/RNBQK2R w KQkq -": [
        "c1d2"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/8/1bBPP3/5N2/PP1B1PPP/RN1QK2R b KQkq -": [
        "b4d2"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/8/2BPP3/5N2/PP1b1PPP/RN1QK2R w KQkq -": [
        "b1d2"
    ],
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R b KQkq b3": [
        "c5b4"
    ],
    "r1bqk1nr/pppp1ppp/2n5/4p3/1bB1P3/5N2/P1PP1PPP/RNBQK2R w KQkq -": [
        "c2c3"
    ],
    "r1bqk1nr/pppp1ppp/2n5/4p3/1bB1P3/2P2N2/P2P1PPP/RNBQK2R b KQkq -": [
        "b4a5"
    ],
    "r1bqk1nr/pppp1ppp/2n5/b3p3/2B1P3/2P2N2/P2P1PPP/RNBQK2R w KQkq -": [
        "d2d4"
    ],
    "r1bqk1nr/pppp1ppp/2n5/b3p3/2BPP3/2P2N2/P4PPP/RNBQK2R b KQkq d3": [
        "e5d4"
    ],
    "r1bqk1nr/pppp1ppp/2n5/b7/2BpP3/2P2N2/P4PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqk1nr/pppp1ppp/2n5/b7/2BpP3/2P2N2/P4PPP/RNBQ1RK1 b kq -": [
        "g8e7"
    ],
    "r1bqk2r/ppppnppp/2n5/b7/2BpP3/2P2N2/P4PPP/RNBQ1RK1 w kq -": [
        "c3d4"
    ],
    "r1bqk2r/ppppnppp/2n5/b7/2BPP3/5N2/P4PPP/RNBQ1RK1 b kq -": [
        "d7d5"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "d2d3",
        "d2d4"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq -": [
        "f8c5"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq -": [
        "c2c3"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R w KQ -": [
        "e1g1"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 b - -": [
        "d7d5"
    ],
    "r1bq1rk1/ppp2ppp/2n2n2/2bpp3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - d6": [
        "e4d5"
    ],
    "r1bq1rk1/ppp2ppp/2n2n2/2bPp3/2B5/2PP1N2/PP3PPP/RNBQ1RK1 b - -": [
        "f6d5"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2BPP3/5N2/PPP2PPP/RNBQK2R b KQkq d3": [
        "e5d4"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/8/2BpP3/5N2/PPP2PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/8/2BpP3/5N2/PPP2PPP/RNBQ1RK1 b kq -": [
        "f6e4"
    ],
    "r1bqkb1r/pppp1ppp/2n5/8/2Bpn3/5N2/PPP2PPP/RNBQ1RK1 w kq -": [
        "f1e1"
    ],
    "r1bqkb1r/pppp1ppp/2n5/8/2Bpn3/5N2/PPP2PPP/RNBQR1K1 b kq -": [
        "d7d5"
    ],
    "r1bqkb1r/ppp2ppp/2n5/3p4/2Bpn3/5N2/PPP2PPP/RNBQR1K1 w kq d6": [
        "c4d5"
    ],
    "r1bqkb1r/ppp2ppp/2n5/3B4/3pn3/5N2/PPP2PPP/RNBQR1K1 b kq -": [
        "d8d5"
    ],
    "r1b1kb1r/ppp2ppp/2n5/3q4/3pn3/5N2/PPP2PPP/RNBQR1K1 w kq -": [
        "b1c3"
    ],
    "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "e5d4"
    ],
    "r1bqkbnr/pppp1ppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f3d4"
    ],
    "r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "f8c5",
        "g8f6"
    ],
    "r1bqk1nr/pppp1ppp/2n5/2b5/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "c1e3"
    ],
    "r1bqk1nr/pppp1ppp/2n5/2b5/3NP3/4B3/PPP2PPP/RN1QKB1R b KQkq -": [
        "d8f6"
    ],
    "r1b1k1nr/pppp1ppp/2n2q2/2b5/3NP3/4B3/PPP2PPP/RN1QKB1R w KQkq -": [
        "c2c3"
    ],
    "r1b1k1nr/pppp1ppp/2n2q2/2b5/3NP3/2P1B3/PP3PPP/RN1QKB1R b KQkq -": [
        "g8e7"
    ],
    "r1b1k2r/ppppnppp/2n2q2/2b5/3NP3/2P1B3/PP3PPP/RN1QKB1R w KQkq -": [
        "f1c4"
    ],
    "r1b1k2r/ppppnppp/2n2q2/2b5/2BNP3/2P1B3/PP3PPP/RN1QK2R b KQkq -": [
        "c6e5"
    ],
    "r1b1k2r/ppppnppp/5q2/2b1n3/2BNP3/2P1B3/PP3PPP/RN1QK2R w KQkq -": [
        "c4e2"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "d4c6"
    ],
    "r1bqkb1r/pppp1ppp/2N2n2/8/4P3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "b7c6"
    ],
    "r1bqkb1r/p1pp1ppp/2p2n2/8/4P3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "e4e5"
    ],
    "r1bqkb1r/p1pp1ppp/2p2n2/4P3/8/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "d8e7"
    ],
    "r1b1kb1r/p1ppqppp/2p2n2/4P3/8/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "d1e2"
    ],
    "r1b1kb1r/p1ppqppp/2p2n2/4P3/8/8/PPP1QPPP/RNB1KB1R b KQkq -": [
        "f6d5"
    ],
    "r1b1kb1r/p1ppqppp/2p5/3nP3/8/8/PPP1QPPP/RNB1KB1R w KQkq -": [
        "c2c4"
    ],
    "r1b1kb1r/p1ppqppp/2p5/3nP3/2P5/8/PP2QPPP/RNB1KB1R b KQkq c3": [
        "c8a6"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "f3e5",
        "d2d4"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq -": [
        "d7d6"
    ],
    "rnbqkb1r/ppp2ppp/3p1n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq -": [
        "e5f3"
    ],
    "rnbqkb1r/ppp2ppp/3p1n2/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": [
        "f6e4"
    ],
    "rnbqkb1r/ppp2ppp/3p4/8/4n3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "d2d4"
    ],
    "rnbqkb1r/ppp2ppp/3p4/8/3Pn3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "d6d5"
    ],
    "rnbqkb1r/ppp2ppp/8/3p4/3Pn3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f1d3"
    ],
    "rnbqkb1r/ppp2ppp/8/3p4/3Pn3/3B1N2/PPP2PPP/RNBQK2R b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/ppp1bppp/8/3p4/3Pn3/3B1N2/PPP2PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqk2r/ppp1bppp/8/3p4/3Pn3/3B1N2/PPP2PPP/RNBQ1RK1 b kq -": [
        "b8c6"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "f6e4"
    ],
    "rnbqkb1r/pppp1ppp/8/4p3/3Pn3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f1d3"
    ],
    "rnbqkb1r/pppp1ppp/8/4p3/3Pn3/3B1N2/PPP2PPP/RNBQK2R b KQkq -": [
        "d7d5"
    ],
    "rnbqkb1r/ppp2ppp/8/3pp3/3Pn3/3B1N2/PPP2PPP/RNBQK2R w KQkq d6": [
        "f3e5"
    ],
    "rnbqkb1r/ppp2ppp/8/3pN3/3Pn3/3B4/PPP2PPP/RNBQK2R b KQkq -": [
        "b8d7"
    ],
    "r1bqkb1r/pppn1ppp/8/3pN3/3Pn3/3B4/PPP2PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqkb1r/pppn1ppp/8/3pN3/3Pn3/3B4/PPP2PPP/RNBQ1RK1 b kq -": [
        "d7e5"
    ],
    "r1bqkb1r/ppp2ppp/8/3pn3/3Pn3/3B4/PPP2PPP/RNBQ1RK1 w kq -": [
        "d4e5"
    ],
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq -": [
        "g8f6"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq -": [
        "f1b5"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq -": [
        "f8b4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/1B2p3/1b2P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/1B2p3/1b2P3/2N2N2/PPPP1PPP/R1BQ1RK1 b kq -": [
        "e8g8"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/1B2p3/1b2P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - -": [
        "d2d3"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/1B2p3/1b2P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - -": [
        "d7d6"
    ],
    "r1bq1rk1/ppp2ppp/2np1n2/1B2p3/1b2P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - -": [
        "c1g5"
    ],
    "r1bq1rk1/ppp2ppp/2np1n2/1B2p1B1/1b2P3/2NP1N2/PPP2PPP/R2Q1RK1 b - -": [
        "b4c3"
    ],
    "r1bq1rk1/ppp2ppp/2np1n2/1B2p1B1/4P3/2bP1N2/PPP2PPP/R2Q1RK1 w - -": [
        "b2c3"
    ],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq -": [
        "f2f4"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4p3/4PP2/2N5/PPPP2PP/R1BQKBNR b KQkq f3": [
        "d7d5"
    ],
    "rnbqkb1r/ppp2ppp/5n2/3pp3/4PP2/2N5/PPPP2PP/R1BQKBNR w KQkq d6": [
        "f4e5"
    ],
    "rnbqkb1r/ppp2ppp/5n2/3pP3/4P3/2N5/PPPP2PP/R1BQKBNR b KQkq -": [
        "f6e4"
    ],
    "rnbqkb1r/ppp2ppp/8/3pP3/4n3/2N5/PPPP2PP/R1BQKBNR w KQkq -": [
        "d1f3"
    ],
    "rnbqkb1r/ppp2ppp/8/3pP3/4n3/2N2Q2/PPPP2PP/R1B1KBNR b KQkq -": [
        "b8c6"
    ],
    "r1bqkb1r/ppp2ppp/2n5/3pP3/4n3/2N2Q2/PPPP2PP/R1B1KBNR w KQkq -": [
        "f1b5"
    ],
    "r1bqkb1r/ppp2ppp/2n5/1B1pP3/4n3/2N2Q2/PPPP2PP/R1B1K1NR b KQkq -": [
        "e4c3"
    ],
    "r1bqkb1r/ppp2ppp/2n5/1B1pP3/8/2n2Q2/PPPP2PP/R1B1K1NR w KQkq -": [
        "d2c3"
    ],
    "r1bqkb1r/ppp2ppp/2n5/1B1pP3/8/2P2Q2/PPP3PP/R1B1K1NR b KQkq -": [
        "f8e7"
    ],
    "rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "d2d4"
    ],
    "rnbqkbnr/ppp2ppp/3p4/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "e5d4"
    ],
    "rnbqkbnr/ppp2ppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f3d4"
    ],
    "rnbqkbnr/ppp2ppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppp2ppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/ppp2ppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/ppp1bppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "f1e2"
    ],
    "rnbqk2r/ppp1bppp/3p1n2/8/3NP3/2N5/PPP1BPPP/R1BQK2R b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1bppp/3p1n2/8/3NP3/2N5/PPP1BPPP/R1BQK2R w KQ -": [
        "e1g1"
    ],
    "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3": [
        "e5f4",
        "f8c5"
    ],
    "rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkbnr/pppp1ppp/8/8/4Pp2/5N2/PPPP2PP/RNBQKB1R b KQkq -": [
        "g7g5"
    ],
    "rnbqkbnr/pppp1p1p/8/6p1/4Pp2/5N2/PPPP2PP/RNBQKB1R w KQkq g6": [
        "h2h4"
    ],
    "rnbqkbnr/pppp1p1p/8/6p1/4Pp1P/5N2/PPPP2P1/RNBQKB1R b KQkq h3": [
        "g5g4"
    ],
    "rnbqkbnr/pppp1p1p/8/8/4PppP/5N2/PPPP2P1/RNBQKB1R w KQkq -": [
        "f3e5"
    ],
    "rnbqkbnr/pppp1p1p/8/4N3/4PppP/8/PPPP2P1/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pppp1p1p/5n2/4N3/4PppP/8/PPPP2P1/RNBQKB1R w KQkq -": [
        "d2d4"
    ],
    "rnbqkb1r/pppp1p1p/5n2/4N3/3PPppP/8/PPP3P1/RNBQKB1R b KQkq d3": [
        "d7d6"
    ],
    "rnbqkb1r/ppp2p1p/3p1n2/4N3/3PPppP/8/PPP3P1/RNBQKB1R w KQkq -": [
        "e5d3"
    ],
    "rnbqk1nr/pppp1ppp/8/2b1p3/4PP2/8/PPPP2PP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqk1nr/pppp1ppp/8/2b1p3/4PP2/5N2/PPPP2PP/RNBQKB1R b KQkq -": [
        "d7d6"
    ],
    "rnbqk1nr/ppp2ppp/3p4/2b1p3/4PP2/5N2/PPPP2PP/RNBQKB1R w KQkq -": [
        "c2c3"
    ],
    "rnbqk1nr/ppp2ppp/3p4/2b1p3/4PP2/2P2N2/PP1P2PP/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqk2r/ppp2ppp/3p1n2/2b1p3/4PP2/2P2N2/PP1P2PP/RNBQKB1R w KQkq -": [
        "d2d4"
    ],
    "rnbqk2r/ppp2ppp/3p1n2/2b1p3/3PPP2/2P2N2/PP4PP/RNBQKB1R b KQkq d3": [
        "e5d4"
    ],
    "rnbqk2r/ppp2ppp/3p1n2/2b5/3pPP2/2P2N2/PP4PP/RNBQKB1R w KQkq -": [
        "c3d4"
    ],
    "rnbqk2r/ppp2ppp/3p1n2/2b5/3PPP2/5N2/PP4PP/RNBQKB1R b KQkq -": [
        "c5b6"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6": [
        "g1f3",
        "c2c3",
        "b1c3",
        "d2d4"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": [
        "d7d6",
        "b8c6",
        "e7e6"
    ],
    "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "d2d4",
        "f1b5"
    ],
    "rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "c5d4"
    ],
    "rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f3d4"
    ],
    "rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "a7a6",
        "g7g6",
        "e7e6"
    ],
    "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1e3",
        "c1g5",
        "f1e2"
    ],
    "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N1B3/PPP2PPP/R2QKB1R b KQkq -": [
        "e7e5"
    ],
    "rnbqkb1r/1p3ppp/p2p1n2/4p3/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq e6": [
        "d4b3"
    ],
    "rnbqkb1r/1p3ppp/p2p1n2/4p3/4P3/1NN1B3/PPP2PPP/R2QKB1R b KQkq -": [
        "c8e6"
    ],
    "rn1qkb1r/1p3ppp/p2pbn2/4p3/4P3/1NN1B3/PPP2PPP/R2QKB1R w KQkq -": [
        "f2f3"
    ],
    "rn1qkb1r/1p3ppp/p2pbn2/4p3/4P3/1NN1BP2/PPP3PP/R2QKB1R b KQkq -": [
        "b8d7"
    ],
    "r2qkb1r/1p1n1ppp/p2pbn2/4p3/4P3/1NN1BP2/PPP3PP/R2QKB1R w KQkq -": [
        "d1d2"
    ],
    "r2qkb1r/1p1n1ppp/p2pbn2/4p3/4P3/1NN1BP2/PPPQ2PP/R3KB1R b KQkq -": [
        "b7b5"
    ],
    "rnbqkb1r/1p2pppp/p2p1n2/6B1/3NP3/2N5/PPP2PPP/R2QKB1R b KQkq -": [
        "e7e6"
    ],
    "rnbqkb1r/1p3ppp/p2ppn2/6B1/3NP3/2N5/PPP2PPP/R2QKB1R w KQkq -": [
        "f2f4"
    ],
    "rnbqkb1r/1p3ppp/p2ppn2/6B1/3NPP2/2N5/PPP3PP/R2QKB1R b KQkq f3": [
        "f8e7"
    ],
    "rnbqk2r/1p2bppp/p2ppn2/6B1/3NPP2/2N5/PPP3PP/R2QKB1R w KQkq -": [
        "d1f3"
    ],
    "rnbqk2r/1p2bppp/p2ppn2/6B1/3NPP2/2N2Q2/PPP3PP/R3KB1R b KQkq -": [
        "d8c7"
    ],
    "rnb1k2r/1pq1bppp/p2ppn2/6B1/3NPP2/2N2Q2/PPP3PP/R3KB1R w KQkq -": [
        "e1c1"
    ],
    "rnb1k2r/1pq1bppp/p2ppn2/6B1/3NPP2/2N2Q2/PPP3PP/2KR1B1R b kq -": [
        "b8d7"
    ],
    "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP1BPPP/R1BQK2R b KQkq -": [
        "e7e5"
    ],
    "rnbqkb1r/1p3ppp/p2p1n2/4p3/3NP3/2N5/PPP1BPPP/R1BQK2R w KQkq e6": [
        "d4b3"
    ],
    "rnbqkb1r/1p3ppp/p2p1n2/4p3/4P3/1NN5/PPP1BPPP/R1BQK2R b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/1p2bppp/p2p1n2/4p3/4P3/1NN5/PPP1BPPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqk2r/1p2bppp/p2p1n2/4p3/4P3/1NN5/PPP1BPPP/R1BQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbq1rk1/1p2bppp/p2p1n2/4p3/4P3/1NN5/PPP1BPPP/R1BQ1RK1 w - -": [
        "c1e3"
    ],
    "rnbq1rk1/1p2bppp/p2p1n2/4p3/4P3/1NN1B3/PPP1BPPP/R2Q1RK1 b - -": [
        "c8e6"
    ],
    "rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1e3"
    ],
    "rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N1B3/PPP2PPP/R2QKB1R b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/pp2ppbp/3p1np1/8/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq -": [
        "f2f3"
    ],
    "rnbqk2r/pp2ppbp/3p1np1/8/3NP3/2N1BP2/PPP3PP/R2QKB1R b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/pp2ppbp/3p1np1/8/3NP3/2N1BP2/PPP3PP/R2QKB1R w KQ -": [
        "d1d2"
    ],
    "rnbq1rk1/pp2ppbp/3p1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R b KQ -": [
        "b8c6"
    ],
    "r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ -": [
        "f1c4"
    ],
    "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1BP2/PPPQ2PP/R3K2R b KQ -": [
        "c8d7"
    ],
    "r2q1rk1/pp1bppbp/2np1np1/8/2BNP3/2N1BP2/PPPQ2PP/R3K2R w KQ -": [
        "e1c1"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "d2d4",
        "f1b5"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "c5d4"
    ],
    "r1bqkbnr/pp1ppppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f3d4"
    ],
    "r1bqkbnr/pp1ppppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "g7g6",
        "g8f6",
        "e7e5"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "f8g7"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1e3"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/8/3NP3/2N1B3/PPP2PPP/R2QKB1R b KQkq -": [
        "g8f6"
    ],
    "r1bqk2r/pp1pppbp/2n2np1/8/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq -": [
        "f1c4"
    ],
    "r1bqk2r/pp1pppbp/2n2np1/8/2BNP3/2N1B3/PPP2PPP/R2QK2R b KQkq -": [
        "e8g8"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/8/2BNP3/2N1B3/PPP2PPP/R2QK2R w KQ -": [
        "c4b3"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/8/3NP3/1BN1B3/PPP2PPP/R2QK2R b KQ -": [
        "d7d6"
    ],
    "r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/1BN1B3/PPP2PPP/R2QK2R w KQ -": [
        "f2f3"
    ],
    "r1bqkb1r/pp1ppppp/2n2n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "r1bqkb1r/pp1ppppp/2n2n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "e7e5",
        "d7d6"
    ],
    "r1bqkb1r/pp1p1ppp/2n2n2/4p3/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq e6": [
        "d4b5"
    ],
    "r1bqkb1r/pp1p1ppp/2n2n2/1N2p3/4P3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "d7d6"
    ],
    "r1bqkb1r/pp3ppp/2np1n2/1N2p3/4P3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1g5"
    ],
    "r1bqkb1r/pp3ppp/2np1n2/1N2p1B1/4P3/2N5/PPP2PPP/R2QKB1R b KQkq -": [
        "a7a6"
    ],
    "r1bqkb1r/1p3ppp/p1np1n2/1N2p1B1/4P3/2N5/PPP2PPP/R2QKB1R w KQkq -": [
        "b5a3"
    ],
    "r1bqkb1r/1p3ppp/p1np1n2/4p1B1/4P3/N1N5/PPP2PPP/R2QKB1R b KQkq -": [
        "b7b5"
    ],
    "r1bqkb1r/5ppp/p1np1n2/1p2p1B1/4P3/N1N5/PPP2PPP/R2QKB1R w KQkq b6": [
        "c3d5"
    ],
    "r1bqkb1r/5ppp/p1np1n2/1p1Np1B1/4P3/N7/PPP2PPP/R2QKB1R b KQkq -": [
        "f8e7"
    ],
    "r1bqk2r/4bppp/p1np1n2/1p1Np1B1/4P3/N7/PPP2PPP/R2QKB1R w KQkq -": [
        "g5f6"
    ],
    "r1bqk2r/4bppp/p1np1B2/1p1Np3/4P3/N7/PPP2PPP/R2QKB1R b KQkq -": [
        "e7f6"
    ],
    "r1bqk2r/5ppp/p1np1b2/1p1Np3/4P3/N7/PPP2PPP/R2QKB1R w KQkq -": [
        "c2c3"
    ],
    "r1bqkbnr/pp1p1ppp/2n5/4p3/3NP3/8/PPP2PPP/RNBQKB1R w KQkq e6": [
        "d4b5"
    ],
    "r1bqkbnr/pp1p1ppp/2n5/1N2p3/4P3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "d7d6"
    ],
    "r1bqkbnr/pp3ppp/2np4/1N2p3/4P3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "r1bqkbnr/pp3ppp/2np4/1N2p3/4P3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "a7a6"
    ],
    "r1bqkbnr/1p3ppp/p1np4/1N2p3/4P3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "b5a3"
    ],
    "r1bqkbnr/1p3ppp/p1np4/4p3/4P3/N1N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "c8e6"
    ],
    "r2qkbnr/1p3ppp/p1npb3/4p3/4P3/N1N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "a3c4"
    ],
    "r2qkbnr/1p3ppp/p1npb3/4p3/2N1P3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "a8c8"
    ],
    "rnbqkbnr/pp1p1ppp/4p3/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
        "d2d4"
    ],
    "rnbqkbnr/pp1p1ppp/4p3/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3": [
        "c5d4"
    ],
    "rnbqkbnr/pp1p1ppp/4p3/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f3d4"
    ],
    "rnbqkbnr/pp1p1ppp/4p3/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -": [
        "b8c6",
        "a7a6"
    ],
    "r1bqkbnr/pp1p1ppp/2n1p3/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "r1bqkbnr/pp1p1ppp/2n1p3/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -": [
        "d8c7"
    ],
    "r1b1kbnr/ppqp1ppp/2n1p3/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1e3"
    ],
    "r1b1kbnr/ppqp1ppp/2n1p3/8/3NP3/2N1B3/PPP2PPP/R2QKB1R b KQkq -": [
        "a7a6"
    ],
    "r1b1kbnr/1pqp1ppp/p1n1p3/8/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq -": [
        "f1e2"
    ],
    "r1b1kbnr/1pqp1ppp/p1n1p3/8/3NP3/2N1B3/PPP1BPPP/R2QK2R b KQkq -": [
        "g8f6"
    ],
    "r1b1kb1r/1pqp1ppp/p1n1pn2/8/3NP3/2N1B3/PPP1BPPP/R2QK2R w KQkq -": [
        "e1g1"
    ],
    "r1b1kb1r/1pqp1ppp/p1n1pn2/8/3NP3/2N1B3/PPP1BPPP/R2Q1RK1 b kq -": [
        "f8b4"
    ],
    "r1b1k2r/1pqp1ppp/p1n1pn2/8/1b1NP3/2N1B3/PPP1BPPP/R2Q1RK1 w kq -": [
        "c3a4"
    ],
    "r1b1k2r/1pqp1ppp/p1n1pn2/8/Nb1NP3/4B3/PPP1BPPP/R2Q1RK1 b kq -": [
        "b4e7"
    ],
    "rnbqkbnr/1p1p1ppp/p3p3/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -": [
        "f1d3"
    ],
    "rnbqkbnr/1p1p1ppp/p3p3/8/3NP3/3B4/PPP2PPP/RNBQK2R b KQkq -": [
        "f8c5"
    ],
    "rnbqk1nr/1p1p1ppp/p3p3/2b5/3NP3/3B4/PPP2PPP/RNBQK2R w KQkq -": [
        "d4b3"
    ],
    "rnbqk1nr/1p1p1ppp/p3p3/2b5/4P3/1N1B4/PPP2PPP/RNBQK2R b KQkq -": [
        "c5a7"
    ],
    "rnbqk1nr/bp1p1ppp/p3p3/8/4P3/1N1B4/PPP2PPP/RNBQK2R w KQkq -": [
        "d1e2"
    ],
    "rnbqk1nr/bp1p1ppp/p3p3/8/4P3/1N1B4/PPP1QPPP/RNB1K2R b KQkq -": [
        "b8c6"
    ],
    "r1bqk1nr/bp1p1ppp/p1n1p3/8/4P3/1N1B4/PPP1QPPP/RNB1K2R w KQkq -": [
        "c1e3"
    ],
    "r1bqk1nr/bp1p1ppp/p1n1p3/8/4P3/1N1BB3/PPP1QPPP/RN2K2R b KQkq -": [
        "d7d6"
    ],
    "rnbqkb1r/pp3ppp/3ppn2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "f1e2"
    ],
    "rnbqkb1r/pp3ppp/3ppn2/8/3NP3/2N5/PPP1BPPP/R1BQK2R b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/pp2bppp/3ppn2/8/3NP3/2N5/PPP1BPPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqk2r/pp2bppp/3ppn2/8/3NP3/2N5/PPP1BPPP/R1BQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbq1rk1/pp2bppp/3ppn2/8/3NP3/2N5/PPP1BPPP/R1BQ1RK1 w - -": [
        "c1e3"
    ],
    "rnbq1rk1/pp2bppp/3ppn2/8/3NP3/2N1B3/PPP1BPPP/R2Q1RK1 b - -": [
        "b8c6"
    ],
    "r1bq1rk1/pp2bppp/2nppn2/8/3NP3/2N1B3/PPP1BPPP/R2Q1RK1 w - -": [
        "f2f4"
    ],
    "r1bqkb1r/pp2pppp/2np1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1g5"
    ],
    "r1bqkb1r/pp2pppp/2np1n2/6B1/3NP3/2N5/PPP2PPP/R2QKB1R b KQkq -": [
        "e7e6"
    ],
    "r1bqkb1r/pp3ppp/2nppn2/6B1/3NP3/2N5/PPP2PPP/R2QKB1R w KQkq -": [
        "d1d2"
    ],
    "r1bqkb1r/pp3ppp/2nppn2/6B1/3NP3/2N5/PPPQ1PPP/R3KB1R b KQkq -": [
        "a7a6"
    ],
    "r1bqkb1r/1p3ppp/p1nppn2/6B1/3NP3/2N5/PPPQ1PPP/R3KB1R w KQkq -": [
        "e1c1"
    ],
    "r1bqkb1r/1p3ppp/p1nppn2/6B1/3NP3/2N5/PPPQ1PPP/2KR1B1R b kq -": [
        "c8d7"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq -": [
        "d7d5",
        "g8f6"
    ],
    "rnbqkbnr/pp2pppp/8/2pp4/4P3/2P5/PP1P1PPP/RNBQKBNR w KQkq d6": [
        "e4d5"
    ],
    "rnbqkbnr/pp2pppp/8/2pP4/8/2P5/PP1P1PPP/RNBQKBNR b KQkq -": [
        "d8d5"
    ],
    "rnb1kbnr/pp2pppp/8/2pq4/8/2P5/PP1P1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnb1kbnr/pp2pppp/8/2pq4/3P4/2P5/PP3PPP/RNBQKBNR b KQkq d3": [
        "g8f6"
    ],
    "rnb1kb1r/pp2pppp/5n2/2pq4/3P4/2P5/PP3PPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnb1kb1r/pp2pppp/5n2/2pq4/3P4/2P2N2/PP3PPP/RNBQKB1R b KQkq -": [
        "e7e6"
    ],
    "rnb1kb1r/pp3ppp/4pn2/2pq4/3P4/2P2N2/PP3PPP/RNBQKB1R w KQkq -": [
        "f1d3"
    ],
    "rnb1kb1r/pp3ppp/4pn2/2pq4/3P4/2PB1N2/PP3PPP/RNBQK2R b KQkq -": [
        "c5d4"
    ],
    "rnb1kb1r/pp3ppp/4pn2/3q4/3p4/2PB1N2/PP3PPP/RNBQK2R w KQkq -": [
        "c3d4"
    ],
    "rnb1kb1r/pp3ppp/4pn2/3q4/3P4/3B1N2/PP3PPP/RNBQK2R b KQkq -": [
        "f8e7"
    ],
    "rnb1k2r/pp2bppp/4pn2/3q4/3P4/3B1N2/PP3PPP/RNBQK2R w KQkq -": [
        "b1c3"
    ],
    "rnb1k2r/pp2bppp/4pn2/3q4/3P4/2NB1N2/PP3PPP/R1BQK2R b KQkq -": [
        "d5d6"
    ],
    "rnbqkb1r/pp1ppppp/5n2/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR w KQkq -": [
        "e4e5"
    ],
    "rnbqkb1r/pp1ppppp/5n2/2p1P3/8/2P5/PP1P1PPP/RNBQKBNR b KQkq -": [
        "f6d5"
    ],
    "rnbqkb1r/pp1ppppp/8/2pnP3/8/2P5/PP1P1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnbqkb1r/pp1ppppp/8/2pnP3/3P4/2P5/PP3PPP/RNBQKBNR b KQkq d3": [
        "c5d4"
    ],
    "rnbqkb1r/pp1ppppp/8/3nP3/3p4/2P5/PP3PPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/pp1ppppp/8/3nP3/3p4/2P2N2/PP3PPP/RNBQKB1R b KQkq -": [
        "b8c6"
    ],
    "r1bqkb1r/pp1ppppp/2n5/3nP3/3p4/2P2N2/PP3PPP/RNBQKB1R w KQkq -": [
        "f1c4"
    ],
    "r1bqkb1r/pp1ppppp/2n5/3nP3/2Bp4/2P2N2/PP3PPP/RNBQK2R b KQkq -": [
        "d5b6"
    ],
    "r1bqkb1r/pp1ppppp/1nn5/4P3/2Bp4/2P2N2/PP3PPP/RNBQK2R w KQkq -": [
        "c4b3"
    ],
    "r1bqkb1r/pp1ppppp/1nn5/4P3/3p4/1BP2N2/PP3PPP/RNBQK2R b KQkq -": [
        "d7d5"
    ],
    "r1bqkb1r/pp2pppp/1nn5/3pP3/3p4/1BP2N2/PP3PPP/RNBQK2R w KQkq d6": [
        "e5d6"
    ],
    "r1bqkb1r/pp2pppp/1nnP4/8/3p4/1BP2N2/PP3PPP/RNBQK2R b KQkq -": [
        "d8d6"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -": [
        "b8c6"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq -": [
        "g2g3",
        "f2f4"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/2N3P1/PPPP1P1P/R1BQKBNR b KQkq -": [
        "g7g6"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/2p5/4P3/2N3P1/PPPP1P1P/R1BQKBNR w KQkq -": [
        "f1g2"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/2p5/4P3/2N3P1/PPPP1PBP/R1BQK1NR b KQkq -": [
        "f8g7"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/2p5/4P3/2N3P1/PPPP1PBP/R1BQK1NR w KQkq -": [
        "d2d3"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/2p5/4P3/2NP2P1/PPP2PBP/R1BQK1NR b KQkq -": [
        "d7d6"
    ],
    "r1bqk1nr/pp2ppbp/2np2p1/2p5/4P3/2NP2P1/PPP2PBP/R1BQK1NR w KQkq -": [
        "c1e3"
    ],
    "r1bqk1nr/pp2ppbp/2np2p1/2p5/4P3/2NPB1P1/PPP2PBP/R2QK1NR b KQkq -": [
        "e7e5"
    ],
    "r1bqk1nr/pp3pbp/2np2p1/2p1p3/4P3/2NPB1P1/PPP2PBP/R2QK1NR w KQkq e6": [
        "d1d2"
    ],
    "r1bqk1nr/pp3pbp/2np2p1/2p1p3/4P3/2NPB1P1/PPPQ1PBP/R3K1NR b KQkq -": [
        "g8e7"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/4PP2/2N5/PPPP2PP/R1BQKBNR b KQkq f3": [
        "g7g6"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/2p5/4PP2/2N5/PPPP2PP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/2p5/4PP2/2N2N2/PPPP2PP/R1BQKB1R b KQkq -": [
        "f8g7"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/2p5/4PP2/2N2N2/PPPP2PP/R1BQKB1R w KQkq -": [
        "f1c4"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/2p5/2B1PP2/2N2N2/PPPP2PP/R1BQK2R b KQkq -": [
        "e7e6"
    ],
    "r1bqk1nr/pp1p1pbp/2n1p1p1/2p5/2B1PP2/2N2N2/PPPP2PP/R1BQK2R w KQkq -": [
        "f4f5"
    ],
    "r1bqk1nr/pp1p1pbp/2n1p1p1/2p2P2/2B1P3/2N2N2/PPPP2PP/R1BQK2R b KQkq -": [
        "g8e7"
    ],
    "r1bqk2r/pp1pnpbp/2n1p1p1/2p2P2/2B1P3/2N2N2/PPPP2PP/R1BQK2R w KQkq -": [
        "f5e6"
    ],
    "r1bqk2r/pp1pnpbp/2n1P1p1/2p5/2B1P3/2N2N2/PPPP2PP/R1BQK2R b KQkq -": [
        "f7e6"
    ],
    "r1bqk2r/pp1pn1bp/2n1p1p1/2p5/2B1P3/2N2N2/PPPP2PP/R1BQK2R w KQkq -": [
        "d2d3"
    ],
    "r1bqk2r/pp1pn1bp/2n1p1p1/2p5/2B1P3/2NP1N2/PPP3PP/R1BQK2R b KQkq -": [
        "d7d5"
    ],
    "r1bqkbnr/pp1ppppp/2n5/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "g7g6"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/1Bp5/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq -": [
        "f8g7"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/1Bp5/4P3/5N2/PPPP1PPP/RNBQ1RK1 w kq -": [
        "c2c3"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/1Bp5/4P3/2P2N2/PP1P1PPP/RNBQ1RK1 b kq -": [
        "g8f6"
    ],
    "r1bqk2r/pp1pppbp/2n2np1/1Bp5/4P3/2P2N2/PP1P1PPP/RNBQ1RK1 w kq -": [
        "f1e1"
    ],
    "r1bqk2r/pp1pppbp/2n2np1/1Bp5/4P3/2P2N2/PP1P1PPP/RNBQR1K1 b kq -": [
        "e8g8"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/1Bp5/4P3/2P2N2/PP1P1PPP/RNBQR1K1 w - -": [
        "d2d4"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/1Bp5/3PP3/2P2N2/PP3PPP/RNBQR1K1 b - d3": [
        "c5d4"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/1B6/3pP3/2P2N2/PP3PPP/RNBQR1K1 w - -": [
        "c3d4"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/1B6/3PP3/5N2/PP3PPP/RNBQR1K1 b - -": [
        "d7d5"
    ],
    "rnbqkbnr/pp2pppp/3p4/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "c8d7"
    ],
    "rn1qkbnr/pp1bpppp/3p4/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "b5d7"
    ],
    "rn1qkbnr/pp1Bpppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
        "d8d7"
    ],
    "rn2kbnr/pp1qpppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rn2kbnr/pp1qpppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq -": [
        "g8f6"
    ],
    "rn2kb1r/pp1qpppp/3p1n2/2p5/4P3/5N2/PPPP1PPP/RNBQ1RK1 w kq -": [
        "f1e1"
    ],
    "rn2kb1r/pp1qpppp/3p1n2/2p5/4P3/5N2/PPPP1PPP/RNBQR1K1 b kq -": [
        "b8c6"
    ],
    "r3kb1r/pp1qpppp/2np1n2/2p5/4P3/5N2/PPPP1PPP/RNBQR1K1 w kq -": [
        "c2c3"
    ],
    "r3kb1r/pp1qpppp/2np1n2/2p5/4P3/2P2N2/PP1P1PPP/RNBQR1K1 b kq -": [
        "e7e6"
    ],
    "r3kb1r/pp1q1ppp/2nppn2/2p5/4P3/2P2N2/PP1P1PPP/RNBQR1K1 w kq -": [
        "d2d4"
    ],
    "r3kb1r/pp1q1ppp/2nppn2/2p5/3PP3/2P2N2/PP3PPP/RNBQR1K1 b kq d3": [
        "c5d4"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "c5d4"
    ],
    "rnbqkbnr/pp1ppppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "c2c3"
    ],
    "rnbqkbnr/pp1ppppp/8/8/3pP3/2P5/PP3PPP/RNBQKBNR b KQkq -": [
        "d4c3"
    ],
    "rnbqkbnr/pp1ppppp/8/8/4P3/2p5/PP3PPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqkbnr/pp1ppppp/8/8/4P3/2N5/PP3PPP/R1BQKBNR b KQkq -": [
        "b8c6"
    ],
    "r1bqkbnr/pp1ppppp/2n5/8/4P3/2N5/PP3PPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "r1bqkbnr/pp1ppppp/2n5/8/4P3/2N2N2/PP3PPP/R1BQKB1R b KQkq -": [
        "e7e6"
    ],
    "r1bqkbnr/pp1p1ppp/2n1p3/8/4P3/2N2N2/PP3PPP/R1BQKB1R w KQkq -": [
        "f1c4"
    ],
    "r1bqkbnr/pp1p1ppp/2n1p3/8/2B1P3/2N2N2/PP3PPP/R1BQK2R b KQkq -": [
        "a7a6"
    ],
    "r1bqkbnr/1p1p1ppp/p1n1p3/8/2B1P3/2N2N2/PP3PPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqkbnr/1p1p1ppp/p1n1p3/8/2B1P3/2N2N2/PP3PPP/R1BQ1RK1 b kq -": [
        "g8e7"
    ],
    "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "d7d5"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6": [
        "e4e5",
        "b1c3",
        "b1d2",
        "e4d5"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq -": [
        "c7c5"
    ],
    "rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq c6": [
        "c2c3"
    ],
    "rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/2P5/PP3PPP/RNBQKBNR b KQkq -": [
        "b8c6"
    ],
    "r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2P5/PP3PPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R b KQkq -": [
        "d8b6"
    ],
    "r1b1kbnr/pp3ppp/1qn1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R w KQkq -": [
        "a2a3"
    ],
    "r1b1kbnr/pp3ppp/1qn1p3/2ppP3/3P4/P1P2N2/1P3PPP/RNBQKB1R b KQkq -": [
        "c5c4"
    ],
    "r1b1kbnr/pp3ppp/1qn1p3/3pP3/2pP4/P1P2N2/1P3PPP/RNBQKB1R w KQkq -": [
        "b1d2"
    ],
    "r1b1kbnr/pp3ppp/1qn1p3/3pP3/2pP4/P1P2N2/1P1N1PPP/R1BQKB1R b KQkq -": [
        "c6a5"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq -": [
        "f8b4",
        "g8f6"
    ],
    "rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -": [
        "e4e5"
    ],
    "rnbqk1nr/ppp2ppp/4p3/3pP3/1b1P4/2N5/PPP2PPP/R1BQKBNR b KQkq -": [
        "c7c5"
    ],
    "rnbqk1nr/pp3ppp/4p3/2ppP3/1b1P4/2N5/PPP2PPP/R1BQKBNR w KQkq c6": [
        "a2a3"
    ],
    "rnbqk1nr/pp3ppp/4p3/2ppP3/1b1P4/P1N5/1PP2PPP/R1BQKBNR b KQkq -": [
        "b4c3"
    ],
    "rnbqk1nr/pp3ppp/4p3/2ppP3/3P4/P1b5/1PP2PPP/R1BQKBNR w KQkq -": [
        "b2c3"
    ],
    "rnbqk1nr/pp3ppp/4p3/2ppP3/3P4/P1P5/2P2PPP/R1BQKBNR b KQkq -": [
        "g8e7"
    ],
    "rnbqk2r/pp2nppp/4p3/2ppP3/3P4/P1P5/2P2PPP/R1BQKBNR w KQkq -": [
        "d1g4"
    ],
    "rnbqk2r/pp2nppp/4p3/2ppP3/3P2Q1/P1P5/2P2PPP/R1B1KBNR b KQkq -": [
        "c5d4"
    ],
    "rnbqk2r/pp2nppp/4p3/3pP3/3p2Q1/P1P5/2P2PPP/R1B1KBNR w KQkq -": [
        "g4g7"
    ],
    "rnbqk2r/pp2npQp/4p3/3pP3/3p4/P1P5/2P2PPP/R1B1KBNR b KQkq -": [
        "h8g8"
    ],
    "rnbqk1r1/pp2npQp/4p3/3pP3/3p4/P1P5/2P2PPP/R1B1KBNR w KQq -": [
        "g7h7"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -": [
        "c1g5"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p2B1/3PP3/2N5/PPP2PPP/R2QKBNR b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/ppp1bppp/4pn2/3p2B1/3PP3/2N5/PPP2PPP/R2QKBNR w KQkq -": [
        "e4e5"
    ],
    "rnbqk2r/ppp1bppp/4pn2/3pP1B1/3P4/2N5/PPP2PPP/R2QKBNR b KQkq -": [
        "f6d7"
    ],
    "rnbqk2r/pppnbppp/4p3/3pP1B1/3P4/2N5/PPP2PPP/R2QKBNR w KQkq -": [
        "g5e7"
    ],
    "rnbqk2r/pppnBppp/4p3/3pP3/3P4/2N5/PPP2PPP/R2QKBNR b KQkq -": [
        "d8e7"
    ],
    "rnb1k2r/pppnqppp/4p3/3pP3/3P4/2N5/PPP2PPP/R2QKBNR w KQkq -": [
        "f2f4"
    ],
    "rnb1k2r/pppnqppp/4p3/3pP3/3P1P2/2N5/PPP3PP/R2QKBNR b KQkq f3": [
        "e8g8"
    ],
    "rnb2rk1/pppnqppp/4p3/3pP3/3P1P2/2N5/PPP3PP/R2QKBNR w KQ -": [
        "g1f3"
    ],
    "rnb2rk1/pppnqppp/4p3/3pP3/3P1P2/2N2N2/PPP3PP/R2QKB1R b KQ -": [
        "c7c5"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPPN1PPP/R1BQKBNR b KQkq -": [
        "c7c5",
        "g8f6"
    ],
    "rnbqkbnr/pp3ppp/4p3/2pp4/3PP3/8/PPPN1PPP/R1BQKBNR w KQkq c6": [
        "e4d5"
    ],
    "rnbqkbnr/pp3ppp/4p3/2pP4/3P4/8/PPPN1PPP/R1BQKBNR b KQkq -": [
        "e6d5"
    ],
    "rnbqkbnr/pp3ppp/8/2pp4/3P4/8/PPPN1PPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkbnr/pp3ppp/8/2pp4/3P4/5N2/PPPN1PPP/R1BQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pp3ppp/5n2/2pp4/3P4/5N2/PPPN1PPP/R1BQKB1R w KQkq -": [
        "f1b5"
    ],
    "rnbqkb1r/pp3ppp/5n2/1Bpp4/3P4/5N2/PPPN1PPP/R1BQK2R b KQkq -": [
        "c8d7"
    ],
    "rn1qkb1r/pp1b1ppp/5n2/1Bpp4/3P4/5N2/PPPN1PPP/R1BQK2R w KQkq -": [
        "b5d7"
    ],
    "rn1qkb1r/pp1B1ppp/5n2/2pp4/3P4/5N2/PPPN1PPP/R1BQK2R b KQkq -": [
        "b8d7"
    ],
    "r2qkb1r/pp1n1ppp/5n2/2pp4/3P4/5N2/PPPN1PPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "r2qkb1r/pp1n1ppp/5n2/2pp4/3P4/5N2/PPPN1PPP/R1BQ1RK1 b kq -": [
        "f8e7"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p4/3PP3/8/PPPN1PPP/R1BQKBNR w KQkq -": [
        "e4e5"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3pP3/3P4/8/PPPN1PPP/R1BQKBNR b KQkq -": [
        "f6d7"
    ],
    "rnbqkb1r/pppn1ppp/4p3/3pP3/3P4/8/PPPN1PPP/R1BQKBNR w KQkq -": [
        "f1d3"
    ],
    "rnbqkb1r/pppn1ppp/4p3/3pP3/3P4/3B4/PPPN1PPP/R1BQK1NR b KQkq -": [
        "c7c5"
    ],
    "rnbqkb1r/pp1n1ppp/4p3/2ppP3/3P4/3B4/PPPN1PPP/R1BQK1NR w KQkq c6": [
        "c2c3"
    ],
    "rnbqkb1r/pp1n1ppp/4p3/2ppP3/3P4/2PB4/PP1N1PPP/R1BQK1NR b KQkq -": [
        "b8c6"
    ],
    "r1bqkb1r/pp1n1ppp/2n1p3/2ppP3/3P4/2PB4/PP1N1PPP/R1BQK1NR w KQkq -": [
        "g1e2"
    ],
    "r1bqkb1r/pp1n1ppp/2n1p3/2ppP3/3P4/2PB4/PP1NNPPP/R1BQK2R b KQkq -": [
        "c5d4"
    ],
    "r1bqkb1r/pp1n1ppp/2n1p3/3pP3/3p4/2PB4/PP1NNPPP/R1BQK2R w KQkq -": [
        "c3d4"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3P4/3P4/8/PPP2PPP/RNBQKBNR b KQkq -": [
        "e6d5"
    ],
    "rnbqkbnr/ppp2ppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "f1d3"
    ],
    "rnbqkbnr/ppp2ppp/8/3p4/3P4/3B4/PPP2PPP/RNBQK1NR b KQkq -": [
        "b8c6"
    ],
    "r1bqkbnr/ppp2ppp/2n5/3p4/3P4/3B4/PPP2PPP/RNBQK1NR w KQkq -": [
        "c2c3"
    ],
    "r1bqkbnr/ppp2ppp/2n5/3p4/3P4/2PB4/PP3PPP/RNBQK1NR b KQkq -": [
        "f8d6"
    ],
    "r1bqk1nr/ppp2ppp/2nb4/3p4/3P4/2PB4/PP3PPP/RNBQK1NR w KQkq -": [
        "g1f3"
    ],
    "r1bqk1nr/ppp2ppp/2nb4/3p4/3P4/2PB1N2/PP3PPP/RNBQK2R b KQkq -": [
        "g8e7"
    ],
    "r1bqk2r/ppp1nppp/2nb4/3p4/3P4/2PB1N2/PP3PPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqk2r/ppp1nppp/2nb4/3p4/3P4/2PB1N2/PP3PPP/RNBQ1RK1 b kq -": [
        "c8g4"
    ],
    "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "d2d4",
        "b1c3"
    ],
    "rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "d7d5"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6": [
        "b1c3",
        "e4e5",
        "e4d5"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq -": [
        "d5e4"
    ],
    "rnbqkbnr/pp2pppp/2p5/8/3Pp3/2N5/PPP2PPP/R1BQKBNR w KQkq -": [
        "c3e4"
    ],
    "rnbqkbnr/pp2pppp/2p5/8/3PN3/8/PPP2PPP/R1BQKBNR b KQkq -": [
        "c8f5",
        "g8f6"
    ],
    "rn1qkbnr/pp2pppp/2p5/5b2/3PN3/8/PPP2PPP/R1BQKBNR w KQkq -": [
        "e4g3"
    ],
    "rn1qkbnr/pp2pppp/2p5/5b2/3P4/6N1/PPP2PPP/R1BQKBNR b KQkq -": [
        "f5g6"
    ],
    "rn1qkbnr/pp2pppp/2p3b1/8/3P4/6N1/PPP2PPP/R1BQKBNR w KQkq -": [
        "h2h4"
    ],
    "rn1qkbnr/pp2pppp/2p3b1/8/3P3P/6N1/PPP2PP1/R1BQKBNR b KQkq h3": [
        "h7h6"
    ],
    "rn1qkbnr/pp2ppp1/2p3bp/8/3P3P/6N1/PPP2PP1/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rn1qkbnr/pp2ppp1/2p3bp/8/3P3P/5NN1/PPP2PP1/R1BQKB1R b KQkq -": [
        "b8d7"
    ],
    "r2qkbnr/pp1nppp1/2p3bp/8/3P3P/5NN1/PPP2PP1/R1BQKB1R w KQkq -": [
        "h4h5"
    ],
    "r2qkbnr/pp1nppp1/2p3bp/7P/3P4/5NN1/PPP2PP1/R1BQKB1R b KQkq -": [
        "g6h7"
    ],
    "r2qkbnr/pp1npppb/2p4p/7P/3P4/5NN1/PPP2PP1/R1BQKB1R w KQkq -": [
        "f1d3"
    ],
    "r2qkbnr/pp1npppb/2p4p/7P/3P4/3B1NN1/PPP2PP1/R1BQK2R b KQkq -": [
        "h7d3"
    ],
    "r2qkbnr/pp1nppp1/2p4p/7P/3P4/3b1NN1/PPP2PP1/R1BQK2R w KQkq -": [
        "d1d3"
    ],
    "rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq -": [
        "c8f5"
    ],
    "rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq -": [
        "e7e6"
    ],
    "rn1qkbnr/pp3ppp/2p1p3/3pPb2/3P4/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f1e2"
    ],
    "rn1qkbnr/pp3ppp/2p1p3/3pPb2/3P4/5N2/PPP1BPPP/RNBQK2R b KQkq -": [
        "c6c5"
    ],
    "rn1qkbnr/pp3ppp/4p3/2ppPb2/3P4/5N2/PPP1BPPP/RNBQK2R w KQkq -": [
        "c1e3"
    ],
    "rn1qkbnr/pp3ppp/4p3/2ppPb2/3P4/4BN2/PPP1BPPP/RN1QK2R b KQkq -": [
        "d8b6"
    ],
    "rn2kbnr/pp3ppp/1q2p3/2ppPb2/3P4/4BN2/PPP1BPPP/RN1QK2R w KQkq -": [
        "b1c3"
    ],
    "rn2kbnr/pp3ppp/1q2p3/2ppPb2/3P4/2N1BN2/PPP1BPPP/R2QK2R b KQkq -": [
        "b8c6"
    ],
    "r3kbnr/pp3ppp/1qn1p3/2ppPb2/3P4/2N1BN2/PPP1BPPP/R2QK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqkbnr/pp2pppp/2p5/3P4/3P4/8/PPP2PPP/RNBQKBNR b KQkq -": [
        "c6d5"
    ],
    "rnbqkbnr/pp2pppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "c2c4"
    ],
    "rnbqkbnr/pp2pppp/8/3p4/2PP4/8/PP3PPP/RNBQKBNR b KQkq c3": [
        "g8f6"
    ],
    "rnbqkb1r/pp2pppp/5n2/3p4/2PP4/8/PP3PPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/pp2pppp/5n2/3p4/2PP4/2N5/PP3PPP/R1BQKBNR b KQkq -": [
        "e7e6"
    ],
    "rnbqkb1r/pp3ppp/4pn2/3p4/2PP4/2N5/PP3PPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/pp3ppp/4pn2/3p4/2PP4/2N2N2/PP3PPP/R1BQKB1R b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/pp2bppp/4pn2/3p4/2PP4/2N2N2/PP3PPP/R1BQKB1R w KQkq -": [
        "c4d5"
    ],
    "rnbqk2r/pp2bppp/4pn2/3P4/3P4/2N2N2/PP3PPP/R1BQKB1R b KQkq -": [
        "f6d5"
    ],
    "rnbqk2r/pp2bppp/4p3/3n4/3P4/2N2N2/PP3PPP/R1BQKB1R w KQkq -": [
        "f1d3"
    ],
    "rnbqkbnr/pp1ppppp/2p5/8/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -": [
        "d7d5"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq d6": [
        "g1f3"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/4P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq -": [
        "c8g4"
    ],
    "rn1qkbnr/pp2pppp/2p5/3p4/4P1b1/2N2N2/PPPP1PPP/R1BQKB1R w KQkq -": [
        "h2h3"
    ],
    "rn1qkbnr/pp2pppp/2p5/3p4/4P1b1/2N2N1P/PPPP1PP1/R1BQKB1R b KQkq -": [
        "g4f3"
    ],
    "rn1qkbnr/pp2pppp/2p5/3p4/4P3/2N2b1P/PPPP1PP1/R1BQKB1R w KQkq -": [
        "d1f3"
    ],
    "rn1qkbnr/pp2pppp/2p5/3p4/4P3/2N2Q1P/PPPP1PP1/R1B1KB1R b KQkq -": [
        "e7e6"
    ],
    "rn1qkbnr/pp3ppp/2p1p3/3p4/4P3/2N2Q1P/PPPP1PP1/R1B1KB1R w KQkq -": [
        "d2d4"
    ],
    "rn1qkbnr/pp3ppp/2p1p3/3p4/3PP3/2N2Q1P/PPP2PP1/R1B1KB1R b KQkq d3": [
        "g8f6"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/3p4/3PP3/2N2Q1P/PPP2PP1/R1B1KB1R w KQkq -": [
        "c1d2"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/3p4/3PP3/2N2Q1P/PPPB1PP1/R3KB1R b KQkq -": [
        "d5e4"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/8/3Pp3/2N2Q1P/PPPB1PP1/R3KB1R w KQkq -": [
        "c3e4"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/8/3PN3/5Q1P/PPPB1PP1/R3KB1R b KQkq -": [
        "b8d7"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/8/3PN3/8/PPP2PPP/R1BQKBNR w KQkq -": [
        "e4f6"
    ],
    "rnbqkb1r/pp2pppp/2p2N2/8/3P4/8/PPP2PPP/R1BQKBNR b KQkq -": [
        "e7f6"
    ],
    "rnbqkb1r/pp3ppp/2p2p2/8/3P4/8/PPP2PPP/R1BQKBNR w KQkq -": [
        "c2c3"
    ],
    "rnbqkb1r/pp3ppp/2p2p2/8/3P4/2P5/PP3PPP/R1BQKBNR b KQkq -": [
        "f8d6"
    ],
    "rnbqk2r/pp3ppp/2pb1p2/8/3P4/2P5/PP3PPP/R1BQKBNR w KQkq -": [
        "f1d3"
    ],
    "rnbqk2r/pp3ppp/2pb1p2/8/3P4/2PB4/PP3PPP/R1BQK1NR b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/pp3ppp/2pb1p2/8/3P4/2PB4/PP3PPP/R1BQK1NR w KQ -": [
        "g1e2"
    ],
    "rnbq1rk1/pp3ppp/2pb1p2/8/3P4/2PB4/PP2NPPP/R1BQK2R b KQ -": [
        "f8e8"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": [
        "e4d5"
    ],
    "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq -": [
        "d8d5",
        "g8f6"
    ],
    "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq -": [
        "d5a5"
    ],
    "rnb1kbnr/ppp1pppp/8/q7/8/2N5/PPPP1PPP/R1BQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnb1kbnr/ppp1pppp/8/q7/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq d3": [
        "g8f6"
    ],
    "rnb1kb1r/ppp1pppp/5n2/q7/3P4/2N5/PPP2PPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnb1kb1r/ppp1pppp/5n2/q7/3P4/2N2N2/PPP2PPP/R1BQKB1R b KQkq -": [
        "c7c6"
    ],
    "rnb1kb1r/pp2pppp/2p2n2/q7/3P4/2N2N2/PPP2PPP/R1BQKB1R w KQkq -": [
        "f1c4"
    ],
    "rnb1kb1r/pp2pppp/2p2n2/q7/2BP4/2N2N2/PPP2PPP/R1BQK2R b KQkq -": [
        "c8f5"
    ],
    "rn2kb1r/pp2pppp/2p2n2/q4b2/2BP4/2N2N2/PPP2PPP/R1BQK2R w KQkq -": [
        "c1d2"
    ],
    "rn2kb1r/pp2pppp/2p2n2/q4b2/2BP4/2N2N2/PPPB1PPP/R2QK2R b KQkq -": [
        "e7e6"
    ],
    "rn2kb1r/pp3ppp/2p1pn2/q4b2/2BP4/2N2N2/PPPB1PPP/R2QK2R w KQkq -": [
        "c3d5"
    ],
    "rn2kb1r/pp3ppp/2p1pn2/q2N1b2/2BP4/5N2/PPPB1PPP/R2QK2R b KQkq -": [
        "a5d8"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3P4/3P4/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "f6d5"
    ],
    "rnbqkb1r/ppp1pppp/8/3n4/3P4/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/ppp1pppp/8/3n4/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq -": [
        "g7g6"
    ],
    "rnbqkb1r/ppp1pp1p/6p1/3n4/3P4/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f1e2"
    ],
    "rnbqkb1r/ppp1pp1p/6p1/3n4/3P4/5N2/PPP1BPPP/RNBQK2R b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/ppp1ppbp/6p1/3n4/3P4/5N2/PPP1BPPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqk2r/ppp1ppbp/6p1/3n4/3P4/5N2/PPP1BPPP/RNBQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1ppbp/6p1/3n4/3P4/5N2/PPP1BPPP/RNBQ1RK1 w - -": [
        "c2c4"
    ],
    "rnbq1rk1/ppp1ppbp/6p1/3n4/2PP4/5N2/PP2BPPP/RNBQ1RK1 b - c3": [
        "d5b6"
    ],
    "rnbq1rk1/ppp1ppbp/1n4p1/8/2PP4/5N2/PP2BPPP/RNBQ1RK1 w - -": [
        "b1c3"
    ],
    "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "e4e5"
    ],
    "rnbqkb1r/pppppppp/5n2/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq -": [
        "f6d5"
    ],
    "rnbqkb1r/pppppppp/8/3nP3/8/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnbqkb1r/pppppppp/8/3nP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "d7d6"
    ],
    "rnbqkb1r/ppp1pppp/3p4/3nP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/ppp1pppp/3p4/3nP3/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq -": [
        "c8g4"
    ],
    "rn1qkb1r/ppp1pppp/3p4/3nP3/3P2b1/5N2/PPP2PPP/RNBQKB1R w KQkq -": [
        "f1e2"
    ],
    "rn1qkb1r/ppp1pppp/3p4/3nP3/3P2b1/5N2/PPP1BPPP/RNBQK2R b KQkq -": [
        "e7e6"
    ],
    "rn1qkb1r/ppp2ppp/3pp3/3nP3/3P2b1/5N2/PPP1BPPP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rn1qkb1r/ppp2ppp/3pp3/3nP3/3P2b1/5N2/PPP1BPPP/RNBQ1RK1 b kq -": [
        "f8e7"
    ],
    "rn1qk2r/ppp1bppp/3pp3/3nP3/3P2b1/5N2/PPP1BPPP/RNBQ1RK1 w kq -": [
        "c2c4"
    ],
    "rn1qk2r/ppp1bppp/3pp3/3nP3/2PP2b1/5N2/PP2BPPP/RNBQ1RK1 b kq c3": [
        "d5b6"
    ],
    "rn1qk2r/ppp1bppp/1n1pp3/4P3/2PP2b1/5N2/PP2BPPP/RNBQ1RK1 w kq -": [
        "b1c3"
    ],
    "rn1qk2r/ppp1bppp/1n1pp3/4P3/2PP2b1/2N2N2/PP2BPPP/R1BQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnbqkbnr/ppp1pppp/3p4/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "g8f6"
    ],
    "rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq -": [
        "g7g6"
    ],
    "rnbqkb1r/ppp1pp1p/3p1np1/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/ppp1pp1p/3p1np1/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/ppp1ppbp/3p1np1/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq -": [
        "f1e2"
    ],
    "rnbqk2r/ppp1ppbp/3p1np1/8/3PP3/2N2N2/PPP1BPPP/R1BQK2R b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/3PP3/2N2N2/PPP1BPPP/R1BQK2R w KQ -": [
        "e1g1"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/3PP3/2N2N2/PPP1BPPP/R1BQ1RK1 b - -": [
        "c7c6"
    ],
    "rnbq1rk1/pp2ppbp/2pp1np1/8/3PP3/2N2N2/PPP1BPPP/R1BQ1RK1 w - -": [
        "a2a4"
    ],
    "rnbq1rk1/pp2ppbp/2pp1np1/8/P2PP3/2N2N2/1PP1BPPP/R1BQ1RK1 b - a3": [
        "a7a5"
    ],
    "rnbq1rk1/1p2ppbp/2pp1np1/p7/P2PP3/2N2N2/1PP1BPPP/R1BQ1RK1 w - a6": [
        "h2h3"
    ],
    "rnbq1rk1/1p2ppbp/2pp1np1/p7/P2PP3/2N2N1P/1PP1BPP1/R1BQ1RK1 b - -": [
        "b8a6"
    ],
    "rnbqkbnr/pppppp1p/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": [
        "d2d4"
    ],
    "rnbqkbnr/pppppp1p/6p1/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3": [
        "f8g7"
    ],
    "rnbqk1nr/ppppppbp/6p1/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqk1nr/ppppppbp/6p1/8/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq -": [
        "d7d6"
    ],
    "rnbqk1nr/ppp1ppbp/3p2p1/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqk1nr/ppp1ppbp/3p2p1/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq -": [
        "a7a6"
    ],
    "rnbqk1nr/1pp1ppbp/p2p2p1/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq -": [
        "c1e3"
    ],
    "rnbqk1nr/1pp1ppbp/p2p2p1/8/3PP3/2N1BN2/PPP2PPP/R2QKB1R b KQkq -": [
        "b7b5"
    ],
    "rnbqk1nr/2p1ppbp/p2p2p1/1p6/3PP3/2N1BN2/PPP2PPP/R2QKB1R w KQkq b6": [
        "f1d3"
    ],
    "rnbqk1nr/2p1ppbp/p2p2p1/1p6/3PP3/2NBBN2/PPP2PPP/R2QK2R b KQkq -": [
        "c8b7"
    ],
    "rn1qk1nr/1bp1ppbp/p2p2p1/1p6/3PP3/2NBBN2/PPP2PPP/R2QK2R w KQkq -": [
        "e1g1"
    ],
    "rn1qk1nr/1bp1ppbp/p2p2p1/1p6/3PP3/2NBBN2/PPP2PPP/R2Q1RK1 b kq -": [
        "b8d7"
    ],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": [
        "d7d5",
        "g8f6",
        "f7f5"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6": [
        "c2c4",
        "c1f4",
        "b1c3"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3": [
        "e7e6",
        "d5c4",
        "c7c6"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "c1g5",
        "c4d5"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq -": [
        "e2e3"
    ],
    "rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N1P3/PP3PPP/R2QKBNR b KQkq -": [
        "e8g8",
        "h7h6"
    ],
    "rnbq1rk1/ppp1bppp/4pn2/3p2B1/2PP4/2N1P3/PP3PPP/R2QKBNR w KQ -": [
        "g1f3"
    ],
    "rnbq1rk1/ppp1bppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R b KQ -": [
        "b8d7"
    ],
    "r1bq1rk1/pppnbppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ -": [
        "a1c1"
    ],
    "r1bq1rk1/pppnbppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/2RQKB1R b K -": [
        "c7c6"
    ],
    "r1bq1rk1/pp1nbppp/2p1pn2/3p2B1/2PP4/2N1PN2/PP3PPP/2RQKB1R w K -": [
        "f1d3"
    ],
    "r1bq1rk1/pp1nbppp/2p1pn2/3p2B1/2PP4/2NBPN2/PP3PPP/2RQK2R b K -": [
        "d5c4"
    ],
    "r1bq1rk1/pp1nbppp/2p1pn2/6B1/2pP4/2NBPN2/PP3PPP/2RQK2R w K -": [
        "d3c4"
    ],
    "rnbqk2r/ppp1bpp1/4pn1p/3p2B1/2PP4/2N1P3/PP3PPP/R2QKBNR w KQkq -": [
        "g5h4"
    ],
    "rnbqk2r/ppp1bpp1/4pn1p/3p4/2PP3B/2N1P3/PP3PPP/R2QKBNR b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1bpp1/4pn1p/3p4/2PP3B/2N1P3/PP3PPP/R2QKBNR w KQ -": [
        "g1f3"
    ],
    "rnbq1rk1/ppp1bpp1/4pn1p/3p4/2PP3B/2N1PN2/PP3PPP/R2QKB1R b KQ -": [
        "b7b6"
    ],
    "rnbq1rk1/p1p1bpp1/1p2pn1p/3p4/2PP3B/2N1PN2/PP3PPP/R2QKB1R w KQ -": [
        "f1d3"
    ],
    "rnbq1rk1/p1p1bpp1/1p2pn1p/3p4/2PP3B/2NBPN2/PP3PPP/R2QK2R b KQ -": [
        "c8b7"
    ],
    "rn1q1rk1/pbp1bpp1/1p2pn1p/3p4/2PP3B/2NBPN2/PP3PPP/R2QK2R w KQ -": [
        "e1g1"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3P4/3P4/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "e6d5"
    ],
    "rnbqkb1r/ppp2ppp/5n2/3p4/3P4/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "c1g5"
    ],
    "rnbqkb1r/ppp2ppp/5n2/3p2B1/3P4/2N5/PP2PPPP/R2QKBNR b KQkq -": [
        "c7c6"
    ],
    "rnbqkb1r/pp3ppp/2p2n2/3p2B1/3P4/2N5/PP2PPPP/R2QKBNR w KQkq -": [
        "e2e3"
    ],
    "rnbqkb1r/pp3ppp/2p2n2/3p2B1/3P4/2N1P3/PP3PPP/R2QKBNR b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/pp2bppp/2p2n2/3p2B1/3P4/2N1P3/PP3PPP/R2QKBNR w KQkq -": [
        "f1d3"
    ],
    "rnbqk2r/pp2bppp/2p2n2/3p2B1/3P4/2NBP3/PP3PPP/R2QK1NR b KQkq -": [
        "b8d7"
    ],
    "r1bqk2r/pp1nbppp/2p2n2/3p2B1/3P4/2NBP3/PP3PPP/R2QK1NR w KQkq -": [
        "d1c2"
    ],
    "r1bqk2r/pp1nbppp/2p2n2/3p2B1/3P4/2NBP3/PPQ2PPP/R3K1NR b KQkq -": [
        "e8g8"
    ],
    "r1bq1rk1/pp1nbppp/2p2n2/3p2B1/3P4/2NBP3/PPQ2PPP/R3K1NR w KQ -": [
        "g1e2"
    ],
    "rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkbnr/ppp1pppp/8/8/2pP4/5N2/PP2PPPP/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppp1pppp/5n2/8/2pP4/5N2/PP2PPPP/RNBQKB1R w KQkq -": [
        "e2e3"
    ],
    "rnbqkb1r/ppp1pppp/5n2/8/2pP4/4PN2/PP3PPP/RNBQKB1R b KQkq -": [
        "e7e6"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/8/2pP4/4PN2/PP3PPP/RNBQKB1R w KQkq -": [
        "f1c4"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/8/2BP4/4PN2/PP3PPP/RNBQK2R b KQkq -": [
        "c7c5"
    ],
    "rnbqkb1r/pp3ppp/4pn2/2p5/2BP4/4PN2/PP3PPP/RNBQK2R w KQkq c6": [
        "e1g1"
    ],
    "rnbqkb1r/pp3ppp/4pn2/2p5/2BP4/4PN2/PP3PPP/RNBQ1RK1 b kq -": [
        "a7a6"
    ],
    "rnbqkb1r/1p3ppp/p3pn2/2p5/2BP4/4PN2/PP3PPP/RNBQ1RK1 w kq -": [
        "d1e2"
    ],
    "rnbqkb1r/1p3ppp/p3pn2/2p5/2BP4/4PN2/PP2QPPP/RNB2RK1 b kq -": [
        "b7b5"
    ],
    "rnbqkb1r/5ppp/p3pn2/1pp5/2BP4/4PN2/PP2QPPP/RNB2RK1 w kq b6": [
        "c4b3"
    ],
    "rnbqkb1r/5ppp/p3pn2/1pp5/3P4/1B2PN2/PP2QPPP/RNB2RK1 b kq -": [
        "c8b7"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/2PP4/5N2/PP2PPPP/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq -": [
        "d5c4",
        "a7a6",
        "e7e6"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/8/2pP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq -": [
        "a2a4"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/8/P1pP4/2N2N2/1P2PPPP/R1BQKB1R b KQkq a3": [
        "c8f5"
    ],
    "rn1qkb1r/pp2pppp/2p2n2/5b2/P1pP4/2N2N2/1P2PPPP/R1BQKB1R w KQkq -": [
        "e2e3"
    ],
    "rn1qkb1r/pp2pppp/2p2n2/5b2/P1pP4/2N1PN2/1P3PPP/R1BQKB1R b KQkq -": [
        "e7e6"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/5b2/P1pP4/2N1PN2/1P3PPP/R1BQKB1R w KQkq -": [
        "f1c4"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/5b2/P1BP4/2N1PN2/1P3PPP/R1BQK2R b KQkq -": [
        "f8b4"
    ],
    "rn1qk2r/pp3ppp/2p1pn2/5b2/PbBP4/2N1PN2/1P3PPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "rn1qk2r/pp3ppp/2p1pn2/5b2/PbBP4/2N1PN2/1P3PPP/R1BQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbqkb1r/1p2pppp/p1p2n2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq -": [
        "e2e3"
    ],
    "rnbqkb1r/1p2pppp/p1p2n2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R b KQkq -": [
        "b7b5"
    ],
    "rnbqkb1r/4pppp/p1p2n2/1p1p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq b6": [
        "b2b3"
    ],
    "rnbqkb1r/4pppp/p1p2n2/1p1p4/2PP4/1PN1PN2/P4PPP/R1BQKB1R b KQkq -": [
        "c8g4"
    ],
    "rn1qkb1r/4pppp/p1p2n2/1p1p4/2PP2b1/1PN1PN2/P4PPP/R1BQKB1R w KQkq -": [
        "f1e2"
    ],
    "rn1qkb1r/4pppp/p1p2n2/1p1p4/2PP2b1/1PN1PN2/P3BPPP/R1BQK2R b KQkq -": [
        "e7e6"
    ],
    "rn1qkb1r/5ppp/p1p1pn2/1p1p4/2PP2b1/1PN1PN2/P3BPPP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqkb1r/pp3ppp/2p1pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq -": [
        "e2e3",
        "c1g5"
    ],
    "rnbqkb1r/pp3ppp/2p1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R b KQkq -": [
        "b8d7"
    ],
    "r1bqkb1r/pp1n1ppp/2p1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq -": [
        "f1d3"
    ],
    "r1bqkb1r/pp1n1ppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R b KQkq -": [
        "d5c4"
    ],
    "r1bqkb1r/pp1n1ppp/2p1pn2/8/2pP4/2NBPN2/PP3PPP/R1BQK2R w KQkq -": [
        "d3c4"
    ],
    "r1bqkb1r/pp1n1ppp/2p1pn2/8/2BP4/2N1PN2/PP3PPP/R1BQK2R b KQkq -": [
        "b7b5"
    ],
    "r1bqkb1r/p2n1ppp/2p1pn2/1p6/2BP4/2N1PN2/PP3PPP/R1BQK2R w KQkq b6": [
        "c4d3"
    ],
    "r1bqkb1r/p2n1ppp/2p1pn2/1p6/3P4/2NBPN2/PP3PPP/R1BQK2R b KQkq -": [
        "a7a6"
    ],
    "r1bqkb1r/3n1ppp/p1p1pn2/1p6/3P4/2NBPN2/PP3PPP/R1BQK2R w KQkq -": [
        "e3e4"
    ],
    "r1bqkb1r/3n1ppp/p1p1pn2/1p6/3PP3/2NB1N2/PP3PPP/R1BQK2R b KQkq -": [
        "c6c5"
    ],
    "rnbqkb1r/pp3ppp/2p1pn2/3p2B1/2PP4/2N2N2/PP2PPPP/R2QKB1R b KQkq -": [
        "h7h6"
    ],
    "rnbqkb1r/pp3pp1/2p1pn1p/3p2B1/2PP4/2N2N2/PP2PPPP/R2QKB1R w KQkq -": [
        "g5f6"
    ],
    "rnbqkb1r/pp3pp1/2p1pB1p/3p4/2PP4/2N2N2/PP2PPPP/R2QKB1R b KQkq -": [
        "d8f6"
    ],
    "rnb1kb1r/pp3pp1/2p1pq1p/3p4/2PP4/2N2N2/PP2PPPP/R2QKB1R w KQkq -": [
        "e2e3"
    ],
    "rnb1kb1r/pp3pp1/2p1pq1p/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R b KQkq -": [
        "b8d7"
    ],
    "r1b1kb1r/pp1n1pp1/2p1pq1p/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQkq -": [
        "f1d3"
    ],
    "r1b1kb1r/pp1n1pp1/2p1pq1p/3p4/2PP4/2NBPN2/PP3PPP/R2QK2R b KQkq -": [
        "g7g6"
    ],
    "rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -": [
        "c2c4",
        "c1f4",
        "c1g5"
    ],
    "rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3": [
        "g7g6",
        "e7e6",
        "c7c5"
    ],
    "rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "b1c3",
        "g2g3"
    ],
    "rnbqkb1r/pppppp1p/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "f8g7",
        "d7d5"
    ],
    "rnbqk2r/ppppppbp/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "e2e4"
    ],
    "rnbqk2r/ppppppbp/5np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR b KQkq e3": [
        "d7d6"
    ],
    "rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq -": [
        "g1f3",
        "f2f3"
    ],
    "rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQ -": [
        "f1e2"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP2BPPP/R1BQK2R b KQ -": [
        "e7e5"
    ],
    "rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQK2R w KQ e6": [
        "e1g1"
    ],
    "rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQ1RK1 b - -": [
        "b8c6"
    ],
    "r1bq1rk1/ppp2pbp/2np1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQ1RK1 w - -": [
        "d4d5"
    ],
    "r1bq1rk1/ppp2pbp/2np1np1/3Pp3/2P1P3/2N2N2/PP2BPPP/R1BQ1RK1 b - -": [
        "c6e7"
    ],
    "r1bq1rk1/ppp1npbp/3p1np1/3Pp3/2P1P3/2N2N2/PP2BPPP/R1BQ1RK1 w - -": [
        "b2b4"
    ],
    "r1bq1rk1/ppp1npbp/3p1np1/3Pp3/1PP1P3/2N2N2/P3BPPP/R1BQ1RK1 b - b3": [
        "a7a5"
    ],
    "rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2P2/PP4PP/R1BQKBNR b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2P2/PP4PP/R1BQKBNR w KQ -": [
        "c1e3"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N1BP2/PP4PP/R2QKBNR b KQ -": [
        "e7e5"
    ],
    "rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N1BP2/PP4PP/R2QKBNR w KQ e6": [
        "d4d5"
    ],
    "rnbq1rk1/ppp2pbp/3p1np1/3Pp3/2P1P3/2N1BP2/PP4PP/R2QKBNR b KQ -": [
        "c7c6"
    ],
    "rnbq1rk1/pp3pbp/2pp1np1/3Pp3/2P1P3/2N1BP2/PP4PP/R2QKBNR w KQ -": [
        "d1d2"
    ],
    "rnbq1rk1/pp3pbp/2pp1np1/3Pp3/2P1P3/2N1BP2/PP1Q2PP/R3KBNR b KQ -": [
        "c6d5"
    ],
    "rnbq1rk1/pp3pbp/3p1np1/3pp3/2P1P3/2N1BP2/PP1Q2PP/R3KBNR w KQ -": [
        "c4d5"
    ],
    "rnbq1rk1/pp3pbp/3p1np1/3Pp3/4P3/2N1BP2/PP1Q2PP/R3KBNR b KQ -": [
        "a7a6"
    ],
    "rnbqkb1r/pppppp1p/5np1/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/ppppppbp/5np1/8/2PP4/6P1/PP2PP1P/RNBQKBNR w KQkq -": [
        "f1g2"
    ],
    "rnbqk2r/ppppppbp/5np1/8/2PP4/6P1/PP2PPBP/RNBQK1NR b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppppppbp/5np1/8/2PP4/6P1/PP2PPBP/RNBQK1NR w KQ -": [
        "g1f3"
    ],
    "rnbq1rk1/ppppppbp/5np1/8/2PP4/5NP1/PP2PPBP/RNBQK2R b KQ -": [
        "d7d6"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/2PP4/5NP1/PP2PPBP/RNBQK2R w KQ -": [
        "e1g1"
    ],
    "rnbq1rk1/ppp1ppbp/3p1np1/8/2PP4/5NP1/PP2PPBP/RNBQ1RK1 b - -": [
        "b8d7"
    ],
    "r1bq1rk1/pppnppbp/3p1np1/8/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w - -": [
        "b1c3"
    ],
    "r1bq1rk1/pppnppbp/3p1np1/8/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 b - -": [
        "e7e5"
    ],
    "r1bq1rk1/pppn1pbp/3p1np1/4p3/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 w - e6": [
        "e2e4"
    ],
    "r1bq1rk1/pppn1pbp/3p1np1/4p3/2PPP3/2N2NP1/PP3PBP/R1BQ1RK1 b - e3": [
        "c7c6"
    ],
    "r1bq1rk1/pp1n1pbp/2pp1np1/4p3/2PPP3/2N2NP1/PP3PBP/R1BQ1RK1 w - -": [
        "h2h3"
    ],
    "rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6": [
        "c4d5",
        "g1f3"
    ],
    "rnbqkb1r/ppp1pp1p/5np1/3P4/3P4/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "f6d5"
    ],
    "rnbqkb1r/ppp1pp1p/6p1/3n4/3P4/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "e2e4"
    ],
    "rnbqkb1r/ppp1pp1p/6p1/3n4/3PP3/2N5/PP3PPP/R1BQKBNR b KQkq e3": [
        "d5c3"
    ],
    "rnbqkb1r/ppp1pp1p/6p1/8/3PP3/2n5/PP3PPP/R1BQKBNR w KQkq -": [
        "b2c3"
    ],
    "rnbqkb1r/ppp1pp1p/6p1/8/3PP3/2P5/P4PPP/R1BQKBNR b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/ppp1ppbp/6p1/8/3PP3/2P5/P4PPP/R1BQKBNR w KQkq -": [
        "f1c4"
    ],
    "rnbqk2r/ppp1ppbp/6p1/8/2BPP3/2P5/P4PPP/R1BQK1NR b KQkq -": [
        "c7c5"
    ],
    "rnbqk2r/pp2ppbp/6p1/2p5/2BPP3/2P5/P4PPP/R1BQK1NR w KQkq c6": [
        "g1e2"
    ],
    "rnbqk2r/pp2ppbp/6p1/2p5/2BPP3/2P5/P3NPPP/R1BQK2R b KQkq -": [
        "b8c6"
    ],
    "r1bqk2r/pp2ppbp/2n3p1/2p5/2BPP3/2P5/P3NPPP/R1BQK2R w KQkq -": [
        "c1e3"
    ],
    "r1bqk2r/pp2ppbp/2n3p1/2p5/2BPP3/2P1B3/P3NPPP/R2QK2R b KQkq -": [
        "e8g8"
    ],
    "r1bq1rk1/pp2ppbp/2n3p1/2p5/2BPP3/2P1B3/P3NPPP/R2QK2R w KQ -": [
        "e1g1"
    ],
    "rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/ppp1ppbp/5np1/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq -": [
        "d1b3"
    ],
    "rnbqk2r/ppp1ppbp/5np1/3p4/2PP4/1QN2N2/PP2PPPP/R1B1KB1R b KQkq -": [
        "d5c4"
    ],
    "rnbqk2r/ppp1ppbp/5np1/8/2pP4/1QN2N2/PP2PPPP/R1B1KB1R w KQkq -": [
        "b3c4"
    ],
    "rnbqk2r/ppp1ppbp/5np1/8/2QP4/2N2N2/PP2PPPP/R1B1KB1R b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1ppbp/5np1/8/2QP4/2N2N2/PP2PPPP/R1B1KB1R w KQ -": [
        "e2e4"
    ],
    "rnbq1rk1/ppp1ppbp/5np1/8/2QPP3/2N2N2/PP3PPP/R1B1KB1R b KQ e3": [
        "a7a6"
    ],
    "rnbq1rk1/1pp1ppbp/p4np1/8/2QPP3/2N2N2/PP3PPP/R1B1KB1R w KQ -": [
        "f1e2"
    ],
    "rnbq1rk1/1pp1ppbp/p4np1/8/2QPP3/2N2N2/PP2BPPP/R1B1K2R b KQ -": [
        "b7b5"
    ],
    "rnbq1rk1/2p1ppbp/p4np1/1p6/2QPP3/2N2N2/PP2BPPP/R1B1K2R w KQ b6": [
        "c4b3"
    ],
    "rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "b1c3",
        "g1f3",
        "g2g3"
    ],
    "rnbqkb1r/pppp1ppp/4pn2/8/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "f8b4"
    ],
    "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "e2e3",
        "d1c2"
    ],
    "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQ -": [
        "f1d3"
    ],
    "rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2NBP3/PP3PPP/R1BQK1NR b KQ -": [
        "d7d5"
    ],
    "rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2NBP3/PP3PPP/R1BQK1NR w KQ d6": [
        "g1f3"
    ],
    "rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2NBPN2/PP3PPP/R1BQK2R b KQ -": [
        "c7c5"
    ],
    "rnbq1rk1/pp3ppp/4pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ c6": [
        "e1g1"
    ],
    "rnbq1rk1/pp3ppp/4pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 b - -": [
        "b8c6"
    ],
    "r1bq1rk1/pp3ppp/2n1pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w - -": [
        "a2a3"
    ],
    "r1bq1rk1/pp3ppp/2n1pn2/2pp4/1bPP4/P1NBPN2/1P3PPP/R1BQ1RK1 b - -": [
        "b4c3"
    ],
    "r1bq1rk1/pp3ppp/2n1pn2/2pp4/2PP4/P1bBPN2/1P3PPP/R1BQ1RK1 w - -": [
        "b2c3"
    ],
    "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PPQ1PPPP/R1B1KBNR b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N5/PPQ1PPPP/R1B1KBNR w KQ -": [
        "a2a3"
    ],
    "rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/P1N5/1PQ1PPPP/R1B1KBNR b KQ -": [
        "b4c3"
    ],
    "rnbq1rk1/pppp1ppp/4pn2/8/2PP4/P1b5/1PQ1PPPP/R1B1KBNR w KQ -": [
        "c2c3"
    ],
    "rnbq1rk1/pppp1ppp/4pn2/8/2PP4/P1Q5/1P2PPPP/R1B1KBNR b KQ -": [
        "b7b6"
    ],
    "rnbq1rk1/p1pp1ppp/1p2pn2/8/2PP4/P1Q5/1P2PPPP/R1B1KBNR w KQ -": [
        "c1g5"
    ],
    "rnbq1rk1/p1pp1ppp/1p2pn2/6B1/2PP4/P1Q5/1P2PPPP/R3KBNR b KQ -": [
        "c8b7"
    ],
    "rn1q1rk1/pbpp1ppp/1p2pn2/6B1/2PP4/P1Q5/1P2PPPP/R3KBNR w KQ -": [
        "f2f3"
    ],
    "rn1q1rk1/pbpp1ppp/1p2pn2/6B1/2PP4/P1Q2P2/1P2P1PP/R3KBNR b KQ -": [
        "h7h6"
    ],
    "rn1q1rk1/pbpp1pp1/1p2pn1p/6B1/2PP4/P1Q2P2/1P2P1PP/R3KBNR w KQ -": [
        "g5h4"
    ],
    "rn1q1rk1/pbpp1pp1/1p2pn1p/8/2PP3B/P1Q2P2/1P2P1PP/R3KBNR b KQ -": [
        "d7d5"
    ],
    "rnbqkb1r/pppp1ppp/4pn2/8/2PP4/5N2/PP2PPPP/RNBQKB1R b KQkq -": [
        "b7b6",
        "f8b4"
    ],
    "rnbqkb1r/p1pp1ppp/1p2pn2/8/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq -": [
        "g2g3"
    ],
    "rnbqkb1r/p1pp1ppp/1p2pn2/8/2PP4/5NP1/PP2PP1P/RNBQKB1R b KQkq -": [
        "c8a6"
    ],
    "rn1qkb1r/p1pp1ppp/bp2pn2/8/2PP4/5NP1/PP2PP1P/RNBQKB1R w KQkq -": [
        "b2b3"
    ],
    "rn1qkb1r/p1pp1ppp/bp2pn2/8/2PP4/1P3NP1/P3PP1P/RNBQKB1R b KQkq -": [
        "f8b4"
    ],
    "rn1qk2r/p1pp1ppp/bp2pn2/8/1bPP4/1P3NP1/P3PP1P/RNBQKB1R w KQkq -": [
        "c1d2"
    ],
    "rn1qk2r/p1pp1ppp/bp2pn2/8/1bPP4/1P3NP1/P2BPP1P/RN1QKB1R b KQkq -": [
        "b4e7"
    ],
    "rn1qk2r/p1ppbppp/bp2pn2/8/2PP4/1P3NP1/P2BPP1P/RN1QKB1R w KQkq -": [
        "f1g2"
    ],
    "rn1qk2r/p1ppbppp/bp2pn2/8/2PP4/1P3NP1/P2BPPBP/RN1QK2R b KQkq -": [
        "c7c6"
    ],
    "rn1qk2r/p2pbppp/bpp1pn2/8/2PP4/1P3NP1/P2BPPBP/RN1QK2R w KQkq -": [
        "d2c3"
    ],
    "rn1qk2r/p2pbppp/bpp1pn2/8/2PP4/1PB2NP1/P3PPBP/RN1QK2R b KQkq -": [
        "d7d5"
    ],
    "rn1qk2r/p3bppp/bpp1pn2/3p4/2PP4/1PB2NP1/P3PPBP/RN1QK2R w KQkq d6": [
        "f3e5"
    ],
    "rn1qk2r/p3bppp/bpp1pn2/3pN3/2PP4/1PB3P1/P3PPBP/RN1QK2R b KQkq -": [
        "f6d7"
    ],
    "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/5N2/PP2PPPP/RNBQKB1R w KQkq -": [
        "c1d2"
    ],
    "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/5N2/PP1BPPPP/RN1QKB1R b KQkq -": [
        "d8e7"
    ],
    "rnb1k2r/ppppqppp/4pn2/8/1bPP4/5N2/PP1BPPPP/RN1QKB1R w KQkq -": [
        "g2g3"
    ],
    "rnb1k2r/ppppqppp/4pn2/8/1bPP4/5NP1/PP1BPP1P/RN1QKB1R b KQkq -": [
        "b8c6"
    ],
    "r1b1k2r/ppppqppp/2n1pn2/8/1bPP4/5NP1/PP1BPP1P/RN1QKB1R w KQkq -": [
        "b1c3"
    ],
    "r1b1k2r/ppppqppp/2n1pn2/8/1bPP4/2N2NP1/PP1BPP1P/R2QKB1R b KQkq -": [
        "b4c3"
    ],
    "r1b1k2r/ppppqppp/2n1pn2/8/2PP4/2b2NP1/PP1BPP1P/R2QKB1R w KQkq -": [
        "d2c3"
    ],
    "r1b1k2r/ppppqppp/2n1pn2/8/2PP4/2B2NP1/PP2PP1P/R2QKB1R b KQkq -": [
        "f6e4"
    ],
    "r1b1k2r/ppppqppp/2n1p3/8/2PPn3/2B2NP1/PP2PP1P/R2QKB1R w KQkq -": [
        "a1c1"
    ],
    "r1b1k2r/ppppqppp/2n1p3/8/2PPn3/2B2NP1/PP2PP1P/2RQKB1R b Kkq -": [
        "e8g8"
    ],
    "r1b2rk1/ppppqppp/2n1p3/8/2PPn3/2B2NP1/PP2PP1P/2RQKB1R w K -": [
        "f1g2"
    ],
    "rnbqkb1r/pppp1ppp/4pn2/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq -": [
        "d7d5"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/6P1/PP2PP1P/RNBQKBNR w KQkq d6": [
        "f1g2"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/6P1/PP2PPBP/RNBQK1NR b KQkq -": [
        "d5c4",
        "f8e7"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/8/2pP4/6P1/PP2PPBP/RNBQK1NR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/ppp2ppp/4pn2/8/2pP4/5NP1/PP2PPBP/RNBQK2R b KQkq -": [
        "f8e7"
    ],
    "rnbqk2r/ppp1bppp/4pn2/8/2pP4/5NP1/PP2PPBP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqk2r/ppp1bppp/4pn2/8/2pP4/5NP1/PP2PPBP/RNBQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1bppp/4pn2/8/2pP4/5NP1/PP2PPBP/RNBQ1RK1 w - -": [
        "d1c2"
    ],
    "rnbq1rk1/ppp1bppp/4pn2/8/2pP4/5NP1/PPQ1PPBP/RNB2RK1 b - -": [
        "a7a6"
    ],
    "rnbq1rk1/1pp1bppp/p3pn2/8/2pP4/5NP1/PPQ1PPBP/RNB2RK1 w - -": [
        "c2c4"
    ],
    "rnbq1rk1/1pp1bppp/p3pn2/8/2QP4/5NP1/PP2PPBP/RNB2RK1 b - -": [
        "b7b5"
    ],
    "rnbq1rk1/2p1bppp/p3pn2/1p6/2QP4/5NP1/PP2PPBP/RNB2RK1 w - b6": [
        "c4c2"
    ],
    "rnbq1rk1/2p1bppp/p3pn2/1p6/3P4/5NP1/PPQ1PPBP/RNB2RK1 b - -": [
        "c8b7"
    ],
    "rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/6P1/PP2PPBP/RNBQK1NR w KQkq -": [
        "g1f3"
    ],
    "rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/5NP1/PP2PPBP/RNBQK2R b KQkq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppp1bppp/4pn2/3p4/2PP4/5NP1/PP2PPBP/RNBQK2R w KQ -": [
        "e1g1"
    ],
    "rnbq1rk1/ppp1bppp/4pn2/3p4/2PP4/5NP1/PP2PPBP/RNBQ1RK1 b - -": [
        "b8d7"
    ],
    "r1bq1rk1/pppnbppp/4pn2/3p4/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w - -": [
        "d1c2"
    ],
    "r1bq1rk1/pppnbppp/4pn2/3p4/2PP4/5NP1/PPQ1PPBP/RNB2RK1 b - -": [
        "c7c6"
    ],
    "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/5NP1/PPQ1PPBP/RNB2RK1 w - -": [
        "b1d2"
    ],
    "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/5NP1/PPQNPPBP/R1B2RK1 b - -": [
        "b7b6"
    ],
    "rnbqkb1r/pp1ppppp/5n2/2p5/2PP4/8/PP2PPPP/RNBQKBNR w KQkq c6": [
        "d4d5"
    ],
    "rnbqkb1r/pp1ppppp/5n2/2pP4/2P5/8/PP2PPPP/RNBQKBNR b KQkq -": [
        "e7e6",
        "b7b5"
    ],
    "rnbqkb1r/pp1p1ppp/4pn2/2pP4/2P5/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/pp1p1ppp/4pn2/2pP4/2P5/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "e6d5"
    ],
    "rnbqkb1r/pp1p1ppp/5n2/2pp4/2P5/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "c4d5"
    ],
    "rnbqkb1r/pp1p1ppp/5n2/2pP4/8/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "d7d6"
    ],
    "rnbqkb1r/pp3ppp/3p1n2/2pP4/8/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "e2e4"
    ],
    "rnbqkb1r/pp3ppp/3p1n2/2pP4/4P3/2N5/PP3PPP/R1BQKBNR b KQkq e3": [
        "g7g6"
    ],
    "rnbqkb1r/pp3p1p/3p1np1/2pP4/4P3/2N5/PP3PPP/R1BQKBNR w KQkq -": [
        "f2f4"
    ],
    "rnbqkb1r/pp3p1p/3p1np1/2pP4/4PP2/2N5/PP4PP/R1BQKBNR b KQkq f3": [
        "f8g7"
    ],
    "rnbqk2r/pp3pbp/3p1np1/2pP4/4PP2/2N5/PP4PP/R1BQKBNR w KQkq -": [
        "f1b5"
    ],
    "rnbqk2r/pp3pbp/3p1np1/1BpP4/4PP2/2N5/PP4PP/R1BQK1NR b KQkq -": [
        "f6d7"
    ],
    "rnbqk2r/pp1n1pbp/3p2p1/1BpP4/4PP2/2N5/PP4PP/R1BQK1NR w KQkq -": [
        "a2a4"
    ],
    "rnbqk2r/pp1n1pbp/3p2p1/1BpP4/P3PP2/2N5/1P4PP/R1BQK1NR b KQkq a3": [
        "e8g8"
    ],
    "rnbq1rk1/pp1n1pbp/3p2p1/1BpP4/P3PP2/2N5/1P4PP/R1BQK1NR w KQ -": [
        "g1f3"
    ],
    "rnbqkb1r/p2ppppp/5n2/1ppP4/2P5/8/PP2PPPP/RNBQKBNR w KQkq b6": [
        "c4b5"
    ],
    "rnbqkb1r/p2ppppp/5n2/1PpP4/8/8/PP2PPPP/RNBQKBNR b KQkq -": [
        "a7a6"
    ],
    "rnbqkb1r/3ppppp/p4n2/1PpP4/8/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "b5a6"
    ],
    "rnbqkb1r/3ppppp/P4n2/2pP4/8/8/PP2PPPP/RNBQKBNR b KQkq -": [
        "c8a6"
    ],
    "rn1qkb1r/3ppppp/b4n2/2pP4/8/8/PP2PPPP/RNBQKBNR w KQkq -": [
        "b1c3"
    ],
    "rn1qkb1r/3ppppp/b4n2/2pP4/8/2N5/PP2PPPP/R1BQKBNR b KQkq -": [
        "d7d6"
    ],
    "rn1qkb1r/4pppp/b2p1n2/2pP4/8/2N5/PP2PPPP/R1BQKBNR w KQkq -": [
        "e2e4"
    ],
    "rn1qkb1r/4pppp/b2p1n2/2pP4/4P3/2N5/PP3PPP/R1BQKBNR b KQkq e3": [
        "a6f1"
    ],
    "rn1qkb1r/4pppp/3p1n2/2pP4/4P3/2N5/PP3PPP/R1BQKbNR w KQkq -": [
        "e1f1"
    ],
    "rn1qkb1r/4pppp/3p1n2/2pP4/4P3/2N5/PP3PPP/R1BQ1KNR b kq -": [
        "g7g6"
    ],
    "rn1qkb1r/4pp1p/3p1np1/2pP4/4P3/2N5/PP3PPP/R1BQ1KNR w kq -": [
        "g1f3"
    ],
    "rn1qkb1r/4pp1p/3p1np1/2pP4/4P3/2N2N2/PP3PPP/R1BQ1K1R b kq -": [
        "f8g7"
    ],
    "rn1qk2r/4ppbp/3p1np1/2pP4/4P3/2N2N2/PP3PPP/R1BQ1K1R w kq -": [
        "g2g3"
    ],
    "rn1qk2r/4ppbp/3p1np1/2pP4/4P3/2N2NP1/PP3P1P/R1BQ1K1R b kq -": [
        "e8g8"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq -": [
        "e2e3"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/4P3/PPP2PPP/RN1QKBNR b KQkq -": [
        "c7c5"
    ],
    "rnbqkb1r/pp2pppp/5n2/2pp4/3P1B2/4P3/PPP2PPP/RN1QKBNR w KQkq c6": [
        "c2c3"
    ],
    "rnbqkb1r/pp2pppp/5n2/2pp4/3P1B2/2P1P3/PP3PPP/RN1QKBNR b KQkq -": [
        "b8c6"
    ],
    "r1bqkb1r/pp2pppp/2n2n2/2pp4/3P1B2/2P1P3/PP3PPP/RN1QKBNR w KQkq -": [
        "b1d2"
    ],
    "r1bqkb1r/pp2pppp/2n2n2/2pp4/3P1B2/2P1P3/PP1N1PPP/R2QKBNR b KQkq -": [
        "e7e6"
    ],
    "r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P1B2/2P1P3/PP1N1PPP/R2QKBNR w KQkq -": [
        "g1f3"
    ],
    "r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P1B2/2P1PN2/PP1N1PPP/R2QKB1R b KQkq -": [
        "f8d6"
    ],
    "r1bqk2r/pp3ppp/2nbpn2/2pp4/3P1B2/2P1PN2/PP1N1PPP/R2QKB1R w KQkq -": [
        "f4g3"
    ],
    "r1bqk2r/pp3ppp/2nbpn2/2pp4/3P4/2P1PNB1/PP1N1PPP/R2QKB1R b KQkq -": [
        "e8g8"
    ],
    "r1bq1rk1/pp3ppp/2nbpn2/2pp4/3P4/2P1PNB1/PP1N1PPP/R2QKB1R w KQ -": [
        "f1d3"
    ],
    "r1bq1rk1/pp3ppp/2nbpn2/2pp4/3P4/2PBPNB1/PP1N1PPP/R2QK2R b KQ -": [
        "d8e7"
    ],
    "rnbqkb1r/pppppppp/5n2/8/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq -": [
        "d7d5"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq d6": [
        "e2e3"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR w KQkq -": [
        "c1f4"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/2N5/PPP1PPPP/R2QKBNR b KQkq -": [
        "c7c5"
    ],
    "rnbqkb1r/pp2pppp/5n2/2pp4/3P1B2/2N5/PPP1PPPP/R2QKBNR w KQkq c6": [
        "e2e3"
    ],
    "rnbqkb1r/pp2pppp/5n2/2pp4/3P1B2/2N1P3/PPP2PPP/R2QKBNR b KQkq -": [
        "c5d4"
    ],
    "rnbqkb1r/pp2pppp/5n2/3p4/3p1B2/2N1P3/PPP2PPP/R2QKBNR w KQkq -": [
        "e3d4"
    ],
    "rnbqkb1r/pp2pppp/5n2/3p4/3P1B2/2N5/PPP2PPP/R2QKBNR b KQkq -": [
        "a7a6"
    ],
    "rnbqkb1r/1p2pppp/p4n2/3p4/3P1B2/2N5/PPP2PPP/R2QKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/1p2pppp/p4n2/3p4/3P1B2/2N2N2/PPP2PPP/R2QKB1R b KQkq -": [
        "c8g4"
    ],
    "rn1qkb1r/1p2pppp/p4n2/3p4/3P1Bb1/2N2N2/PPP2PPP/R2QKB1R w KQkq -": [
        "h2h3"
    ],
    "rn1qkb1r/1p2pppp/p4n2/3p4/3P1Bb1/2N2N1P/PPP2PP1/R2QKB1R b KQkq -": [
        "g4f3"
    ],
    "rn1qkb1r/1p2pppp/p4n2/3p4/3P1B2/2N2b1P/PPP2PP1/R2QKB1R w KQkq -": [
        "d1f3"
    ],
    "rn1qkb1r/1p2pppp/p4n2/3p4/3P1B2/2N2Q1P/PPP2PP1/R3KB1R b KQkq -": [
        "e7e6"
    ],
    "rnbqkb1r/pppppppp/5n2/6B1/3P4/8/PPP1PPPP/RN1QKBNR b KQkq -": [
        "d7d5"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p2B1/3P4/8/PPP1PPPP/RN1QKBNR w KQkq d6": [
        "e2e3"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p2B1/3P4/4P3/PPP2PPP/RN1QKBNR b KQkq -": [
        "c7c5"
    ],
    "rnbqkb1r/pp2pppp/5n2/2pp2B1/3P4/4P3/PPP2PPP/RN1QKBNR w KQkq c6": [
        "g5f6"
    ],
    "rnbqkb1r/pp2pppp/5B2/2pp4/3P4/4P3/PPP2PPP/RN1QKBNR b KQkq -": [
        "g7f6"
    ],
    "rnbqkb1r/pp2pp1p/5p2/2pp4/3P4/4P3/PPP2PPP/RN1QKBNR w KQkq -": [
        "d4c5"
    ],
    "rnbqkb1r/pp2pp1p/5p2/2Pp4/8/4P3/PPP2PPP/RN1QKBNR b KQkq -": [
        "e7e6"
    ],
    "rnbqkb1r/pp3p1p/4pp2/2Pp4/8/4P3/PPP2PPP/RN1QKBNR w KQkq -": [
        "b1c3"
    ],
    "rnbqkb1r/pp3p1p/4pp2/2Pp4/8/2N1P3/PPP2PPP/R2QKBNR b KQkq -": [
        "f8c5"
    ],
    "rnbqk2r/pp3p1p/4pp2/2bp4/8/2N1P3/PPP2PPP/R2QKBNR w KQkq -": [
        "d1h5"
    ],
    "rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq f6": [
        "g2g3"
    ],
    "rnbqkbnr/ppppp1pp/8/5p2/3P4/6P1/PPP1PP1P/RNBQKBNR b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppppp1pp/5n2/5p2/3P4/6P1/PPP1PP1P/RNBQKBNR w KQkq -": [
        "f1g2"
    ],
    "rnbqkb1r/ppppp1pp/5n2/5p2/3P4/6P1/PPP1PPBP/RNBQK1NR b KQkq -": [
        "e7e6",
        "g7g6"
    ],
    "rnbqkb1r/pppp2pp/4pn2/5p2/3P4/6P1/PPP1PPBP/RNBQK1NR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/pppp2pp/4pn2/5p2/3P4/5NP1/PPP1PPBP/RNBQK2R b KQkq -": [
        "d7d5"
    ],
    "rnbqkb1r/ppp3pp/4pn2/3p1p2/3P4/5NP1/PPP1PPBP/RNBQK2R w KQkq d6": [
        "e1g1"
    ],
    "rnbqkb1r/ppp3pp/4pn2/3p1p2/3P4/5NP1/PPP1PPBP/RNBQ1RK1 b kq -": [
        "f8d6"
    ],
    "rnbqk2r/ppp3pp/3bpn2/3p1p2/3P4/5NP1/PPP1PPBP/RNBQ1RK1 w kq -": [
        "c2c4"
    ],
    "rnbqk2r/ppp3pp/3bpn2/3p1p2/2PP4/5NP1/PP2PPBP/RNBQ1RK1 b kq c3": [
        "c7c6"
    ],
    "rnbqk2r/pp4pp/2pbpn2/3p1p2/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w kq -": [
        "b2b3"
    ],
    "rnbqk2r/pp4pp/2pbpn2/3p1p2/2PP4/1P3NP1/P3PPBP/RNBQ1RK1 b kq -": [
        "d8e7"
    ],
    "rnb1k2r/pp2q1pp/2pbpn2/3p1p2/2PP4/1P3NP1/P3PPBP/RNBQ1RK1 w kq -": [
        "c1b2"
    ],
    "rnb1k2r/pp2q1pp/2pbpn2/3p1p2/2PP4/1P3NP1/PB2PPBP/RN1Q1RK1 b kq -": [
        "e8g8"
    ],
    "rnbqkb1r/ppppp2p/5np1/5p2/3P4/6P1/PPP1PPBP/RNBQK1NR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/ppppp2p/5np1/5p2/3P4/5NP1/PPP1PPBP/RNBQK2R b KQkq -": [
        "f8g7"
    ],
    "rnbqk2r/ppppp1bp/5np1/5p2/3P4/5NP1/PPP1PPBP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqk2r/ppppp1bp/5np1/5p2/3P4/5NP1/PPP1PPBP/RNBQ1RK1 b kq -": [
        "e8g8"
    ],
    "rnbq1rk1/ppppp1bp/5np1/5p2/3P4/5NP1/PPP1PPBP/RNBQ1RK1 w - -": [
        "c2c4"
    ],
    "rnbq1rk1/ppppp1bp/5np1/5p2/2PP4/5NP1/PP2PPBP/RNBQ1RK1 b - c3": [
        "d7d6"
    ],
    "rnbq1rk1/ppp1p1bp/3p1np1/5p2/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w - -": [
        "b1c3"
    ],
    "rnbq1rk1/ppp1p1bp/3p1np1/5p2/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 b - -": [
        "d8e8"
    ],
    "rnb1qrk1/ppp1p1bp/3p1np1/5p2/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 w - -": [
        "d4d5"
    ],
    "rnb1qrk1/ppp1p1bp/3p1np1/3P1p2/2P5/2N2NP1/PP2PPBP/R1BQ1RK1 b - -": [
        "a7a5"
    ],
    "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3": [
        "e7e5",
        "c7c5"
    ],
    "rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq e6": [
        "b1c3"
    ],
    "rnbqkbnr/pppp1ppp/8/4p3/2P5/2N5/PP1PPPPP/R1BQKBNR b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4p3/2P5/2N5/PP1PPPPP/R1BQKBNR w KQkq -": [
        "g1f3"
    ],
    "rnbqkb1r/pppp1ppp/5n2/4p3/2P5/2N2N2/PP1PPPPP/R1BQKB1R b KQkq -": [
        "b8c6"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2P5/2N2N2/PP1PPPPP/R1BQKB1R w KQkq -": [
        "g2g3",
        "e2e3"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2P5/2N2NP1/PP1PPP1P/R1BQKB1R b KQkq -": [
        "f8b4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/4p3/1bP5/2N2NP1/PP1PPP1P/R1BQKB1R w KQkq -": [
        "f1g2"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/4p3/1bP5/2N2NP1/PP1PPPBP/R1BQK2R b KQkq -": [
        "e8g8"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/4p3/1bP5/2N2NP1/PP1PPPBP/R1BQK2R w KQ -": [
        "e1g1"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/4p3/1bP5/2N2NP1/PP1PPPBP/R1BQ1RK1 b - -": [
        "e5e4"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/8/1bP1p3/2N2NP1/PP1PPPBP/R1BQ1RK1 w - -": [
        "f3g5"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/6N1/1bP1p3/2N3P1/PP1PPPBP/R1BQ1RK1 b - -": [
        "b4c3"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/6N1/2P1p3/2b3P1/PP1PPPBP/R1BQ1RK1 w - -": [
        "b2c3"
    ],
    "r1bq1rk1/pppp1ppp/2n2n2/6N1/2P1p3/2P3P1/P2PPPBP/R1BQ1RK1 b - -": [
        "f8e8"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/2P5/8/PP1PPPPP/RNBQKBNR w KQkq c6": [
        "b1c3"
    ],
    "rnbqkbnr/pp1ppppp/8/2p5/2P5/2N5/PP1PPPPP/R1BQKBNR b KQkq -": [
        "b8c6"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/2P5/2N5/PP1PPPPP/R1BQKBNR w KQkq -": [
        "g2g3"
    ],
    "r1bqkbnr/pp1ppppp/2n5/2p5/2P5/2N3P1/PP1PPP1P/R1BQKBNR b KQkq -": [
        "g7g6"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/2p5/2P5/2N3P1/PP1PPP1P/R1BQKBNR w KQkq -": [
        "f1g2"
    ],
    "r1bqkbnr/pp1ppp1p/2n3p1/2p5/2P5/2N3P1/PP1PPPBP/R1BQK1NR b KQkq -": [
        "f8g7"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/2p5/2P5/2N3P1/PP1PPPBP/R1BQK1NR w KQkq -": [
        "g1f3"
    ],
    "r1bqk1nr/pp1pppbp/2n3p1/2p5/2P5/2N2NP1/PP1PPPBP/R1BQK2R b KQkq -": [
        "g8f6"
    ],
    "r1bqk2r/pp1pppbp/2n2np1/2p5/2P5/2N2NP1/PP1PPPBP/R1BQK2R w KQkq -": [
        "e1g1"
    ],
    "r1bqk2r/pp1pppbp/2n2np1/2p5/2P5/2N2NP1/PP1PPPBP/R1BQ1RK1 b kq -": [
        "e8g8"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/2p5/2P5/2N2NP1/PP1PPPBP/R1BQ1RK1 w - -": [
        "d2d4"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/2p5/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 b - d3": [
        "c5d4"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/8/2Pp4/2N2NP1/PP2PPBP/R1BQ1RK1 w - -": [
        "f3d4"
    ],
    "r1bq1rk1/pp1pppbp/2n2np1/8/2PN4/2N3P1/PP2PPBP/R1BQ1RK1 b - -": [
        "d7d6"
    ],
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2P5/2N1PN2/PP1P1PPP/R1BQKB1R b KQkq -": [
        "f8b4"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/4p3/1bP5/2N1PN2/PP1P1PPP/R1BQKB1R w KQkq -": [
        "d1c2"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/4p3/1bP5/2N1PN2/PPQP1PPP/R1B1KB1R b KQkq -": [
        "b4c3"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/4p3/2P5/2b1PN2/PPQP1PPP/R1B1KB1R w KQkq -": [
        "c2c3"
    ],
    "r1bqk2r/pppp1ppp/2n2n2/4p3/2P5/2Q1PN2/PP1P1PPP/R1B1KB1R b KQkq -": [
        "d8e7"
    ],
    "r1b1k2r/ppppqppp/2n2n2/4p3/2P5/2Q1PN2/PP1P1PPP/R1B1KB1R w KQkq -": [
        "a2a3"
    ],
    "r1b1k2r/ppppqppp/2n2n2/4p3/2P5/P1Q1PN2/1P1P1PPP/R1B1KB1R b KQkq -": [
        "a7a5"
    ],
    "r1b1k2r/1pppqppp/2n2n2/p3p3/2P5/P1Q1PN2/1P1P1PPP/R1B1KB1R w KQkq a6": [
        "b2b3"
    ],
    "r1b1k2r/1pppqppp/2n2n2/p3p3/2P5/PPQ1PN2/3P1PPP/R1B1KB1R b KQkq -": [
        "d7d6"
    ],
    "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -": [
        "d7d5"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq d6": [
        "c2c4",
        "g2g3"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/2P5/5N2/PP1PPPPP/RNBQKB1R b KQkq c3": [
        "c7c6"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/2P5/5N2/PP1PPPPP/RNBQKB1R w KQkq -": [
        "b2b3"
    ],
    "rnbqkbnr/pp2pppp/2p5/3p4/2P5/1P3N2/P2PPPPP/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/3p4/2P5/1P3N2/P2PPPPP/RNBQKB1R w KQkq -": [
        "g2g3"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/3p4/2P5/1P3NP1/P2PPP1P/RNBQKB1R b KQkq -": [
        "c8f5"
    ],
    "rn1qkb1r/pp2pppp/2p2n2/3p1b2/2P5/1P3NP1/P2PPP1P/RNBQKB1R w KQkq -": [
        "f1g2"
    ],
    "rn1qkb1r/pp2pppp/2p2n2/3p1b2/2P5/1P3NP1/P2PPPBP/RNBQK2R b KQkq -": [
        "e7e6"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/3p1b2/2P5/1P3NP1/P2PPPBP/RNBQK2R w KQkq -": [
        "c1b2"
    ],
    "rn1qkb1r/pp3ppp/2p1pn2/3p1b2/2P5/1P3NP1/PB1PPPBP/RN1QK2R b KQkq -": [
        "f8e7"
    ],
    "rn1qk2r/pp2bppp/2p1pn2/3p1b2/2P5/1P3NP1/PB1PPPBP/RN1QK2R w KQkq -": [
        "e1g1"
    ],
    "rn1qk2r/pp2bppp/2p1pn2/3p1b2/2P5/1P3NP1/PB1PPPBP/RN1Q1RK1 b kq -": [
        "h7h6"
    ],
    "rn1qk2r/pp2bpp1/2p1pn1p/3p1b2/2P5/1P3NP1/PB1PPPBP/RN1Q1RK1 w kq -": [
        "d2d3"
    ],
    "rn1qk2r/pp2bpp1/2p1pn1p/3p1b2/2P5/1P1P1NP1/PB2PPBP/RN1Q1RK1 b kq -": [
        "e8g8"
    ],
    "rn1q1rk1/pp2bpp1/2p1pn1p/3p1b2/2P5/1P1P1NP1/PB2PPBP/RN1Q1RK1 w - -": [
        "b1d2"
    ],
    "rn1q1rk1/pp2bpp1/2p1pn1p/3p1b2/2P5/1P1P1NP1/PB1NPPBP/R2Q1RK1 b - -": [
        "b8d7"
    ],
    "rnbqkbnr/ppp1pppp/8/3p4/8/5NP1/PPPPPP1P/RNBQKB1R b KQkq -": [
        "g8f6"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/8/5NP1/PPPPPP1P/RNBQKB1R w KQkq -": [
        "f1g2"
    ],
    "rnbqkb1r/ppp1pppp/5n2/3p4/8/5NP1/PPPPPPBP/RNBQK2R b KQkq -": [
        "c7c6"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/3p4/8/5NP1/PPPPPPBP/RNBQK2R w KQkq -": [
        "e1g1"
    ],
    "rnbqkb1r/pp2pppp/2p2n2/3p4/8/5NP1/PPPPPPBP/RNBQ1RK1 b kq -": [
        "c8g4"
    ],
    "rn1qkb1r/pp2pppp/2p2n2/3p4/6b1/5NP1/PPPPPPBP/RNBQ1RK1 w kq -": [
        "d2d3"
    ],
    "rn1qkb1r/pp2pppp/2p2n2/3p4/6b1/3P1NP1/PPP1PPBP/RNBQ1RK1 b kq -": [
        "b8d7"
    ],
    "r2qkb1r/pp1npppp/2p2n2/3p4/6b1/3P1NP1/PPP1PPBP/RNBQ1RK1 w kq -": [
        "b1d2"
    ],
    "r2qkb1r/pp1npppp/2p2n2/3p4/6b1/3P1NP1/PPPNPPBP/R1BQ1RK1 b kq -": [
        "e7e5"
    ],
    "r2qkb1r/pp1n1ppp/2p2n2/3pp3/6b1/3P1NP1/PPPNPPBP/R1BQ1RK1 w kq e6": [
        "e2e4"
    ],
    "r2qkb1r/pp1n1ppp/2p2n2/3pp3/4P1b1/3P1NP1/PPPN1PBP/R1BQ1RK1 b kq e3": [
        "d5e4"
    ],
    "r2qkb1r/pp1n1ppp/2p2n2/4p3/4p1b1/3P1NP1/PPPN1PBP/R1BQ1RK1 w kq -": [
        "d3e4"
    ],
    "r2qkb1r/pp1n1ppp/2p2n2/4p3/4P1b1/5NP1/PPPN1PBP/R1BQ1RK1 b kq -": [
        "f8c5"
    ]
};

    const ChessEndgameTablebase = {
    "4K3/4P3/8/3k4/8/8/1r6/4R3 w - -": [
        "e1e4"
    ],
    "4K3/4P3/3k4/8/4R3/8/1r6/8 w - -": [
        "e4d4"
    ],
    "4K3/4P3/8/8/8/8/1r6/4R2k w - -": [
        "e1e4"
    ],
    "3K4/3P4/8/2k5/8/8/1r6/3R4 w - -": [
        "d1d4"
    ],
    "3K4/3P4/2k5/8/3R4/8/1r6/8 w - -": [
        "d4c4"
    ],
    "5K2/5P2/8/4k3/8/8/1r6/5R2 w - -": [
        "f1f4"
    ],
    "5K2/5P2/4k3/8/5R2/8/1r6/8 w - -": [
        "f4e4"
    ],
    "2K5/2P5/8/1k6/8/8/1r6/2R5 w - -": [
        "c1c4"
    ],
    "2K5/2P5/1k6/8/2R5/8/1r6/8 w - -": [
        "c4b4"
    ],
    "1K6/1P6/8/k7/8/8/2r5/1R6 w - -": [
        "b1b4"
    ],
    "6K1/6P1/8/5k2/8/8/1r6/6R1 w - -": [
        "g1g4"
    ],
    "4r3/1R6/8/8/3K4/8/4p3/4k3 b - -": [
        "e8e5"
    ],
    "8/1R6/8/4r3/8/3K4/4p3/4k3 b - -": [
        "e5d5"
    ],
    "3r4/1R6/8/8/2K5/8/3p4/3k4 b - -": [
        "d8d5"
    ],
    "5r2/1R6/8/8/4K3/8/5p2/5k2 b - -": [
        "f8f5"
    ],
    "2r5/1R6/8/8/1K6/8/2p5/2k5 b - -": [
        "c8c5"
    ],
    "4k3/8/r7/4P3/8/8/4R3/4K3 b - -": [
        "a6a1",
        "a6h6"
    ],
    "4k3/8/1r6/4P3/8/8/4R3/4K3 b - -": [
        "b6b1",
        "b6h6"
    ],
    "4k3/8/2r5/4P3/8/8/4R3/4K3 b - -": [
        "c6c1",
        "c6h6"
    ],
    "4k3/8/5r2/4P3/8/8/4R3/4K3 b - -": [
        "f6f1",
        "f6h6"
    ],
    "4k3/8/6r1/4P3/8/8/4R3/4K3 b - -": [
        "g6g1",
        "g6h6"
    ],
    "4k3/8/7r/4P3/8/8/4R3/4K3 b - -": [
        "h6h1"
    ],
    "3k4/8/r7/3P4/8/8/3R4/3K4 b - -": [
        "a6a1",
        "a6h6"
    ],
    "3k4/8/1r6/3P4/8/8/3R4/3K4 b - -": [
        "b6b1",
        "b6h6"
    ],
    "5k2/8/r7/5P2/8/8/5R2/5K2 b - -": [
        "a6a1",
        "a6h6"
    ],
    "5k2/8/1r6/5P2/8/8/5R2/5K2 b - -": [
        "b6b1",
        "b6h6"
    ],
    "2k5/8/r7/2P5/8/8/2R5/2K5 b - -": [
        "a6a1",
        "a6h6"
    ],
    "4k3/8/4P3/5K2/8/8/8/r7 b - -": [
        "a1a5",
        "a1f1"
    ],
    "4k3/8/4P3/3K4/8/8/8/r7 b - -": [
        "a1a6",
        "a1d1"
    ],
    "4k3/8/4P3/5K2/8/8/8/1r6 b - -": [
        "b1b5",
        "b1f1"
    ],
    "4k3/8/4P3/3K4/8/8/8/1r6 b - -": [
        "b1b6",
        "b1d1"
    ],
    "4k3/8/4P3/5K2/8/8/8/7r b - -": [
        "h1h5",
        "h1f1"
    ],
    "3k4/8/3P4/4K3/8/8/8/r7 b - -": [
        "a1a5",
        "a1e1"
    ],
    "3k4/8/3P4/2K5/8/8/8/r7 b - -": [
        "a1a6",
        "a1c1"
    ],
    "4k3/8/8/4K3/4P3/8/8/8 w - -": [
        "e5e6",
        "e5d5",
        "e5f5"
    ],
    "3k4/8/8/3K3/3P4/8/8/8 w - -": [
        "d5d6",
        "d5c5",
        "d5e5"
    ],
    "5k2/8/8/5K2/5P2/8/8/8 w - -": [
        "f5f6",
        "f5e5",
        "f5g5"
    ],
    "2k5/8/8/2K5/2P5/8/8/8 w - -": [
        "c5c6",
        "c5b5",
        "c5d5"
    ],
    "1k6/8/8/1K6/1P6/8/8/8 w - -": [
        "b5b6",
        "b5a5",
        "b5c5"
    ],
    "6k1/8/8/6K1/6P1/8/8/8 w - -": [
        "g5g6",
        "g5f5",
        "g5h5"
    ],
    "4k3/8/4P3/4K3/8/8/8/8 b - -": [
        "e8e7"
    ],
    "3k4/8/3P4/3K4/8/8/8/8 b - -": [
        "d8d7"
    ],
    "5k2/8/5P2/5K2/8/8/8/8 b - -": [
        "f8f7"
    ],
    "2k5/8/2P5/2K5/8/8/8/8 b - -": [
        "c8c7"
    ],
    "1k6/8/1P6/1K6/8/8/8/8 b - -": [
        "b8b7"
    ],
    "6k1/8/6P1/6K1/8/8/8/8 b - -": [
        "g8g7"
    ],
    "8/4k3/4K3/8/4P3/8/8/8 w - -": [
        "e6d5",
        "e6f5"
    ],
    "8/3k4/3K4/8/3P4/8/8/8 w - -": [
        "d6c5",
        "d6e5"
    ],
    "8/5k2/5K2/8/5P2/8/8/8 w - -": [
        "f6e5",
        "f6g5"
    ],
    "8/2k5/2K5/8/2P5/8/8/8 w - -": [
        "c6b5",
        "c6d5"
    ],
    "8/8/4k3/8/4K3/4P3/8/8 w - -": [
        "e4d4",
        "e4f4"
    ],
    "8/8/3k4/8/3K4/3P4/8/8 w - -": [
        "d4c4",
        "d4e4"
    ],
    "8/8/5k2/8/5K2/5P2/8/8 w - -": [
        "f4e4",
        "f4g4"
    ],
    "8/8/2k5/8/2K5/2P5/8/8 w - -": [
        "c4b4",
        "c4d4"
    ],
    "8/8/4k3/4P3/4K3/8/8/8 w - -": [
        "e4f4",
        "e4d4"
    ],
    "8/8/3k4/3P4/3K4/8/8/8 w - -": [
        "d4c4",
        "d4e4"
    ],
    "8/8/8/3k4/8/3K4/3P4/8 w - -": [
        "d3e3"
    ],
    "8/8/8/4k3/8/4K3/4P3/8 w - -": [
        "e3f3"
    ],
    "8/8/8/2k5/8/2K5/2P5/8 w - -": [
        "c3d3"
    ],
    "8/4P3/8/8/8/4K3/8/3Q3k w - -": [
        "d1f3",
        "d1e2"
    ],
    "8/3P4/8/8/8/3K4/8/4Q2k w - -": [
        "e1e2",
        "e1f2"
    ],
    "8/1P6/8/8/8/1K6/8/5Q1k w - -": [
        "f1b1",
        "f1f3"
    ],
    "8/6P1/8/8/8/6K1/8/1Q5k w - -": [
        "b1g1",
        "b1f1"
    ],
    "8/2P5/8/8/8/2K5/8/4Q2k w - -": [
        "e1c1",
        "e1e4"
    ],
    "8/5P2/8/8/8/5K2/8/3Q3k w - -": [
        "d1f1",
        "d1d4"
    ],
    "8/P7/8/8/8/1K6/8/5Q1k w - -": [
        "f1a1",
        "f1f3"
    ],
    "8/7P/8/8/8/6K1/8/1Q5k w - -": [
        "b1h1",
        "b1f1"
    ],
    "7K/8/8/1p6/8/8/P7/7k w - -": [
        "h8g7"
    ],
    "8/6K1/8/1p6/8/8/P7/7k w - -": [
        "g7f6"
    ],
    "8/8/5K2/1p6/8/8/P7/7k w - -": [
        "f6e5",
        "f6e6"
    ],
    "8/8/8/8/8/5k2/8/4K2Q w - -": [
        "h1h3",
        "h1f1"
    ],
    "8/8/8/8/8/4k3/8/4K1Q1 w - -": [
        "g1e3"
    ],
    "8/8/8/8/8/8/5k2/6Q1 w - -": [
        "g1g2"
    ],
    "4k3/8/8/8/8/8/4R3/4K3 w - -": [
        "e2e3",
        "e1f2"
    ],
    "4k3/8/8/8/4R3/8/8/4K3 w - -": [
        "e4e5",
        "e1f2"
    ],
    "4k3/8/4R3/8/8/8/8/4K3 w - -": [
        "e6e7",
        "e1d2"
    ],
    "8/4k3/8/3K4/4R3/8/8/8 w - -": [
        "e4e5",
        "d5c5"
    ],
    "8/4k3/8/4K3/8/8/8/R7 w - -": [
        "a1a7"
    ],
    "8/8/8/8/4k3/8/R7/R3K3 w - -": [
        "a2a4"
    ],
    "8/8/8/8/4k3/R7/8/R3K3 w - -": [
        "a1a2"
    ],
    "8/8/8/4k3/R7/1R6/8/4K3 w - -": [
        "a4a5"
    ],
    "8/8/4k3/R7/8/1R6/8/4K3 w - -": [
        "b3b6"
    ],
    "8/4k3/1R6/R7/8/8/8/4K3 w - -": [
        "a5a7"
    ],
    "4k3/R7/1R6/8/8/8/8/4K3 w - -": [
        "b6b8"
    ]
};

    function getEndgameTablebaseMove(fen) {
        if (!fen) return null;
        const parts = fen.split(/\s+/);
        const normalized = parts.slice(0, 4).join(' ');
        const moves = ChessEndgameTablebase[normalized];
        if (moves && moves.length > 0) {
            const selected = moves[Math.floor(Math.random() * moves.length)];
            const m = parseUciMove(selected);
            m.isEndgame = true;
            return m;
        }
        return null;
    }

    function getEndgameMove(fen, logic) {
        const tbMove = getEndgameTablebaseMove(fen);
        if (tbMove) return tbMove;
        return null;
    }

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

    const API = { evaluateBoard, minimax, applyMove, undoMove, quiesce, getOpeningBookMove, getEndgameTablebaseMove, getEndgameMove, ChessOpeningBook, ChessEndgameTablebase };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
