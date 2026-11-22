/**
 * Standalone Pure-JS Chess Tactical & Alpha-Beta Search Core (Zero ONNX dependency).
 * Runs identically in browser main thread, Web Workers (via importScripts), and Node/Jest tests.
 */
var ChessAINeuralSearch = (() => {
    const PIECE_VALUES = {
        p: 100, n: 300, b: 300, r: 500, q: 900, k: 20000,
        P: 100, N: 300, B: 300, R: 500, Q: 900, K: 20000
    };

    // Int8 piece encodings for fast 64-square board
    const EMPTY = 0;
    const PAWN = 1;
    const KNIGHT = 2;
    const BISHOP = 3;
    const ROOK = 4;
    const QUEEN = 5;
    const KING = 6;

    const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
    const BP = -1, BN = -2, BB = -3, BR = -4, BQ = -5, BK = -6;

    const TYPE_VALUES = [0, 100, 300, 300, 500, 900, 20000];
    const LVA_ORDER = [0, 1, 2, 3, 4, 5, 6];
    const CODE_TO_CHAR = {
        1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K',
        [-1]: 'p', [-2]: 'n', [-3]: 'b', [-4]: 'r', [-5]: 'q', [-6]: 'k'
    };
    const CHAR_TO_CODE = {
        P: WP, N: WN, B: WB, R: WR, Q: WQ, K: WK,
        p: BP, n: BN, b: BB, r: BR, q: BQ, k: BK
    };
    const PROMO_CHAR_TO_TYPE = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };
    const PROMO_TYPE_TO_CHAR = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' };

    const MATE_CP = 30000;
    const MATE_THRESHOLD = 28000;
    const INF_CP = 50000;
    const MAX_SEARCH_TT = 65536;
    const TT_SIZE = 1 << 19; // 524,288 flat TypedArray slots
    const TT_MASK = TT_SIZE - 1;
    const TT_FLAG_EXACT = 1;
    const TT_FLAG_LOWER = 2;
    const TT_FLAG_UPPER = 3;
    const MAX_HIST = 16384;
    const PRIOR_BONUS_CP = 20;

    function getDepthPriorBonusCp(depth) {
        const d = (typeof depth === 'number' && Number.isFinite(depth) && depth >= 1) ? depth : 1;
        return Math.max(5, Math.round(PRIOR_BONUS_CP - (d - 1) * 1.35));
    }

    // Precomputed Logarithmic LMR table [depth][moveIndex]
    const LMR_TABLE = (() => {
        const tbl = new Array(64);
        for (let d = 0; d < 64; d++) {
            const row = new Int8Array(64);
            for (let m = 0; m < 64; m++) {
                row[m] = (d >= 1 && m >= 1)
                    ? Math.floor(0.75 + (Math.log(d) * Math.log(m)) / 2.25)
                    : 0;
            }
            tbl[d] = row;
        }
        return tbl;
    })();

    const PST_PAWN = [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ];

    const PST_KNIGHT = [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ];

    const PST_BISHOP = [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ];

    const PST_ROOK = [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
    ];

    const PST_QUEEN = [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ];

    const PST_KING_MG = [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
    ];

    // Flattened 64-entry MG & EG PST tables indexed by [white: sq, black: sq ^ 56]
    const PST_FLAT = [
        new Int16Array(64), // 0 unused
        new Int16Array(64), // 1 pawn MG
        new Int16Array(64), // 2 knight MG
        new Int16Array(64), // 3 bishop MG
        new Int16Array(64), // 4 rook MG
        new Int16Array(64), // 5 queen MG
        new Int16Array(64)  // 6 king MG
    ];
    const PST_PAWN_EG = [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [80, 80, 80, 80, 80, 80, 80, 80],
        [45, 45, 45, 50, 50, 45, 45, 45],
        [25, 25, 25, 30, 30, 25, 25, 25],
        [10, 10, 10, 15, 15, 10, 10, 10],
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [-5, -5, -5, -5, -5, -5, -5, -5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
    ];
    const PST_KNIGHT_EG = [
        [-40,-30,-20,-20,-20,-20,-30,-40],
        [-30,-15,  0,  0,  0,  0,-15,-30],
        [-20,  0, 10, 12, 12, 10,  0,-20],
        [-20,  0, 12, 16, 16, 12,  0,-20],
        [-20,  0, 12, 16, 16, 12,  0,-20],
        [-20,  0, 10, 12, 12, 10,  0,-20],
        [-30,-15,  0,  0,  0,  0,-15,-30],
        [-40,-30,-20,-20,-20,-20,-30,-40]
    ];
    const PST_BISHOP_EG = [
        [-15,-10,-10,-10,-10,-10,-10,-15],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  8,  8,  8,  8,  0,-10],
        [-10,  0,  8, 12, 12,  8,  0,-10],
        [-10,  0,  8, 12, 12,  8,  0,-10],
        [-10,  0,  8,  8,  8,  8,  0,-10],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-15,-10,-10,-10,-10,-10,-10,-15]
    ];
    const PST_ROOK_EG = [
        [ 5,  5,  5,  5,  5,  5,  5,  5],
        [10, 15, 15, 15, 15, 15, 15, 10],
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [-5, -5, -5, -5, -5, -5, -5, -5],
        [-5, -5, -5,  0,  0, -5, -5, -5]
    ];
    const PST_QUEEN_EG = [
        [-20,-15,-10,-10,-10,-10,-15,-20],
        [-15, -5,  0,  0,  0,  0, -5,-15],
        [-10,  0,  8, 10, 10,  8,  0,-10],
        [-10,  0, 10, 15, 15, 10,  0,-10],
        [-10,  0, 10, 15, 15, 10,  0,-10],
        [-10,  0,  8, 10, 10,  8,  0,-10],
        [-15, -5,  0,  0,  0,  0, -5,-15],
        [-20,-15,-10,-10,-10,-10,-15,-20]
    ];
    const PST_EG_FLAT = [
        new Int16Array(64), // 0 unused
        new Int16Array(64), // 1 pawn EG
        new Int16Array(64), // 2 knight EG
        new Int16Array(64), // 3 bishop EG
        new Int16Array(64), // 4 rook EG
        new Int16Array(64), // 5 queen EG
        new Int16Array(64)  // 6 king EG
    ];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = r * 8 + c;
            PST_FLAT[1][sq] = PST_PAWN[r][c];
            PST_FLAT[2][sq] = PST_KNIGHT[r][c];
            PST_FLAT[3][sq] = PST_BISHOP[r][c];
            PST_FLAT[4][sq] = PST_ROOK[r][c];
            PST_FLAT[5][sq] = PST_QUEEN[r][c];
            PST_FLAT[6][sq] = PST_KING_MG[r][c];

            PST_EG_FLAT[1][sq] = PST_PAWN_EG[r][c];
            PST_EG_FLAT[2][sq] = PST_KNIGHT_EG[r][c];
            PST_EG_FLAT[3][sq] = PST_BISHOP_EG[r][c];
            PST_EG_FLAT[4][sq] = PST_ROOK_EG[r][c];
            PST_EG_FLAT[5][sq] = PST_QUEEN_EG[r][c];

            const cheb = Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5));
            const manh = Math.abs(r - 3.5) + Math.abs(c - 3.5);
            PST_EG_FLAT[6][sq] = Math.round((2.0 - cheb) * 16 + (3.0 - manh) * 3);
        }
    }

    const PHASE_WEIGHTS = [0, 0, 1, 1, 2, 4, 0];
    const ADJ_FILE_MASK = new Uint8Array([0x02, 0x05, 0x0A, 0x14, 0x28, 0x50, 0xA0, 0x40]);
    const PP_MG_BONUS = new Int16Array([0, 0, 5, 15, 35, 75, 160, 0]);
    const PP_EG_BONUS = new Int16Array([0, 0, 15, 30, 65, 130, 280, 0]);
    const EVAL_W_FILE_CNT = new Uint8Array(8);
    const EVAL_B_FILE_CNT = new Uint8Array(8);
    const EVAL_W_MIN_RANK = new Int8Array(8);
    const EVAL_W_MAX_RANK = new Int8Array(8);
    const EVAL_B_MIN_RANK = new Int8Array(8);
    const EVAL_B_MAX_RANK = new Int8Array(8);
    const EVAL_W_PAWN_ATK = new Uint8Array(64);
    const EVAL_B_PAWN_ATK = new Uint8Array(64);
    const EVAL_PAWN_SQ = new Int8Array(64);
    const EVAL_PIECE_SQ = new Int8Array(64);

    // Pre-allocated scratch buffers for non-recursive SEE evaluation
    const SEE_GAIN = new Int32Array(32);
    const SEE_SAVE_SQ = new Int8Array(32);
    const SEE_SAVE_PIECE = new Int8Array(32);

    // Pre-allocated per-ply move/score/quiet/eval scratch buffers (128 plies)
    const SEARCH_MOVE_BUFS = Array.from({ length: 128 }, () => new Int32Array(256));
    const SEARCH_SCORE_BUFS = Array.from({ length: 128 }, () => new Int32Array(256));
    const SEARCH_QUIET_BUFS = Array.from({ length: 128 }, () => new Int32Array(128));
    const SEARCH_EVAL_STACK = new Int32Array(128);

    function createFlatTT() {
        return {
            isFlat: true,
            gen: 1,
            keyLo: new Uint32Array(TT_SIZE),
            keyHi: new Uint32Array(TT_SIZE),
            score: new Int16Array(TT_SIZE),
            move: new Uint16Array(TT_SIZE),
            depth: new Int8Array(TT_SIZE),
            flagGen: new Uint8Array(TT_SIZE)
        };
    }

    const COLD_FLAT_TT = createFlatTT();

    function storeTT(tt, h1, h2, depth, score, origAlpha, beta, ply, bestMove) {
        let flatFlag = TT_FLAG_EXACT;
        if (score <= origAlpha) flatFlag = TT_FLAG_UPPER;
        else if (score >= beta) flatFlag = TT_FLAG_LOWER;

        let ttScore = score;
        if (ttScore >= MATE_THRESHOLD) ttScore += ply;
        else if (ttScore <= -MATE_THRESHOLD) ttScore -= ply;
        if (ttScore > 32000) ttScore = 32000;
        else if (ttScore < -32000) ttScore = -32000;

        if (tt.isFlat) {
            const idx = h1 & TT_MASK;
            const oldFg = tt.flagGen[idx];
            const oldFlag = oldFg & 3;
            const samePos = (oldFlag !== 0 && tt.keyLo[idx] === h1 && tt.keyHi[idx] === h2);
            const oldGen = oldFg >>> 2;
            const oldDepth = tt.depth[idx];

            let storeMove = bestMove & 0x7fff;
            if (samePos && (storeMove === 0 || flatFlag === TT_FLAG_UPPER)) {
                const prevMove = tt.move[idx];
                if (prevMove !== 0) storeMove = prevMove;
            }

            const shouldReplace =
                oldFlag === 0 ||
                oldGen !== tt.gen ||
                (!samePos && depth >= oldDepth - 2) ||
                (samePos && (
                    depth > oldDepth ||
                    (depth === oldDepth && (flatFlag === TT_FLAG_EXACT || oldFlag !== TT_FLAG_EXACT))
                ));

            if (shouldReplace) {
                tt.keyLo[idx] = h1;
                tt.keyHi[idx] = h2;
                tt.score[idx] = ttScore;
                tt.move[idx] = storeMove;
                tt.depth[idx] = depth < -128 ? -128 : (depth > 127 ? 127 : depth);
                tt.flagGen[idx] = (flatFlag & 3) | ((tt.gen & 63) << 2);
            } else if (samePos && storeMove !== 0 && tt.move[idx] === 0) {
                tt.move[idx] = storeMove;
            }
            return;
        }

        // Map fallback (compatibility for tests passing params.tt = new Map())
        const mapFlag = flatFlag - 1; // 0: EXACT, 1: LOWER, 2: UPPER
        const ttKey = ((h2 & 0x1fffff) * 4294967296) + h1;
        const existing = tt.get(ttKey);
        if (existing) {
            let storeMove = bestMove;
            if (existing.lock === h2 && (storeMove === 0 || mapFlag === 2)) {
                if (existing.bestMove) storeMove = existing.bestMove;
            }
            const mapSamePos = (existing.lock === h2);
            const mapShouldReplace =
                (!mapSamePos && depth >= existing.depth - 2) ||
                (mapSamePos && (
                    depth > existing.depth ||
                    (depth === existing.depth && (mapFlag === 0 || existing.flag !== 0))
                ));
            if (mapShouldReplace) {
                tt.delete(ttKey);
                tt.set(ttKey, { lock: h2, depth, score: ttScore, flag: mapFlag, bestMove: storeMove });
            } else if (mapSamePos && storeMove !== 0 && !existing.bestMove) {
                existing.bestMove = storeMove;
            }
        } else {
            if (tt.size >= MAX_SEARCH_TT) {
                tt.delete(tt.keys().next().value);
            }
            tt.set(ttKey, { lock: h2, depth, score: ttScore, flag: mapFlag, bestMove });
        }
    }

    // Persistent worker TT and ordering state for multi-wave searches on the same root position
    const PERSISTENT_SEARCH_STATE = {
        rootKey: null,
        rootLock: null,
        historyHash: '',
        tt: createFlatTT(),
        historyTable: new Int32Array(2 * 64 * 64),
        counterMoveTable: new Int32Array(2 * 64 * 64),
        killer1: new Int32Array(128),
        killer2: new Int32Array(128)
    };

    const KNIGHT_OFFSETS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    const ORTH_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
    const DIAG_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
    const ALL_SLIDE_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];

    // Castling bitmask clearing table per square (K=1, Q=2, k=4, q=8)
    const CAST_CLEAR = new Uint8Array(64).fill(15);
    CAST_CLEAR[63] = 15 & ~1; // h1
    CAST_CLEAR[60] = 15 & ~3; // e1
    CAST_CLEAR[56] = 15 & ~2; // a1
    CAST_CLEAR[7]  = 15 & ~4; // h8
    CAST_CLEAR[4]  = 15 & ~12; // e8
    CAST_CLEAR[0]  = 15 & ~8; // a8

    // Deterministic Zobrist tables (two 32-bit streams -> 53-bit key + 32-bit lock)
    const Z_PIECE_LO = new Uint32Array(13 * 64);
    const Z_PIECE_HI = new Uint32Array(13 * 64);
    const Z_CAST_LO = new Uint32Array(16);
    const Z_CAST_HI = new Uint32Array(16);
    const Z_EP_LO = new Uint32Array(9);
    const Z_EP_HI = new Uint32Array(9);
    let Z_TURN_LO = 0;
    let Z_TURN_HI = 0;

    (() => {
        let seed = 0x9e3779b9 >>> 0;
        function nextU32() {
            seed = (seed + 0x6D2B79F5) >>> 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return (t ^ (t >>> 14)) >>> 0;
        }
        for (let i = 0; i < 13 * 64; i++) {
            Z_PIECE_LO[i] = nextU32();
            Z_PIECE_HI[i] = nextU32();
        }
        for (let i = 0; i < 16; i++) {
            Z_CAST_LO[i] = nextU32();
            Z_CAST_HI[i] = nextU32();
        }
        for (let i = 0; i < 9; i++) {
            Z_EP_LO[i] = nextU32();
            Z_EP_HI[i] = nextU32();
        }
        Z_TURN_LO = nextU32();
        Z_TURN_HI = nextU32();
    })();

    function nowMs() {
        return (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
    }

    function castlingStrToMask(castStr) {
        if (!castStr || castStr === '-') return 0;
        let m = 0;
        if (castStr.includes('K')) m |= 1;
        if (castStr.includes('Q')) m |= 2;
        if (castStr.includes('k')) m |= 4;
        if (castStr.includes('q')) m |= 8;
        return m;
    }

    function parseEpSquareStr(epStr) {
        if (!epStr || epStr === '-' || epStr.length < 2) return null;
        const c = epStr.charCodeAt(0) - 97;
        const rank = parseInt(epStr[1], 10);
        if (c < 0 || c > 7 || !Number.isFinite(rank) || rank < 1 || rank > 8) return null;
        const r = 8 - rank;
        if (r < 0 || r > 7) return null;
        return { r, c };
    }

    function normalizeEpSquareInput(epSquare) {
        if (!epSquare) return -1;
        if (typeof epSquare === 'number') {
            return (epSquare >= 0 && epSquare < 64) ? epSquare : -1;
        }
        if (typeof epSquare === 'string') {
            const parsed = parseEpSquareStr(epSquare);
            return parsed ? (parsed.r * 8 + parsed.c) : -1;
        }
        if (typeof epSquare === 'object' && typeof epSquare.r === 'number' && typeof epSquare.c === 'number') {
            if (epSquare.r >= 0 && epSquare.r < 8 && epSquare.c >= 0 && epSquare.c < 8) {
                return epSquare.r * 8 + epSquare.c;
            }
        }
        if (typeof epSquare === 'object' && typeof epSquare.row === 'number' && typeof epSquare.col === 'number') {
            if (epSquare.row >= 0 && epSquare.row < 8 && epSquare.col >= 0 && epSquare.col < 8) {
                return epSquare.row * 8 + epSquare.col;
            }
        }
        return -1;
    }

    function fenToBoard(fen) {
        const parts = (fen || '').trim().split(/\s+/);
        const boardStr = parts[0] || '';
        const turn = parts[1] || 'w';
        const castling = parts[2] || '-';
        const epSquare = parseEpSquareStr(parts[3]);
        const board = Array.from({ length: 8 }, () => new Array(8).fill(null));

        let r = 0;
        let c = 0;
        for (let i = 0; i < boardStr.length; i++) {
            const ch = boardStr[i];
            if (ch === '/') {
                r++;
                c = 0;
                if (r >= 8) break;
            } else if (ch >= '1' && ch <= '8') {
                c += parseInt(ch, 10);
            } else {
                if (r < 8 && c < 8) {
                    board[r][c] = ch;
                }
                c++;
            }
        }
        return { board, turn, castling, epSquare };
    }

    function simulateMove(board, fR, fC, tR, tC, promotion = null, epSquare = null) {
        const nb = board.map(row => row.slice());
        let p = nb[fR][fC];
        const hadTarget = nb[tR][tC];
        nb[fR][fC] = null;

        if (p === 'P' && tR === 0) {
            const pr = promotion ? promotion.toLowerCase() : 'q';
            p = (pr === 'n' || pr === 'b' || pr === 'r' || pr === 'q') ? pr.toUpperCase() : 'Q';
        } else if (p === 'p' && tR === 7) {
            const pr = promotion ? promotion.toLowerCase() : 'q';
            p = (pr === 'n' || pr === 'b' || pr === 'r' || pr === 'q') ? pr : 'q';
        } else if (p === 'K' && fR === 7 && fC === 4) {
            if (tC === 6) { nb[7][7] = null; nb[7][5] = 'R'; }
            else if (tC === 2) { nb[7][0] = null; nb[7][3] = 'R'; }
        } else if (p === 'k' && fR === 0 && fC === 4) {
            if (tC === 6) { nb[0][7] = null; nb[0][5] = 'r'; }
            else if (tC === 2) { nb[0][0] = null; nb[0][3] = 'r'; }
        } else if ((p === 'P' || p === 'p') && fC !== tC && !hadTarget) {
            // Diagonal pawn move onto empty square is an en passant capture
            const epSqIdx = normalizeEpSquareInput(epSquare);
            if (epSqIdx === -1 || epSqIdx === (tR * 8 + tC)) {
                nb[fR][tC] = null;
            }
        }

        nb[tR][tC] = p;
        return nb;
    }

    function updateCastlingRights(cast, m, piece) {
        if (!cast || cast === '-') return '-';
        let nCast = cast;
        if (piece === 'K') nCast = nCast.replace('K', '').replace('Q', '');
        else if (piece === 'k') nCast = nCast.replace('k', '').replace('q', '');
        if ((m.fromR === 7 && m.fromC === 7) || (m.toR === 7 && m.toC === 7)) nCast = nCast.replace('K', '');
        if ((m.fromR === 7 && m.fromC === 0) || (m.toR === 7 && m.toC === 0)) nCast = nCast.replace('Q', '');
        if ((m.fromR === 0 && m.fromC === 7) || (m.toR === 0 && m.toC === 7)) nCast = nCast.replace('k', '');
        if ((m.fromR === 0 && m.fromC === 0) || (m.toR === 0 && m.toC === 0)) nCast = nCast.replace('q', '');
        return nCast || '-';
    }

    // ---- Fast 64-square Int8Array Position & Make/Unmake Engine ----

    function packMove(fromSq, toSq, promoType = 0) {
        return fromSq | (toSq << 6) | (promoType << 12);
    }

    function unpackMove(m, b) {
        const fromSq = m & 63;
        const toSq = (m >> 6) & 63;
        const promoType = (m >> 12) & 7;
        const fromR = fromSq >> 3;
        const fromC = fromSq & 7;
        const toR = toSq >> 3;
        const toC = toSq & 7;
        let promotion = null;
        if (promoType) {
            promotion = PROMO_TYPE_TO_CHAR[promoType] || 'q';
        } else if (b) {
            const code = b[fromSq];
            if ((code === WP && toR === 0) || (code === BP && toR === 7)) {
                promotion = 'q';
            }
        }
        return promotion
            ? { fromR, fromC, toR, toC, promotion }
            : { fromR, fromC, toR, toC };
    }

    function moveObjToPacked(board, m) {
        const fromSq = m.fromR * 8 + m.fromC;
        const toSq = m.toR * 8 + m.toC;
        const p = board[m.fromR] ? board[m.fromR][m.fromC] : null;
        const isPromo = !!(p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7));
        let promoType = 0;
        if (isPromo) {
            promoType = (m.promotion && PROMO_CHAR_TO_TYPE[m.promotion.toLowerCase()]) || QUEEN;
        }
        return packMove(fromSq, toSq, promoType);
    }

    function boardToFast(board, turn = 'w', castling = '-', epSquare = null) {
        const b = new Int8Array(64);
        let wKingSq = -1;
        let bKingSq = -1;
        let repH1 = 0;
        let repH2 = 0;

        for (let r = 0; r < 8; r++) {
            const row = board[r];
            for (let c = 0; c < 8; c++) {
                const ch = row[c];
                if (!ch) continue;
                const code = CHAR_TO_CODE[ch];
                if (!code) continue;
                const sq = r * 8 + c;
                b[sq] = code;
                if (code === WK) wKingSq = sq;
                else if (code === BK) bKingSq = sq;
                const zIdx = (code + 6) * 64 + sq;
                repH1 = (repH1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                repH2 = (repH2 ^ Z_PIECE_HI[zIdx]) >>> 0;
            }
        }

        const turnNum = (turn === 'w') ? 1 : -1;
        if (turnNum === -1) {
            repH1 = (repH1 ^ Z_TURN_LO) >>> 0;
            repH2 = (repH2 ^ Z_TURN_HI) >>> 0;
        }

        return {
            b,
            turn: turnNum,
            cast: castlingStrToMask(castling),
            epSq: normalizeEpSquareInput(epSquare),
            wKingSq,
            bKingSq,
            repH1,
            repH2
        };
    }

    function fastToBoard8x8(pos) {
        const board = Array.from({ length: 8 }, () => new Array(8).fill(null));
        for (let sq = 0; sq < 64; sq++) {
            const code = pos.b[sq];
            if (code !== 0) {
                board[sq >> 3][sq & 7] = CODE_TO_CHAR[code];
            }
        }
        return board;
    }

    function computeRepKey(pos) {
        return ((pos.repH2 & 0x1fffff) * 4294967296) + (pos.repH1 >>> 0);
    }

    function computeTTKeyAndLock(pos) {
        const epIdx = (pos.epSq !== -1) ? (pos.epSq & 7) : 8;
        const h1 = (pos.repH1 ^ Z_CAST_LO[pos.cast] ^ Z_EP_LO[epIdx]) >>> 0;
        const h2 = (pos.repH2 ^ Z_CAST_HI[pos.cast] ^ Z_EP_HI[epIdx]) >>> 0;
        return {
            key: ((h2 & 0x1fffff) * 4294967296) + h1,
            lock: h2
        };
    }

    function createUndoStack(size = 128) {
        const stack = new Array(size);
        for (let i = 0; i < size; i++) {
            stack[i] = {
                moved: 0,
                cap: 0,
                epCapSq: -1,
                epCapPiece: 0,
                rookFromSq: -1,
                rookToSq: -1,
                rookPiece: 0,
                prevCast: 0,
                prevEpSq: -1,
                prevWKingSq: -1,
                prevBKingSq: -1,
                prevRepH1: 0,
                prevRepH2: 0
            };
        }
        return stack;
    }

    const SHARED_UNDO = createUndoStack(128);

    function makeMoveFast(pos, move, undo) {
        const b = pos.b;
        const fromSq = move & 63;
        const toSq = (move >> 6) & 63;
        const promoType = (move >> 12) & 7;
        const piece = b[fromSq];
        const cap = b[toSq];
        const absType = piece > 0 ? piece : -piece;
        const turn = pos.turn;

        undo.moved = piece;
        undo.cap = cap;
        undo.epCapSq = -1;
        undo.epCapPiece = 0;
        undo.rookFromSq = -1;
        undo.rookToSq = -1;
        undo.rookPiece = 0;
        undo.prevCast = pos.cast;
        undo.prevEpSq = pos.epSq;
        undo.prevWKingSq = pos.wKingSq;
        undo.prevBKingSq = pos.bKingSq;
        undo.prevRepH1 = pos.repH1;
        undo.prevRepH2 = pos.repH2;

        let h1 = pos.repH1;
        let h2 = pos.repH2;

        // XOR out moving piece at fromSq
        let zIdx = (piece + 6) * 64 + fromSq;
        h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
        h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
        b[fromSq] = 0;

        // XOR out captured piece at toSq
        if (cap !== 0) {
            zIdx = (cap + 6) * 64 + toSq;
            h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
            h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
        }

        let placedPiece = piece;
        let nextEpSq = -1;

        if (absType === PAWN) {
            const fromC = fromSq & 7;
            const toC = toSq & 7;
            const diff = fromSq - toSq;
            if (diff === 16 || diff === -16) {
                const oppPawn = -turn * PAWN;
                if ((toC > 0 && b[toSq - 1] === oppPawn) || (toC < 7 && b[toSq + 1] === oppPawn)) {
                    nextEpSq = (fromSq + toSq) >> 1;
                }
            } else if (fromC !== toC && cap === 0) {
                // En passant capture
                const epCapSq = toSq + (turn === 1 ? 8 : -8);
                const epCapPiece = b[epCapSq];
                if (epCapPiece !== 0) {
                    undo.epCapSq = epCapSq;
                    undo.epCapPiece = epCapPiece;
                    b[epCapSq] = 0;
                    zIdx = (epCapPiece + 6) * 64 + epCapSq;
                    h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                    h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
                }
            }
            if ((piece === WP && toSq < 8) || (piece === BP && toSq >= 56)) {
                const pType = (promoType >= KNIGHT && promoType <= QUEEN) ? promoType : QUEEN;
                placedPiece = turn * pType;
            }
        } else if (absType === KING) {
            if (turn === 1) pos.wKingSq = toSq;
            else pos.bKingSq = toSq;
            const dc = toSq - fromSq;
            if (dc === 2) {
                const rFrom = toSq + 1;
                const rTo = toSq - 1;
                const rPiece = b[rFrom];
                undo.rookFromSq = rFrom;
                undo.rookToSq = rTo;
                undo.rookPiece = rPiece;
                b[rFrom] = 0;
                b[rTo] = rPiece;
                zIdx = (rPiece + 6) * 64 + rFrom;
                h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
                zIdx = (rPiece + 6) * 64 + rTo;
                h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
            } else if (dc === -2) {
                const rFrom = toSq - 2;
                const rTo = toSq + 1;
                const rPiece = b[rFrom];
                undo.rookFromSq = rFrom;
                undo.rookToSq = rTo;
                undo.rookPiece = rPiece;
                b[rFrom] = 0;
                b[rTo] = rPiece;
                zIdx = (rPiece + 6) * 64 + rFrom;
                h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
                zIdx = (rPiece + 6) * 64 + rTo;
                h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
            }
        }

        b[toSq] = placedPiece;
        zIdx = (placedPiece + 6) * 64 + toSq;
        h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
        h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;

        pos.cast &= CAST_CLEAR[fromSq] & CAST_CLEAR[toSq];
        pos.epSq = nextEpSq;
        pos.turn = -turn;
        pos.repH1 = (h1 ^ Z_TURN_LO) >>> 0;
        pos.repH2 = (h2 ^ Z_TURN_HI) >>> 0;
    }

    function unmakeMoveFast(pos, move, undo) {
        const b = pos.b;
        const fromSq = move & 63;
        const toSq = (move >> 6) & 63;

        b[fromSq] = undo.moved;
        b[toSq] = undo.cap;
        if (undo.epCapSq !== -1) {
            b[undo.epCapSq] = undo.epCapPiece;
        }
        if (undo.rookFromSq !== -1) {
            b[undo.rookFromSq] = undo.rookPiece;
            b[undo.rookToSq] = 0;
        }

        pos.turn = -pos.turn;
        pos.cast = undo.prevCast;
        pos.epSq = undo.prevEpSq;
        pos.wKingSq = undo.prevWKingSq;
        pos.bKingSq = undo.prevBKingSq;
        pos.repH1 = undo.prevRepH1;
        pos.repH2 = undo.prevRepH2;
    }

    function isSquareAttackedFast(pos, sq, byTurn) {
        const b = pos.b;
        const r = sq >> 3;
        const c = sq & 7;
        const pCode = byTurn * PAWN;
        const nCode = byTurn * KNIGHT;
        const bCode = byTurn * BISHOP;
        const rCode = byTurn * ROOK;
        const qCode = byTurn * QUEEN;
        const kCode = byTurn * KING;

        // Pawns
        const pSrcR = r + byTurn; // white attacks from r+1, black from r-1
        if (pSrcR >= 0 && pSrcR < 8) {
            const base = pSrcR * 8;
            if (c > 0 && b[base + c - 1] === pCode) return true;
            if (c < 7 && b[base + c + 1] === pCode) return true;
        }

        // Knights
        for (let i = 0; i < 8; i++) {
            const nr = r + KNIGHT_OFFSETS[i][0];
            const nc = c + KNIGHT_OFFSETS[i][1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === nCode) return true;
        }

        // Orthogonal (Rooks & Queens)
        for (let i = 0; i < 4; i++) {
            const dr = ORTH_DIRS[i][0];
            const dc = ORTH_DIRS[i][1];
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const cp = b[nr * 8 + nc];
                if (cp !== 0) {
                    if (cp === rCode || cp === qCode) return true;
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }

        // Diagonal (Bishops & Queens)
        for (let i = 0; i < 4; i++) {
            const dr = DIAG_DIRS[i][0];
            const dc = DIAG_DIRS[i][1];
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const cp = b[nr * 8 + nc];
                if (cp !== 0) {
                    if (cp === bCode || cp === qCode) return true;
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }

        // King
        const oppKingSq = (byTurn === 1) ? pos.wKingSq : pos.bKingSq;
        if (oppKingSq !== -1) {
            const okR = oppKingSq >> 3;
            const okC = oppKingSq & 7;
            if (Math.abs(r - okR) <= 1 && Math.abs(c - okC) <= 1 && (r !== okR || c !== okC)) {
                return true;
            }
        } else {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === kCode) return true;
                }
            }
        }

        return false;
    }

    function isKingInCheckFast(pos, sideTurn) {
        const kSq = (sideTurn === 1) ? pos.wKingSq : pos.bKingSq;
        if (kSq === -1) return true;
        return isSquareAttackedFast(pos, kSq, -sideTurn);
    }

    function isPassedPawnFast(b, r, c, pawnTurn) {
        const ownPawn = pawnTurn * PAWN;
        const oppPawn = -ownPawn;
        const cStart = c > 0 ? c - 1 : 0;
        const cEnd = c < 7 ? c + 1 : 7;

        if (pawnTurn === 1) {
            for (let cr = 0; cr < r; cr++) {
                const base = cr * 8;
                // Doubled own pawn on same file blocks front-free passed pawn status
                if (b[base + c] === ownPawn) return false;
                for (let cc = cStart; cc <= cEnd; cc++) {
                    if (b[base + cc] === oppPawn) return false;
                }
            }
        } else {
            for (let cr = r + 1; cr < 8; cr++) {
                const base = cr * 8;
                if (b[base + c] === ownPawn) return false;
                for (let cc = cStart; cc <= cEnd; cc++) {
                    if (b[base + cc] === oppPawn) return false;
                }
            }
        }
        return true;
    }

    function isEndgameFast(pos) {
        const b = pos.b;
        let nonKingMat = 0;
        let nonPawnMat = 0;
        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0) continue;
            const type = code > 0 ? code : -code;
            if (type === KING) continue;
            const val = TYPE_VALUES[type];
            nonKingMat += val;
            if (type !== PAWN) nonPawnMat += val;
        }
        return nonKingMat <= 1600 || nonPawnMat <= 1200;
    }

    function evalSimpleMatCp(pos) {
        const b = pos.b;
        let total = 0;
        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0) continue;
            const type = code > 0 ? code : -code;
            if (type === KING) continue;
            const val = TYPE_VALUES[type];
            total += (code > 0) ? val : -val;
        }
        return pos.turn * total;
    }

    function findLeastValuableAttackerSq(b, toSq, side) {
        const r = toSq >> 3;
        const c = toSq & 7;

        // 1. Pawns
        const pCode = side * PAWN;
        const pSrcR = r + side;
        if (pSrcR >= 0 && pSrcR < 8) {
            const base = pSrcR * 8;
            if (c > 0 && b[base + c - 1] === pCode) return base + c - 1;
            if (c < 7 && b[base + c + 1] === pCode) return base + c + 1;
        }

        // 2. Knights
        const nCode = side * KNIGHT;
        for (let i = 0; i < 8; i++) {
            const nr = r + KNIGHT_OFFSETS[i][0];
            const nc = c + KNIGHT_OFFSETS[i][1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const sq = nr * 8 + nc;
                if (b[sq] === nCode) return sq;
            }
        }

        // 3. Bishops (and track Queen on diagonals)
        const bCode = side * BISHOP;
        const qCode = side * QUEEN;
        let queenSq = -1;
        for (let i = 0; i < 4; i++) {
            const dr = DIAG_DIRS[i][0];
            const dc = DIAG_DIRS[i][1];
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const sq = nr * 8 + nc;
                const cp = b[sq];
                if (cp !== 0) {
                    if (cp === bCode) return sq;
                    if (cp === qCode && queenSq === -1) queenSq = sq;
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }

        // 4. Rooks (and track Queen on orthogonals)
        const rCode = side * ROOK;
        for (let i = 0; i < 4; i++) {
            const dr = ORTH_DIRS[i][0];
            const dc = ORTH_DIRS[i][1];
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const sq = nr * 8 + nc;
                const cp = b[sq];
                if (cp !== 0) {
                    if (cp === rCode) return sq;
                    if (cp === qCode && queenSq === -1) queenSq = sq;
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }

        // 5. Queens
        if (queenSq !== -1) return queenSq;

        // 6. King
        const kCode = side * KING;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const sq = nr * 8 + nc;
                    if (b[sq] === kCode) return sq;
                }
            }
        }

        return -1;
    }

    function seeCpFast(pos, move) {
        const b = pos.b;
        const fromSq = move & 63;
        const toSq = (move >> 6) & 63;
        if (fromSq === toSq) return 0;

        const movedPiece = b[fromSq];
        if (movedPiece === 0) return 0;
        const movedType = movedPiece > 0 ? movedPiece : -movedPiece;
        const promoType = (move >> 12) & 7;
        const capPiece = b[toSq];
        const isEp = (movedType === PAWN && capPiece === 0 && ((fromSq & 7) !== (toSq & 7)));

        let capVal = 0;
        if (isEp) {
            capVal = TYPE_VALUES[PAWN];
        } else if (capPiece !== 0) {
            capVal = TYPE_VALUES[capPiece > 0 ? capPiece : -capPiece];
        }

        let attVal = TYPE_VALUES[movedType];
        if (promoType >= KNIGHT && promoType <= QUEEN) {
            const pVal = TYPE_VALUES[promoType];
            capVal += pVal - TYPE_VALUES[PAWN];
            attVal = pVal;
        }

        let saveCnt = 0;
        SEE_SAVE_SQ[saveCnt] = fromSq;
        SEE_SAVE_PIECE[saveCnt] = movedPiece;
        saveCnt++;
        b[fromSq] = 0;

        if (isEp) {
            const epCapSq = toSq + (pos.turn === 1 ? 8 : -8);
            if (epCapSq >= 0 && epCapSq < 64 && b[epCapSq] !== 0) {
                SEE_SAVE_SQ[saveCnt] = epCapSq;
                SEE_SAVE_PIECE[saveCnt] = b[epCapSq];
                saveCnt++;
                b[epCapSq] = 0;
            }
        }

        SEE_GAIN[0] = capVal;
        let d = 0;
        let sideToMove = -pos.turn;

        while (d < 30) {
            const attSq = findLeastValuableAttackerSq(b, toSq, sideToMove);
            if (attSq === -1) break;
            d++;
            SEE_GAIN[d] = attVal - SEE_GAIN[d - 1];
            const attPiece = b[attSq];
            const attType = attPiece > 0 ? attPiece : -attPiece;
            SEE_SAVE_SQ[saveCnt] = attSq;
            SEE_SAVE_PIECE[saveCnt] = attPiece;
            saveCnt++;
            b[attSq] = 0;
            attVal = TYPE_VALUES[attType];
            sideToMove = -sideToMove;
        }

        for (let i = saveCnt - 1; i >= 0; i--) {
            b[SEE_SAVE_SQ[i]] = SEE_SAVE_PIECE[i];
        }

        while (d > 0) {
            SEE_GAIN[d - 1] = -Math.max(-SEE_GAIN[d - 1], SEE_GAIN[d]);
            d--;
        }

        return SEE_GAIN[0];
    }

    function seeCp(pos, move) {
        if (!pos || !pos.b) return 0;
        if (typeof move === 'number') {
            return seeCpFast(pos, move);
        }
        if (move && typeof move === 'object' && typeof move.fromR === 'number') {
            const fromSq = move.fromR * 8 + move.fromC;
            const toSq = move.toR * 8 + move.toC;
            const pCode = pos.b[fromSq];
            const isPawnPromo = (pCode === WP && move.toR === 0) || (pCode === BP && move.toR === 7);
            const promoType = isPawnPromo
                ? ((move.promotion && PROMO_CHAR_TO_TYPE[move.promotion.toLowerCase()]) || QUEEN)
                : 0;
            return seeCpFast(pos, packMove(fromSq, toSq, promoType));
        }
        return 0;
    }

    function evaluateBoardFast(pos) {
        const b = pos.b;
        EVAL_W_FILE_CNT.fill(0);
        EVAL_B_FILE_CNT.fill(0);
        EVAL_W_MIN_RANK.fill(8);
        EVAL_W_MAX_RANK.fill(-1);
        EVAL_B_MIN_RANK.fill(8);
        EVAL_B_MAX_RANK.fill(-1);
        EVAL_W_PAWN_ATK.fill(0);
        EVAL_B_PAWN_ATK.fill(0);

        let mgScore = 0;
        let egScore = 0;
        let phase = 0;
        let wPawns = 0, bPawns = 0;
        let wKnights = 0, bKnights = 0;
        let wBishops = 0, bBishops = 0;
        let wRooks = 0, bRooks = 0;
        let wQueens = 0, bQueens = 0;
        let wMat = 0, bMat = 0;
        let wBishopColorMask = 0, bBishopColorMask = 0;
        let wPawnMask = 0;
        let bPawnMask = 0;
        let pawnCount = 0;
        let pieceCount = 0;

        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0) continue;
            const isW = code > 0;
            const type = isW ? code : -code;
            const pstSq = isW ? sq : (sq ^ 56);

            if (type === KING) {
                if (isW) {
                    mgScore += PST_FLAT[KING][pstSq];
                    egScore += PST_EG_FLAT[KING][pstSq];
                } else {
                    mgScore -= PST_FLAT[KING][pstSq];
                    egScore -= PST_EG_FLAT[KING][pstSq];
                }
                continue;
            }

            const baseMat = TYPE_VALUES[type];
            const mgVal = baseMat + PST_FLAT[type][pstSq];
            const egVal = baseMat + PST_EG_FLAT[type][pstSq];
            if (isW) {
                mgScore += mgVal;
                egScore += egVal;
                wMat += baseMat;
            } else {
                mgScore -= mgVal;
                egScore -= egVal;
                bMat += baseMat;
            }

            phase += PHASE_WEIGHTS[type];

            if (type === PAWN) {
                const r = sq >> 3;
                const c = sq & 7;
                if (isW) {
                    wPawns++;
                    EVAL_W_FILE_CNT[c]++;
                    if (r < EVAL_W_MIN_RANK[c]) EVAL_W_MIN_RANK[c] = r;
                    if (r > EVAL_W_MAX_RANK[c]) EVAL_W_MAX_RANK[c] = r;
                    wPawnMask |= (1 << c);
                    if (r > 0) {
                        const base = (r - 1) * 8;
                        if (c > 0) EVAL_W_PAWN_ATK[base + c - 1] = 1;
                        if (c < 7) EVAL_W_PAWN_ATK[base + c + 1] = 1;
                    }
                } else {
                    bPawns++;
                    EVAL_B_FILE_CNT[c]++;
                    if (r < EVAL_B_MIN_RANK[c]) EVAL_B_MIN_RANK[c] = r;
                    if (r > EVAL_B_MAX_RANK[c]) EVAL_B_MAX_RANK[c] = r;
                    bPawnMask |= (1 << c);
                    if (r < 7) {
                        const base = (r + 1) * 8;
                        if (c > 0) EVAL_B_PAWN_ATK[base + c - 1] = 1;
                        if (c < 7) EVAL_B_PAWN_ATK[base + c + 1] = 1;
                    }
                }
                EVAL_PAWN_SQ[pawnCount++] = sq;
            } else {
                if (type === KNIGHT) {
                    if (isW) wKnights++; else bKnights++;
                } else if (type === BISHOP) {
                    const colorBit = 1 << (((sq >> 3) + (sq & 7)) & 1);
                    if (isW) { wBishops++; wBishopColorMask |= colorBit; }
                    else { bBishops++; bBishopColorMask |= colorBit; }
                } else if (type === ROOK) {
                    if (isW) wRooks++; else bRooks++;
                } else if (type === QUEEN) {
                    if (isW) wQueens++; else bQueens++;
                }
                EVAL_PIECE_SQ[pieceCount++] = sq;
            }
        }

        // Insufficient mating material (K vs K, KB vs K, KN vs K, K+minor vs K+minor, KNN vs K)
        if (wPawns === 0 && bPawns === 0 && wRooks === 0 && bRooks === 0 && wQueens === 0 && bQueens === 0) {
            const wMinors = wKnights + wBishops;
            const bMinors = bKnights + bBishops;
            if (
                (wMinors <= 1 && bMinors <= 1) ||
                (wMinors === 2 && wBishops === 0 && bMinors === 0) ||
                (bMinors === 2 && bBishops === 0 && wMinors === 0)
            ) {
                return 0;
            }
        }

        if (wBishops >= 2) { mgScore += 30; egScore += 45; }
        if (bBishops >= 2) { mgScore -= 30; egScore -= 45; }

        // Doubled pawn penalties per file
        for (let c = 0; c < 8; c++) {
            const wc = EVAL_W_FILE_CNT[c];
            if (wc > 1) {
                const extra = wc - 1;
                mgScore -= extra * 12;
                egScore -= extra * 20;
            }
            const bc = EVAL_B_FILE_CNT[c];
            if (bc > 1) {
                const extra = bc - 1;
                mgScore += extra * 12;
                egScore += extra * 20;
            }
        }

        const wK = pos.wKingSq;
        const bK = pos.bKingSq;
        const wKR = wK !== -1 ? (wK >> 3) : -10;
        const wKC = wK !== -1 ? (wK & 7) : -10;
        const bKR = bK !== -1 ? (bK >> 3) : -10;
        const bKC = bK !== -1 ? (bK & 7) : -10;
        const bothKingsPresent = (wK !== -1 && bK !== -1);

        // Pawn structure: isolated, phalanx/connected, O(1) passed (with blockade & endgame king distance)
        for (let i = 0; i < pawnCount; i++) {
            const sq = EVAL_PAWN_SQ[i];
            const code = b[sq];
            const isW = code > 0;
            const sign = isW ? 1 : -1;
            const r = sq >> 3;
            const c = sq & 7;
            const ownMask = isW ? wPawnMask : bPawnMask;

            if ((ownMask & ADJ_FILE_MASK[c]) === 0) {
                mgScore -= sign * 12;
                egScore -= sign * 18;
            }

            if (c > 0 && b[sq - 1] === code) {
                mgScore += sign * 10;
                egScore += sign * 14;
            }

            const backR = r + sign;
            const supported = (backR >= 0 && backR < 8) && (
                (c > 0 && b[backR * 8 + c - 1] === code) ||
                (c < 7 && b[backR * 8 + c + 1] === code)
            );
            if (supported) {
                mgScore += sign * 10;
                egScore += sign * 14;
            }

            const isPassed = isW
                ? (EVAL_W_MIN_RANK[c] === r &&
                   EVAL_B_MIN_RANK[c] >= r &&
                   (c === 0 || EVAL_B_MIN_RANK[c - 1] >= r) &&
                   (c === 7 || EVAL_B_MIN_RANK[c + 1] >= r))
                : (EVAL_B_MAX_RANK[c] === r &&
                   EVAL_W_MAX_RANK[c] <= r &&
                   (c === 0 || EVAL_W_MAX_RANK[c - 1] <= r) &&
                   (c === 7 || EVAL_W_MAX_RANK[c + 1] <= r));

            if (isPassed) {
                const adv = isW ? (7 - r) : r;
                const ppMg = PP_MG_BONUS[adv];
                let ppEg = PP_EG_BONUS[adv];
                let kingProxEg = 0;

                const stopR = isW ? (r - 1) : (r + 1);
                if (stopR >= 0 && stopR < 8) {
                    const stopSq = stopR * 8 + c;
                    if (b[stopSq] * sign < 0) {
                        // Blockaded by opponent piece: reduce endgame bonus by 40%
                        ppEg = Math.round(ppEg * 0.6);
                    }
                    if (bothKingsPresent && adv >= 3) {
                        const wd = Math.max(Math.abs(wKR - stopR), Math.abs(wKC - c));
                        const bd = Math.max(Math.abs(bKR - stopR), Math.abs(bKC - c));
                        const ownDist = isW ? wd : bd;
                        const oppDist = isW ? bd : wd;
                        kingProxEg = (oppDist - ownDist) * (adv >= 4 ? (adv * 3 - 4) : 3);
                    }
                }

                mgScore += sign * ppMg;
                egScore += sign * (ppEg + (supported ? 18 : 0) + kingProxEg);
            }
        }

        // King safety in middlegame: symmetric 3-file pawn shield + open/semi-open files near king
        if (wK !== -1) {
            const kr = wKR;
            const kc = wKC;
            const scCenter = kc < 1 ? 1 : (kc > 6 ? 6 : kc);
            const cStart = scCenter - 1;
            const cEnd = scCenter + 1;
            for (let sc = cStart; sc <= cEnd; sc++) {
                if (EVAL_W_FILE_CNT[sc] === 0) {
                    mgScore -= (EVAL_B_FILE_CNT[sc] === 0) ? 22 : 12;
                }
            }
            if (kr >= 6 && (kc <= 2 || kc >= 5)) {
                for (let sc = cStart; sc <= cEnd; sc++) {
                    if (b[(kr - 1) * 8 + sc] === WP) {
                        mgScore += 15;
                    } else if (kr >= 2 && b[(kr - 2) * 8 + sc] === WP) {
                        mgScore += 8;
                    } else {
                        mgScore -= 16;
                    }
                }
            }
        }

        if (bK !== -1) {
            const kr = bKR;
            const kc = bKC;
            const scCenter = kc < 1 ? 1 : (kc > 6 ? 6 : kc);
            const cStart = scCenter - 1;
            const cEnd = scCenter + 1;
            for (let sc = cStart; sc <= cEnd; sc++) {
                if (EVAL_B_FILE_CNT[sc] === 0) {
                    mgScore += (EVAL_W_FILE_CNT[sc] === 0) ? 22 : 12;
                }
            }
            if (kr <= 1 && (kc <= 2 || kc >= 5)) {
                for (let sc = cStart; sc <= cEnd; sc++) {
                    if (b[(kr + 1) * 8 + sc] === BP) {
                        mgScore -= 15;
                    } else if (kr <= 5 && b[(kr + 2) * 8 + sc] === BP) {
                        mgScore -= 8;
                    } else {
                        mgScore += 16;
                    }
                }
            }
        }

        let wAttackUnits = 0;
        let wAttackers = 0;
        let bAttackUnits = 0;
        let bAttackers = 0;

        // Piece activity: pawn threats, safe mobility, king attack zone, rooks on files/7th, O(1) knight outposts
        for (let i = 0; i < pieceCount; i++) {
            const sq = EVAL_PIECE_SQ[i];
            const code = b[sq];
            const isW = code > 0;
            const sign = isW ? 1 : -1;
            const type = isW ? code : -code;
            const r = sq >> 3;
            const c = sq & 7;
            const oppPawnAtk = isW ? EVAL_B_PAWN_ATK : EVAL_W_PAWN_ATK;
            const ekR = isW ? bKR : wKR;
            const ekC = isW ? bKC : wKC;
            let hitKingZone = 0;

            if (oppPawnAtk[sq] !== 0) {
                const threatPenMg = (type >= ROOK) ? 50 : 30;
                const threatPenEg = (type >= ROOK) ? 40 : 24;
                mgScore -= sign * threatPenMg;
                egScore -= sign * threatPenEg;
            }

            if (type === KNIGHT) {
                let mob = 0;
                for (let j = 0; j < 8; j++) {
                    const nr = r + KNIGHT_OFFSETS[j][0];
                    const nc = c + KNIGHT_OFFSETS[j][1];
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        if (b[tSq] * sign <= 0 && oppPawnAtk[tSq] === 0) mob++;
                        if (Math.abs(nr - ekR) <= 1 && Math.abs(nc - ekC) <= 1) hitKingZone++;
                    }
                }
                mgScore += sign * (mob - 4) * 4;
                egScore += sign * (mob - 4) * 3;
                if (hitKingZone > 0) {
                    const addU = 2 * (hitKingZone > 2 ? 2 : hitKingZone);
                    if (isW) { wAttackers++; wAttackUnits += addU; }
                    else { bAttackers++; bAttackUnits += addU; }
                }

                // Knight outpost supported by friendly pawn and safe from enemy pawn advances (O(1) check)
                if ((isW ? (r >= 2 && r <= 4) : (r >= 3 && r <= 5)) && c >= 1 && c <= 6) {
                    const suppR = r + sign;
                    const ownPawn = sign * PAWN;
                    if (b[suppR * 8 + c - 1] === ownPawn || b[suppR * 8 + c + 1] === ownPawn) {
                        const enemyCanChallenge = isW
                            ? (EVAL_B_MIN_RANK[c - 1] < r || EVAL_B_MIN_RANK[c + 1] < r)
                            : (EVAL_W_MAX_RANK[c - 1] > r || EVAL_W_MAX_RANK[c + 1] > r);
                        if (!enemyCanChallenge) {
                            const outBonus = (c >= 2 && c <= 5) ? 26 : 18;
                            mgScore += sign * outBonus;
                            egScore += sign * Math.round(outBonus * 0.7);
                        }
                    }
                }
            } else if (type === BISHOP) {
                let mob = 0;
                for (let d = 0; d < 4; d++) {
                    const dr = DIAG_DIRS[d][0];
                    const dc = DIAG_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        if (Math.abs(nr - ekR) <= 1 && Math.abs(nc - ekC) <= 1) hitKingZone++;
                        const tp = b[tSq];
                        if (tp === 0) {
                            if (oppPawnAtk[tSq] === 0) mob++;
                        } else {
                            if (tp * sign < 0 && oppPawnAtk[tSq] === 0) mob++;
                            break;
                        }
                        nr += dr;
                        nc += dc;
                    }
                }
                mgScore += sign * (mob - 6) * 4;
                egScore += sign * (mob - 6) * 4;
                if (hitKingZone > 0) {
                    const addU = 2 * (hitKingZone > 2 ? 2 : hitKingZone);
                    if (isW) { wAttackers++; wAttackUnits += addU; }
                    else { bAttackers++; bAttackUnits += addU; }
                }
            } else if (type === ROOK) {
                if (pawnCount > 0) {
                    const ownCnt = isW ? EVAL_W_FILE_CNT[c] : EVAL_B_FILE_CNT[c];
                    const oppCnt = isW ? EVAL_B_FILE_CNT[c] : EVAL_W_FILE_CNT[c];
                    if (ownCnt === 0) {
                        if (oppCnt === 0) {
                            mgScore += sign * 22;
                            egScore += sign * 15;
                        } else {
                            mgScore += sign * 12;
                            egScore += sign * 8;
                        }
                    }
                }
                if ((isW && r === 1) || (!isW && r === 6)) {
                    mgScore += sign * 20;
                    egScore += sign * 30;
                }

                let mob = 0;
                for (let d = 0; d < 4; d++) {
                    const dr = ORTH_DIRS[d][0];
                    const dc = ORTH_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        if (Math.abs(nr - ekR) <= 1 && Math.abs(nc - ekC) <= 1) hitKingZone++;
                        const tp = b[tSq];
                        if (tp === 0) {
                            if (oppPawnAtk[tSq] === 0) mob++;
                        } else {
                            if (tp * sign < 0 && oppPawnAtk[tSq] === 0) mob++;
                            break;
                        }
                        nr += dr;
                        nc += dc;
                    }
                }
                mgScore += sign * (mob - 7) * 2;
                egScore += sign * (mob - 8) * 2;
                if (hitKingZone > 0) {
                    const addU = 3 * (hitKingZone > 2 ? 2 : hitKingZone);
                    if (isW) { wAttackers++; wAttackUnits += addU; }
                    else { bAttackers++; bAttackUnits += addU; }
                }
            } else if (type === QUEEN) {
                let mob = 0;
                for (let d = 0; d < 8; d++) {
                    const dr = ALL_SLIDE_DIRS[d][0];
                    const dc = ALL_SLIDE_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        if (Math.abs(nr - ekR) <= 1 && Math.abs(nc - ekC) <= 1) hitKingZone++;
                        const tp = b[tSq];
                        if (tp === 0) {
                            if (oppPawnAtk[tSq] === 0) mob++;
                        } else {
                            if (tp * sign < 0 && oppPawnAtk[tSq] === 0) mob++;
                            break;
                        }
                        nr += dr;
                        nc += dc;
                    }
                }
                mgScore += sign * (mob - 14);
                egScore += sign * (mob - 14) * 2;
                if (hitKingZone > 0) {
                    const addU = 4 * (hitKingZone > 2 ? 2 : hitKingZone);
                    if (isW) { wAttackers++; wAttackUnits += addU; }
                    else { bAttackers++; bAttackUnits += addU; }
                }
            }
        }

        if (wAttackers >= 2) {
            mgScore += Math.min(120, Math.round(wAttackUnits * wAttackUnits * 0.5));
        }
        if (bAttackers >= 2) {
            mgScore -= Math.min(120, Math.round(bAttackUnits * bAttackUnits * 0.5));
        }

        // Drawish endgame scaling (opposite-colored bishops; R+minor vs R without pawns)
        if (
            wBishops === 1 && bBishops === 1 &&
            wKnights === 0 && bKnights === 0 &&
            wRooks === 0 && bRooks === 0 &&
            wQueens === 0 && bQueens === 0 &&
            wBishopColorMask !== bBishopColorMask
        ) {
            egScore = Math.trunc(egScore * 0.5);
        } else if (
            (egScore > 0 && wPawns === 0 && (wMat - bMat) <= 350) ||
            (egScore < 0 && bPawns === 0 && (bMat - wMat) <= 350)
        ) {
            egScore = Math.trunc(egScore * 0.5);
        }

        // Mop-up bonus in winning endgames to push losing king toward corner and bring winning king closer
        if (phase <= 6 && bothKingsPresent) {
            if (egScore > 250) {
                const bkEdge = Math.abs(bKR - 3.5) + Math.abs(bKC - 3.5);
                const kDist = Math.abs(wKR - bKR) + Math.abs(wKC - bKC);
                egScore += Math.round(bkEdge * 10) + (14 - kDist) * 4;
            } else if (egScore < -250) {
                const wkEdge = Math.abs(wKR - 3.5) + Math.abs(wKC - 3.5);
                const kDist = Math.abs(wKR - bKR) + Math.abs(wKC - bKC);
                egScore -= Math.round(wkEdge * 10) + (14 - kDist) * 4;
            }
        }

        const p = phase > 24 ? 24 : phase;
        const tapered = Math.trunc((mgScore * p + egScore * (24 - p)) / 24);
        return pos.turn * tapered + 12;
    }

    function hasNonPawnMaterialFast(pos, sideTurn) {
        const b = pos.b;
        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0) continue;
            if ((code > 0 ? 1 : -1) !== sideTurn) continue;
            const type = code > 0 ? code : -code;
            if (type >= KNIGHT && type <= QUEEN) return true;
        }
        return false;
    }

    function pushMoveIfLegalFast(pos, move, outMoves, undo) {
        const side = pos.turn;
        makeMoveFast(pos, move, undo);
        const kSq = (side === 1) ? pos.wKingSq : pos.bKingSq;
        const safe = (kSq !== -1 && !isSquareAttackedFast(pos, kSq, -side));
        unmakeMoveFast(pos, move, undo);
        if (safe) outMoves.push(move);
    }

    function genLegalMovesFast(pos, undo) {
        const b = pos.b;
        const side = pos.turn;
        const isW = (side === 1);
        const oppSide = -side;
        const pDir = isW ? -1 : 1;
        const startRank = isW ? 6 : 1;
        const promoRank = isW ? 0 : 7;
        const epSq = pos.epSq;
        const oppPawn = -side * PAWN;
        const oppKing = -side * KING;
        const ownKingSq = isW ? pos.wKingSq : pos.bKingSq;
        const kR = ownKingSq !== -1 ? (ownKingSq >> 3) : -10;
        const kC = ownKingSq !== -1 ? (ownKingSq & 7) : -10;
        const inCheck = (ownKingSq === -1 || isSquareAttackedFast(pos, ownKingSq, oppSide));
        const moves = [];

        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0 || (code > 0 ? 1 : -1) !== side) continue;
            const type = code > 0 ? code : -code;
            const r = sq >> 3;
            const c = sq & 7;
            const alignedWithKing = (inCheck || ownKingSq === -1 || r === kR || c === kC || Math.abs(r - kR) === Math.abs(c - kC));

            if (type === PAWN) {
                const nr = r + pDir;
                if (nr >= 0 && nr < 8) {
                    const fwdSq = nr * 8 + c;
                    if (b[fwdSq] === 0) {
                        if (nr === promoRank) {
                            if (alignedWithKing) {
                                pushMoveIfLegalFast(pos, packMove(sq, fwdSq, QUEEN), moves, undo);
                                pushMoveIfLegalFast(pos, packMove(sq, fwdSq, ROOK), moves, undo);
                                pushMoveIfLegalFast(pos, packMove(sq, fwdSq, BISHOP), moves, undo);
                                pushMoveIfLegalFast(pos, packMove(sq, fwdSq, KNIGHT), moves, undo);
                            } else {
                                moves.push(packMove(sq, fwdSq, QUEEN));
                                moves.push(packMove(sq, fwdSq, ROOK));
                                moves.push(packMove(sq, fwdSq, BISHOP));
                                moves.push(packMove(sq, fwdSq, KNIGHT));
                            }
                        } else {
                            if (alignedWithKing) pushMoveIfLegalFast(pos, packMove(sq, fwdSq, 0), moves, undo);
                            else moves.push(packMove(sq, fwdSq, 0));
                            if (r === startRank) {
                                const nnr = r + 2 * pDir;
                                const dblSq = nnr * 8 + c;
                                if (b[dblSq] === 0) {
                                    if (alignedWithKing) pushMoveIfLegalFast(pos, packMove(sq, dblSq, 0), moves, undo);
                                    else moves.push(packMove(sq, dblSq, 0));
                                }
                            }
                        }
                    }
                    for (let dci = -1; dci <= 1; dci += 2) {
                        const nc = c + dci;
                        if (nc < 0 || nc >= 8) continue;
                        const capSq = nr * 8 + nc;
                        const tp = b[capSq];
                        if (tp !== 0 && (tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                            if (nr === promoRank) {
                                if (alignedWithKing) {
                                    pushMoveIfLegalFast(pos, packMove(sq, capSq, QUEEN), moves, undo);
                                    pushMoveIfLegalFast(pos, packMove(sq, capSq, ROOK), moves, undo);
                                    pushMoveIfLegalFast(pos, packMove(sq, capSq, BISHOP), moves, undo);
                                    pushMoveIfLegalFast(pos, packMove(sq, capSq, KNIGHT), moves, undo);
                                } else {
                                    moves.push(packMove(sq, capSq, QUEEN));
                                    moves.push(packMove(sq, capSq, ROOK));
                                    moves.push(packMove(sq, capSq, BISHOP));
                                    moves.push(packMove(sq, capSq, KNIGHT));
                                }
                            } else {
                                if (alignedWithKing) pushMoveIfLegalFast(pos, packMove(sq, capSq, 0), moves, undo);
                                else moves.push(packMove(sq, capSq, 0));
                            }
                        } else if (capSq === epSq && tp === 0 && b[r * 8 + nc] === oppPawn) {
                            // En passant removes two pawns from rank r, so always test legality
                            pushMoveIfLegalFast(pos, packMove(sq, capSq, 0), moves, undo);
                        }
                    }
                }
            } else if (type === KNIGHT) {
                for (let i = 0; i < 8; i++) {
                    const nr = r + KNIGHT_OFFSETS[i][0];
                    const nc = c + KNIGHT_OFFSETS[i][1];
                    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
                    const tSq = nr * 8 + nc;
                    const tp = b[tSq];
                    if (tp === 0 || ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing)) {
                        if (alignedWithKing) pushMoveIfLegalFast(pos, packMove(sq, tSq, 0), moves, undo);
                        else moves.push(packMove(sq, tSq, 0));
                    }
                }
            } else if (type === BISHOP || type === ROOK || type === QUEEN) {
                const startD = (type === ROOK) ? 4 : 0;
                const endD = (type === BISHOP) ? 4 : 8;
                for (let d = startD; d < endD; d++) {
                    const dr = ALL_SLIDE_DIRS[d][0];
                    const dc = ALL_SLIDE_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        const tp = b[tSq];
                        if (tp === 0) {
                            if (alignedWithKing) pushMoveIfLegalFast(pos, packMove(sq, tSq, 0), moves, undo);
                            else moves.push(packMove(sq, tSq, 0));
                        } else {
                            if ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                                if (alignedWithKing) pushMoveIfLegalFast(pos, packMove(sq, tSq, 0), moves, undo);
                                else moves.push(packMove(sq, tSq, 0));
                            }
                            break;
                        }
                        nr += dr;
                        nc += dc;
                    }
                }
            } else if (type === KING) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
                        const tSq = nr * 8 + nc;
                        const tp = b[tSq];
                        if (tp === 0 || ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing)) {
                            pushMoveIfLegalFast(pos, packMove(sq, tSq, 0), moves, undo);
                        }
                    }
                }
            }
        }

        // Castling checks without any board cloning
        const cast = pos.cast;
        if (cast !== 0) {
            if (isW) {
                if ((cast & 1) && b[60] === WK && b[63] === WR && b[61] === 0 && b[62] === 0) {
                    if (!isSquareAttackedFast(pos, 60, -1) && !isSquareAttackedFast(pos, 61, -1) && !isSquareAttackedFast(pos, 62, -1)) {
                        moves.push(packMove(60, 62, 0));
                    }
                }
                if ((cast & 2) && b[60] === WK && b[56] === WR && b[59] === 0 && b[58] === 0 && b[57] === 0) {
                    if (!isSquareAttackedFast(pos, 60, -1) && !isSquareAttackedFast(pos, 59, -1) && !isSquareAttackedFast(pos, 58, -1)) {
                        moves.push(packMove(60, 58, 0));
                    }
                }
            } else {
                if ((cast & 4) && b[4] === BK && b[7] === BR && b[5] === 0 && b[6] === 0) {
                    if (!isSquareAttackedFast(pos, 4, 1) && !isSquareAttackedFast(pos, 5, 1) && !isSquareAttackedFast(pos, 6, 1)) {
                        moves.push(packMove(4, 6, 0));
                    }
                }
                if ((cast & 8) && b[4] === BK && b[0] === BR && b[3] === 0 && b[2] === 0 && b[1] === 0) {
                    if (!isSquareAttackedFast(pos, 4, 1) && !isSquareAttackedFast(pos, 3, 1) && !isSquareAttackedFast(pos, 2, 1)) {
                        moves.push(packMove(4, 2, 0));
                    }
                }
            }
        }

        return moves;
    }

    function genPseudoMovesFast(pos, outBuf) {
        const b = pos.b;
        const side = pos.turn;
        const isW = (side === 1);
        const oppSide = -side;
        const pDir = isW ? -1 : 1;
        const startRank = isW ? 6 : 1;
        const promoRank = isW ? 0 : 7;
        const epSq = pos.epSq;
        const oppPawn = -side * PAWN;
        const oppKing = -side * KING;
        let cnt = 0;

        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0 || (code > 0 ? 1 : -1) !== side) continue;
            const type = code > 0 ? code : -code;
            const r = sq >> 3;
            const c = sq & 7;

            if (type === PAWN) {
                const nr = r + pDir;
                if (nr >= 0 && nr < 8) {
                    const fwdSq = nr * 8 + c;
                    if (b[fwdSq] === 0) {
                        if (nr === promoRank) {
                            outBuf[cnt++] = packMove(sq, fwdSq, QUEEN);
                            outBuf[cnt++] = packMove(sq, fwdSq, ROOK);
                            outBuf[cnt++] = packMove(sq, fwdSq, BISHOP);
                            outBuf[cnt++] = packMove(sq, fwdSq, KNIGHT);
                        } else {
                            outBuf[cnt++] = packMove(sq, fwdSq, 0);
                            if (r === startRank) {
                                const nnr = r + 2 * pDir;
                                const dblSq = nnr * 8 + c;
                                if (b[dblSq] === 0) {
                                    outBuf[cnt++] = packMove(sq, dblSq, 0);
                                }
                            }
                        }
                    }
                    for (let dci = -1; dci <= 1; dci += 2) {
                        const nc = c + dci;
                        if (nc < 0 || nc >= 8) continue;
                        const capSq = nr * 8 + nc;
                        const tp = b[capSq];
                        if (tp !== 0 && (tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                            if (nr === promoRank) {
                                outBuf[cnt++] = packMove(sq, capSq, QUEEN);
                                outBuf[cnt++] = packMove(sq, capSq, ROOK);
                                outBuf[cnt++] = packMove(sq, capSq, BISHOP);
                                outBuf[cnt++] = packMove(sq, capSq, KNIGHT);
                            } else {
                                outBuf[cnt++] = packMove(sq, capSq, 0);
                            }
                        } else if (capSq === epSq && tp === 0 && b[r * 8 + nc] === oppPawn) {
                            outBuf[cnt++] = packMove(sq, capSq, 0);
                        }
                    }
                }
            } else if (type === KNIGHT) {
                for (let i = 0; i < 8; i++) {
                    const nr = r + KNIGHT_OFFSETS[i][0];
                    const nc = c + KNIGHT_OFFSETS[i][1];
                    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
                    const tSq = nr * 8 + nc;
                    const tp = b[tSq];
                    if (tp === 0 || ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing)) {
                        outBuf[cnt++] = packMove(sq, tSq, 0);
                    }
                }
            } else if (type === BISHOP || type === ROOK || type === QUEEN) {
                const startD = (type === ROOK) ? 4 : 0;
                const endD = (type === BISHOP) ? 4 : 8;
                for (let d = startD; d < endD; d++) {
                    const dr = ALL_SLIDE_DIRS[d][0];
                    const dc = ALL_SLIDE_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        const tp = b[tSq];
                        if (tp === 0) {
                            outBuf[cnt++] = packMove(sq, tSq, 0);
                        } else {
                            if ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                                outBuf[cnt++] = packMove(sq, tSq, 0);
                            }
                            break;
                        }
                        nr += dr;
                        nc += dc;
                    }
                }
            } else if (type === KING) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
                        const tSq = nr * 8 + nc;
                        const tp = b[tSq];
                        if (tp === 0 || ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing)) {
                            outBuf[cnt++] = packMove(sq, tSq, 0);
                        }
                    }
                }
            }
        }

        const cast = pos.cast;
        if (cast !== 0) {
            if (isW) {
                if ((cast & 1) && b[60] === WK && b[63] === WR && b[61] === 0 && b[62] === 0) {
                    if (!isSquareAttackedFast(pos, 60, -1) && !isSquareAttackedFast(pos, 61, -1) && !isSquareAttackedFast(pos, 62, -1)) {
                        outBuf[cnt++] = packMove(60, 62, 0);
                    }
                }
                if ((cast & 2) && b[60] === WK && b[56] === WR && b[59] === 0 && b[58] === 0 && b[57] === 0) {
                    if (!isSquareAttackedFast(pos, 60, -1) && !isSquareAttackedFast(pos, 59, -1) && !isSquareAttackedFast(pos, 58, -1)) {
                        outBuf[cnt++] = packMove(60, 58, 0);
                    }
                }
            } else {
                if ((cast & 4) && b[4] === BK && b[7] === BR && b[5] === 0 && b[6] === 0) {
                    if (!isSquareAttackedFast(pos, 4, 1) && !isSquareAttackedFast(pos, 5, 1) && !isSquareAttackedFast(pos, 6, 1)) {
                        outBuf[cnt++] = packMove(4, 6, 0);
                    }
                }
                if ((cast & 8) && b[4] === BK && b[0] === BR && b[3] === 0 && b[2] === 0 && b[1] === 0) {
                    if (!isSquareAttackedFast(pos, 4, 1) && !isSquareAttackedFast(pos, 3, 1) && !isSquareAttackedFast(pos, 2, 1)) {
                        outBuf[cnt++] = packMove(4, 2, 0);
                    }
                }
            }
        }

        return cnt;
    }

    function genCapturesFast(pos) {
        const b = pos.b;
        const side = pos.turn;
        const isW = (side === 1);
        const oppSide = -side;
        const pDir = isW ? -1 : 1;
        const promoRank = isW ? 0 : 7;
        const epSq = pos.epSq;
        const oppPawn = -side * PAWN;
        const oppKing = -side * KING;
        const captures = [];

        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0 || (code > 0 ? 1 : -1) !== side) continue;
            const type = code > 0 ? code : -code;
            const r = sq >> 3;
            const c = sq & 7;

            if (type === PAWN) {
                const nr = r + pDir;
                if (nr >= 0 && nr < 8) {
                    if (nr === promoRank) {
                        const fwdSq = nr * 8 + c;
                        if (b[fwdSq] === 0) {
                            captures.push({ m: packMove(sq, fwdSq, QUEEN), delta: 800, mvvLva: 8000 });
                            captures.push({ m: packMove(sq, fwdSq, KNIGHT), delta: 200, mvvLva: 2000 });
                        }
                    }
                    for (let dci = -1; dci <= 1; dci += 2) {
                        const nc = c + dci;
                        if (nc < 0 || nc >= 8) continue;
                        const capSq = nr * 8 + nc;
                        const tp = b[capSq];
                        if (tp !== 0 && (tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                            const vVal = TYPE_VALUES[tp > 0 ? tp : -tp];
                            if (nr === promoRank) {
                                captures.push({ m: packMove(sq, capSq, QUEEN), delta: vVal + 800, mvvLva: (vVal + 800) * 10 - LVA_ORDER[PAWN] });
                                captures.push({ m: packMove(sq, capSq, KNIGHT), delta: vVal + 200, mvvLva: (vVal + 200) * 10 - LVA_ORDER[PAWN] });
                            } else {
                                captures.push({ m: packMove(sq, capSq, 0), delta: vVal, mvvLva: vVal * 10 - LVA_ORDER[PAWN] });
                            }
                        } else if (capSq === epSq && tp === 0 && b[r * 8 + nc] === oppPawn) {
                            captures.push({ m: packMove(sq, capSq, 0), delta: 100, mvvLva: 100 * 10 - LVA_ORDER[PAWN] });
                        }
                    }
                }
            } else if (type === KNIGHT) {
                for (let i = 0; i < 8; i++) {
                    const nr = r + KNIGHT_OFFSETS[i][0];
                    const nc = c + KNIGHT_OFFSETS[i][1];
                    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
                    const tSq = nr * 8 + nc;
                    const tp = b[tSq];
                    if (tp !== 0 && (tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                        const vVal = TYPE_VALUES[tp > 0 ? tp : -tp];
                        captures.push({ m: packMove(sq, tSq, 0), delta: vVal, mvvLva: vVal * 10 - LVA_ORDER[KNIGHT] });
                    }
                }
            } else if (type === BISHOP || type === ROOK || type === QUEEN) {
                const startD = (type === ROOK) ? 4 : 0;
                const endD = (type === BISHOP) ? 4 : 8;
                const aOrder = LVA_ORDER[type];
                for (let d = startD; d < endD; d++) {
                    const dr = ALL_SLIDE_DIRS[d][0];
                    const dc = ALL_SLIDE_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        const tp = b[tSq];
                        if (tp !== 0) {
                            if ((tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                                const vVal = TYPE_VALUES[tp > 0 ? tp : -tp];
                                captures.push({ m: packMove(sq, tSq, 0), delta: vVal, mvvLva: vVal * 10 - aOrder });
                            }
                            break;
                        }
                        nr += dr;
                        nc += dc;
                    }
                }
            } else if (type === KING) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
                        const tSq = nr * 8 + nc;
                        const tp = b[tSq];
                        if (tp !== 0 && (tp > 0 ? 1 : -1) === oppSide && tp !== oppKing) {
                            const vVal = TYPE_VALUES[tp > 0 ? tp : -tp];
                            captures.push({ m: packMove(sq, tSq, 0), delta: vVal, mvvLva: vVal * 10 - LVA_ORDER[KING] });
                        }
                    }
                }
            }
        }
        return captures;
    }

    function canPieceAttackSquareGeom(ptype, turn, r, c, sqR, sqC) {
        if (ptype === 'p') {
            const pDir = (turn === 'w') ? -1 : 1;
            return (r + pDir === sqR) && (Math.abs(c - sqC) === 1);
        }
        if (ptype === 'n') {
            const dr = Math.abs(r - sqR), dc = Math.abs(c - sqC);
            return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
        }
        if (ptype === 'b') {
            return Math.abs(r - sqR) === Math.abs(c - sqC);
        }
        if (ptype === 'r') {
            return r === sqR || c === sqC;
        }
        if (ptype === 'q') {
            return r === sqR || c === sqC || Math.abs(r - sqR) === Math.abs(c - sqC);
        }
        return false;
    }

    function canTypeAttackGeomFast(type, sideTurn, r, c, okR, okC) {
        if (type === PAWN) {
            const pDir = (sideTurn === 1) ? -1 : 1;
            return (r + pDir === okR) && (Math.abs(c - okC) === 1);
        }
        if (type === KNIGHT) {
            const dr = Math.abs(r - okR), dc = Math.abs(c - okC);
            return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
        }
        if (type === BISHOP) return Math.abs(r - okR) === Math.abs(c - okC);
        if (type === ROOK) return r === okR || c === okC;
        if (type === QUEEN) return r === okR || c === okC || Math.abs(r - okR) === Math.abs(c - okC);
        return false;
    }

    function genQuietChecksFast(pos, undo) {
        const side = pos.turn;
        const oppSide = -side;
        const okSq = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
        if (okSq === -1) return [];
        const okR = okSq >> 3;
        const okC = okSq & 7;
        const b = pos.b;
        const pDir = (side === 1) ? -1 : 1;
        const startRank = (side === 1) ? 6 : 1;
        const checks = [];

        function tryCandidate(fromSq, toSq, type, alignedFrom) {
            const nr = toSq >> 3;
            const nc = toSq & 7;
            if (!alignedFrom && !canTypeAttackGeomFast(type, side, nr, nc, okR, okC)) {
                return;
            }
            const m = packMove(fromSq, toSq, 0);
            makeMoveFast(pos, m, undo);
            const selfKingSq = (side === 1) ? pos.wKingSq : pos.bKingSq;
            if (selfKingSq !== -1 && !isSquareAttackedFast(pos, selfKingSq, oppSide)) {
                if (isSquareAttackedFast(pos, okSq, side)) {
                    const attacked = isSquareAttackedFast(pos, toSq, oppSide);
                    const defended = isSquareAttackedFast(pos, toSq, side);
                    const safetyScore = (!attacked ? 200 : (defended ? 100 : -TYPE_VALUES[type]));
                    checks.push({ m, safetyScore });
                }
            }
            unmakeMoveFast(pos, m, undo);
        }

        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0 || (code > 0 ? 1 : -1) !== side) continue;
            const type = code > 0 ? code : -code;
            const r = sq >> 3;
            const c = sq & 7;
            const alignedFrom = (r === okR || c === okC || Math.abs(r - okR) === Math.abs(c - okC));

            if (type === PAWN) {
                const nr = r + pDir;
                if (nr > 0 && nr < 7 && b[nr * 8 + c] === 0) {
                    tryCandidate(sq, nr * 8 + c, PAWN, alignedFrom);
                    if (r === startRank) {
                        const nnr = r + 2 * pDir;
                        if (nnr >= 0 && nnr < 8 && b[nnr * 8 + c] === 0) {
                            tryCandidate(sq, nnr * 8 + c, PAWN, alignedFrom);
                        }
                    }
                }
            } else if (type === KNIGHT) {
                for (let i = 0; i < 8; i++) {
                    const nr = r + KNIGHT_OFFSETS[i][0];
                    const nc = c + KNIGHT_OFFSETS[i][1];
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === 0) {
                        tryCandidate(sq, nr * 8 + nc, KNIGHT, alignedFrom);
                    }
                }
            } else if (type === BISHOP || type === ROOK || type === QUEEN) {
                const startD = (type === ROOK) ? 4 : 0;
                const endD = (type === BISHOP) ? 4 : 8;
                for (let d = startD; d < endD; d++) {
                    const dr = ALL_SLIDE_DIRS[d][0];
                    const dc = ALL_SLIDE_DIRS[d][1];
                    let nr = r + dr, nc = c + dc;
                    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const tSq = nr * 8 + nc;
                        if (b[tSq] !== 0) break;
                        tryCandidate(sq, tSq, type, alignedFrom);
                        nr += dr;
                        nc += dc;
                    }
                }
            } else if (type === KING && alignedFrom) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === 0) {
                            tryCandidate(sq, nr * 8 + nc, KING, true);
                        }
                    }
                }
            }
        }

        if (checks.length > 1) {
            checks.sort((a, b) => b.safetyScore - a.safetyScore);
        }
        return checks;
    }

    function quiesceFast(pos, alpha, beta, qPly, stackPly, undoStack, onNode = null, tt = null) {
        if (onNode && onNode()) return 0;

        const side = pos.turn;
        const oppSide = -side;
        const inCheck = isKingInCheckFast(pos, side);

        if (qPly >= 16 || stackPly >= 120) {
            if (inCheck) {
                const legals = genLegalMovesFast(pos, undoStack[stackPly]);
                if (legals.length === 0) return -(MATE_CP - stackPly);
            }
            return evaluateBoardFast(pos);
        }

        const origAlpha = alpha;
        const isPvNode = (beta - alpha > 1);
        const qDepth = (qPly === 0) ? 0 : -1;

        let ttH1 = 0;
        let ttH2 = 0;
        let qTtMove = 0;
        if (tt) {
            const epIdx = (pos.epSq !== -1) ? (pos.epSq & 7) : 8;
            ttH1 = (pos.repH1 ^ Z_CAST_LO[pos.cast] ^ Z_EP_LO[epIdx]) >>> 0;
            ttH2 = (pos.repH2 ^ Z_CAST_HI[pos.cast] ^ Z_EP_HI[epIdx]) >>> 0;
            if (tt.isFlat) {
                const tIdx = ttH1 & TT_MASK;
                const fg = tt.flagGen[tIdx];
                const tFlag = fg & 3;
                if (tFlag !== 0 && tt.keyLo[tIdx] === ttH1 && tt.keyHi[tIdx] === ttH2) {
                    qTtMove = tt.move[tIdx];
                    if (!isPvNode && tt.depth[tIdx] >= qDepth) {
                        let tScore = tt.score[tIdx];
                        if (tScore >= MATE_THRESHOLD) tScore -= stackPly;
                        else if (tScore <= -MATE_THRESHOLD) tScore += stackPly;
                        if (tFlag === TT_FLAG_EXACT) return tScore;
                        if (tFlag === TT_FLAG_LOWER && tScore >= beta) return tScore;
                        if (tFlag === TT_FLAG_UPPER && tScore <= alpha) return tScore;
                    }
                }
            } else {
                const ttKey = ((ttH2 & 0x1fffff) * 4294967296) + ttH1;
                const ttEntry = tt.get(ttKey);
                if (ttEntry && ttEntry.lock === ttH2) {
                    qTtMove = ttEntry.bestMove || 0;
                    const eDepth = (ttEntry.depth !== undefined) ? ttEntry.depth : 0;
                    if (!isPvNode && eDepth >= qDepth) {
                        let tScore = ttEntry.score;
                        if (tScore >= MATE_THRESHOLD) tScore -= stackPly;
                        else if (tScore <= -MATE_THRESHOLD) tScore += stackPly;
                        if (ttEntry.flag === 0) return tScore;
                        if (ttEntry.flag === 1 && tScore >= beta) return tScore;
                        if (ttEntry.flag === 2 && tScore <= alpha) return tScore;
                    }
                }
            }
        }

        let bestScore = -INF_CP;
        let standPat = -INF_CP;
        if (!inCheck) {
            standPat = evaluateBoardFast(pos);
            bestScore = standPat;
            if (standPat >= beta) {
                if (tt && !(onNode && onNode(true))) {
                    storeTT(tt, ttH1, ttH2, qDepth, standPat, origAlpha, beta, stackPly, 0);
                }
                return standPat;
            }
            if (standPat > alpha) alpha = standPat;
        }

        const undo = undoStack[stackPly];
        let bestQMove = 0;

        if (inCheck) {
            const legals = genLegalMovesFast(pos, undo);
            if (legals.length === 0) return -(MATE_CP - stackPly);
            const b = pos.b;
            const scored = new Array(legals.length);
            for (let i = 0; i < legals.length; i++) {
                const m = legals[i];
                if (qTtMove !== 0 && m === qTtMove) {
                    scored[i] = { score: 1000000, m };
                    continue;
                }
                const cap = b[(m >> 6) & 63];
                const moved = b[m & 63];
                const vVal = cap !== 0 ? TYPE_VALUES[cap > 0 ? cap : -cap] : 0;
                const aOrd = moved !== 0 ? LVA_ORDER[moved > 0 ? moved : -moved] : 0;
                scored[i] = { score: vVal * 10 - aOrd, m };
            }
            scored.sort((a, bMove) => bMove.score - a.score);
            for (let i = 0; i < scored.length; i++) {
                const m = scored[i].m;
                makeMoveFast(pos, m, undo);
                const score = -quiesceFast(pos, -beta, -alpha, qPly + 1, stackPly + 1, undoStack, onNode, tt);
                unmakeMoveFast(pos, m, undo);
                if (onNode && onNode(true)) return 0;
                if (score > bestScore) {
                    bestScore = score;
                    bestQMove = m;
                    if (score > alpha) alpha = score;
                    if (score >= beta) {
                        if (tt) storeTT(tt, ttH1, ttH2, qDepth, score, origAlpha, beta, stackPly, m);
                        return score;
                    }
                }
            }
            if (tt) storeTT(tt, ttH1, ttH2, qDepth, bestScore, origAlpha, beta, stackPly, bestQMove);
            return bestScore;
        }

        const caps = genCapturesFast(pos);
        if (caps.length > 0) {
            const b = pos.b;
            for (let i = 0; i < caps.length; i++) {
                const c = caps[i];
                const promoType = (c.m >> 12) & 7;
                const isPromo = promoType !== 0;
                const toSq = (c.m >> 6) & 63;
                const cap = b[toSq];
                const moved = b[c.m & 63];
                const vVal = cap !== 0 ? TYPE_VALUES[cap > 0 ? cap : -cap] : 100;
                const aVal = moved !== 0 ? TYPE_VALUES[moved > 0 ? moved : -moved] : 100;
                const see = (!isPromo && vVal < aVal) ? seeCpFast(pos, c.m) : 0;
                c.see = see;
                c.isPromo = isPromo;
                let s = isPromo
                    ? (2000000 + c.mvvLva)
                    : (see >= 0 ? (1000000 + c.mvvLva) : (see * 16 + c.mvvLva));
                if (qTtMove !== 0 && c.m === qTtMove) s += 3000000;
                c.sortScore = s;
            }
            caps.sort((a, bMove) => bMove.sortScore - a.sortScore);
            for (let i = 0; i < caps.length; i++) {
                const c = caps[i];
                if (!c.isPromo && c.see < 0) continue;
                if (!c.isPromo && Math.abs(alpha) < MATE_THRESHOLD && standPat + c.delta + 200 < alpha) continue;
                makeMoveFast(pos, c.m, undo);
                const selfKingSq = (side === 1) ? pos.wKingSq : pos.bKingSq;
                if (selfKingSq === -1 || isSquareAttackedFast(pos, selfKingSq, oppSide)) {
                    unmakeMoveFast(pos, c.m, undo);
                    continue;
                }
                const score = -quiesceFast(pos, -beta, -alpha, qPly + 1, stackPly + 1, undoStack, onNode, tt);
                unmakeMoveFast(pos, c.m, undo);
                if (onNode && onNode(true)) return 0;
                if (score > bestScore) {
                    bestScore = score;
                    bestQMove = c.m;
                    if (score > alpha) alpha = score;
                    if (score >= beta) {
                        if (tt) storeTT(tt, ttH1, ttH2, qDepth, score, origAlpha, beta, stackPly, c.m);
                        return score;
                    }
                }
            }
        }

        // Only search quiet checks at qPly === 0 to keep quiescence tree tight and TT depth aligned
        if (qPly === 0 && standPat + 950 >= alpha) {
            const quietChecks = genQuietChecksFast(pos, undo);
            for (let i = 0; i < quietChecks.length; i++) {
                const qc = quietChecks[i];
                makeMoveFast(pos, qc.m, undo);
                const score = -quiesceFast(pos, -beta, -alpha, qPly + 1, stackPly + 1, undoStack, onNode, tt);
                unmakeMoveFast(pos, qc.m, undo);
                if (onNode && onNode(true)) return 0;
                if (score > bestScore) {
                    bestScore = score;
                    bestQMove = qc.m;
                    if (score > alpha) alpha = score;
                    if (score >= beta) {
                        if (tt) storeTT(tt, ttH1, ttH2, qDepth, score, origAlpha, beta, stackPly, qc.m);
                        return score;
                    }
                }
            }
        }

        if (tt && !(onNode && onNode(true))) {
            storeTT(tt, ttH1, ttH2, qDepth, bestScore, origAlpha, beta, stackPly, bestQMove);
        }
        return bestScore;
    }

    // ---- Public 8x8 Helper Wrappers (Zero-breaking API compatibility) ----

    function findKingPos(board, color) {
        const kChar = (color === 'w') ? 'K' : 'k';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === kChar) return { r, c };
            }
        }
        return { r: -1, c: -1 };
    }

    function isPassedPawn(board, r, c, isW) {
        const p = board[r][c];
        if (!p || p !== (isW ? 'P' : 'p')) return false;
        const ownP = isW ? 'P' : 'p';
        const oppP = isW ? 'p' : 'P';
        const filesToCheck = [];
        if (c > 0) filesToCheck.push(c - 1);
        filesToCheck.push(c);
        if (c < 7) filesToCheck.push(c + 1);

        if (isW) {
            for (let checkR = 0; checkR < r; checkR++) {
                if (board[checkR][c] === ownP) return false;
                for (let i = 0; i < filesToCheck.length; i++) {
                    if (board[checkR][filesToCheck[i]] === oppP) return false;
                }
            }
        } else {
            for (let checkR = r + 1; checkR < 8; checkR++) {
                if (board[checkR][c] === ownP) return false;
                for (let i = 0; i < filesToCheck.length; i++) {
                    if (board[checkR][filesToCheck[i]] === oppP) return false;
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

        const pSourceDir = isW ? 1 : -1;
        for (const dc of [-1, 1]) {
            const nr = sqR + pSourceDir, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === pChar) return true;
        }

        for (const [dr, dc] of KNIGHT_OFFSETS) {
            const nr = sqR + dr, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === nChar) return true;
        }

        for (const [dr, dc] of ORTH_DIRS) {
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

        for (const [dr, dc] of DIAG_DIRS) {
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
        const { r: kr, c: kc } = findKingPos(board, turn);
        if (kr === -1) return true;
        return isSquareAttacked(board, kr, kc, turn === 'w' ? 'b' : 'w');
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

    function generateCaptures(board, turn, epSquare = null) {
        const pos = boardToFast(board, turn, '-', epSquare);
        const fastCaps = genCapturesFast(pos);
        const out = new Array(fastCaps.length);
        for (let i = 0; i < fastCaps.length; i++) {
            const fc = fastCaps[i];
            const fromSq = fc.m & 63;
            const toSq = (fc.m >> 6) & 63;
            const promoType = (fc.m >> 12) & 7;
            const item = {
                fr: fromSq >> 3,
                fc: fromSq & 7,
                tr: toSq >> 3,
                tc: toSq & 7,
                victimVal: fc.delta,
                mvvLva: fc.mvvLva
            };
            if (promoType) item.promotion = PROMO_TYPE_TO_CHAR[promoType] || 'q';
            out[i] = item;
        }
        return out;
    }

    function generateQuietChecks(board, turn) {
        const pos = boardToFast(board, turn, '-', null);
        const fastChecks = genQuietChecksFast(pos, SHARED_UNDO[0]);
        const out = new Array(fastChecks.length);
        for (let i = 0; i < fastChecks.length; i++) {
            const qc = fastChecks[i];
            const fromSq = qc.m & 63;
            const toSq = (qc.m >> 6) & 63;
            const fr = fromSq >> 3, fc = fromSq & 7;
            const tr = toSq >> 3, tc = toSq & 7;
            makeMoveFast(pos, qc.m, SHARED_UNDO[0]);
            const nb = fastToBoard8x8(pos);
            unmakeMoveFast(pos, qc.m, SHARED_UNDO[0]);
            out[i] = { fr, fc, tr, tc, nb, safetyScore: qc.safetyScore };
        }
        return out;
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
                    const type = p.toLowerCase();
                    let val = PIECE_VALUES[type] || 0;
                    const isW = (p === p.toUpperCase());
                    if (p === 'K') {
                        wKr = r; wKc = c;
                    } else if (p === 'k') {
                        bKr = r; bKc = c;
                    } else {
                        nonKingMaterial += val;
                    }
                    if (type === 'p' && isPassedPawn(board, r, c, isW)) {
                        const adv = isW ? (7 - r) : r;
                        if (adv >= 3) {
                            val += [0, 0, 0, 20, 50, 110, 250, 0][adv] || 0;
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

    function evaluateBoardTactical(board) {
        let total = 0;
        let nonKingMaterial = 0;
        let wKr = -1, wKc = -1;
        let bKr = -1, bKc = -1;
        let wBishops = 0, bBishops = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p) continue;
                const isW = (p === p.toUpperCase());
                const type = p.toLowerCase();
                let val = PIECE_VALUES[type] || 0;
                const pstR = isW ? r : 7 - r;

                if (type === 'k') {
                    if (isW) { wKr = r; wKc = c; }
                    else { bKr = r; bKc = c; }
                    continue;
                }

                nonKingMaterial += val;

                if (type === 'p') {
                    val += PST_PAWN[pstR][c];
                    if (isPassedPawn(board, r, c, isW)) {
                        const adv = isW ? (7 - r) : r;
                        if (adv >= 3) {
                            val += [0, 0, 0, 20, 50, 110, 250, 0][adv] || 0;
                        }
                    }
                } else if (type === 'n') {
                    val += PST_KNIGHT[pstR][c];
                } else if (type === 'b') {
                    val += PST_BISHOP[pstR][c];
                    if (isW) wBishops++; else bBishops++;
                } else if (type === 'r') {
                    val += PST_ROOK[pstR][c];
                } else if (type === 'q') {
                    val += PST_QUEEN[pstR][c];
                }

                total += isW ? val : -val;
            }
        }

        if (wBishops >= 2) total += 30;
        if (bBishops >= 2) total -= 30;

        if (nonKingMaterial <= 1600) {
            if (wKr !== -1) {
                const wCenterDist = Math.max(Math.abs(wKr - 3.5), Math.abs(wKc - 3.5));
                total += Math.round((3.5 - wCenterDist) * 15);
            }
            if (bKr !== -1) {
                const bCenterDist = Math.max(Math.abs(bKr - 3.5), Math.abs(bKc - 3.5));
                total -= Math.round((3.5 - bCenterDist) * 15);
            }
        } else {
            if (wKr !== -1) total += PST_KING_MG[wKr][wKc];
            if (bKr !== -1) total -= PST_KING_MG[7 - bKr][bKc];
        }

        return total;
    }

    function quiesce(board, turn, alpha, beta, depth = 4, qPly = 0, epSquare = null) {
        const pos = boardToFast(board, turn, '-', epSquare);
        const res = quiesceFast(pos, alpha, beta, qPly, 0, SHARED_UNDO, null, null);
        return res > beta ? beta : (res < alpha ? alpha : res);
    }

    function getLegalMovesForBoard(board, turn, castling = '-', epSquare = null) {
        const pos = boardToFast(board, turn, castling, epSquare);
        const fastMoves = genLegalMovesFast(pos, SHARED_UNDO[0]);
        const out = new Array(fastMoves.length);
        for (let i = 0; i < fastMoves.length; i++) {
            out[i] = unpackMove(fastMoves[i], null);
        }
        return out;
    }

    function findInstantMateFast(pos, legals, undoA, undoB) {
        const oppSide = -pos.turn;
        for (let i = 0; i < legals.length; i++) {
            const m = legals[i];
            makeMoveFast(pos, m, undoA);
            const okSq = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
            if (okSq !== -1 && isSquareAttackedFast(pos, okSq, -oppSide)) {
                const oppMoves = genLegalMovesFast(pos, undoB);
                if (oppMoves.length === 0) {
                    unmakeMoveFast(pos, m, undoA);
                    return m;
                }
            }
            unmakeMoveFast(pos, m, undoA);
        }
        return null;
    }

    function findInstantMateMove(board, turn, legalMoves) {
        const pos = boardToFast(board, turn, '-', null);
        const undoA = SHARED_UNDO[0];
        const undoB = SHARED_UNDO[1];
        for (let i = 0; i < legalMoves.length; i++) {
            const mObj = legalMoves[i];
            const packed = moveObjToPacked(board, mObj);
            makeMoveFast(pos, packed, undoA);
            const oppSide = pos.turn;
            const okSq = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
            if (okSq !== -1 && isSquareAttackedFast(pos, okSq, -oppSide)) {
                const oppMoves = genLegalMovesFast(pos, undoB);
                if (oppMoves.length === 0) {
                    unmakeMoveFast(pos, packed, undoA);
                    return unpackMove(packed, pos.b);
                }
            }
            unmakeMoveFast(pos, packed, undoA);
        }
        return null;
    }

    function findMateInTwoMove(board, turn, legalMoves, castling = '-', epSquare = null) {
        const pos = boardToFast(board, turn, castling, epSquare);
        const undoRoot = SHARED_UNDO[0];
        const undoOpp = SHARED_UNDO[1];
        const undoM2 = SHARED_UNDO[2];
        const undoRefute = SHARED_UNDO[3];
        const oppSide = -pos.turn;

        // Partition into checks first, then quiet moves / captures so obvious forcing mates return instantly
        const checksFirst = [];
        const nonChecks = [];
        for (let i = 0; i < legalMoves.length; i++) {
            const packed = moveObjToPacked(board, legalMoves[i]);
            makeMoveFast(pos, packed, undoRoot);
            const oppKingSq = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
            const givesCheck = (oppKingSq !== -1 && isSquareAttackedFast(pos, oppKingSq, pos.turn * -1));
            unmakeMoveFast(pos, packed, undoRoot);
            if (givesCheck) checksFirst.push(packed);
            else nonChecks.push(packed);
        }

        const orderedCandidates = checksFirst.concat(nonChecks);
        for (let i = 0; i < orderedCandidates.length; i++) {
            const mPacked = orderedCandidates[i];
            makeMoveFast(pos, mPacked, undoRoot);
            const oppMoves = genLegalMovesFast(pos, undoOpp);
            if (oppMoves.length === 0) {
                // Already mate in 1 or stalemate -> skip
                unmakeMoveFast(pos, mPacked, undoRoot);
                continue;
            }

            // Order opponent replies so king moves / captures / checks refute false quiet mate-in-2 on iteration 0
            if (oppMoves.length > 1) {
                const okSq = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
                const b = pos.b;
                oppMoves.sort((a, bMove) => {
                    const aCap = b[(a >> 6) & 63] !== 0 ? 2 : 0;
                    const bCap = b[(bMove >> 6) & 63] !== 0 ? 2 : 0;
                    const aKing = ((a & 63) === okSq) ? 1 : 0;
                    const bKing = ((bMove & 63) === okSq) ? 1 : 0;
                    return (bCap + bKing) - (aCap + aKing);
                });
            }

            let allLeadToMate = true;
            for (let j = 0; j < oppMoves.length; j++) {
                const om = oppMoves[j];
                makeMoveFast(pos, om, undoOpp);
                const secondMoves = genLegalMovesFast(pos, undoM2);
                const mateMove = findInstantMateFast(pos, secondMoves, undoM2, undoRefute);
                unmakeMoveFast(pos, om, undoOpp);
                if (!mateMove) {
                    allLeadToMate = false;
                    break;
                }
            }
            unmakeMoveFast(pos, mPacked, undoRoot);

            if (allLeadToMate) {
                return unpackMove(mPacked, pos.b);
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

        const pSourceDir = isW ? 1 : -1;
        for (const dc of [-1, 1]) {
            const nr = sqR + pSourceDir, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === pChar) return 100;
        }

        for (const [dr, dc] of KNIGHT_OFFSETS) {
            const nr = sqR + dr, nc = sqC + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === nChar) return 300;
        }

        let cheapest = 9999;
        for (const [dr, dc] of DIAG_DIRS) {
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

        for (const [dr, dc] of ORTH_DIRS) {
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

    function sumMaterialForTurnFast(pos, forTurn) {
        const b = pos.b;
        let total = 0;
        for (let sq = 0; sq < 64; sq++) {
            const code = b[sq];
            if (code === 0) continue;
            const type = code > 0 ? code : -code;
            if (type === KING) continue;
            const v = TYPE_VALUES[type];
            total += ((code > 0 ? 1 : -1) === forTurn) ? v : -v;
        }
        return total;
    }

    function checkMoveTacticalBlunder(board, turn, m, castling = '-', epSquare = null) {
        const oppTurn = (turn === 'w' ? 'b' : 'w');
        const fr = m.fromR, fc = m.fromC, tr = m.toR, tc = m.toC;
        const p = board[fr][fc];
        if (!p) return null;
        const cap = board[tr][tc];
        const epSqIdx = normalizeEpSquareInput(epSquare);
        const isEpCap = (p.toLowerCase() === 'p' && fc !== tc && !cap && (epSqIdx === -1 || epSqIdx === (tr * 8 + tc)));
        const capVal = cap ? (PIECE_VALUES[cap.toLowerCase()] || 0) : (isEpCap ? 100 : 0);

        const nb = simulateMove(board, fr, fc, tr, tc, m.promotion, epSquare);
        const movedAfter = nb[tr][tc] || p;
        // Evaluate loss using post-move piece value (catches hanging promoted queens)
        const postVal = PIECE_VALUES[movedAfter.toLowerCase()] || 0;

        // 1. Hanging piece & bad trade check
        if (movedAfter.toLowerCase() !== 'k') {
            const cheapEnemy = getCheapestAttacker(nb, tr, tc, oppTurn);
            if (cheapEnemy !== null) {
                const isDef = isSquareAttacked(nb, tr, tc, turn);
                if (!isDef) {
                    const netLoss = postVal - capVal;
                    if (netLoss > 150) return 'hanging_piece';
                } else {
                    const tradeLoss = postVal - cheapEnemy - capVal;
                    if (tradeLoss > 150) return 'bad_trade';
                }
            }
        }

        const givesCheck = isKingInCheck(nb, oppTurn);

        // 2. Abandoned piece check (skipped if move delivers check, and compares value against capVal)
        const isW = (turn === 'w');
        if (!givesCheck) {
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (r === tr && c === tc) continue;
                    const fp = nb[r][c];
                    if (fp && (fp === fp.toUpperCase()) === isW && ['q', 'r', 'b', 'n'].includes(fp.toLowerCase())) {
                        const fpVal = PIECE_VALUES[fp.toLowerCase()] || 0;
                        if (fpVal - capVal > 150) {
                            if (isSquareAttacked(nb, r, c, oppTurn) && !isSquareAttacked(nb, r, c, turn)) {
                                if (isSquareAttacked(board, r, c, turn)) return 'abandons_piece';
                            }
                        }
                    }
                }
            }
        }

        // 3. Forcing check-skewer / check-fork check using fast net material accounting
        const pos = boardToFast(nb, oppTurn, updateCastlingRights(castling, m, p), (p.toLowerCase() === 'p' && Math.abs(tr - fr) === 2) ? { r: (fr + tr) >> 1, c: fc } : null);
        const turnNum = isW ? 1 : -1;
        const oppNum = -turnNum;
        const undoA = SHARED_UNDO[0];
        const undoB = SHARED_UNDO[1];
        const undoC = SHARED_UNDO[2];
        const matBase = sumMaterialForTurnFast(pos, turnNum);
        const oppLegal = genLegalMovesFast(pos, undoA);

        for (let i = 0; i < oppLegal.length; i++) {
            const om = oppLegal[i];
            makeMoveFast(pos, om, undoA);
            const ourKingSq = (turnNum === 1) ? pos.wKingSq : pos.bKingSq;
            if (ourKingSq !== -1 && isSquareAttackedFast(pos, ourKingSq, oppNum)) {
                const ourReplies = genLegalMovesFast(pos, undoB);
                if (ourReplies.length > 0) {
                    let allRepliesLosePiece = true;
                    for (let j = 0; j < ourReplies.length; j++) {
                        const rep = ourReplies[j];
                        makeMoveFast(pos, rep, undoB);
                        const matAfterRep = sumMaterialForTurnFast(pos, turnNum);
                        const oppFollowups = genLegalMovesFast(pos, undoC);

                        let worstLoss = 0;
                        for (let k = 0; k < oppFollowups.length; k++) {
                            const om2 = oppFollowups[k];
                            const vicCode = pos.b[(om2 >> 6) & 63];
                            if (vicCode === 0) continue;
                            const vicType = vicCode > 0 ? vicCode : -vicCode;
                            if (vicType >= KNIGHT && vicType <= QUEEN) {
                                const vVal = TYPE_VALUES[vicType];
                                const attCode = pos.b[om2 & 63];
                                const aVal = TYPE_VALUES[attCode > 0 ? attCode : -attCode];
                                makeMoveFast(pos, om2, undoC);
                                const sqTo = (om2 >> 6) & 63;
                                const isDefAfter = isSquareAttackedFast(pos, sqTo, turnNum);
                                unmakeMoveFast(pos, om2, undoC);
                                if (!isDefAfter) {
                                    if (vVal > worstLoss) worstLoss = vVal;
                                } else if (vVal - aVal >= 200) {
                                    const net = vVal - aVal;
                                    if (net > worstLoss) worstLoss = net;
                                }
                            }
                        }

                        const netDelta = capVal + (matAfterRep - matBase) - worstLoss;
                        unmakeMoveFast(pos, rep, undoB);

                        if (netDelta > -150) {
                            allRepliesLosePiece = false;
                            break;
                        }
                    }
                    if (allRepliesLosePiece) {
                        unmakeMoveFast(pos, om, undoA);
                        return 'skewer_fork';
                    }
                }
            }
            unmakeMoveFast(pos, om, undoA);
        }

        return null;
    }

    function filterMatingBlunders(board, turn, legalMoves, castling = '-', epSquare = null) {
        if (!legalMoves || legalMoves.length <= 1) return legalMoves;
        const oppTurn = (turn === 'w' ? 'b' : 'w');
        const nonMating = [];
        for (const m of legalMoves) {
            const p = board[m.fromR][m.fromC];
            const nEp = (p && p.toLowerCase() === 'p' && Math.abs(m.toR - m.fromR) === 2)
                ? { r: (m.fromR + m.toR) >> 1, c: m.fromC }
                : null;
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC, m.promotion, epSquare);
            const oppMoves = getLegalMovesForBoard(nb, oppTurn, updateCastlingRights(castling, m, p), nEp);
            if (!findInstantMateMove(nb, oppTurn, oppMoves)) {
                nonMating.push(m);
            }
        }
        return nonMating.length > 0 ? nonMating : legalMoves;
    }

    function filterTacticalBlunders(board, turn, legalMoves, castling = '-', epSquare = null) {
        const pool = filterMatingBlunders(board, turn, legalMoves, castling, epSquare);
        if (!pool || pool.length <= 1) return pool;

        const safeMoves = [];
        for (const m of pool) {
            const blunder = checkMoveTacticalBlunder(board, turn, m, castling, epSquare);
            m.blunder = blunder;
            if (!blunder) safeMoves.push(m);
        }

        return safeMoves.length > 0 ? safeMoves : pool;
    }

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
        let nonPawnMat = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p) continue;
                const t = p.toLowerCase();
                if (t === 'k') continue;
                const v = PIECE_VALUES[t] || 0;
                nonKingMat += v;
                if (t !== 'p') nonPawnMat += v;
            }
        }
        return nonKingMat <= 1600 || nonPawnMat <= 1200;
    }

    function hasNonPawnMaterial(board, turn) {
        const isW = (turn === 'w');
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p) continue;
                if ((p === p.toUpperCase()) !== isW) continue;
                const t = p.toLowerCase();
                if (t === 'n' || t === 'b' || t === 'r' || t === 'q') return true;
            }
        }
        return false;
    }

    function solveElementaryEndgame(board, turn, castling = '-', epSquare = null) {
        const isW = (turn === 'w');
        const oppTurn = isW ? 'b' : 'w';
        const legal = getLegalMovesForBoard(board, turn, castling, epSquare);
        if (!legal || legal.length === 0) return null;

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
            const pMoved = board[m.fromR][m.fromC];
            const nEp = (pMoved && pMoved.toLowerCase() === 'p' && Math.abs(m.toR - m.fromR) === 2)
                ? { r: (m.fromR + m.toR) >> 1, c: m.fromC }
                : null;
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC, m.promotion, epSquare);
            const oppMoves = getLegalMovesForBoard(nb, oppTurn, '-', nEp);

            if (oppMoves.length === 0) {
                if (isKingInCheck(nb, oppTurn)) {
                    const isPromo = pMoved && pMoved.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
                    const promoChar = isPromo ? (m.promotion ? m.promotion.toLowerCase() : 'q') : null;
                    return { ...m, promotion: promoChar, isMate: true, isEndgame: true };
                }
                continue; // Stalemate prevention
            }

            // Check safety of ALL friendly pieces (not just pMoved)
            let hangsAnyPiece = false;
            let worstOppEdgeDist = 0;
            let sumOppEdgeDist = 0;

            for (const om of oppMoves) {
                const capTarget = nb[om.toR][om.toC];
                if (capTarget) {
                    const afterCap = simulateMove(nb, om.fromR, om.fromC, om.toR, om.toC, om.promotion, nEp);
                    const vicVal = PIECE_VALUES[capTarget.toLowerCase()] || 0;
                    const attChar = nb[om.fromR][om.fromC];
                    const attVal = PIECE_VALUES[(attChar || '').toLowerCase()] || 0;
                    if (!isSquareAttacked(afterCap, om.toR, om.toC, turn) || vicVal > attVal) {
                        hangsAnyPiece = true;
                        break;
                    }
                }
                const movingOpp = nb[om.fromR][om.fromC];
                const postOkR = (movingOpp === okChar) ? om.toR : okR;
                const postOkC = (movingOpp === okChar) ? om.toC : okC;
                const dEdge = Math.min(postOkR, 7 - postOkR, postOkC, 7 - postOkC);
                if (dEdge > worstOppEdgeDist) worstOppEdgeDist = dEdge;
                sumOppEdgeDist += dEdge;
            }
            if (hangsAnyPiece) continue;

            const avgOppEdgeDist = sumOppEdgeDist / oppMoves.length;
            const nFkR = (m.fromR === fkR && m.fromC === fkC) ? m.toR : fkR;
            const nFkC = (m.fromR === fkR && m.fromC === fkC) ? m.toC : fkC;

            // Evaluate opponent king containment after opponent's possible replies
            const edgeScore = (3.5 - worstOppEdgeDist) * 60.0 + (3.5 - avgOppEdgeDist) * 25.0;
            const kDist = Math.max(Math.abs(nFkR - okR), Math.abs(nFkC - okC));
            const kScore = -(kDist * 14.0);
            const mobScore = -(oppMoves.length * 7.0);
            const checkBonus = isKingInCheck(nb, oppTurn) ? 4.0 : 0.0;

            const total = edgeScore + kScore + mobScore + checkBonus;
            if (total > bestScore) {
                bestScore = total;
                bestMove = m;
            }
        }

        if (bestMove) {
            return withPromotion(board, { ...bestMove, isEndgame: true });
        }
        return null;
    }

    function buildHistoryHashSet(historyKeys) {
        const set = new Set();
        if (!historyKeys) return set;
        const iter = (historyKeys instanceof Set)
            ? historyKeys
            : (Array.isArray(historyKeys) ? historyKeys : []);

        for (const h of iter) {
            if (typeof h !== 'string') continue;
            const parts = h.trim().split(/\s+/);
            const boardStr = parts[0];
            if (!boardStr) continue;
            const turnChar = parts[1] || 'w';
            let h1 = 0;
            let h2 = 0;
            let r = 0;
            let c = 0;
            for (let i = 0; i < boardStr.length; i++) {
                const ch = boardStr[i];
                if (ch === '/') {
                    r++;
                    c = 0;
                    if (r >= 8) break;
                } else if (ch >= '1' && ch <= '8') {
                    c += parseInt(ch, 10);
                } else {
                    const code = CHAR_TO_CODE[ch];
                    if (code && r < 8 && c < 8) {
                        const zIdx = (code + 6) * 64 + (r * 8 + c);
                        h1 = (h1 ^ Z_PIECE_LO[zIdx]) >>> 0;
                        h2 = (h2 ^ Z_PIECE_HI[zIdx]) >>> 0;
                    }
                    c++;
                }
            }
            if (turnChar === 'b') {
                h1 = (h1 ^ Z_TURN_LO) >>> 0;
                h2 = (h2 ^ Z_TURN_HI) >>> 0;
            }
            const repKey = ((h2 & 0x1fffff) * 4294967296) + h1;
            set.add(repKey);
        }
        return set;
    }

    function withPromotion(board, m) {
        if (!m) return null;
        const p = board[m.fromR] ? board[m.fromR][m.fromC] : null;
        const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
        const promo = isPromo ? (m.promotion ? m.promotion.toLowerCase() : 'q') : null;
        return {
            ...m,
            promotion: promo
        };
    }

    function cpToRootScore(cp) {
        if (cp >= MATE_THRESHOLD) {
            return Math.max(8.0, 10.0 - Math.max(0, MATE_CP - cp) * 0.1);
        }
        if (cp <= -MATE_THRESHOLD) {
            return Math.min(-8.0, -10.0 + Math.max(0, MATE_CP + cp) * 0.1);
        }
        return Math.tanh(cp / 400.0);
    }

    function rootScoreToAlphaCp(neededScore) {
        if (neededScore === -Infinity) return -INF_CP;
        if (neededScore >= 8.0) {
            const dist = Math.max(0, Math.round((10.0 - neededScore) * 10));
            return Math.max(2000, MATE_CP - dist - 1);
        }
        if (neededScore >= 0.999999) {
            return MATE_THRESHOLD - 1;
        }
        if (neededScore <= -8.0) {
            return -MATE_CP;
        }
        if (neededScore <= -0.999999) {
            return -MATE_THRESHOLD + 1;
        }
        return Math.floor(400.0 * 0.5 * Math.log((1.0 + neededScore) / (1.0 - neededScore))) - 1;
    }

    function searchRootMoves(params = {}) {
        const startTime = nowMs();
        const board = params.board;
        const turn = params.turn || 'w';
        const rootTurnNum = (turn === 'w') ? 1 : -1;
        const castling = params.castling || '-';
        const epSquare = params.epSquare !== undefined ? params.epSquare : null;
        const maxDepth = Math.max(1, Math.floor(params.maxDepth || 6));
        const rawStartDepth = (typeof params.startDepth === 'number' && Number.isFinite(params.startDepth))
            ? Math.floor(params.startDepth)
            : 1;
        const startDepth = Math.max(1, Math.min(maxDepth, rawStartDepth));
        const timeLimitMs = (typeof params.timeLimitMs === 'number' && params.timeLimitMs > 0)
            ? params.timeLimitMs
            : 5000;
        const minAlphaScore = (typeof params.minAlphaScore === 'number' && Number.isFinite(params.minAlphaScore))
            ? params.minAlphaScore
            : -Infinity;
        const hasMinAlphaCp = (typeof params.minAlphaCp === 'number' && Number.isFinite(params.minAlphaCp));
        const sharedCtrl = (typeof Int32Array !== 'undefined' && params.sharedBuffer instanceof Int32Array && params.sharedBuffer.length >= 2)
            ? params.sharedBuffer
            : null;
        const reuseTT = !!(params.reuseTT || params.persistentTT);

        const pos = boardToFast(board, turn, castling, epSquare);
        const historySet = buildHistoryHashSet(params.historyKeys);
        const undoStack = createUndoStack(128);

        let candidateObjs;
        if (Array.isArray(params.rootMoves)) {
            candidateObjs = params.rootMoves;
        } else {
            const fastRootMoves = genLegalMovesFast(pos, undoStack[0]);
            candidateObjs = fastRootMoves.map(m => unpackMove(m, pos.b));
        }

        if (!candidateObjs || candidateObjs.length === 0) {
            return {
                bestMove: null,
                bestScore: -Infinity,
                bestCp: -INF_CP,
                bestPrior: 0,
                priorBonus: 0,
                blendedScore: -Infinity,
                completedDepth: 0,
                nodes: 0,
                timedOut: false,
                moveResults: []
            };
        }

        const rootPriors = Array.isArray(params.rootPriors) ? params.rootPriors : [];
        const candidates = candidateObjs.map((m, idx) => ({
            packed: moveObjToPacked(board, m),
            move: withPromotion(board, m),
            prior: (typeof rootPriors[idx] === 'number' && Number.isFinite(rootPriors[idx])) ? rootPriors[idx] : 0.0,
            lastScore: 0.0
        }));

        const rootTTInfo = computeTTKeyAndLock(pos);
        let hHashLo = 0;
        let hHashHi = 0;
        for (const rk of historySet) {
            hHashLo = (hHashLo ^ (rk >>> 0)) >>> 0;
            hHashHi = (hHashHi ^ (Math.floor(rk / 4294967296) >>> 0)) >>> 0;
        }
        const historyHash = `${historySet.size}:${hHashLo}:${hHashHi}`;

        let tt;
        let killer1;
        let killer2;
        let historyTable;
        let counterMoveTable;

        if (params.tt instanceof Map) {
            tt = params.tt;
            killer1 = new Int32Array(128);
            killer2 = new Int32Array(128);
            historyTable = new Int32Array(2 * 64 * 64);
            counterMoveTable = new Int32Array(2 * 64 * 64);
        } else if (reuseTT) {
            tt = PERSISTENT_SEARCH_STATE.tt;
            if (
                PERSISTENT_SEARCH_STATE.rootKey !== rootTTInfo.key ||
                PERSISTENT_SEARCH_STATE.rootLock !== rootTTInfo.lock ||
                PERSISTENT_SEARCH_STATE.historyHash !== historyHash
            ) {
                PERSISTENT_SEARCH_STATE.rootKey = rootTTInfo.key;
                PERSISTENT_SEARCH_STATE.rootLock = rootTTInfo.lock;
                PERSISTENT_SEARCH_STATE.historyHash = historyHash;
                tt.flagGen.fill(0);
                tt.gen = 1;
                PERSISTENT_SEARCH_STATE.historyTable.fill(0);
                PERSISTENT_SEARCH_STATE.counterMoveTable.fill(0);
                PERSISTENT_SEARCH_STATE.killer1.fill(0);
                PERSISTENT_SEARCH_STATE.killer2.fill(0);
            } else {
                const nextGen = (tt.gen + 1) & 63;
                tt.gen = nextGen === 0 ? 1 : nextGen;
                if (params.ageHistory !== false) {
                    for (let hi = 0; hi < PERSISTENT_SEARCH_STATE.historyTable.length; hi++) {
                        PERSISTENT_SEARCH_STATE.historyTable[hi] >>= 1;
                    }
                }
            }
            killer1 = PERSISTENT_SEARCH_STATE.killer1;
            killer2 = PERSISTENT_SEARCH_STATE.killer2;
            historyTable = PERSISTENT_SEARCH_STATE.historyTable;
            counterMoveTable = PERSISTENT_SEARCH_STATE.counterMoveTable;
        } else {
            tt = COLD_FLAT_TT;
            tt.flagGen.fill(0);
            tt.gen = 1;
            killer1 = new Int32Array(128);
            killer2 = new Int32Array(128);
            historyTable = new Int32Array(2 * 64 * 64);
            counterMoveTable = new Int32Array(2 * 64 * 64);
        }

        const pathKeys = new Set();

        let nodes = 0;
        let isTimeOut = false;
        let currentDepth = startDepth;
        let completedDepth = 0;

        function onSearchNode(onlyCheck = false) {
            if (!onlyCheck) {
                nodes++;
                if ((nodes & 1023) === 0) {
                    if (sharedCtrl && typeof Atomics !== 'undefined' && Atomics.load(sharedCtrl, 0) !== 0) {
                        isTimeOut = true;
                        return true;
                    }
                    if ((completedDepth > 0 || startDepth > 1) && nowMs() - startTime >= timeLimitMs) {
                        isTimeOut = true;
                    }
                }
            }
            return isTimeOut;
        }

        function isMoveCheckFast(m, okR, okC, okSq, undo) {
            if (okSq === -1) return false;
            const fromSq = m & 63;
            const toSq = (m >> 6) & 63;
            const promoType = (m >> 12) & 7;
            const code = pos.b[fromSq];
            if (code === 0) return false;
            const absType = code > 0 ? code : -code;
            const fromR = fromSq >> 3;
            const fromC = fromSq & 7;
            const toR = toSq >> 3;
            const toC = toSq & 7;

            const alignedFrom = (
                fromR === okR ||
                fromC === okC ||
                Math.abs(fromR - okR) === Math.abs(fromC - okC)
            );
            const isCastling = (absType === KING && Math.abs(toC - fromC) === 2);
            const isEp = (absType === PAWN && fromC !== toC && pos.b[toSq] === 0);
            const destType = promoType || absType;

            if (!alignedFrom && !isCastling && !isEp && !canTypeAttackGeomFast(destType, pos.turn, toR, toC, okR, okC)) {
                return false;
            }

            makeMoveFast(pos, m, undo);
            const givesCheck = isSquareAttackedFast(pos, okSq, -pos.turn);
            unmakeMoveFast(pos, m, undo);
            return givesCheck;
        }

        function addHistory(hIdx, bonus) {
            const clamped = bonus > 400 ? 400 : (bonus < -400 ? -400 : bonus);
            historyTable[hIdx] += clamped - Math.trunc((historyTable[hIdx] * Math.abs(clamped)) / MAX_HIST);
        }

        function recordKiller(ply, m) {
            if (killer1[ply] !== m) {
                killer2[ply] = killer1[ply];
                killer1[ply] = m;
            }
        }

        function negamaxFast(depth, alpha, beta, ply, extCount, allowNull, prevMove = 0) {
            if (onSearchNode()) return 0;
            if (ply >= 120) return evaluateBoardFast(pos);

            // Mate Distance Pruning
            if (ply > 0) {
                const matingVal = MATE_CP - ply;
                if (matingVal < beta) {
                    beta = matingVal;
                    if (alpha >= matingVal) return matingVal;
                }
                const matedVal = -(MATE_CP - ply);
                if (matedVal > alpha) {
                    alpha = matedVal;
                    if (beta <= matedVal) return matedVal;
                }
            }

            const repKey = computeRepKey(pos);

            // Repetition check with mild contempt (never sacrifices material to avoid balanced draws)
            if (ply > 0) {
                if ((allowNull && historySet.has(repKey)) || pathKeys.has(repKey)) {
                    const rootMat = (pos.turn === rootTurnNum)
                        ? evalSimpleMatCp(pos)
                        : -evalSimpleMatCp(pos);
                    const rootScore = (rootMat > 100) ? -25 : (rootMat < -100 ? 15 : 0);
                    return (pos.turn === rootTurnNum) ? rootScore : -rootScore;
                }
            }

            killer1[ply + 1] = 0;
            killer2[ply + 1] = 0;

            const side = pos.turn;
            const oppSide = -side;
            const inCheck = isKingInCheckFast(pos, side);
            const isPvNode = (beta - alpha > 1);

            // Check extension BEFORE TT probe so depth===0 check nodes properly search extended depth
            let effectiveDepth = depth;
            let nextExtCount = extCount;
            if (inCheck && ply > 0 && extCount < 4) {
                effectiveDepth = (depth + 1 > 1) ? depth + 1 : 1;
                nextExtCount = extCount + 1;
            }

            if (effectiveDepth <= 0) {
                return quiesceFast(pos, alpha, beta, 0, ply, undoStack, onSearchNode, tt);
            }

            // Transposition Table probe (always probe even when !allowNull)
            const epIdx = (pos.epSq !== -1) ? (pos.epSq & 7) : 8;
            const ttH1 = (pos.repH1 ^ Z_CAST_LO[pos.cast] ^ Z_EP_LO[epIdx]) >>> 0;
            const ttH2 = (pos.repH2 ^ Z_CAST_HI[pos.cast] ^ Z_EP_HI[epIdx]) >>> 0;
            let ttHit = false;
            let ttMove = 0;
            let ttScore = 0;
            let ttFlag = 0; // 1=EXACT, 2=LOWER, 3=UPPER
            let ttDepth = -128;

            if (tt.isFlat) {
                const tIdx = ttH1 & TT_MASK;
                const fg = tt.flagGen[tIdx];
                const f = fg & 3;
                if (f !== 0 && tt.keyLo[tIdx] === ttH1 && tt.keyHi[tIdx] === ttH2) {
                    ttHit = true;
                    ttFlag = f;
                    ttDepth = tt.depth[tIdx];
                    ttMove = tt.move[tIdx];
                    let s = tt.score[tIdx];
                    if (s >= MATE_THRESHOLD) s -= ply;
                    else if (s <= -MATE_THRESHOLD) s += ply;
                    ttScore = s;
                }
            } else {
                const ttKey = ((ttH2 & 0x1fffff) * 4294967296) + ttH1;
                const ttEntry = tt.get(ttKey);
                if (ttEntry && ttEntry.lock === ttH2) {
                    ttHit = true;
                    ttFlag = ttEntry.flag + 1;
                    ttDepth = (ttEntry.depth !== undefined) ? ttEntry.depth : 0;
                    ttMove = ttEntry.bestMove || 0;
                    let s = ttEntry.score;
                    if (s >= MATE_THRESHOLD) s -= ply;
                    else if (s <= -MATE_THRESHOLD) s += ply;
                    ttScore = s;
                }
            }

            if (ttHit && !isPvNode && ttDepth >= effectiveDepth) {
                if (ttFlag === TT_FLAG_EXACT) return ttScore;
                if (ttFlag === TT_FLAG_LOWER && ttScore >= beta) return ttScore;
                if (ttFlag === TT_FLAG_UPPER && ttScore <= alpha) return ttScore;
            }

            // Internal Iterative Reductions (IIR)
            if (!isPvNode && ply >= 2 && !inCheck && ttMove === 0 && effectiveDepth >= 4) {
                effectiveDepth -= 1;
            }

            // Static eval + TT refinement + improving flag (for pruning & LMR)
            let staticEval = 0;
            let improving = false;
            if (inCheck) {
                SEARCH_EVAL_STACK[ply] = -INF_CP;
            } else {
                const rawEval = evaluateBoardFast(pos);
                SEARCH_EVAL_STACK[ply] = rawEval;
                improving = (ply >= 2 && SEARCH_EVAL_STACK[ply - 2] > -INF_CP && rawEval > SEARCH_EVAL_STACK[ply - 2]);
                staticEval = rawEval;
                if (ttHit) {
                    if (
                        ttFlag === TT_FLAG_EXACT ||
                        (ttFlag === TT_FLAG_LOWER && ttScore > staticEval) ||
                        (ttFlag === TT_FLAG_UPPER && ttScore < staticEval)
                    ) {
                        staticEval = ttScore;
                    }
                }
            }

            const ownNonPawn = (!inCheck && ply > 0 && allowNull) ? hasNonPawnMaterialFast(pos, side) : false;

            // Reverse Futility Pruning (BEFORE movegen, non-PV only)
            if (
                !isPvNode &&
                allowNull &&
                ply > 0 &&
                !inCheck &&
                effectiveDepth <= 3 &&
                Math.abs(beta) < MATE_THRESHOLD &&
                ownNonPawn
            ) {
                const rfpMargin = (improving ? 90 : 120) * effectiveDepth;
                if (staticEval - rfpMargin >= beta) {
                    return staticEval - rfpMargin;
                }
            }

            // Adaptive Null-Move Pruning (BEFORE movegen, non-PV only, requires staticEval >= beta)
            if (
                !isPvNode &&
                allowNull &&
                ply > 0 &&
                !inCheck &&
                effectiveDepth >= 3 &&
                Math.abs(beta) < MATE_THRESHOLD &&
                staticEval >= beta &&
                !isEndgameFast(pos) &&
                ownNonPawn
            ) {
                const R = (effectiveDepth >= 6 ? 3 : 2) + (staticEval - beta >= 200 ? 1 : 0);
                const prevEp = pos.epSq;
                pos.turn = -side;
                pos.epSq = -1;
                pos.repH1 = (pos.repH1 ^ Z_TURN_LO) >>> 0;
                pos.repH2 = (pos.repH2 ^ Z_TURN_HI) >>> 0;

                const nullChild = negamaxFast(
                    effectiveDepth - 1 - R,
                    -beta,
                    -beta + 1,
                    ply + 1,
                    nextExtCount,
                    false,
                    0
                );

                pos.turn = side;
                pos.epSq = prevEp;
                pos.repH1 = (pos.repH1 ^ Z_TURN_LO) >>> 0;
                pos.repH2 = (pos.repH2 ^ Z_TURN_HI) >>> 0;

                if (isTimeOut) return 0;
                const nullScore = -nullChild;
                if (nullScore >= beta) {
                    return (nullScore >= MATE_THRESHOLD) ? beta : nullScore;
                }
            }

            // Precompute Futility Pruning flag (non-PV only)
            let canFutility = false;
            if (
                !isPvNode &&
                ply > 0 &&
                !inCheck &&
                effectiveDepth <= 2 &&
                Math.abs(alpha) < MATE_THRESHOLD &&
                Math.abs(beta) < MATE_THRESHOLD
            ) {
                const futMargin = (effectiveDepth === 1) ? 160 : 320;
                if (staticEval + futMargin <= alpha) {
                    canFutility = true;
                }
            }

            const undo = undoStack[ply];
            const b = pos.b;
            const moves = SEARCH_MOVE_BUFS[ply];
            const scores = SEARCH_SCORE_BUFS[ply];
            const moveCount = genPseudoMovesFast(pos, moves);

            const sideIdx = (side === 1) ? 0 : 1;
            const sideShift = sideIdx << 12;
            const k1 = killer1[ply] || 0;
            const k2 = killer2[ply] || 0;
            const cm = (prevMove !== 0)
                ? counterMoveTable[sideShift | ((prevMove & 63) << 6) | ((prevMove >> 6) & 63)]
                : 0;

            // Score all pseudo-legal moves into preallocated Int32Array (zero object allocs, lazy SEE, no check checks)
            for (let i = 0; i < moveCount; i++) {
                const m = moves[i];
                if (ttMove !== 0 && m === ttMove) {
                    scores[i] = 1000000;
                    continue;
                }
                const fromSq = m & 63;
                const toSq = (m >> 6) & 63;
                const promoType = (m >> 12) & 7;
                const moved = b[fromSq];
                const cap = b[toSq];
                const isEp = (cap === 0 && (moved === WP || moved === BP) && ((fromSq & 7) !== (toSq & 7)));
                const isCapture = (cap !== 0 || isEp);

                if (promoType === QUEEN) {
                    const capVal = cap !== 0 ? TYPE_VALUES[cap > 0 ? cap : -cap] : 0;
                    scores[i] = 500000 + capVal * 10;
                    continue;
                }

                if (isCapture) {
                    const vVal = isEp ? 100 : TYPE_VALUES[cap > 0 ? cap : -cap];
                    const aType = moved > 0 ? moved : -moved;
                    const aVal = TYPE_VALUES[aType];
                    const see = (vVal >= aVal) ? 0 : seeCpFast(pos, m);
                    if (see >= 0) {
                        scores[i] = 200000 + vVal * 10 - LVA_ORDER[aType];
                    } else if (promoType !== 0) {
                        scores[i] = 150000 + see;
                    } else {
                        scores[i] = -100000 + see;
                    }
                    continue;
                }

                if (promoType !== 0) {
                    scores[i] = 150000 + TYPE_VALUES[promoType];
                    continue;
                }

                if (m === k1) scores[i] = 100000;
                else if (m === k2) scores[i] = 90000;
                else if (cm !== 0 && m === cm) scores[i] = 80000;
                else scores[i] = historyTable[sideShift | (fromSq << 6) | toSq];
            }

            const ownKingSqBefore = (side === 1) ? pos.wKingSq : pos.bKingSq;
            const ownKR = ownKingSqBefore !== -1 ? (ownKingSqBefore >> 3) : -10;
            const ownKC = ownKingSqBefore !== -1 ? (ownKingSqBefore & 7) : -10;
            const oppKingSq = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
            const okR = oppKingSq !== -1 ? (oppKingSq >> 3) : -10;
            const okC = oppKingSq !== -1 ? (oppKingSq & 7) : -10;
            const hasAnyNonPawn = hasNonPawnMaterialFast(pos, side) || hasNonPawnMaterialFast(pos, oppSide);
            const lmpLimit = (!isPvNode && !inCheck && effectiveDepth <= 3)
                ? (improving ? (3 + effectiveDepth * effectiveDepth) : (2 + effectiveDepth * effectiveDepth))
                : 999;

            const quietBuf = SEARCH_QUIET_BUFS[ply];
            let quietTried = 0;
            let legalCount = 0;
            let bestScore = -INF_CP;
            let bestM = 0;
            const origAlpha = alpha;

            pathKeys.add(repKey);

            for (let i = 0; i < moveCount; i++) {
                // Incremental selection sort: pick best remaining move
                let bestIdx = i;
                let bestMoveScore = scores[i];
                for (let j = i + 1; j < moveCount; j++) {
                    if (scores[j] > bestMoveScore) {
                        bestMoveScore = scores[j];
                        bestIdx = j;
                    }
                }
                const m = moves[bestIdx];
                if (bestIdx !== i) {
                    moves[bestIdx] = moves[i];
                    scores[bestIdx] = scores[i];
                    moves[i] = m;
                    scores[i] = bestMoveScore;
                }

                const fromSq = m & 63;
                const toSq = (m >> 6) & 63;
                const promoType = (m >> 12) & 7;
                const movedCode = b[fromSq];
                const absType = movedCode > 0 ? movedCode : -movedCode;
                const capCode = b[toSq];
                const isEp = (absType === PAWN && capCode === 0 && ((fromSq & 7) !== (toSq & 7)));
                const isCapture = (capCode !== 0 || isEp);
                const isPromo = (promoType !== 0);
                const isKiller = !isCapture && !isPromo && (m === k1 || m === k2);
                const isCounterMove = !isCapture && !isPromo && (cm !== 0 && m === cm);

                if (legalCount > 0) {
                    // SEE pruning for losing captures in shallow non-PV nodes (preserve checking sacrifices like Qxf7#)
                    if (!isPvNode && !inCheck && effectiveDepth <= 2 && isCapture && !isPromo && bestMoveScore < -50000) {
                        const seeEst = bestMoveScore + 100000;
                        if (seeEst < -100 * effectiveDepth && !isMoveCheckFast(m, okR, okC, oppKingSq, undo)) {
                            continue;
                        }
                    }

                    // LMP & Futility Pruning for quiet non-tactical moves (disabled when already facing mate)
                    if (!isCapture && !isPromo && !isKiller && !isCounterMove && bestScore > -MATE_THRESHOLD) {
                        const needLmp = (!isPvNode && !inCheck && effectiveDepth <= 3 && quietTried >= lmpLimit);
                        if (needLmp || canFutility) {
                            const isDangerousPawnPush =
                                (movedCode === WP && (toSq >> 3) <= 1) ||
                                (movedCode === BP && (toSq >> 3) >= 6);
                            if (!isDangerousPawnPush && !isMoveCheckFast(m, okR, okC, oppKingSq, undo)) {
                                continue;
                            }
                        }
                    }
                }

                makeMoveFast(pos, m, undo);

                // Lazy legality check (only needed if inCheck, king move, en passant, or piece was aligned with own king)
                const fromR = fromSq >> 3;
                const fromC = fromSq & 7;
                if (
                    inCheck ||
                    absType === KING ||
                    isEp ||
                    ownKingSqBefore === -1 ||
                    fromR === ownKR ||
                    fromC === ownKC ||
                    Math.abs(fromR - ownKR) === Math.abs(fromC - ownKC)
                ) {
                    const kSqNow = (side === 1) ? pos.wKingSq : pos.bKingSq;
                    if (kSqNow === -1 || isSquareAttackedFast(pos, kSqNow, oppSide)) {
                        unmakeMoveFast(pos, m, undo);
                        continue;
                    }
                }

                legalCount++;
                const oppKingNow = (oppSide === 1) ? pos.wKingSq : pos.bKingSq;
                const givesCheck = (oppKingNow !== -1 && isSquareAttackedFast(pos, oppKingNow, side));

                // Passed pawn extension on 7th/2nd rank
                let moveExt = 0;
                if (nextExtCount < 4) {
                    const movedPiece = pos.b[toSq];
                    const tR = toSq >> 3;
                    if (
                        (movedPiece === WP && tR === 1 && isPassedPawnFast(pos.b, tR, toSq & 7, 1)) ||
                        (movedPiece === BP && tR === 6 && isPassedPawnFast(pos.b, tR, toSq & 7, -1))
                    ) {
                        moveExt = 1;
                    }
                }

                const childDepth = effectiveDepth - 1 + moveExt;
                const moveNextExt = nextExtCount + moveExt;
                let score;

                if (legalCount === 1) {
                    score = -negamaxFast(
                        childDepth,
                        -beta,
                        -alpha,
                        ply + 1,
                        moveNextExt,
                        true,
                        m
                    );
                } else {
                    const isBadCap = isCapture && bestMoveScore < -50000;
                    const canLMR = (
                        effectiveDepth >= 3 &&
                        !inCheck &&
                        !givesCheck &&
                        hasAnyNonPawn &&
                        moveExt === 0 &&
                        !isPromo &&
                        !isKiller &&
                        legalCount >= (isPvNode ? 3 : 2) &&
                        (!isCapture || isBadCap)
                    );

                    let needsZeroWindow = true;
                    if (canLMR) {
                        const dIdx = effectiveDepth < 63 ? effectiveDepth : 63;
                        const mIdx = legalCount < 63 ? legalCount : 63;
                        let reduction = LMR_TABLE[dIdx][mIdx];
                        if (isPvNode) reduction -= 1;
                        if (!improving) reduction += 1;
                        if (!isCapture) {
                            const hVal = historyTable[sideShift | (fromSq << 6) | toSq];
                            if (hVal < -2000) reduction += 1;
                            else if (hVal > 4000) reduction -= 1;
                        } else {
                            reduction += 1;
                        }
                        if (reduction < 0) reduction = 0;
                        const maxRed = childDepth > 1 ? childDepth - 1 : 0;
                        if (reduction > maxRed) reduction = maxRed;

                        if (reduction > 0) {
                            score = -negamaxFast(
                                childDepth - reduction,
                                -alpha - 1,
                                -alpha,
                                ply + 1,
                                moveNextExt,
                                true,
                                m
                            );
                            if (isTimeOut) {
                                unmakeMoveFast(pos, m, undo);
                                break;
                            }
                            needsZeroWindow = (score > alpha);
                        }
                    }

                    if (needsZeroWindow) {
                        score = -negamaxFast(
                            childDepth,
                            -alpha - 1,
                            -alpha,
                            ply + 1,
                            moveNextExt,
                            true,
                            m
                        );
                        if (!isTimeOut && isPvNode && score > alpha) {
                            score = -negamaxFast(
                                childDepth,
                                -beta,
                                -alpha,
                                ply + 1,
                                moveNextExt,
                                true,
                                m
                            );
                        }
                    }
                }

                unmakeMoveFast(pos, m, undo);
                if (isTimeOut) break;

                if (score > bestScore) {
                    bestScore = score;
                    bestM = m;
                }
                if (score > alpha) alpha = score;
                if (alpha >= beta) {
                    if (!isCapture && !isPromo) {
                        recordKiller(ply, m);
                        if (prevMove !== 0) {
                            counterMoveTable[sideShift | ((prevMove & 63) << 6) | ((prevMove >> 6) & 63)] = m;
                        }
                        const bonus = effectiveDepth * effectiveDepth;
                        addHistory(sideShift | (fromSq << 6) | toSq, bonus);
                        for (let qi = 0; qi < quietTried; qi++) {
                            const qm = quietBuf[qi];
                            addHistory(sideShift | ((qm & 63) << 6) | ((qm >> 6) & 63), -bonus);
                        }
                    }
                    break;
                }
                if (!isCapture && !isPromo && quietTried < 128) {
                    quietBuf[quietTried++] = m;
                }
            }

            pathKeys.delete(repKey);

            if (isTimeOut) return 0;

            if (legalCount === 0) {
                return inCheck ? -(MATE_CP - ply) : 0;
            }

            storeTT(tt, ttH1, ttH2, effectiveDepth, bestScore, origAlpha, beta, ply, bestM);
            return bestScore;
        }

        let bestMoveRoot = candidates[0].move;
        let bestPackedRoot = candidates[0].packed;
        let bestScoreRoot = -Infinity;
        let bestCpRoot = null;
        let bestBlendedCpRoot = -INF_CP;
        let bestFailedLowRoot = false;
        if (typeof params.expectedCp === 'number' && Number.isFinite(params.expectedCp)) {
            bestCpRoot = Math.round(params.expectedCp);
        } else if (
            typeof params.expectedScore === 'number' &&
            Number.isFinite(params.expectedScore) &&
            Math.abs(params.expectedScore) < 0.999
        ) {
            bestCpRoot = rootScoreToAlphaCp(params.expectedScore) + 1;
        }
        let bestPriorRoot = candidates[0].prior;
        let bestBlendedRoot = -Infinity;
        let finalMoveResults = [];

        const rootRepKey = computeRepKey(pos);
        const rootUndo = undoStack[0];

        function searchRootChild(packedMove, depth, alphaCp, betaCp) {
            makeMoveFast(pos, packedMove, rootUndo);
            const oppMovesPly1 = genLegalMovesFast(pos, undoStack[1]);
            let cp;
            if (oppMovesPly1.length === 0) {
                cp = isKingInCheckFast(pos, pos.turn) ? (MATE_CP - 1) : 0;
            } else {
                const childCp = negamaxFast(
                    depth - 1,
                    -betaCp,
                    -alphaCp,
                    1,
                    0,
                    true,
                    packedMove
                );
                cp = -childCp;
            }
            unmakeMoveFast(pos, packedMove, rootUndo);
            return cp;
        }

        SEARCH_EVAL_STACK[0] = isKingInCheckFast(pos, pos.turn) ? -INF_CP : evaluateBoardFast(pos);

        const rootEpIdx = (pos.epSq !== -1) ? (pos.epSq & 7) : 8;
        const rootTtH1 = (pos.repH1 ^ Z_CAST_LO[pos.cast] ^ Z_EP_LO[rootEpIdx]) >>> 0;
        const rootTtH2 = (pos.repH2 ^ Z_CAST_HI[pos.cast] ^ Z_EP_HI[rootEpIdx]) >>> 0;
        let hasRootTtMove = false;
        if (startDepth > 1 || params.reuseTT) {
            let rootTtMove = 0;
            if (tt.isFlat) {
                const tIdx = rootTtH1 & TT_MASK;
                if ((tt.flagGen[tIdx] & 3) !== 0 && tt.keyLo[tIdx] === rootTtH1 && tt.keyHi[tIdx] === rootTtH2) {
                    rootTtMove = tt.move[tIdx];
                }
            } else {
                const ttKey = ((rootTtH2 & 0x1fffff) * 4294967296) + rootTtH1;
                const ttEntry = tt.get(ttKey);
                if (ttEntry && ttEntry.lock === rootTtH2) {
                    rootTtMove = ttEntry.bestMove || 0;
                }
            }
            if (rootTtMove !== 0 && candidates.some(c => c.packed === rootTtMove)) {
                bestPackedRoot = rootTtMove;
                hasRootTtMove = true;
            }
        }

        for (let d = startDepth; d <= maxDepth; d++) {
            currentDepth = d;
            if (d > startDepth && (nowMs() - startTime >= timeLimitMs || isTimeOut)) break;

            // Age history table between iterative deepening depths so history never saturates
            if (d > startDepth) {
                for (let hi = 0; hi < historyTable.length; hi++) {
                    historyTable[hi] >>= 1;
                }
            }

            const ordered = candidates.slice().sort((a, bMove) => {
                if (d === startDepth && bestCpRoot === null && !hasRootTtMove) return bMove.prior - a.prior;
                const aIsBest = (a.packed === bestPackedRoot) ? 1 : 0;
                const bIsBest = (bMove.packed === bestPackedRoot) ? 1 : 0;
                if (aIsBest !== bIsBest) return bIsBest - aIsBest;
                if (bMove.lastScore !== a.lastScore) return bMove.lastScore - a.lastScore;
                return bMove.prior - a.prior;
            });

            let iterBestMove = ordered[0].move;
            let iterBestPacked = ordered[0].packed;
            let iterBestScore = -Infinity;
            let iterBestCp = -INF_CP;
            let iterBestBlendedCp = -INF_CP;
            let iterBestPrior = ordered[0].prior;
            let iterBestBonus = 0;
            let iterBestBlended = -Infinity;
            let iterBestFailedLow = false;
            const iterResults = [];
            const depthPriorCp = getDepthPriorBonusCp(d);

            const useAspiration = (
                d >= 4 &&
                bestCpRoot !== null &&
                Math.abs(bestCpRoot) < (MATE_THRESHOLD - 1000)
            );
            let aspDelta = 50;
            let aspAlpha = useAspiration ? (bestCpRoot - aspDelta) : -INF_CP;
            let aspBeta = useAspiration ? (bestCpRoot + aspDelta) : INF_CP;

            pathKeys.clear();
            pathKeys.add(rootRepKey);

            for (let i = 0; i < ordered.length; i++) {
                const cand = ordered[i];
                const prior = cand.prior;
                const priorBonusCp = Math.round(depthPriorCp * prior);

                let localAlphaCp = -INF_CP;
                if (iterBestBlended > -Infinity) {
                    if (iterBestCp >= MATE_THRESHOLD) {
                        localAlphaCp = iterBestCp;
                    } else if (iterBestCp > -MATE_THRESHOLD) {
                        localAlphaCp = iterBestBlendedCp - priorBonusCp;
                    }
                }

                // Apply YBWC shared alpha floor in exact centipawns (fallback to tanh score when minAlphaCp is omitted)
                let sharedAlphaCp = -INF_CP;
                if (hasMinAlphaCp) {
                    sharedAlphaCp = Math.round(params.minAlphaCp);
                } else if (d >= 2 && minAlphaScore > -Infinity) {
                    if (minAlphaScore >= 8.0) {
                        sharedAlphaCp = rootScoreToAlphaCp(minAlphaScore - 0.0001 * prior - 1e-4);
                    } else if (minAlphaScore > -8.0) {
                        const sharedBlendedCp = rootScoreToAlphaCp(minAlphaScore) + 1;
                        sharedAlphaCp = sharedBlendedCp - priorBonusCp - 1;
                    }
                }
                if (sharedCtrl && typeof Atomics !== 'undefined' && d >= 2) {
                    const liveBestBlendedCp = Atomics.load(sharedCtrl, 1);
                    if (liveBestBlendedCp > -INF_CP && liveBestBlendedCp < INF_CP) {
                        const liveRawAlpha = (liveBestBlendedCp >= MATE_THRESHOLD) ? liveBestBlendedCp : (liveBestBlendedCp - priorBonusCp);
                        if (liveRawAlpha > sharedAlphaCp) {
                            sharedAlphaCp = liveRawAlpha;
                        }
                    }
                }
                if (sharedAlphaCp >= MATE_THRESHOLD) sharedAlphaCp = MATE_THRESHOLD - 1;

                const rootAlphaCp = Math.max(localAlphaCp, sharedAlphaCp);

                const moveNodesBefore = nodes;
                let cp;

                if (i === 0) {
                    if (useAspiration) {
                        let aDelta = aspDelta;
                        let bDelta = aspDelta;
                        while (true) {
                            const effAlpha = Math.max(aspAlpha, sharedAlphaCp);
                            if (aspBeta <= effAlpha) aspBeta = INF_CP;
                            cp = searchRootChild(cand.packed, d, effAlpha, aspBeta);
                            if (isTimeOut) break;
                            if (cp <= effAlpha) {
                                // Respect shared alpha floor if it was the binding lower bound
                                if (effAlpha === sharedAlphaCp && aspAlpha <= sharedAlphaCp) {
                                    break;
                                }
                                if (effAlpha <= -INF_CP) break;
                                aDelta *= 2;
                                aspAlpha = (aDelta > 400) ? -INF_CP : (bestCpRoot - aDelta);
                            } else if (cp >= aspBeta && aspBeta < INF_CP) {
                                bDelta *= 2;
                                aspBeta = (bDelta > 400) ? INF_CP : (bestCpRoot + bDelta);
                            } else {
                                break;
                            }
                        }
                    } else {
                        cp = searchRootChild(cand.packed, d, sharedAlphaCp, INF_CP);
                    }
                } else {
                    // PVS at root: probe with zero window around rootAlphaCp first
                    const probeBeta = rootAlphaCp + 1;
                    cp = searchRootChild(cand.packed, d, rootAlphaCp, probeBeta);
                    if (!isTimeOut && cp > rootAlphaCp) {
                        let curBeta = useAspiration ? Math.max(aspBeta, probeBeta + 1) : INF_CP;
                        let bDelta = aspDelta;
                        while (true) {
                            cp = searchRootChild(cand.packed, d, rootAlphaCp, curBeta);
                            if (isTimeOut) break;
                            if (cp >= curBeta && curBeta < INF_CP) {
                                bDelta *= 2;
                                curBeta = (bDelta > 400) ? INF_CP : (cp + bDelta);
                                aspBeta = curBeta;
                            } else {
                                break;
                            }
                        }
                    }
                }

                if (isTimeOut) break;

                const moveNodes = nodes - moveNodesBefore;
                const score = cpToRootScore(cp);
                const isMateZone = (Math.abs(cp) >= MATE_THRESHOLD);
                const blendedCp = isMateZone ? cp : (cp + priorBonusCp);
                const blended = isMateZone ? score : cpToRootScore(blendedCp);
                const priorBonus = blended - score;
                const moveFailedLow = (
                    (sharedAlphaCp > -INF_CP && cp <= sharedAlphaCp) ||
                    (i > 0 && localAlphaCp > -INF_CP && cp <= localAlphaCp)
                );
                cand.lastScore = blended;

                iterResults.push({
                    move: cand.move,
                    score,
                    cp,
                    blendedCp,
                    prior,
                    priorBonus,
                    blendedScore: blended,
                    failedLow: moveFailedLow,
                    bound: moveFailedLow ? 'upper' : 'exact',
                    nodes: moveNodes
                });

                const beatsIterBest = (
                    iterResults.length === 1 ||
                    blendedCp > iterBestBlendedCp ||
                    (blendedCp === iterBestBlendedCp && cp > iterBestCp)
                );
                if (beatsIterBest) {
                    iterBestBlended = blended;
                    iterBestBlendedCp = blendedCp;
                    iterBestScore = score;
                    iterBestCp = cp;
                    iterBestPrior = prior;
                    iterBestBonus = priorBonus;
                    iterBestMove = cand.move;
                    iterBestPacked = cand.packed;
                    iterBestFailedLow = (sharedAlphaCp > -INF_CP && cp <= sharedAlphaCp);
                }
            }

            if (isTimeOut) {
                if (
                    iterResults.length >= 1 &&
                    iterBestBlended > -Infinity &&
                    (completedDepth === 0 || (!iterBestFailedLow && iterBestPacked !== bestPackedRoot && iterBestBlendedCp > bestBlendedCpRoot))
                ) {
                    bestMoveRoot = iterBestMove;
                    bestPackedRoot = iterBestPacked;
                    bestScoreRoot = iterBestScore;
                    bestCpRoot = iterBestCp;
                    bestBlendedCpRoot = iterBestBlendedCp;
                    bestPriorRoot = iterBestPrior;
                    bestBlendedRoot = iterBestBlended;
                    bestFailedLowRoot = iterBestFailedLow;
                    if (completedDepth === 0) {
                        finalMoveResults = iterResults;
                    }
                }
                break;
            }

            bestMoveRoot = iterBestMove;
            bestPackedRoot = iterBestPacked;
            bestScoreRoot = iterBestScore;
            bestCpRoot = iterBestCp;
            bestBlendedCpRoot = iterBestBlendedCp;
            bestPriorRoot = iterBestPrior;
            bestBlendedRoot = iterBestBlended;
            bestFailedLowRoot = iterBestFailedLow;
            completedDepth = d;
            finalMoveResults = iterResults;

            if (!Array.isArray(params.rootMoves) && !bestFailedLowRoot) {
                storeTT(tt, rootTtH1, rootTtH2, d, bestCpRoot, -INF_CP, INF_CP, 0, bestPackedRoot);
            }

            if (bestCpRoot >= MATE_THRESHOLD || bestScoreRoot >= 9.9) break;
        }

        const finalPriorBonus = (bestBlendedRoot > -Infinity && bestScoreRoot > -Infinity)
            ? (bestBlendedRoot - bestScoreRoot)
            : 0;

        return {
            bestMove: withPromotion(board, bestMoveRoot),
            bestScore: bestScoreRoot,
            bestCp: bestCpRoot !== null ? bestCpRoot : -INF_CP,
            blendedCp: bestBlendedCpRoot,
            bestPrior: bestPriorRoot,
            priorBonus: finalPriorBonus,
            blendedScore: bestBlendedRoot,
            failedLow: bestFailedLowRoot,
            bound: bestFailedLowRoot ? 'upper' : 'exact',
            completedDepth,
            nodes,
            timedOut: isTimeOut,
            moveResults: finalMoveResults
        };
    }

    const API = {
        PIECE_VALUES,
        fenToBoard,
        simulateMove,
        isPassedPawn,
        isSquareAttacked,
        isKingInCheck,
        boardToSimpleKey,
        boardToFast,
        packMove,
        unpackMove,
        seeCp,
        cpToRootScore,
        rootScoreToAlphaCp,
        getDepthPriorBonusCp,
        evaluateBoardFast,
        generateCaptures,
        generateQuietChecks,
        evaluateMaterial,
        evaluateBoardTactical,
        quiesce,
        getLegalMovesForBoard,
        findInstantMateMove,
        findMateInTwoMove,
        getCheapestAttacker,
        checkMoveTacticalBlunder,
        filterTacticalBlunders,
        filterMatingBlunders,
        isElementaryEndgame,
        isEndgamePosition,
        solveElementaryEndgame,
        searchRootMoves
    };

    if (typeof globalThis !== 'undefined') {
        globalThis.ChessAINeuralSearch = API;
    } else if (typeof self !== 'undefined') {
        self.ChessAINeuralSearch = API;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
