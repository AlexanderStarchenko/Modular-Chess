/**
 * Modular Chess Neural Network AI (V1 - Grandmaster 5-Ply Deep Search Enhanced)
 * Powered by ONNX Runtime Web (WASM / WebGPU)
 * Enhancements:
 *  1. Grandmaster Opening Book integration (0ms instant book moves)
 *  2. In-Memory Transposition Table (LRU caching across evaluations)
 *  3. Instant Checkmate & Anti-Mate in 1 Tactical Filter
 *  4. Policy-Guided 5-Ply Minimax Deep Search with Batched Multi-Ply ONNX Execution
 *  5. Tactical Quiescence Search (resolving forcing trades & horizon traps via MVV-LVA)
 *  6. Hybrid Evaluation Blending (Neural Value Head + Tactical Material/PST)
 */

const ChessAINeural = (() => {
    let session = null;
    let initPromise = null;
    const transpositionTable = new Map();
    const MAX_TT_SIZE = 2500;

    const PIECE_MAP = {
        'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
        'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
    };

    const PIECE_VALUES = {
        'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
        'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
    };

    let sessionV1 = null;
    let sessionV15 = null;
    let sessionV16 = null;
    let sessionV17 = null;
    let activeSession = null;

    async function init(modelVer = 'v1') {
        if (typeof ort === 'undefined') {
            throw new Error('ONNX Runtime Web (ort) is not loaded.');
        }

        if (ort.env && ort.env.wasm) {
            ort.env.wasm.wasmPaths = 'js/';
            ort.env.wasm.numThreads = 2;
        }

        if (modelVer === 'v1_7' || modelVer === 'v1.7') {
            if (sessionV17) {
                activeSession = sessionV17;
                session = sessionV17;
                return sessionV17;
            }
            try {
                console.log('[Neural AI] Initializing ModularChessNet V1.7 (modular_chess_v1_7.onnx)...');
                sessionV17 = await ort.InferenceSession.create('modular_chess_v1_7.onnx', { executionProviders: ['wasm'] });
                console.log('[Neural AI] ModularChessNet V1.7 session ready!');
                activeSession = sessionV17;
                session = sessionV17;
                return sessionV17;
            } catch (err) {
                console.warn('[Neural AI] modular_chess_v1_7.onnx not loaded, falling back to V1.6:', err);
                return init('v1_6');
            }
        }

        if (modelVer === 'v1_6') {
            if (sessionV16) {
                activeSession = sessionV16;
                session = sessionV16;
                return sessionV16;
            }
            try {
                console.log('[Neural AI] Initializing ModularChessNet V1.6 (modular_chess_v1_6.onnx)...');
                sessionV16 = await ort.InferenceSession.create('modular_chess_v1_6.onnx', { executionProviders: ['wasm'] });
                console.log('[Neural AI] ModularChessNet V1.6 session ready!');
                activeSession = sessionV16;
                session = sessionV16;
                return sessionV16;
            } catch (err) {
                console.warn('[Neural AI] modular_chess_v1_6.onnx not loaded, falling back to V1.5:', err);
                return init('v1_5');
            }
        }

        if (modelVer === 'v1_5') {
            if (sessionV15) {
                activeSession = sessionV15;
                session = sessionV15;
                return sessionV15;
            }
            try {
                console.log('[Neural AI] Initializing ModularChessNet V1.5 (modular_chess_v1_5.onnx)...');
                sessionV15 = await ort.InferenceSession.create('modular_chess_v1_5.onnx', { executionProviders: ['wasm'] });
                console.log('[Neural AI] ModularChessNet V1.5 session ready!');
                activeSession = sessionV15;
                session = sessionV15;
                return sessionV15;
            } catch (err) {
                console.warn('[Neural AI] modular_chess_v1_5.onnx not loaded, falling back to V1.0:', err);
            }
        }

        if (sessionV1) {
            activeSession = sessionV1;
            session = sessionV1;
            return sessionV1;
        }

        console.log('[Neural AI] Initializing ModularChessNet V1 (modular_chess_v1.onnx)...');
        try {
            sessionV1 = await ort.InferenceSession.create('modular_chess_v1.onnx', { executionProviders: ['wasm'] });
            console.log('[Neural AI] ModularChessNet V1 session ready!');
            activeSession = sessionV1;
            session = sessionV1;
            return sessionV1;
        } catch (err) {
            console.error('[Neural AI] Failed to load ONNX model locally:', err);
            throw err;
        }
    }

    function fenToBoard(fen) {
        const parts = fen.split(' ');
        const boardStr = parts[0];
        const turn = parts[1] || 'w';
        const castling = parts[2] || '-';
        const board = Array.from({ length: 8 }, () => new Array(8).fill(null));

        let r = 0;
        let c = 0;
        for (let i = 0; i < boardStr.length; i++) {
            const ch = boardStr[i];
            if (ch === '/') {
                r++;
                c = 0;
            } else if (ch >= '1' && ch <= '8') {
                c += parseInt(ch, 10);
            } else {
                board[r][c] = ch;
                c++;
            }
        }
        return { board, turn, castling };
    }

    function fillPlanes(planes, offset, board, turn, castling) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && PIECE_MAP[p] !== undefined) {
                    planes[offset + PIECE_MAP[p] * 64 + r * 8 + c] = 1.0;
                }
            }
        }

        // Plane 12: Turn
        if (turn === 'w') {
            for (let i = 0; i < 64; i++) {
                planes[offset + 12 * 64 + i] = 1.0;
            }
        }

        // Planes 13-14: Castling rights
        if (castling.includes('K')) {
            for (let rr = 0; rr < 4; rr++) {
                for (let cc = 0; cc < 4; cc++) planes[offset + 13 * 64 + rr * 8 + cc] = 1.0;
            }
        }
        if (castling.includes('Q')) {
            for (let rr = 0; rr < 4; rr++) {
                for (let cc = 4; cc < 8; cc++) planes[offset + 13 * 64 + rr * 8 + cc] = 1.0;
            }
        }
        if (castling.includes('k')) {
            for (let rr = 4; rr < 8; rr++) {
                for (let cc = 0; cc < 4; cc++) planes[offset + 14 * 64 + rr * 8 + cc] = 1.0;
            }
        }
        if (castling.includes('q')) {
            for (let rr = 4; rr < 8; rr++) {
                for (let cc = 4; cc < 8; cc++) planes[offset + 14 * 64 + rr * 8 + cc] = 1.0;
            }
        }
    }

    function simulateMove(board, fR, fC, tR, tC) {
        const nb = board.map(row => row.slice());
        let p = nb[fR][fC];
        nb[fR][fC] = null;
        if (p === 'P' && tR === 0) p = 'Q';
        else if (p === 'p' && tR === 7) p = 'q';
        else if (p === 'K' && fR === 7 && fC === 4) {
            if (tC === 6) { nb[7][7] = null; nb[7][5] = 'R'; }
            else if (tC === 2) { nb[7][0] = null; nb[7][3] = 'R'; }
        } else if (p === 'k' && fR === 0 && fC === 4) {
            if (tC === 6) { nb[0][7] = null; nb[0][5] = 'r'; }
            else if (tC === 2) { nb[0][0] = null; nb[0][3] = 'r'; }
        }
        nb[tR][tC] = p;
        return nb;
    }

    function isPassedPawn(board, r, c, isW) {
        const p = board[r][c];
        if (!p || p !== (isW ? 'P' : 'p')) return false;
        const oppP = isW ? 'p' : 'P';
        const filesToCheck = [c - 1, c, c + 1].filter(fc => fc >= 0 && fc < 8);
        if (isW) {
            for (let checkR = 0; checkR < r; checkR++) {
                for (const checkC of filesToCheck) {
                    if (board[checkR][checkC] === oppP) return false;
                }
            }
        } else {
            for (let checkR = r + 1; checkR < 8; checkR++) {
                for (const checkC of filesToCheck) {
                    if (board[checkR][checkC] === oppP) return false;
                }
            }
        }
        return true;
    }

    function isSquareAttacked(board, sqR, sqC, byColor) {
        const isW = (byColor === 'w');
        const pChar = isW ? 'P' : 'p';
        const nChar = isW ? 'N' : 'n';
        const bChars = isW ? ['B', 'Q'] : ['b', 'q'];
        const rChars = isW ? ['R', 'Q'] : ['r', 'q'];
        const kChar = isW ? 'K' : 'k';

        // Pawns
        const pSourceDir = isW ? 1 : -1;
        for (const dc of [-1, 1]) {
            const nr = sqR + pSourceDir, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === pChar) return true;
        }

        // Knights
        const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightOffsets) {
            const nr = sqR + dr, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === nChar) return true;
        }

        // Rooks & Queens
        const orthDirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of orthDirs) {
            let nr = sqR + dr, nc = sqC + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = board[nr][nc];
                if (p) {
                    if (rChars.includes(p)) return true;
                    break;
                }
                nr += dr; nc += dc;
            }
        }

        // Bishops & Queens
        const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of diagDirs) {
            let nr = sqR + dr, nc = sqC + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = board[nr][nc];
                if (p) {
                    if (bChars.includes(p)) return true;
                    break;
                }
                nr += dr; nc += dc;
            }
        }

        // King
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = sqR + dr, nc = sqC + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === kChar) return true;
            }
        }

        return false;
    }

    function isKingInCheck(board, turn) {
        const isW = (turn === 'w');
        const kChar = isW ? 'K' : 'k';
        let kr = -1, kc = -1;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === kChar) {
                    kr = r; kc = c; break;
                }
            }
            if (kr !== -1) break;
        }
        if (kr === -1) return true;
        return isSquareAttacked(board, kr, kc, isW ? 'b' : 'w');
    }

    function boardToSimpleKey(board, turn) {
        const rows = [];
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            let rowStr = '';
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p === null) {
                    empty++;
                } else {
                    if (empty > 0) {
                        rowStr += empty;
                        empty = 0;
                    }
                    rowStr += p;
                }
            }
            if (empty > 0) rowStr += empty;
            rows.push(rowStr);
        }
        return rows.join('/') + ' ' + turn;
    }

    function generateCaptures(board, turn) {
        const isW = (turn === 'w');
        const captures = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p || (p === p.toUpperCase()) !== isW) continue;
                const ptype = p.toLowerCase();
                if (ptype === 'p') {
                    const pDir = isW ? -1 : 1;
                    const nr = r + pDir;
                    // Promotion push to empty square
                    if ((nr === 0 || nr === 7) && nr >= 0 && nr < 8 && !board[nr][c]) {
                        captures.push({ fr: r, fc: c, tr: nr, tc: c, victimVal: 800, mvvLva: 8000 });
                    }
                    if (nr >= 0 && nr < 8) {
                        for (const dc of [-1, 1]) {
                            const nc = c + dc;
                            if (nc >= 0 && nc < 8) {
                                const tp = board[nr][nc];
                                if (tp && (tp === tp.toUpperCase()) !== isW) {
                                    let vVal = PIECE_VALUES[tp.toLowerCase()] || 0;
                                    if (nr === 0 || nr === 7) vVal += 800;
                                    const aVal = PIECE_VALUES[p.toLowerCase()] || 0;
                                    captures.push({ fr: r, fc: c, tr: nr, tc: nc, victimVal: vVal, mvvLva: vVal * 10 - aVal });
                                }
                            }
                        }
                    }
                } else if (ptype === 'n') {
                    const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                    for (const [dr, dc] of knightOffsets) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            const tp = board[nr][nc];
                            if (tp && (tp === tp.toUpperCase()) !== isW) {
                                const vVal = PIECE_VALUES[tp.toLowerCase()] || 0;
                                const aVal = PIECE_VALUES[p.toLowerCase()] || 0;
                                captures.push({ fr: r, fc: c, tr: nr, tc: nc, victimVal: vVal, mvvLva: vVal * 10 - aVal });
                            }
                        }
                    }
                } else if (ptype === 'b' || ptype === 'r' || ptype === 'q') {
                    const dirs = [];
                    if (ptype === 'b' || ptype === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
                    if (ptype === 'r' || ptype === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
                    for (const [dr, dc] of dirs) {
                        let nr = r + dr, nc = c + dc;
                        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            const tp = board[nr][nc];
                            if (tp) {
                                if ((tp === tp.toUpperCase()) !== isW) {
                                    const vVal = PIECE_VALUES[tp.toLowerCase()] || 0;
                                    const aVal = PIECE_VALUES[p.toLowerCase()] || 0;
                                    captures.push({ fr: r, fc: c, tr: nr, tc: nc, victimVal: vVal, mvvLva: vVal * 10 - aVal });
                                }
                                break;
                            }
                            nr += dr; nc += dc;
                        }
                    }
                } else if (ptype === 'k') {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                const tp = board[nr][nc];
                                if (tp && (tp === tp.toUpperCase()) !== isW) {
                                    const vVal = PIECE_VALUES[tp.toLowerCase()] || 0;
                                    const aVal = PIECE_VALUES[p.toLowerCase()] || 0;
                                    captures.push({ fr: r, fc: c, tr: nr, tc: nc, victimVal: vVal, mvvLva: vVal * 10 - aVal });
                                }
                            }
                        }
                    }
                }
            }
        }
        return captures;
    }

    function evaluateMaterial(board) {
        let total = 0;
        let nonKingMaterial = 0;
        let wKr = -1, wKc = -1;
        let bKr = -1, bKc = -1;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p) {
                    let val = PIECE_VALUES[p.toLowerCase()] || 0;
                    const isW = (p === p.toUpperCase());
                    if (p === 'K') {
                        wKr = r; wKc = c;
                    } else if (p === 'k') {
                        bKr = r; bKc = c;
                    } else {
                        nonKingMaterial += val;
                    }
                    if (p.toLowerCase() === 'p' && isPassedPawn(board, r, c, isW)) {
                        const adv = isW ? (7 - r) : r;
                        if (adv >= 3) {
                            const bonus = [0, 0, 0, 20, 50, 110, 250, 0][adv] || 0;
                            val += bonus;
                        }
                    }
                    total += isW ? val : -val;
                }
            }
        }
        if (nonKingMaterial <= 1600) {
            if (wKr !== -1) {
                const wCenterDist = Math.max(Math.abs(wKr - 3.5), Math.abs(wKc - 3.5));
                total += Math.round((3.5 - wCenterDist) * 15);
            }
            if (bKr !== -1) {
                const bCenterDist = Math.max(Math.abs(bKr - 3.5), Math.abs(bKc - 3.5));
                total -= Math.round((3.5 - bCenterDist) * 15);
            }
        }
        return total;
    }

    function quiesce(board, turn, alpha, beta, depth = 4) {
        const inCheck = isKingInCheck(board, turn);
        const persp = (turn === 'w' ? 1.0 : -1.0);
        let standPat = -9999;

        if (!inCheck) {
            standPat = persp * evaluateMaterial(board);
            if (standPat >= beta) return beta;
            if (standPat > alpha) alpha = standPat;
        }

        if (depth <= 0) {
            if (!inCheck) return alpha;
            depth = 1;
        }

        const oppTurn = (turn === 'w' ? 'b' : 'w');

        if (inCheck) {
            const legals = getLegalMovesForBoard(board, turn, '-');
            if (!legals || legals.length === 0) return -10000;
            const scored = [];
            for (let i = 0; i < legals.length; i++) {
                const m = legals[i];
                const target = board[m.toR][m.toC];
                const vVal = target ? (PIECE_VALUES[target.toLowerCase()] || 0) : 0;
                const aVal = PIECE_VALUES[(board[m.fromR][m.fromC] || '').toLowerCase()] || 0;
                scored.push({ score: vVal * 10 - aVal, m });
            }
            scored.sort((a, b) => b.score - a.score);
            for (let i = 0; i < scored.length; i++) {
                const m = scored[i].m;
                const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                const score = -quiesce(nb, oppTurn, -beta, -alpha, depth - 1);
                if (score >= beta) return beta;
                if (score > alpha) alpha = score;
            }
            return alpha;
        }

        const caps = generateCaptures(board, turn);
        if (!caps || caps.length === 0) return alpha;
        caps.sort((a, b) => b.mvvLva - a.mvvLva);

        for (const c of caps) {
            if (standPat + c.victimVal + 200 < alpha) continue;
            const nb = simulateMove(board, c.fr, c.fc, c.tr, c.tc);
            if (isKingInCheck(nb, turn)) continue;

            const score = -quiesce(nb, oppTurn, -beta, -alpha, depth - 1);
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        return alpha;
    }

    function getAllLegalMoves(turn) {
        if (typeof ChessLogic !== 'undefined' && typeof ChessLogic.getAllLegalMoves === 'function') {
            return ChessLogic.getAllLegalMoves(turn);
        }
        return [];
    }

    function getLegalMovesForBoard(board, turn, castling = '-') {
        const isW = (turn === 'w');
        const moves = [];
        const pDir = isW ? -1 : 1;
        const startRank = isW ? 6 : 1;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p || (p === p.toUpperCase()) !== isW) continue;
                const ptype = p.toLowerCase();

                if (ptype === 'p') {
                    const nr = r + pDir;
                    if (nr >= 0 && nr < 8 && !board[nr][c]) {
                        moves.push({ fromR: r, fromC: c, toR: nr, toC: c });
                        if (r === startRank) {
                            const nnr = r + 2 * pDir;
                            if (nnr >= 0 && nnr < 8 && !board[nnr][c]) {
                                moves.push({ fromR: r, fromC: c, toR: nnr, toC: c });
                            }
                        }
                    }
                    for (const dc of [-1, 1]) {
                        const nc = c + dc;
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            const tp = board[nr][nc];
                            if (tp && (tp === tp.toUpperCase()) !== isW && tp.toLowerCase() !== 'k') {
                                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc });
                            }
                        }
                    }
                } else if (ptype === 'n') {
                    const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                    for (const [dr, dc] of knightOffsets) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            const tp = board[nr][nc];
                            if (!tp || ((tp === tp.toUpperCase()) !== isW && tp.toLowerCase() !== 'k')) {
                                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc });
                            }
                        }
                    }
                } else if (ptype === 'b' || ptype === 'r' || ptype === 'q') {
                    const dirs = [];
                    if (ptype === 'b' || ptype === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
                    if (ptype === 'r' || ptype === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
                    for (const [dr, dc] of dirs) {
                        let nr = r + dr, nc = c + dc;
                        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            const tp = board[nr][nc];
                            if (!tp) {
                                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc });
                            } else {
                                if ((tp === tp.toUpperCase()) !== isW && tp.toLowerCase() !== 'k') {
                                    moves.push({ fromR: r, fromC: c, toR: nr, toC: nc });
                                }
                                break;
                            }
                            nr += dr; nc += dc;
                        }
                    }
                } else if (ptype === 'k') {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                const tp = board[nr][nc];
                                if (!tp || ((tp === tp.toUpperCase()) !== isW && tp.toLowerCase() !== 'k')) {
                                    moves.push({ fromR: r, fromC: c, toR: nr, toC: nc });
                                }
                            }
                        }
                    }
                }
            }
        }

        if (isW) {
            if (castling.includes('K') && board[7][4] === 'K' && board[7][7] === 'R') {
                if (!board[7][5] && !board[7][6] && !isKingInCheck(board, 'w') && !isKingInCheck(simulateMove(board, 7, 4, 7, 5), 'w')) {
                    moves.push({ fromR: 7, fromC: 4, toR: 7, toC: 6 });
                }
            }
            if (castling.includes('Q') && board[7][4] === 'K' && board[7][0] === 'R') {
                if (!board[7][1] && !board[7][2] && !board[7][3] && !isKingInCheck(board, 'w') && !isKingInCheck(simulateMove(board, 7, 4, 7, 3), 'w')) {
                    moves.push({ fromR: 7, fromC: 4, toR: 7, toC: 2 });
                }
            }
        } else {
            if (castling.includes('k') && board[0][4] === 'k' && board[0][7] === 'r') {
                if (!board[0][5] && !board[0][6] && !isKingInCheck(board, 'b') && !isKingInCheck(simulateMove(board, 0, 4, 0, 5), 'b')) {
                    moves.push({ fromR: 0, fromC: 4, toR: 0, toC: 6 });
                }
            }
            if (castling.includes('q') && board[0][4] === 'k' && board[0][0] === 'r') {
                if (!board[0][1] && !board[0][2] && !board[0][3] && !isKingInCheck(board, 'b') && !isKingInCheck(simulateMove(board, 0, 4, 0, 3), 'b')) {
                    moves.push({ fromR: 0, fromC: 4, toR: 0, toC: 2 });
                }
            }
        }

        const legal = [];
        for (const m of moves) {
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            if (!isKingInCheck(nb, turn)) {
                legal.push(m);
            }
        }
        return legal;
    }

    function findInstantMateMove(board, turn, legalMoves) {
        const oppTurn = (turn === 'w' ? 'b' : 'w');
        for (const m of legalMoves) {
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            if (isKingInCheck(nb, oppTurn)) {
                const oppMoves = getLegalMovesForBoard(nb, oppTurn, '-');
                if (oppMoves.length === 0) {
                    const p = board[m.fromR][m.fromC];
                    const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
                    return { ...m, promotion: isPromo ? 'q' : null };
                }
            }
        }
        return null;
    }

    function findMateInTwoMove(board, turn, legalMoves, castling = '-') {
        const oppTurn = (turn === 'w' ? 'b' : 'w');
        for (const m of legalMoves) {
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            if (!isKingInCheck(nb, oppTurn)) continue;
            const oppMoves = getLegalMovesForBoard(nb, oppTurn, castling);
            if (!oppMoves || oppMoves.length === 0) continue;
            let allLeadToMate = true;
            for (const om of oppMoves) {
                const onb = simulateMove(nb, om.fromR, om.fromC, om.toR, om.toC);
                const secondMoves = getLegalMovesForBoard(onb, turn, castling);
                if (!findInstantMateMove(onb, turn, secondMoves)) {
                    allLeadToMate = false;
                    break;
                }
            }
            if (allLeadToMate) {
                const p = board[m.fromR][m.fromC];
                const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
                return { ...m, promotion: isPromo ? 'q' : null };
            }
        }
        return null;
    }

    function getCheapestAttacker(board, sqR, sqC, byColor) {
        const isW = (byColor === 'w');
        const pChar = isW ? 'P' : 'p';
        const nChar = isW ? 'N' : 'n';
        const bChars = isW ? ['B', 'Q'] : ['b', 'q'];
        const rChars = isW ? ['R', 'Q'] : ['r', 'q'];
        const kChar = isW ? 'K' : 'k';

        // Pawns
        const pSourceDir = isW ? 1 : -1;
        for (const dc of [-1, 1]) {
            const nr = sqR + pSourceDir, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === pChar) return 100;
        }

        // Knights
        const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightOffsets) {
            const nr = sqR + dr, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === nChar) return 300;
        }

        let cheapest = 9999;
        // Bishops & Queens
        const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of diagDirs) {
            let nr = sqR + dr, nc = sqC + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = board[nr][nc];
                if (p) {
                    if (bChars.includes(p)) {
                        const val = (p.toLowerCase() === 'b') ? 300 : 900;
                        if (val < cheapest) cheapest = val;
                    }
                    break;
                }
                nr += dr; nc += dc;
            }
        }

        // Rooks & Queens
        const orthDirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of orthDirs) {
            let nr = sqR + dr, nc = sqC + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = board[nr][nc];
                if (p) {
                    if (rChars.includes(p)) {
                        const val = (p.toLowerCase() === 'r') ? 500 : 900;
                        if (val < cheapest) cheapest = val;
                    }
                    break;
                }
                nr += dr; nc += dc;
            }
        }

        // King
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = sqR + dr, nc = sqC + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === kChar) {
                    if (20000 < cheapest) cheapest = 20000;
                }
            }
        }

        return cheapest < 9999 ? cheapest : null;
    }

    function checkMoveTacticalBlunder(board, turn, m, castling = '-') {
        const oppTurn = (turn === 'w' ? 'b' : 'w');
        const fr = m.fromR, fc = m.fromC, tr = m.toR, tc = m.toC;
        const p = board[fr][fc];
        if (!p) return null;
        const pVal = PIECE_VALUES[p.toLowerCase()] || 0;
        const cap = board[tr][tc];
        const capVal = cap ? (PIECE_VALUES[cap.toLowerCase()] || 0) : 0;
        const nb = simulateMove(board, fr, fc, tr, tc);

        // 1. Hanging piece & bad trade check
        if (p.toLowerCase() !== 'k') {
            const cheapEnemy = getCheapestAttacker(nb, tr, tc, oppTurn);
            if (cheapEnemy !== null) {
                const isDef = isSquareAttacked(nb, tr, tc, turn);
                if (!isDef) {
                    const netLoss = pVal - capVal;
                    if (netLoss > 150) return 'hanging_piece';
                } else {
                    const tradeLoss = pVal - cheapEnemy - capVal;
                    if (tradeLoss > 150) return 'bad_trade';
                }
            }
        }

        // 2. Abandoned piece check
        const isW = (turn === 'w');
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (r === tr && c === tc) continue;
                const fp = nb[r][c];
                if (fp && (fp === fp.toUpperCase()) === isW && ['q', 'r', 'b', 'n'].includes(fp.toLowerCase())) {
                    if (isSquareAttacked(nb, r, c, oppTurn) && !isSquareAttacked(nb, r, c, turn)) {
                        if (isSquareAttacked(board, r, c, turn)) return 'abandons_piece';
                    }
                }
            }
        }

        // 3. Forcing check-skewer / check-fork check
        const oppLegal = getLegalMovesForBoard(nb, oppTurn, castling);
        for (let i = 0; i < oppLegal.length; i++) {
            const om = oppLegal[i];
            const onb = simulateMove(nb, om.fromR, om.fromC, om.toR, om.toC);
            if (isKingInCheck(onb, turn)) {
                const ourReplies = getLegalMovesForBoard(onb, turn, castling);
                if (!ourReplies || ourReplies.length === 0) continue;
                let allRepliesLosePiece = true;
                for (let j = 0; j < ourReplies.length; j++) {
                    const rep = ourReplies[j];
                    const rnb = simulateMove(onb, rep.fromR, rep.fromC, rep.toR, rep.toC);
                    const oppFollowups = getLegalMovesForBoard(rnb, oppTurn, castling);
                    let foundSafe = true;
                    for (let k = 0; k < oppFollowups.length; k++) {
                        const om2 = oppFollowups[k];
                        const vic = rnb[om2.toR][om2.toC];
                        if (vic && ['q', 'r', 'b', 'n'].includes(vic.toLowerCase())) {
                            const vVal = PIECE_VALUES[vic.toLowerCase()] || 0;
                            const aVal = PIECE_VALUES[(rnb[om2.fromR][om2.fromC] || '').toLowerCase()] || 0;
                            const afterCap = simulateMove(rnb, om2.fromR, om2.fromC, om2.toR, om2.toC);
                            if (!isSquareAttacked(afterCap, om2.toR, om2.toC, turn)) {
                                if (vVal >= 300) {
                                    foundSafe = false;
                                    break;
                                }
                            } else if (vVal - aVal >= 200) {
                                foundSafe = false;
                                break;
                            }
                        }
                    }
                    if (foundSafe) {
                        allRepliesLosePiece = false;
                        break;
                    }
                }
                if (allRepliesLosePiece) return 'skewer_fork';
            }
        }

        return null;
    }

    function filterTacticalBlunders(board, turn, legalMoves, castling = '-') {
        if (!legalMoves || legalMoves.length <= 1) return legalMoves;
        const oppTurn = (turn === 'w' ? 'b' : 'w');

        // Priority 1: Instant mate in 1
        const nonMating = [];
        for (const m of legalMoves) {
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            const oppMoves = getLegalMovesForBoard(nb, oppTurn, castling);
            if (!findInstantMateMove(nb, oppTurn, oppMoves)) {
                nonMating.push(m);
            }
        }
        const pool = nonMating.length > 0 ? nonMating : legalMoves;
        if (pool.length <= 1) return pool;

        // Priority 2: Hanging pieces, bad trades, skewers, check-forks
        const safeMoves = [];
        for (const m of pool) {
            const blunder = checkMoveTacticalBlunder(board, turn, m, castling);
            if (!blunder) safeMoves.push(m);
        }

        return safeMoves.length > 0 ? safeMoves : pool;
    }

    const filterMatingBlunders = filterTacticalBlunders;

    function isElementaryEndgame(board, turn) {
        const isW = (turn === 'w');
        let myQueens = 0, myRooks = 0, oppPieces = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p) continue;
                const pIsW = (p === p.toUpperCase());
                if (pIsW === isW) {
                    if (p.toLowerCase() === 'q') myQueens++;
                    else if (p.toLowerCase() === 'r') myRooks++;
                } else {
                    if (p.toLowerCase() !== 'k') oppPieces++;
                }
            }
        }
        return oppPieces === 0 && (myQueens >= 1 || myRooks >= 1);
    }

    function isEndgamePosition(board) {
        let nonKingMat = 0;
        let totalPieces = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p) {
                    totalPieces++;
                    if (p.toLowerCase() !== 'k') {
                        nonKingMat += PIECE_VALUES[p] || 0;
                    }
                }
            }
        }
        return totalPieces <= 14 || nonKingMat <= 1600;
    }

    function solveElementaryEndgame(board, turn, castling = '-') {
        const isW = (turn === 'w');
        const oppTurn = isW ? 'b' : 'w';
        const legal = getLegalMovesForBoard(board, turn, castling);
        if (!legal || legal.length === 0) return null;

        // Instant mate in 1 check
        const im = findInstantMateMove(board, turn, legal);
        if (im) return { ...im, isMate: true, isEndgame: true };

        const fkChar = isW ? 'K' : 'k';
        const okChar = isW ? 'k' : 'K';
        let fkR = -1, fkC = -1, okR = -1, okC = -1;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === fkChar) { fkR = r; fkC = c; }
                else if (board[r][c] === okChar) { okR = r; okC = c; }
            }
        }

        let bestScore = -Infinity;
        let bestMove = null;

        for (const m of legal) {
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            const oppMoves = getLegalMovesForBoard(nb, oppTurn, '-');

            if (oppMoves.length === 0) {
                if (isKingInCheck(nb, oppTurn)) {
                    const p = board[m.fromR][m.fromC];
                    const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
                    return { ...m, promotion: isPromo ? 'q' : null, isMate: true, isEndgame: true };
                }
                continue; // Stalemate prevention!
            }

            // Undefended hanging piece check
            const pMoved = board[m.fromR][m.fromC];
            let hanging = false;
            if (pMoved.toLowerCase() !== 'k') {
                for (const om of oppMoves) {
                    if (om.toR === m.toR && om.toC === m.toC) {
                        const afterCap = simulateMove(nb, om.fromR, om.fromC, m.toR, m.toC);
                        if (!isSquareAttacked(afterCap, m.toR, m.toC, turn)) {
                            hanging = true;
                            break;
                        }
                    }
                }
            }
            if (hanging) continue;

            const nFkR = (m.fromR === fkR && m.fromC === fkC) ? m.toR : fkR;
            const nFkC = (m.fromR === fkR && m.fromC === fkC) ? m.toC : fkC;

            const edgeDist = Math.min(okR, 7 - okR, okC, 7 - okC);
            const edgeScore = (3.5 - edgeDist) * 40.0;
            const kDist = Math.max(Math.abs(nFkR - okR), Math.abs(nFkC - okC));
            const kScore = -(kDist * 12.0);
            const mobScore = -(oppMoves.length * 4.0);
            const checkBonus = isKingInCheck(nb, oppTurn) ? 15.0 : 0.0;

            const total = edgeScore + kScore + mobScore + checkBonus;
            if (total > bestScore) {
                bestScore = total;
                bestMove = m;
            }
        }

        if (bestMove) {
            const p = board[bestMove.fromR][bestMove.fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (bestMove.toR === 0 || bestMove.toR === 7);
            return { ...bestMove, promotion: isPromo ? 'q' : null, isEndgame: true };
        }
        return null;
    }

    function getEndgameMove(fen) {
        if (!fen) return null;
        if (typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getEndgameTablebaseMove === 'function') {
            const tbMove = ChessAIShared.getEndgameTablebaseMove(fen);
            if (tbMove) return tbMove;
        }
        const { board, turn, castling } = fenToBoard(fen);
        if (board && isElementaryEndgame(board, turn)) {
            return solveElementaryEndgame(board, turn, castling);
        }
        return null;
    }

    const DIRECTIONS_4672 = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];
    const KNIGHT_MOVES_4672 = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    const UNDERPROMOS_4672 = ['n', 'b', 'r'];

    function moveTo4672(fromR, fromC, toR, toC, promo = null) {
        const fromSq = fromR * 8 + fromC;
        const dr = toR - fromR;
        const dc = toC - fromC;
        const pr = promo ? promo.toLowerCase() : null;

        if (pr && UNDERPROMOS_4672.includes(pr)) {
            const pIdx = UNDERPROMOS_4672.indexOf(pr);
            const pDir = dc < 0 ? -1 : (dc > 0 ? 1 : 0);
            const dirIdx = pDir + 1;
            return fromSq * 73 + 64 + dirIdx * 3 + pIdx;
        }

        for (let kIdx = 0; kIdx < KNIGHT_MOVES_4672.length; kIdx++) {
            if (dr === KNIGHT_MOVES_4672[kIdx][0] && dc === KNIGHT_MOVES_4672[kIdx][1]) {
                return fromSq * 73 + 56 + kIdx;
            }
        }

        for (let dIdx = 0; dIdx < DIRECTIONS_4672.length; dIdx++) {
            const [ddr, ddc] = DIRECTIONS_4672[dIdx];
            for (let dist = 1; dist <= 7; dist++) {
                if (dr === ddr * dist && dc === ddc * dist) {
                    return fromSq * 73 + dIdx * 7 + (dist - 1);
                }
            }
        }

        return null;
    }

    function idx4672ToMove(idx) {
        if (idx === null || idx < 0 || idx >= 4672) return { fr: 0, fc: 0, tr: 0, tc: 0, promo: null };
        const fromSq = Math.floor(idx / 73);
        const plane = idx % 73;
        const fromR = Math.floor(fromSq / 8);
        const fromC = fromSq % 8;

        if (plane < 56) {
            const dIdx = Math.floor(plane / 7);
            const dist = (plane % 7) + 1;
            const [dr, dc] = DIRECTIONS_4672[dIdx];
            const toR = fromR + dr * dist;
            const toC = fromC + dc * dist;
            if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8) {
                const promo = (toR === 0 || toR === 7) && dist === 1 ? 'q' : null;
                return { fr: fromR, fc: fromC, tr: toR, tc: toC, promo };
            }
        } else if (plane < 64) {
            const kIdx = plane - 56;
            const [dr, dc] = KNIGHT_MOVES_4672[kIdx];
            const toR = fromR + dr;
            const toC = fromC + dc;
            if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8) {
                return { fr: fromR, fc: fromC, tr: toR, tc: toC, promo: null };
            }
        } else {
            const uIdx = plane - 64;
            const dirIdx = Math.floor(uIdx / 3);
            const pIdx = uIdx % 3;
            const pDir = dirIdx - 1;
            const toC = fromC + pDir;
            const toR = (fromR === 1) ? 0 : ((fromR === 6) ? 7 : -1);
            if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8) {
                return { fr: fromR, fc: fromC, tr: toR, tc: toC, promo: UNDERPROMOS_4672[pIdx] };
            }
        }
        return { fr: fromR, fc: fromC, tr: fromR, tc: fromC, promo: null };
    }

    function decode4096(idx) {
        const fromSq = Math.floor(idx / 64);
        const toSq = idx % 64;
        return {
            fr: Math.floor(fromSq / 8),
            fc: fromSq % 8,
            tr: Math.floor(toSq / 8),
            tc: toSq % 8,
            promo: null
        };
    }

    function computePriors(board, turn, moves, policyLogits, historySet = null, rootVal = 0.0, lastOwnKey = null) {
        const isW = (turn === 'w');
        const oppTurn = isW ? 'b' : 'w';
        const is4672 = policyLogits && policyLogits.length === 4672;
        const inEg = isEndgamePosition(board);
        const scores = [];
        for (const m of moves) {
            const p = board[m.fromR][m.fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
            let s = -999;

            if (is4672) {
                const idx4672 = moveTo4672(m.fromR, m.fromC, m.toR, m.toC, isPromo ? 'q' : null);
                if (idx4672 !== null && policyLogits[idx4672] !== undefined) {
                    s = policyLogits[idx4672];
                }
            } else {
                const idx = (m.fromR * 8 + m.fromC) * 64 + (m.toR * 8 + m.toC);
                if (policyLogits[idx] !== undefined) {
                    s = policyLogits[idx];
                }
            }

            if (isPromo) {
                const nbPromo = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                const oppMovesPromo = getLegalMovesForBoard(nbPromo, oppTurn, '-');
                let hangingPromo = false;
                for (const om of oppMovesPromo) {
                    if (om.toR === m.toR && om.toC === m.toC) {
                        const afterCap = simulateMove(nbPromo, om.fromR, om.fromC, m.toR, m.toC);
                        if (!isSquareAttacked(afterCap, m.toR, m.toC, turn)) {
                            hangingPromo = true;
                            break;
                        }
                    }
                }
                const enemyAttack = isSquareAttacked(nbPromo, m.toR, m.toC, oppTurn);
                const friendlyDefend = isSquareAttacked(nbPromo, m.toR, m.toC, turn);
                if (hangingPromo) {
                    s -= 8.0;
                } else if (enemyAttack && !friendlyDefend) {
                    s -= 6.0;
                } else {
                    s += 12.0;
                }
            } else {
                const blunder = checkMoveTacticalBlunder(board, turn, m);
                if (blunder === 'skewer_fork') s -= 15.0;
                else if (blunder === 'hanging_piece') s -= 15.0;
                else if (blunder === 'bad_trade') s -= 10.0;
                else if (blunder === 'abandons_piece') s -= 12.0;
            }

            // Tactical capture bonus
            const target = board[m.toR][m.toC];
            if (target) {
                const vVal = PIECE_VALUES[target.toLowerCase()] || 0;
                const aVal = PIECE_VALUES[board[m.fromR][m.fromC].toLowerCase()] || 0;
                s += Math.max(1.0, (vVal * 10 - aVal) / 500.0 + (vVal / 100.0));
            }

            // Tactical safe passed pawn advancement boost (Careful & Not reckless)
            if (p && p.toLowerCase() === 'p' && isPassedPawn(board, m.fromR, m.fromC, isW)) {
                const adv = isW ? (7 - m.toR) : m.toR;
                if (adv < 7) {
                    const nbP = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                    const enemyAttack = isSquareAttacked(nbP, m.toR, m.toC, oppTurn);
                    const friendlyDefend = isSquareAttacked(nbP, m.toR, m.toC, turn);
                    if (enemyAttack && !friendlyDefend) {
                        s -= 3.0; // avoid reckless blunders
                    } else {
                        const advBoost = [0.0, 0.0, 0.0, 0.8, 1.5, 2.5, 4.0, 0.0][adv] || 0;
                        s += advBoost;
                    }
                }
            }

            // Repetition penalty (avoid shuffling, especially in endgame)
            if (historySet && historySet.size > 0) {
                const nbRep = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                const destKey = boardToSimpleKey(nbRep, oppTurn);
                if (historySet.has(destKey)) {
                    const engineEval = (turn === 'w') ? rootVal : -rootVal;
                    const isOsc = (lastOwnKey && destKey === lastOwnKey);
                    if (inEg) {
                        s -= (isOsc ? 15.0 : 10.0);
                    } else {
                        if (engineEval >= -0.15) {
                            s -= 5.0;
                        } else {
                            s -= 2.0;
                        }
                    }
                }
            }

            scores.push(s);
        }
        const maxS = Math.max(...scores);
        const expS = scores.map(s => Math.exp(Math.min(50, s - maxS)));
        const sumExp = expS.reduce((a, b) => a + b, 0) || 1.0;
        return expS.map(e => e / sumExp);
    }

    async function search5Ply(fen, topK1 = 14, topK2 = 8, topK3 = 4, topK4 = 3, history = null) {
        const startTime = performance.now();

        // 0. Endgame tablebase & solver (0ms)
        const egMove = getEndgameMove(fen);
        if (egMove) return egMove;

        const { board, turn, castling } = fenToBoard(fen);
        const persp = (turn === 'w' ? 1.0 : -1.0);
        const oppTurn = (turn === 'w' ? 'b' : 'w');

        // Build history set for repetition avoidance
        const historySet = new Set();
        const historyCounts = {};
        const recentKeys = [];
        if (Array.isArray(history)) {
            for (const h of history) {
                if (typeof h === 'string') {
                    const parts = h.trim().split(/\s+/);
                    const k = parts.length >= 2 ? (parts[0] + ' ' + parts[1]) : parts[0];
                    if (k) {
                        historySet.add(k);
                        recentKeys.push(k);
                        historyCounts[k] = (historyCounts[k] || 0) + 1;
                    }
                }
            }
        }
        const lastOwnKey = recentKeys.length >= 2 ? recentKeys[recentKeys.length - 2] : null;

        const legalMoves = getAllLegalMoves(turn);
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) {
            const p = board[legalMoves[0].fromR][legalMoves[0].fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (legalMoves[0].toR === 0 || legalMoves[0].toR === 7);
            return { ...legalMoves[0], promotion: isPromo ? 'q' : null };
        }

        // 1. Instant checkmate attack check
        const instantMate = findInstantMateMove(board, turn, legalMoves);
        if (instantMate) {
            console.log(`[Neural AI:5-Ply] 🏆 Instant checkmate detected: (${instantMate.fromR},${instantMate.fromC}) -> (${instantMate.toR},${instantMate.toC})`);
            return instantMate;
        }

        // 1b. Checkmate-in-2 attack check
        const mateIn2 = findMateInTwoMove(board, turn, legalMoves, castling);
        if (mateIn2) {
            console.log(`[Neural AI:5-Ply] 🎯 Forcing mate-in-2 detected: (${mateIn2.fromR},${mateIn2.fromC}) -> (${mateIn2.toR},${mateIn2.toC})`);
            return mateIn2;
        }

        // Filter out blunder moves that immediately allow opponent instant mate
        const activeMoves = filterMatingBlunders(board, turn, legalMoves, castling);

        // Step 1: Root pass
        const rootPlanes = new Float32Array(16 * 8 * 8);
        fillPlanes(rootPlanes, 0, board, turn, castling);
        const rootTensor = new ort.Tensor('float32', rootPlanes, [1, 16, 8, 8]);
        const rootResults = await session.run({ board_state: rootTensor });

        const policyLogits = rootResults.policy_logits.data;
        const rootEval = rootResults.value.data[0];

        const priors = computePriors(board, turn, activeMoves, policyLogits, historySet, rootEval, lastOwnKey);
        const scoredMoves = [];
        for (let i = 0; i < activeMoves.length; i++) {
            const m = activeMoves[i];
            const p = board[m.fromR][m.fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
            scoredMoves.push({ ...m, pScore: priors[i], promotion: isPromo ? 'q' : null });
        }
        scoredMoves.sort((a, b) => b.pScore - a.pScore);

        const numCandidates = Math.min(topK1, scoredMoves.length);
        const candidates = scoredMoves.slice(0, numCandidates);

        // Step 2: Ply 2 - Opponent responses (Batched)
        const p1Planes = new Float32Array(numCandidates * 16 * 8 * 8);
        const p1Boards = [];
        for (let i = 0; i < numCandidates; i++) {
            const m = candidates[i];
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            p1Boards.push(nb);
            fillPlanes(p1Planes, i * 16 * 8 * 8, nb, oppTurn, castling);
        }

        const p1Tensor = new ort.Tensor('float32', p1Planes, [numCandidates, 16, 8, 8]);
        const p1Results = await session.run({ board_state: p1Tensor });
        const p2Policies = p1Results.policy_logits.data;

        const p2Branches = [];
        let totalP2Branches = 0;
        const polDim = Math.floor(p2Policies.length / numCandidates);

        for (let i = 0; i < numCandidates; i++) {
            const offset = i * polDim;
            const oppIndexed = [];
            for (let j = 0; j < polDim; j++) {
                oppIndexed.push({ idx: j, s: p2Policies[offset + j] });
            }
            oppIndexed.sort((a, b) => b.s - a.s);

            const candBranches = [];
            for (let k = 0; k < topK2; k++) {
                const bestIdx = oppIndexed[k].idx;
                const coords = (polDim === 4672) ? idx4672ToMove(bestIdx) : decode4096(bestIdx);
                const oNb = simulateMove(p1Boards[i], coords.fr, coords.fc, coords.tr, coords.tc);
                candBranches.push({ board: oNb, fr: coords.fr, fc: coords.fc, tr: coords.tr, tc: coords.tc });
            }
            p2Branches.push(candBranches);
            totalP2Branches += candBranches.length;
        }

        // Step 3: Ply 3 - Our counter-moves (Batched)
        const p2Planes = new Float32Array(totalP2Branches * 16 * 8 * 8);
        let bIdxCounter = 0;
        for (let i = 0; i < numCandidates; i++) {
            for (const b of p2Branches[i]) {
                fillPlanes(p2Planes, bIdxCounter * 16 * 8 * 8, b.board, turn, castling);
                bIdxCounter++;
            }
        }

        const p2Tensor = new ort.Tensor('float32', p2Planes, [totalP2Branches, 16, 8, 8]);
        const p2Results = await session.run({ board_state: p2Tensor });
        const p3Policies = p2Results.policy_logits.data;

        // Step 4: Ply 4 - Opponent responses to our counters
        const p3Branches = [];
        let p3PlaneCounter = 0;
        let totalP3Counters = 0;
        const polDim3 = totalP2Branches > 0 ? Math.floor(p3Policies.length / totalP2Branches) : polDim;

        for (let i = 0; i < numCandidates; i++) {
            const candList = [];
            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                const b = p2Branches[i][bIdx];
                const offset = p3PlaneCounter * polDim3;
                p3PlaneCounter++;

                const ourIndexed = [];
                for (let j = 0; j < polDim3; j++) {
                    ourIndexed.push({ idx: j, s: p3Policies[offset + j] });
                }
                ourIndexed.sort((a, b) => b.s - a.s);

                const counterList = [];
                for (let k = 0; k < topK3; k++) {
                    const cIdx = ourIndexed[k].idx;
                    const coords = (polDim3 === 4672) ? idx4672ToMove(cIdx) : decode4096(cIdx);
                    const cNb = simulateMove(b.board, coords.fr, coords.fc, coords.tr, coords.tc);
                    counterList.push({ board: cNb, fr: coords.fr, fc: coords.fc, tr: coords.tr, tc: coords.tc });
                }
                candList.push(counterList);
                totalP3Counters += counterList.length;
            }
            p3Branches.push(candList);
        }

        const p3Planes = new Float32Array(totalP3Counters * 16 * 8 * 8);
        let p3Idx = 0;
        for (let i = 0; i < numCandidates; i++) {
            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                for (let cIdx = 0; cIdx < p3Branches[i][bIdx].length; cIdx++) {
                    fillPlanes(p3Planes, p3Idx * 16 * 8 * 8, p3Branches[i][bIdx][cIdx].board, oppTurn, castling);
                    p3Idx++;
                }
            }
        }

        const p3Tensor = new ort.Tensor('float32', p3Planes, [totalP3Counters, 16, 8, 8]);
        const p3Results = await session.run({ board_state: p3Tensor });
        const p4Policies = p3Results.policy_logits.data;

        // Step 5: Ply 5 - Final leaf positions evaluated with Value Head + Quiescence
        const p5Map = [];
        let p4PlaneCounter = 0;
        const polDim4 = totalP3Counters > 0 ? Math.floor(p4Policies.length / totalP3Counters) : polDim;

        for (let i = 0; i < numCandidates; i++) {
            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                for (let cIdx = 0; cIdx < p3Branches[i][bIdx].length; cIdx++) {
                    const cItem = p3Branches[i][bIdx][cIdx];
                    const offset = p4PlaneCounter * polDim4;
                    p4PlaneCounter++;

                    const opp2Indexed = [];
                    for (let j = 0; j < polDim4; j++) {
                        opp2Indexed.push({ idx: j, s: p4Policies[offset + j] });
                    }
                    opp2Indexed.sort((a, b) => b.s - a.s);

                    for (let k = 0; k < topK4; k++) {
                        const o2Idx = opp2Indexed[k].idx;
                        const coords = (polDim4 === 4672) ? idx4672ToMove(o2Idx) : decode4096(o2Idx);
                        const o2Nb = simulateMove(cItem.board, coords.fr, coords.fc, coords.tr, coords.tc);
                        p5Map.push({ candI: i, bIdx: bIdx, cIdx: cIdx, board: o2Nb });
                    }
                }
            }
        }

        const totalP5Leaves = p5Map.length;
        const p5Planes = new Float32Array(totalP5Leaves * 16 * 8 * 8);
        for (let l = 0; l < totalP5Leaves; l++) {
            fillPlanes(p5Planes, l * 16 * 8 * 8, p5Map[l].board, turn, castling);
        }

        const p5Tensor = new ort.Tensor('float32', p5Planes, [totalP5Leaves, 16, 8, 8]);
        const p5Results = await session.run({ board_state: p5Tensor });
        const p5Values = p5Results.value.data;

        // Minimax Roll-up across 5-Ply tree with Tactical Quiescence Search
        const tree = {};
        for (let i = 0; i < numCandidates; i++) {
            tree[i] = {};
            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                tree[i][bIdx] = {};
                for (let cIdx = 0; cIdx < p3Branches[i][bIdx].length; cIdx++) {
                    tree[i][bIdx][cIdx] = [];
                }
            }
        }

        for (let l = 0; l < totalP5Leaves; l++) {
            const item = p5Map[l];
            const neuralV = p5Values[l];
            const qCp = quiesce(item.board, turn, -10000, 10000, 4);
            const qEval = Math.tanh(qCp / 400.0);
            const leafScore = (0.65 * (persp * neuralV)) + (0.35 * (persp * qEval));
            tree[item.candI][item.bIdx][item.cIdx].push(leafScore);
        }

        let bestCandidate = candidates[0];
        let bestTotalScore = -Infinity;

        for (let i = 0; i < numCandidates; i++) {
            const m = candidates[i];
            let worstBScore = Infinity;

            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                let bestCounterScore = -Infinity;

                for (let cIdx = 0; cIdx < p3Branches[i][bIdx].length; cIdx++) {
                    const leafScores = tree[i][bIdx][cIdx];
                    const worstLeafScore = leafScores && leafScores.length > 0 ? Math.min(...leafScores) : -9999.0;
                    if (worstLeafScore > bestCounterScore) {
                        bestCounterScore = worstLeafScore;
                    }
                }

                if (bestCounterScore < worstBScore) {
                    worstBScore = bestCounterScore;
                }
            }

            let repPenalty = 0.0;
            if (historySet && historySet.size > 0) {
                const destKey = boardToSimpleKey(m.board, oppTurn);
                if (historySet.has(destKey)) {
                    const inEg = isEndgamePosition(m.board);
                    const repCount = historyCounts[destKey] || 0;
                    const isOsc = (lastOwnKey && destKey === lastOwnKey);
                    if (inEg) {
                        repPenalty = (repCount >= 2 || isOsc) ? 3.0 : 2.0;
                    } else if ((persp * rootEval) >= -0.15) {
                        repPenalty = 0.40;
                    }
                }
            }

            const totalScore = worstBScore + 0.08 * m.pScore - repPenalty;
            m.totalScore = totalScore;
            m.minimaxVal = worstBScore;

            if (totalScore > bestTotalScore) {
                bestTotalScore = totalScore;
                bestCandidate = m;
            }
        }

        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`[Neural AI:5-Ply Deep] Best move: (${bestCandidate.fromR},${bestCandidate.fromC})->(${bestCandidate.toR},${bestCandidate.toC}) | Score: ${bestCandidate.totalScore.toFixed(3)} | Time: ${duration}ms`);
        return bestCandidate;
    }

    async function mctsSearch(fen, numSimulations = 80, cPuct = 1.0, history = null) {
        const startTime = performance.now();

        // 0. Endgame tablebase & solver (0ms)
        const egMove = getEndgameMove(fen);
        if (egMove) return egMove;

        const { board, turn, castling } = fenToBoard(fen);

        // Build history set and counts for repetition avoidance
        const historySet = new Set();
        const historyCounts = new Map();
        const recentKeys = [];
        if (Array.isArray(history)) {
            for (const h of history) {
                if (typeof h === 'string') {
                    const parts = h.trim().split(/\s+/);
                    let k = null;
                    if (parts.length >= 2) k = parts[0] + ' ' + parts[1];
                    else if (parts.length === 1) k = parts[0];
                    if (k) {
                        historySet.add(k);
                        recentKeys.push(k);
                        historyCounts.set(k, (historyCounts.get(k) || 0) + 1);
                    }
                }
            }
        }
        const lastOwnKey = recentKeys.length >= 2 ? recentKeys[recentKeys.length - 2] : null;

        const legalMoves = getAllLegalMoves(turn);
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) return legalMoves[0];

        // Instant checkmate attack check
        const instantMate = findInstantMateMove(board, turn, legalMoves);
        if (instantMate) {
            console.log(`[Neural AI:MCTS] 🏆 Instant checkmate detected: (${instantMate.fromR},${instantMate.fromC}) -> (${instantMate.toR},${instantMate.toC})`);
            return instantMate;
        }

        // Checkmate-in-2 attack check
        const mateIn2 = findMateInTwoMove(board, turn, legalMoves, castling);
        if (mateIn2) {
            console.log(`[Neural AI:MCTS] 🎯 Forcing mate-in-2 detected: (${mateIn2.fromR},${mateIn2.fromC}) -> (${mateIn2.toR},${mateIn2.toC})`);
            return mateIn2;
        }

        // Filter out fatal blunder moves that immediately allow opponent instant mate
        const activeMoves = filterMatingBlunders(board, turn, legalMoves, castling);

        if (activeMoves.length === 1) return activeMoves[0];

        const evalCache = new Map();

        // Root evaluation
        const rootPlanes = new Float32Array(16 * 8 * 8);
        fillPlanes(rootPlanes, 0, board, turn, castling);
        const rootTensor = new ort.Tensor('float32', rootPlanes, [1, 16, 8, 8]);
        const rootResults = await session.run({ board_state: rootTensor });
        const rootPolicy = rootResults.policy_logits.data;
        const rootVal = rootResults.value.data[0];

        const rootPriors = computePriors(board, turn, activeMoves, rootPolicy, historySet, rootVal, lastOwnKey);

        const oppTurn = (turn === 'w' ? 'b' : 'w');
        const rootNode = {
            board, turn, castling, parent: null, move: null,
            children: [], visits: 0, totalValue: 0.0, isExpanded: true
        };

        for (let i = 0; i < activeMoves.length; i++) {
            const m = activeMoves[i];
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
            const p = board[m.fromR][m.fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
            rootNode.children.push({
                board: nb, turn: oppTurn, castling, parent: rootNode,
                move: { ...m, promotion: isPromo ? 'q' : null }, prior: rootPriors[i], children: [],
                visits: 0, totalValue: 0.0, isExpanded: false
            });
        }

        // MCTS simulation loop
        for (let sim = 0; sim < numSimulations; sim++) {
            let node = rootNode;
            const simPathKeys = new Set();
            simPathKeys.add(boardToSimpleKey(rootNode.board, rootNode.turn));
            let isCycle = false;

            while (node.isExpanded && node.children.length > 0) {
                let bestChild = null;
                let bestScore = -Infinity;
                const parentVisits = node.visits;
                for (let cIdx = 0; cIdx < node.children.length; cIdx++) {
                    const c = node.children[cIdx];
                    const qVal = (c.visits === 0) ? 0.0 : -(c.totalValue / c.visits);
                    const uVal = cPuct * c.prior * (Math.sqrt(parentVisits) / (1 + c.visits));
                    const score = qVal + uVal;
                    if (score > bestScore) {
                        bestScore = score;
                        bestChild = c;
                    }
                }
                node = bestChild;
                const childKey = boardToSimpleKey(node.board, node.turn);
                if (simPathKeys.has(childKey)) {
                    isCycle = true;
                    break;
                }
                simPathKeys.add(childKey);
            }

            // Evaluate leaf & terminal / repetition check
            const cTurn = node.turn;
            const currKey = boardToSimpleKey(node.board, cTurn);
            const isHistoryRepetition = (node !== rootNode && historySet.has(currKey));

            let leafVal = 0.0;
            if (isCycle || isHistoryRepetition) {
                const engineEval = (node.turn === turn) ? rootVal : -rootVal;
                const inEg = isEndgamePosition(node.board);
                if (inEg) {
                    leafVal = (engineEval >= -0.20) ? -0.85 : 0.0;
                } else {
                    leafVal = (engineEval >= -0.10) ? -0.30 : 0.0;
                }
            } else {
                const isCheck = isKingInCheck(node.board, cTurn);
                const nextLegal = getLegalMovesForBoard(node.board, cTurn, node.castling);

                if (nextLegal.length === 0) {
                    if (isCheck) {
                        leafVal = -1.0; // Checkmated: loss for cTurn
                    } else {
                        leafVal = 0.0; // Stalemate
                    }
                } else if (findInstantMateMove(node.board, cTurn, nextLegal)) {
                    leafVal = 1.0; // cTurn can deliver instant checkmate!
                } else {
                    const cacheKey = JSON.stringify(node.board) + ':' + cTurn;
                    let leafPolicy = null;
                    if (evalCache.has(cacheKey)) {
                        const cached = evalCache.get(cacheKey);
                        leafPolicy = cached.policy;
                        leafVal = cached.val;
                    } else {
                        const planes = new Float32Array(16 * 8 * 8);
                        fillPlanes(planes, 0, node.board, cTurn, node.castling);
                        const tensor = new ort.Tensor('float32', planes, [1, 16, 8, 8]);
                        const res = await session.run({ board_state: tensor });
                        leafPolicy = res.policy_logits.data;
                        const nnVal = res.value.data[0];
                        const qCp = quiesce(node.board, cTurn, -10000, 10000, 2);
                        const qVal = Math.tanh(qCp / 400.0);
                        const pVal = (cTurn === 'w' ? nnVal : -nnVal);
                        leafVal = 0.75 * pVal + 0.25 * (cTurn === 'w' ? qVal : -qVal);
                        if (evalCache.size < 2000) {
                            evalCache.set(cacheKey, { policy: leafPolicy, val: leafVal });
                        }
                    }

                    if (!node.isExpanded) {
                        const nextOpp = (cTurn === 'w' ? 'b' : 'w');
                        const childPriors = computePriors(node.board, cTurn, nextLegal, leafPolicy, historySet, leafVal);
                        for (let k = 0; k < nextLegal.length; k++) {
                            const km = nextLegal[k];
                            const knb = simulateMove(node.board, km.fromR, km.fromC, km.toR, km.toC);
                            let nCast = node.castling;
                            const p = node.board[km.fromR][km.fromC];
                            const isPromo = p && p.toLowerCase() === 'p' && (km.toR === 0 || km.toR === 7);
                            if (p === 'K') nCast = nCast.replace('K', '').replace('Q', '');
                            else if (p === 'k') nCast = nCast.replace('k', '').replace('q', '');
                            if (km.fromR === 7 && km.fromC === 7) nCast = nCast.replace('K', '');
                            if (km.fromR === 7 && km.fromC === 0) nCast = nCast.replace('Q', '');
                            if (km.fromR === 0 && km.fromC === 7) nCast = nCast.replace('k', '');
                            if (km.fromR === 0 && km.fromC === 0) nCast = nCast.replace('q', '');
                            if (!nCast) nCast = '-';

                            node.children.push({
                                board: knb, turn: nextOpp, castling: nCast, parent: node,
                                move: { ...km, promotion: isPromo ? 'q' : null }, prior: childPriors[k], children: [],
                                visits: 0, totalValue: 0.0, isExpanded: false
                            });
                        }
                        node.isExpanded = true;
                    }
                }
            }

            // Backpropagation with alternating sign inversion
            let backNode = node;
            let valToProp = leafVal;
            while (backNode !== null) {
                backNode.visits += 1;
                backNode.totalValue += valToProp;
                valToProp = -valToProp;
                backNode = backNode.parent;
            }
        }

        // Action selection: sort strictly by visits descending (tie-breaker Q), penalizing repetitions especially in endgame
        function getChildSelectionScore(c) {
            const qMean = c.visits > 0 ? -(c.totalValue / c.visits) : -999.0;
            let effVisits = c.visits;
            const cDestKey = boardToSimpleKey(c.board, c.turn);
            if (historySet && historySet.has(cDestKey)) {
                const inEg = isEndgamePosition(c.board);
                const repCount = historyCounts.get(cDestKey) || 0;
                const isOsc = (lastOwnKey && cDestKey === lastOwnKey);
                if (inEg) {
                    effVisits -= ((repCount >= 2 || isOsc) ? 2000.0 : 500.0);
                } else {
                    if (rootVal >= -0.15) {
                        effVisits -= 100.0;
                    }
                }
            }
            return { effVisits, qMean };
        }

        rootNode.children.sort((a, b) => {
            const scoreA = getChildSelectionScore(a);
            const scoreB = getChildSelectionScore(b);
            if (scoreB.effVisits !== scoreA.effVisits) {
                return scoreB.effVisits - scoreA.effVisits;
            }
            return scoreB.qMean - scoreA.qMean;
        });
        const bestChild = rootNode.children[0];

        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`[Neural AI:MCTS] Best move: (${bestChild.move.fromR},${bestChild.move.fromC})->(${bestChild.move.toR},${bestChild.move.toC}) | Visits: ${bestChild.visits}/${numSimulations} | Time: ${duration}ms`);
        return bestChild.move;
    }

    async function alphaBetaSearch(fen, maxDepth = 6, timeLimitMs = 4000, history = null) {
        const startTime = performance.now();

        // 0. Endgame tablebase & solver (0ms)
        const egMove = getEndgameMove(fen);
        if (egMove) return egMove;

        const { board, turn, castling } = fenToBoard(fen);

        // Build history set and counts for repetition avoidance
        const historySet = new Set();
        const historyCounts = new Map();
        const recentKeys = [];
        if (Array.isArray(history)) {
            for (const h of history) {
                if (typeof h === 'string') {
                    const parts = h.trim().split(/\s+/);
                    let k = null;
                    if (parts.length >= 2) k = parts[0] + ' ' + parts[1];
                    else if (parts.length === 1) k = parts[0];
                    if (k) {
                        historySet.add(k);
                        recentKeys.push(k);
                        historyCounts.set(k, (historyCounts.get(k) || 0) + 1);
                    }
                }
            }
        }
        const lastOwnKey = recentKeys.length >= 2 ? recentKeys[recentKeys.length - 2] : null;

        const legalMoves = getAllLegalMoves(turn);
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) {
            const p = board[legalMoves[0].fromR][legalMoves[0].fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (legalMoves[0].toR === 0 || legalMoves[0].toR === 7);
            return { ...legalMoves[0], promotion: isPromo ? 'q' : null };
        }

        // Instant checkmate attack check
        const instantMate = findInstantMateMove(board, turn, legalMoves);
        if (instantMate) {
            console.log(`[Neural AI:AlphaBeta] 🏆 Instant checkmate detected: (${instantMate.fromR},${instantMate.fromC}) -> (${instantMate.toR},${instantMate.toC})`);
            return instantMate;
        }

        // Checkmate-in-2 attack check
        const mateIn2 = findMateInTwoMove(board, turn, legalMoves, castling);
        if (mateIn2) {
            console.log(`[Neural AI:AlphaBeta] 🎯 Forcing mate-in-2 detected: (${mateIn2.fromR},${mateIn2.fromC}) -> (${mateIn2.toR},${mateIn2.toC})`);
            return mateIn2;
        }

        // Filter out fatal tactical blunders at root
        const activeMoves = filterTacticalBlunders(board, turn, legalMoves, castling);
        if (activeMoves.length === 1) {
            const p = board[activeMoves[0].fromR][activeMoves[0].fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (activeMoves[0].toR === 0 || activeMoves[0].toR === 7);
            return { ...activeMoves[0], promotion: isPromo ? 'q' : null };
        }

        // Root evaluation (single ONNX inference)
        const rootPlanes = new Float32Array(16 * 8 * 8);
        fillPlanes(rootPlanes, 0, board, turn, castling);
        const rootTensor = new ort.Tensor('float32', rootPlanes, [1, 16, 8, 8]);
        const rootResults = await session.run({ board_state: rootTensor });
        const rootPolicy = rootResults.policy_logits.data;
        const rootVal = rootResults.value.data[0];

        const rootPriors = computePriors(board, turn, activeMoves, rootPolicy, historySet, rootVal, lastOwnKey);

        const tt = new Map();
        const killerMoves = new Map(); // ply -> move

        function orderMovesInner(b, cTurn, nextMoves, ttMove, ply) {
            const scored = [];
            const killer = killerMoves.get(ply);
            for (let i = 0; i < nextMoves.length; i++) {
                const m = nextMoves[i];
                if (ttMove && m.fromR === ttMove.fromR && m.fromC === ttMove.fromC && m.toR === ttMove.toR && m.toC === ttMove.toC) {
                    scored.push({ score: 60000.0, m });
                    continue;
                }
                const p = b[m.fromR][m.fromC];
                const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
                let s = 0.0;
                if (isPromo) s += 4000.0;
                const target = b[m.toR][m.toC];
                if (target) {
                    const vVal = PIECE_VALUES[target.toLowerCase()] || 0;
                    const aVal = PIECE_VALUES[(p || '').toLowerCase()] || 0;
                    s += (vVal * 10 - aVal + 2000.0);
                } else if (killer && killer.fromR === m.fromR && killer.fromC === m.fromC && killer.toR === m.toR && killer.toC === m.toC) {
                    s += 1500.0;
                }
                scored.push({ score: s, m });
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.map(item => item.m);
        }

        function negamax(b, cTurn, cast, depth, alpha, beta, ply) {
            const posKey = JSON.stringify(b) + ':' + cTurn + ':' + cast;

            // Repetition check in tree
            const keyStr = boardToSimpleKey(b, cTurn);
            if (ply > 0 && historySet.has(keyStr)) {
                const inEg = isEndgamePosition(b);
                return { score: (inEg ? -0.85 : -0.20), bestMove: null };
            }

            // TT probe
            const ttEntry = tt.get(posKey);
            let ttMove = null;
            if (ttEntry) {
                ttMove = ttEntry.bestMove;
                if (ttEntry.depth >= depth) {
                    if (ttEntry.flag === 'EXACT') return { score: ttEntry.score, bestMove: ttMove };
                    else if (ttEntry.flag === 'LOWER' && ttEntry.score >= beta) return { score: ttEntry.score, bestMove: ttMove };
                    else if (ttEntry.flag === 'UPPER' && ttEntry.score <= alpha) return { score: ttEntry.score, bestMove: ttMove };
                }
            }

            // Deep Quiescence search at leaf (depth <= 0)
            if (depth <= 0) {
                const qCp = quiesce(b, cTurn, -10000, 10000, 4);
                const qVal = Math.tanh(qCp / 400.0);
                return { score: qVal, bestMove: null };
            }

            const nextMoves = getLegalMovesForBoard(b, cTurn, cast);
            if (!nextMoves || nextMoves.length === 0) {
                if (isKingInCheck(b, cTurn)) {
                    return { score: -10.0 + ply * 0.1, bestMove: null };
                }
                return { score: 0.0, bestMove: null };
            }

            const im = findInstantMateMove(b, cTurn, nextMoves);
            if (im) {
                return { score: 10.0 - ply * 0.1, bestMove: im };
            }

            const sortedMoves = orderMovesInner(b, cTurn, nextMoves, ttMove, ply);

            let bestScore = -9999.0;
            let bestM = null;
            const origAlpha = alpha;
            const nextTurn = (cTurn === 'w' ? 'b' : 'w');

            for (let i = 0; i < sortedMoves.length; i++) {
                const m = sortedMoves[i];
                const nb = simulateMove(b, m.fromR, m.fromC, m.toR, m.toC);
                let nCast = cast;
                const p = b[m.fromR][m.fromC];
                if (p === 'K') nCast = nCast.replace('K', '').replace('Q', '');
                else if (p === 'k') nCast = nCast.replace('k', '').replace('q', '');
                if (!nCast) nCast = '-';

                const { score: childScore } = negamax(nb, nextTurn, nCast, depth - 1, -beta, -alpha, ply + 1);
                const score = -childScore;
                if (score > bestScore) {
                    bestScore = score;
                    bestM = m;
                }
                if (score > alpha) alpha = score;
                if (alpha >= beta) {
                    killerMoves.set(ply, m);
                    break; // Beta cutoff
                }
            }

            let flag = 'EXACT';
            if (bestScore <= origAlpha) flag = 'UPPER';
            else if (bestScore >= beta) flag = 'LOWER';
            if (tt.size < 10000) {
                tt.set(posKey, { depth, score: bestScore, flag, bestMove: bestM });
            }
            return { score: bestScore, bestMove: bestM };
        }

        let bestMoveRoot = activeMoves[0];
        const moveScores = new Map();

        // Iterative deepening from depth 1 to maxDepth
        for (let d = 1; d <= maxDepth; d++) {
            if (performance.now() - startTime > timeLimitMs) break;

            // Policy-guided root move ordering
            const orderedRoot = [];
            for (let i = 0; i < activeMoves.length; i++) {
                const m = activeMoves[i];
                let pScore = rootPriors[i] * 100.0;
                if (bestMoveRoot && m.fromR === bestMoveRoot.fromR && m.fromC === bestMoveRoot.fromC && m.toR === bestMoveRoot.toR && m.toC === bestMoveRoot.toC) {
                    pScore += 50000.0;
                }
                orderedRoot.push({ m, pScore, prior: rootPriors[i] });
            }
            orderedRoot.sort((a, b) => b.pScore - a.pScore);

            let alpha = -9999.0;
            const beta = 9999.0;
            const nextTurn = (turn === 'w' ? 'b' : 'w');

            for (let i = 0; i < orderedRoot.length; i++) {
                const { m, prior } = orderedRoot[i];
                const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                let nCast = castling;
                const p = board[m.fromR][m.fromC];
                if (p === 'K') nCast = nCast.replace('K', '').replace('Q', '');
                else if (p === 'k') nCast = nCast.replace('k', '').replace('q', '');
                if (!nCast) nCast = '-';

                const { score: childScore } = negamax(nb, nextTurn, nCast, d - 1, -beta, -alpha, 1);
                const score = -childScore;
                const blended = score + 0.05 * prior;
                const moveKey = `${m.fromR},${m.fromC}->${m.toR},${m.toC}`;
                moveScores.set(moveKey, blended);
                if (score > alpha) {
                    alpha = score;
                    bestMoveRoot = m;
                }
            }
        }

        const duration = (performance.now() - startTime).toFixed(1);
        const p = board[bestMoveRoot.fromR][bestMoveRoot.fromC];
        const isPromo = p && p.toLowerCase() === 'p' && (bestMoveRoot.toR === 0 || bestMoveRoot.toR === 7);
        const finalMove = { ...bestMoveRoot, promotion: isPromo ? 'q' : null };
        console.log(`[Neural AI:AlphaBeta] Best move: (${finalMove.fromR},${finalMove.fromC})->(${finalMove.toR},${finalMove.toC}) | Depth: ${maxDepth} | Time: ${duration}ms`);
        return finalMove;
    }

    async function getBestMove(fen, modelVer = 'v1.6', searchType = 'alphabeta', history = []) {
        // 1. Grandmaster Opening Book (0ms instant response)
        if (typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getOpeningBookMove === 'function') {
            const bookMove = ChessAIShared.getOpeningBookMove(fen);
            if (bookMove) {
                console.log(`[Neural AI] 📖 Opening book move applied: (${bookMove.fromR},${bookMove.fromC}) -> (${bookMove.toR},${bookMove.toC})`);
                return bookMove;
            }
        }

        // 1b. Theoretical Endgame Tablebase & Solver (0ms instant response)
        const egMove = getEndgameMove(fen);
        if (egMove) {
            console.log(`[Neural AI] 👑 Endgame tablebase/solver move applied: (${egMove.fromR},${egMove.fromC}) -> (${egMove.toR},${egMove.toC})`);
            return egMove;
        }

        // 2. Transposition Table cache lookup (only if no repetition history)
        const hasHistory = Array.isArray(history) && history.length > 0;
        const posKey = modelVer + ':' + searchType + ':' + fen.split(' ').slice(0, 4).join(' ');
        if (!hasHistory && transpositionTable.has(posKey)) {
            const cached = transpositionTable.get(posKey);
            console.log(`[Neural AI:${modelVer}:${searchType}] ⚡ Transposition cache hit: (${cached.fromR},${cached.fromC}) -> (${cached.toR},${cached.toC})`);
            return cached;
        }

        // 3. Local WebAssembly ONNX inference
        try {
            await init(modelVer);
            if (session) {
                let move = null;
                if (searchType === 'mcts') {
                    move = await mctsSearch(fen, 80, 1.0, history);
                } else if (searchType === 'deep' || searchType === 'minimax') {
                    move = await search5Ply(fen, 14, 8, 4, 3, history);
                } else {
                    move = await alphaBetaSearch(fen, 6, 4000, history);
                }
                if (move) {
                    if (!hasHistory) {
                        if (transpositionTable.size >= MAX_TT_SIZE) {
                            const firstKey = transpositionTable.keys().next().value;
                            transpositionTable.delete(firstKey);
                        }
                        transpositionTable.set(posKey, move);
                    }
                    return move;
                }
            }
        } catch (err) {
            console.warn('[Neural AI] Local ONNX search unavailable, requesting /api/neural-move...', err);
        }

        // 4. Server API fallback (/api/neural-move)
        try {
            if (typeof fetch !== 'undefined') {
                const response = await fetch('/api/neural-move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fen, modelVer, searchType, history })
                });
                if (response.ok) {
                    const data = await response.json();
                    const turn = fen.split(' ')[1] || 'w';
                    const legalMoves = getAllLegalMoves(turn);
                    if (data.topMoves && data.topMoves.length > 0) {
                        for (const cand of data.topMoves) {
                            const matched = legalMoves.find(m => m.fromR === cand.fromR && m.fromC === cand.fromC && m.toR === cand.toR && m.toC === cand.toC);
                            if (matched) {
                                console.log(`[Neural AI:Server ${data.searchType || searchType}] Move chosen: ${cand.uci} in ${data.elapsedMs?.toFixed(1)}ms`);
                                const finalMove = { ...matched, promotion: cand.promotion || null };
                                if (!hasHistory) {
                                    if (transpositionTable.size >= MAX_TT_SIZE) {
                                        const firstKey = transpositionTable.keys().next().value;
                                        transpositionTable.delete(firstKey);
                                    }
                                    transpositionTable.set(posKey, finalMove);
                                }
                                return finalMove;
                            }
                        }
                        const firstMove = { fromR: data.topMoves[0].fromR, fromC: data.topMoves[0].fromC, toR: data.topMoves[0].toR, toC: data.topMoves[0].toC, promotion: data.topMoves[0].promotion || null };
                        if (!hasHistory) transpositionTable.set(posKey, firstMove);
                        return firstMove;
                    }
                }
            }
        } catch (netErr) {
            console.warn('[Neural AI] Server API also failed:', netErr);
        }

        return null;
    }

    const API = {
        init,
        getBestMove,
        search5Ply,
        search4Ply: search5Ply,
        search2Ply: search5Ply, // Backwards compatibility
        mctsSearch,
        getEndgameMove,
        clearCache: () => transpositionTable.clear()
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
