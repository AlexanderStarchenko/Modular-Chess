/**
 * Chess Logic Module
 * Handles board state, move validation, and game rules.
 */

var ChessLogic = (() => {
    let board = [];
    let turn = 'w';
    let castlingRights = {};
    let listeners = [];
    let gameHistory = [];
    let positionHistory = {}; // For three-fold repetition
    let enPassantSquare = null; // {row, col}
    let halfMoveClock = 0; // For 50-move rule
    let initialFullMove = 1;

    function initBoard() {
        board = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
        turn = 'w';
        castlingRights = {
            wKingMoved: false, bKingMoved: false,
            wRookAMoved: false, wRookHMoved: false,
            bRookAMoved: false, bRookHMoved: false
        };
        gameHistory = [];
        positionHistory = {};
        enPassantSquare = null;
        halfMoveClock = 0;
        initialFullMove = 1;
        recordPosition();
        notifyChange(checkDrawConditions());
    }

    function getBoard() { return board; }
    function getTurn() { return turn; }
    function getGameHistory() { return [...gameHistory]; }

    function cloneGameHistory(src = gameHistory) {
        return src.map(entry => ({
            ...entry,
            move: entry.move ? { ...entry.move } : null
        }));
    }

    function cloneBoard(src = board) {
        return src.map(row => row.slice());
    }

    function getState() {
        return {
            board: cloneBoard(),
            turn,
            castlingRights: { ...castlingRights },
            gameHistory: cloneGameHistory(),
            positionHistory: { ...positionHistory },
            enPassantSquare: enPassantSquare ? { ...enPassantSquare } : null,
            halfMoveClock,
            initialFullMove
        };
    }

    function loadState(state) {
        if (!state || !Array.isArray(state.board) || state.board.length !== 8) return false;

        board = cloneBoard(state.board);
        turn = state.turn === 'b' ? 'b' : 'w';
        castlingRights = state.castlingRights ? { ...state.castlingRights } : {};
        gameHistory = Array.isArray(state.gameHistory) ? cloneGameHistory(state.gameHistory) : [];
        positionHistory = state.positionHistory ? { ...state.positionHistory } : {};
        enPassantSquare = state.enPassantSquare ? { ...state.enPassantSquare } : null;
        halfMoveClock = Number.isFinite(state.halfMoveClock) ? state.halfMoveClock : 0;
        initialFullMove = Number.isFinite(state.initialFullMove) ? state.initialFullMove : 1;

        if (!Object.keys(positionHistory).length) {
            recordPosition();
        }

        notifyChange(checkDrawConditions());
        return true;
    }

    function loadFen(fen, options = {}) {
        if (typeof fen !== 'string') return false;
        const parts = fen.trim().split(/\s+/);
        const rows = (parts[0] || '').split('/');
        if (rows.length !== 8) return false;

        board = rows.map(row => {
            const parsed = [];
            row.split('').forEach(char => {
                if (/\d/.test(char)) {
                    for (let i = 0; i < Number(char); i++) parsed.push(null);
                } else {
                    parsed.push(char);
                }
            });
            return parsed;
        });

        turn = parts[1] === 'b' ? 'b' : 'w';
        const rights = parts[2] || '-';
        castlingRights = {
            wKingMoved: !rights.includes('K') && !rights.includes('Q'),
            bKingMoved: !rights.includes('k') && !rights.includes('q'),
            wRookAMoved: !rights.includes('Q'),
            wRookHMoved: !rights.includes('K'),
            bRookAMoved: !rights.includes('q'),
            bRookHMoved: !rights.includes('k')
        };

        const ep = parts[3] || '-';
        if (ep !== '-') {
            const f = ep.charCodeAt(0) - 97;
            const r = 8 - parseInt(ep[1]);
            enPassantSquare = { row: r, col: f };
        } else {
            enPassantSquare = null;
        }

        halfMoveClock = parseInt(parts[4]) || 0;
        initialFullMove = parseInt(parts[5]) || 1;

        if (!options.keepHistory) {
            gameHistory = [];
            positionHistory = {};
        }
        if (!options.skipRecord) {
            recordPosition();
        }
        notifyChange(checkDrawConditions());
        return true;
    }

    function boardToFen() {
        const rows = board.map(row => {
            let empty = 0, fenRow = '';
            row.forEach(piece => {
                if (!piece) { empty++; return; }
                if (empty > 0) { fenRow += empty; empty = 0; }
                fenRow += piece;
            });
            return fenRow + (empty > 0 ? empty : '');
        });
        const rights = [
            !castlingRights.wKingMoved && !castlingRights.wRookHMoved && board[7][7] === 'R' ? 'K' : '',
            !castlingRights.wKingMoved && !castlingRights.wRookAMoved && board[7][0] === 'R' ? 'Q' : '',
            !castlingRights.bKingMoved && !castlingRights.bRookHMoved && board[0][7] === 'r' ? 'k' : '',
            !castlingRights.bKingMoved && !castlingRights.bRookAMoved && board[0][0] === 'r' ? 'q' : ''
        ].join('') || '-';
        
        const ep = enPassantSquare ? String.fromCharCode(97 + enPassantSquare.col) + (8 - enPassantSquare.row) : '-';
        const fullMove = initialFullMove + Math.floor(gameHistory.length / 2);
        
        return `${rows.join('/')} ${turn} ${rights} ${ep} ${halfMoveClock} ${fullMove}`;
    }

    function getSimpleFen() {
        const parts = boardToFen().split(' ');
        return parts.slice(0, 4).join(' '); // board, turn, castling, enpassant
    }

    function recordPosition(currentSimpleFen = null) {
        const fen = currentSimpleFen || getSimpleFen();
        positionHistory[fen] = (positionHistory[fen] || 0) + 1;
    }

    function isInsufficientMaterial() {
        let whitePieces = [];
        let blackPieces = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (!piece) continue;
                const isWhite = piece === piece.toUpperCase();
                const type = piece.toLowerCase();
                if (type === 'k') continue; // Kings are always on board
                if (isWhite) {
                    whitePieces.push({ type, r, c });
                } else {
                    blackPieces.push({ type, r, c });
                }
            }
        }
        
        const wCount = whitePieces.length;
        const bCount = blackPieces.length;
        
        // 1. King vs King
        if (wCount === 0 && bCount === 0) return true;
        
        // 2. King + Bishop vs King
        if (wCount === 1 && whitePieces[0].type === 'b' && bCount === 0) return true;
        if (bCount === 1 && blackPieces[0].type === 'b' && wCount === 0) return true;
        
        // 3. King + Knight vs King
        if (wCount === 1 && whitePieces[0].type === 'n' && bCount === 0) return true;
        if (bCount === 1 && blackPieces[0].type === 'n' && wCount === 0) return true;
        
        // 4. King + Bishop vs King + Bishop (Bishops on same color squares)
        if (wCount === 1 && whitePieces[0].type === 'b' && bCount === 1 && blackPieces[0].type === 'b') {
            const wSquareColor = (whitePieces[0].r + whitePieces[0].c) % 2;
            const bSquareColor = (blackPieces[0].r + blackPieces[0].c) % 2;
            return wSquareColor === bSquareColor;
        }
        
        return false;
    }

    function checkDrawConditions(simpleFen = null) {
        const legalMoves = getAllLegalMoves(turn);
        if (legalMoves.length === 0) {
            return isKingInCheck(turn) ? 'checkmate' : 'stalemate';
        }
        if (isInsufficientMaterial()) return 'material';
        const key = simpleFen || getSimpleFen();
        if (positionHistory[key] >= 3) return 'repetition';
        if (halfMoveClock >= 100) return '50moves'; // 100 half-moves = 50 full moves
        return null;
    }

    function isValidMoveInternal(fR, fC, tR, tC, ignoreTurn = false) {
        const piece = board[fR][fC];
        if (!piece) return false;
        const isWhite = piece === piece.toUpperCase();
        if (!ignoreTurn && ((isWhite && turn !== 'w') || (!isWhite && turn !== 'b'))) return false;
        const target = board[tR][tC];
        if (target && (target === target.toUpperCase()) === isWhite) return false;

        const dR = tR - fR, dC = tC - fC;
        const p = piece.toLowerCase();
        if (p === 'p') return validatePawnMove(fR, fC, tR, tC, isWhite);
        if (p === 'r') return validateRookMove(fR, fC, tR, tC);
        if (p === 'n') return (Math.abs(dR) === 2 && Math.abs(dC) === 1) || (Math.abs(dR) === 1 && Math.abs(dC) === 2);
        if (p === 'b') return validateBishopMove(fR, fC, tR, tC);
        if (p === 'q') return validateRookMove(fR, fC, tR, tC) || validateBishopMove(fR, fC, tR, tC);
        if (p === 'k') {
            if (Math.abs(dR) <= 1 && Math.abs(dC) <= 1) return true;
            if (dR === 0 && Math.abs(dC) === 2) return isCastlingValid(fR, fC, tC, isWhite);
        }
        return false;
    }

    function validatePawnMove(fR, fC, tR, tC, isWhite) {
        const dir = isWhite ? -1 : 1;
        const start = isWhite ? 6 : 1;
        const dR = tR - fR, dC = tC - fC;

        // Normal move
        if (dC === 0 && !board[tR][tC]) {
            if (dR === dir) return true;
            if (fR === start && dR === 2 * dir && !board[fR + dir][fC]) return true;
        }

        // Normal capture
        if (Math.abs(dC) === 1 && dR === dir) {
            if (board[tR][tC]) return true;
            
            // En Passant capture
            if (enPassantSquare && enPassantSquare.row === tR && enPassantSquare.col === tC) {
                return true;
            }
        }
        return false;
    }

    function validateRookMove(fR, fC, tR, tC) {
        if (fR !== tR && fC !== tC) return false;
        const sR = fR === tR ? 0 : (tR > fR ? 1 : -1);
        const sC = fC === tC ? 0 : (tC > fC ? 1 : -1);
        let cR = fR + sR, cC = fC + sC;
        while (cR !== tR || cC !== tC) {
            if (board[cR][cC]) return false;
            cR += sR; cC += sC;
        }
        return true;
    }

    function validateBishopMove(fR, fC, tR, tC) {
        if (Math.abs(tR - fR) !== Math.abs(tC - fC)) return false;
        const sR = tR > fR ? 1 : -1, sC = tC > fC ? 1 : -1;
        let cR = fR + sR, cC = fC + sC;
        while (cR !== tR || cC !== tC) {
            if (board[cR][cC]) return false;
            cR += sR; cC += sC;
        }
        return true;
    }

    function isCastlingValid(row, kC, tC, isWhite) {
        const color = isWhite ? 'w' : 'b';
        if (isWhite && castlingRights.wKingMoved) return false;
        if (!isWhite && castlingRights.bKingMoved) return false;
        const isKing = tC > kC, rC = isKing ? 7 : 0;
        if (isWhite ? (isKing ? castlingRights.wRookHMoved : castlingRights.wRookAMoved) : (isKing ? castlingRights.bRookHMoved : castlingRights.bRookAMoved)) return false;
        if (board[row][rC] !== (isWhite ? 'R' : 'r')) return false;
        for (let c = Math.min(kC, rC) + 1; c < Math.max(kC, rC); c++) if (board[row][c]) return false;
        if (isKingInCheck(color)) return false;
        const step = isKing ? 1 : -1;
        for (let c = kC + step; c !== tC + step; c += step) {
            const old = board[row][kC]; board[row][kC] = null; board[row][c] = old;
            const check = isKingInCheck(color);
            board[row][c] = null; board[row][kC] = old;
            if (check) return false;
        }
        return true;
    }

    function isKingInCheck(color) {
        let kR = -1, kC = -1, kChar = color === 'w' ? 'K' : 'k';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === kChar) {
                    kR = r;
                    kC = c;
                    break;
                }
            }
            if (kR !== -1) break;
        }
        if (kR === -1) return false;

        // Optimize using WebAssembly if available
        if (typeof ChessWASM !== 'undefined' && ChessWASM.isLoaded()) {
            const attackerColor = color === 'w' ? 'b' : 'w';
            return ChessWASM.isSquareAttacked(kR, kC, attackerColor, board);
        }

        // Fallback to JS implementation
        const isW = color === 'w';
        const knightJumps = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        for (const [dr, dc] of knightJumps) {
            const r = kR + dr, c = kC + dc;
            if (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === (isW ? 'n' : 'N')) return true;
        }
        const pDir = isW ? -1 : 1, oP = isW ? 'p' : 'P';
        if (kR + pDir >= 0 && kR + pDir < 8) {
            if (kC - 1 >= 0 && board[kR + pDir][kC - 1] === oP) return true;
            if (kC + 1 < 8 && board[kR + pDir][kC + 1] === oP) return true;
        }
        const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        for (let i = 0; i < 8; i++) {
            const [dr, dc] = dirs[i];
            let r = kR + dr, c = kC + dc, dist = 1;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const piece = board[r][c];
                if (piece) {
                    if (piece === (isW ? 'q' : 'Q')) return true;
                    if (i < 4 && piece === (isW ? 'r' : 'R')) return true;
                    if (i >= 4 && piece === (isW ? 'b' : 'B')) return true;
                    if (dist === 1 && piece === (isW ? 'k' : 'K')) return true;
                    break;
                }
                r += dr; c += dc; dist++;
            }
        }
        return false;
    }

    function isLegalMove(fR, fC, tR, tC, ignoreTurn = false) {
        if (!isValidMoveInternal(fR, fC, tR, tC, ignoreTurn)) return false;
        const piece = board[fR][fC], target = board[tR][tC];
        
        // Handle En Passant in simulation
        let epPiece = null, epR = -1, epC = -1;
        if (piece.toLowerCase() === 'p' && !target && enPassantSquare && tR === enPassantSquare.row && tC === enPassantSquare.col) {
            epR = piece === 'P' ? tR + 1 : tR - 1;
            epC = tC;
            epPiece = board[epR][epC];
            board[epR][epC] = null;
        }

        board[tR][tC] = piece; board[fR][fC] = null;
        const check = isKingInCheck(piece === piece.toUpperCase() ? 'w' : 'b');
        
        // Restore
        board[fR][fC] = piece; board[tR][tC] = target;
        if (epPiece) board[epR][epC] = epPiece;

        return !check;
    }

    /**
     * Fast vector-based legal move generator for a given color.
     * Generates moves along actual piece vectors instead of 64x64 loop.
     * Correctly handles ignoreTurn=true so moves can be queried for any color.
     */
    function getAllLegalMoves(color) {
        const moves = [];
        const isW = color === 'w';
        const pDir = isW ? -1 : 1;
        const knightDirs = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        const slideDirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

        const tryAdd = (r, c, tr, tc) => {
            if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && isLegalMove(r, c, tr, tc, true)) {
                moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
            }
        };

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (!piece || (piece === piece.toUpperCase()) !== isW) continue;
                const p = piece.toLowerCase();

                if (p === 'p') {
                    tryAdd(r, c, r + pDir, c);
                    if (r === (isW ? 6 : 1)) tryAdd(r, c, r + 2 * pDir, c);
                    tryAdd(r, c, r + pDir, c - 1);
                    tryAdd(r, c, r + pDir, c + 1);
                } else if (p === 'n') {
                    for (const [dr, dc] of knightDirs) tryAdd(r, c, r + dr, c + dc);
                } else if (p === 'k') {
                    for (const [dr, dc] of slideDirs) tryAdd(r, c, r + dr, c + dc);
                    tryAdd(r, c, r, c + 2);
                    tryAdd(r, c, r, c - 2);
                } else {
                    const startIdx = p === 'b' ? 4 : 0;
                    const endIdx = p === 'r' ? 4 : 8;
                    for (let i = startIdx; i < endIdx; i++) {
                        const [dr, dc] = slideDirs[i];
                        let tr = r + dr, tc = c + dc;
                        while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
                            const target = board[tr][tc];
                            if (!target) {
                                if (isLegalMove(r, c, tr, tc, true)) moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                            } else {
                                if ((target === target.toUpperCase()) !== isW && isLegalMove(r, c, tr, tc, true)) {
                                    moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                                }
                                break;
                            }
                            tr += dr; tc += dc;
                        }
                    }
                }
            }
        }
        return moves;
    }

    function movePiece(fR, fC, tR, tC, promotion = 'q') {
        if (isLegalMove(fR, fC, tR, tC)) {
            const beforeFen = boardToFen();
            let piece = board[fR][fC];
            const target = board[tR][tC];
            const isPawn = piece.toLowerCase() === 'p';
            const isPromo = isPawn && (tR === 0 || tR === 7);
            const promoChar = (promotion || 'q').toLowerCase();
            
            // 50-move rule reset
            if (isPawn || target) halfMoveClock = 0;
            else halfMoveClock++;

            // Pawn promotion with selectable piece choice
            if (isPromo) {
                piece = (piece === 'P') ? promoChar.toUpperCase() : promoChar;
            }
            
            // Handle En Passant removal
            if (isPawn && !target && enPassantSquare && tR === enPassantSquare.row && tC === enPassantSquare.col) {
                const epR = (piece === piece.toUpperCase()) ? tR + 1 : tR - 1;
                board[epR][tC] = null;
            }

            // Set next En Passant square
            if (isPawn && Math.abs(tR - fR) === 2) {
                enPassantSquare = { row: (fR + tR) / 2, col: fC };
            } else {
                enPassantSquare = null;
            }

            // Handle castling
            if (piece.toLowerCase() === 'k' && Math.abs(tC - fC) === 2) {
                const isK = tC > fC, rFC = isK ? 7 : 0, rTC = isK ? 5 : 3;
                board[fR][rTC] = board[fR][rFC]; board[fR][rFC] = null;
            }
            
            board[tR][tC] = piece; board[fR][fC] = null;
            if (piece === 'K') castlingRights.wKingMoved = true;
            if (piece === 'k') castlingRights.bKingMoved = true;
            if (fR === 7 && fC === 0 || tR === 7 && tC === 0) castlingRights.wRookAMoved = true;
            if (fR === 7 && fC === 7 || tR === 7 && tC === 7) castlingRights.wRookHMoved = true;
            if (fR === 0 && fC === 0 || tR === 0 && tC === 0) castlingRights.bRookAMoved = true;
            if (fR === 0 && fC === 7 || tR === 0 && tC === 7) castlingRights.bRookHMoved = true;
            
            turn = turn === 'w' ? 'b' : 'w';
            const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const uci = `${files[fC]}${8 - fR}${files[tC]}${8 - tR}${isPromo ? promoChar : ''}`;
            const currentFen = boardToFen();
            const currentSimpleFen = currentFen.split(' ').slice(0, 4).join(' ');
            recordPosition(currentSimpleFen);
            gameHistory.push({ fen: currentFen, beforeFen, move: { fR, fC, tR, tC, promotion: isPromo ? promoChar : null, uci } });
            notifyChange(checkDrawConditions(currentSimpleFen));
            return true;
        }
        return false;
    }

    function subscribe(l) { listeners.push(l); return () => listeners = listeners.filter(fn => fn !== l); }
    function notifyChange(status = null) {
        const s = { ...getState(), status };
        listeners.forEach(l => l(s));
    }

    return {
        initBoard, getBoard, getTurn, getState, loadState, loadFen, getFen: boardToFen,
        movePiece, getAllLegalMoves, isValidMove: isLegalMove, isKingInCheck, subscribe,
        getGameHistory: () => [...gameHistory]
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ChessLogic;
if (typeof window !== 'undefined') ChessLogic.initBoard();
