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
    const SearchCore = (typeof ChessAINeuralSearch !== 'undefined'
        ? ChessAINeuralSearch
        : (typeof globalThis !== 'undefined' && globalThis.ChessAINeuralSearch
            ? globalThis.ChessAINeuralSearch
            : (typeof require === 'function' ? require('./ai_neural_search.js') : null)));

    if (!SearchCore) {
        throw new Error('ChessAINeuralSearch must be loaded before ChessAINeural.');
    }

    const {
        PIECE_VALUES,
        fenToBoard,
        simulateMove,
        isPassedPawn,
        isSquareAttacked,
        isKingInCheck,
        boardToSimpleKey,
        rootScoreToAlphaCp,
        cpToRootScore,
        getDepthPriorBonusCp,
        quiesce,
        getLegalMovesForBoard,
        findInstantMateMove,
        findMateInTwoMove,
        checkMoveTacticalBlunder,
        filterTacticalBlunders,
        filterMatingBlunders,
        isElementaryEndgame,
        isEndgamePosition,
        solveElementaryEndgame,
        searchRootMoves
    } = SearchCore;

    let session = null;
    let initPromise = null;
    let initPromiseVer = null;
    const transpositionTable = new Map();
    const MAX_TT_SIZE = 2500;
    const failedModelVers = new Set();
    const resolvedModelVerMap = new Map();
    let inferenceChain = Promise.resolve();
    let mainThreadTTDirty = false;
    let lastSearchHistoryLen = 0;

    function markAllSearchTTDirty() {
        mainThreadTTDirty = true;
        for (let i = 0; i < workerPool.length; i++) {
            workerPool[i].ttDirty = true;
        }
    }

    function runSessionSerialized(targetSession, feeds) {
        const task = inferenceChain.then(
            () => targetSession.run(feeds),
            () => targetSession.run(feeds)
        );
        inferenceChain = task.catch(() => {});
        return task;
    }

    function normalizeMovePromotion(board, move) {
        if (!move) return null;
        if (move.promotion) return { ...move };
        const p = board && board[move.fromR] ? board[move.fromR][move.fromC] : null;
        const isPromo = p && p.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7);
        return { ...move, promotion: isPromo ? 'q' : null };
    }

    function computeLastOwnKey(recentKeys, currentSimpleKey, oppTurn) {
        if (!Array.isArray(recentKeys) || recentKeys.length === 0) return null;
        const lastEntry = recentKeys[recentKeys.length - 1];
        if (lastEntry === currentSimpleKey) {
            return recentKeys.length >= 2 ? recentKeys[recentKeys.length - 2] : null;
        }
        if (typeof lastEntry === 'string' && lastEntry.endsWith(' ' + oppTurn)) {
            return lastEntry;
        }
        return recentKeys.length >= 2 ? recentKeys[recentKeys.length - 2] : null;
    }

    const PIECE_MAP = {
        'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
        'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
    };

    let sessionV1 = null;
    let sessionV15 = null;
    let sessionV16 = null;
    let sessionV17 = null;
    let sessionV18 = null;
    let activeSession = null;
    let activeModelVer = null;

    function resolveWasmPaths() {
        if (typeof window !== 'undefined' && window.location && /^(https?|file|capacitor):/i.test(window.location.protocol || '')) {
            try {
                const base = (typeof document !== 'undefined' && document.baseURI) || window.location.href;
                return new URL('js/', base).href;
            } catch (_) {
                // Fall back to relative path
            }
        }
        return 'js/';
    }

    async function loadModelInput(modelPath) {
        const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
        const isElectron = typeof process !== 'undefined' && process.versions && !!process.versions.electron;

        if ((isFileProtocol || isElectron) && typeof require === 'function') {
            try {
                const fs = require('fs');
                const path = require('path');
                const candidates = [
                    typeof process !== 'undefined' && typeof process.cwd === 'function' ? path.resolve(process.cwd(), modelPath) : null,
                    typeof __dirname !== 'undefined' ? path.resolve(__dirname, modelPath) : null,
                    typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', modelPath) : null
                ].filter(Boolean);

                for (const candidate of candidates) {
                    if (fs.existsSync(candidate)) {
                        const buf = await fs.promises.readFile(candidate);
                        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
                    }
                }
            } catch (e) {
                console.warn(`[Neural AI] Direct file read failed for ${modelPath}, falling back to path:`, e);
            }
        }

        return modelPath;
    }

    async function createOrtSession(modelPath) {
        const modelInput = await loadModelInput(modelPath);
        if (typeof navigator !== 'undefined' && navigator.gpu) {
            try {
                return await ort.InferenceSession.create(modelInput, { executionProviders: ['webgpu', 'wasm'] });
            } catch (gpuErr) {
                console.warn('[Neural AI] WebGPU provider unavailable, falling back to WASM:', gpuErr);
            }
        }
        return await ort.InferenceSession.create(modelInput, { executionProviders: ['wasm'] });
    }

    function normalizeModelVer(modelVer) {
        if (typeof modelVer === 'string') {
            const trimmed = modelVer.trim();
            if (trimmed) return trimmed.replace(/\./g, '_');
        }
        return 'v1';
    }

    async function init(modelVer = 'v1') {
        if (typeof ort === 'undefined') {
            throw new Error('ONNX Runtime Web (ort) is not loaded.');
        }

        const requestedVer = normalizeModelVer(modelVer);
        let targetVer = resolvedModelVerMap.get(requestedVer) || requestedVer;

        if (activeSession && activeModelVer === targetVer) {
            resolvedModelVerMap.set(requestedVer, targetVer);
            return activeSession;
        }

        if (initPromise) {
            if (initPromiseVer === targetVer) {
                return initPromise;
            }
            try {
                await initPromise;
            } catch (_) {
                // Ignore failure from earlier version load and try requested targetVer
            }
            targetVer = resolvedModelVerMap.get(requestedVer) || requestedVer;
            if (activeSession && activeModelVer === targetVer) {
                resolvedModelVerMap.set(requestedVer, targetVer);
                return activeSession;
            }
        }

        initPromiseVer = targetVer;
        initPromise = (async () => {
            if (ort.env && ort.env.wasm) {
                ort.env.wasm.wasmPaths = resolveWasmPaths();
                const isCrossOriginIsolated = typeof self !== 'undefined' && self.crossOriginIsolated === true;
                const hwThreads = (typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0)
                    ? Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency)))
                    : 1;
                ort.env.wasm.numThreads = isCrossOriginIsolated ? hwThreads : 1;
            }

            let curVer = targetVer;

            if (curVer === 'v1_8' || curVer === 'v1.8') {
                if (sessionV18) {
                    activeSession = sessionV18;
                    session = sessionV18;
                    activeModelVer = 'v1_8';
                    resolvedModelVerMap.set(requestedVer, 'v1_8');
                    return sessionV18;
                }
                if (failedModelVers.has('v1_8')) {
                    curVer = 'v1_7';
                } else {
                    try {
                        console.log('[Neural AI] Initializing ModularChessNet V1.8 (modular_chess_v1_8.onnx)...');
                        sessionV18 = await createOrtSession('modular_chess_v1_8.onnx');
                        console.log('[Neural AI] ModularChessNet V1.8 session ready!');
                        activeSession = sessionV18;
                        session = sessionV18;
                        activeModelVer = 'v1_8';
                        resolvedModelVerMap.set(requestedVer, 'v1_8');
                        return sessionV18;
                    } catch (err) {
                        console.warn('[Neural AI] modular_chess_v1_8.onnx not loaded, falling back to V1.7:', err);
                        failedModelVers.add('v1_8');
                        curVer = 'v1_7';
                    }
                }
            }

            if (curVer === 'v1_7' || curVer === 'v1.7') {
                if (sessionV17) {
                    activeSession = sessionV17;
                    session = sessionV17;
                    activeModelVer = 'v1_7';
                    resolvedModelVerMap.set(requestedVer, 'v1_7');
                    return sessionV17;
                }
                if (failedModelVers.has('v1_7')) {
                    curVer = 'v1_6';
                } else {
                    try {
                        console.log('[Neural AI] Initializing ModularChessNet V1.7 (modular_chess_v1_7.onnx)...');
                        sessionV17 = await createOrtSession('modular_chess_v1_7.onnx');
                        console.log('[Neural AI] ModularChessNet V1.7 session ready!');
                        activeSession = sessionV17;
                        session = sessionV17;
                        activeModelVer = 'v1_7';
                        resolvedModelVerMap.set(requestedVer, 'v1_7');
                        return sessionV17;
                    } catch (err) {
                        console.warn('[Neural AI] modular_chess_v1_7.onnx not loaded, falling back to V1.6:', err);
                        failedModelVers.add('v1_7');
                        curVer = 'v1_6';
                    }
                }
            }

            if (curVer === 'v1_6') {
                if (sessionV16) {
                    activeSession = sessionV16;
                    session = sessionV16;
                    activeModelVer = 'v1_6';
                    resolvedModelVerMap.set(requestedVer, 'v1_6');
                    return sessionV16;
                }
                if (failedModelVers.has('v1_6')) {
                    curVer = 'v1_5';
                } else {
                    try {
                        console.log('[Neural AI] Initializing ModularChessNet V1.6 (modular_chess_v1_6.onnx)...');
                        sessionV16 = await createOrtSession('modular_chess_v1_6.onnx');
                        console.log('[Neural AI] ModularChessNet V1.6 session ready!');
                        activeSession = sessionV16;
                        session = sessionV16;
                        activeModelVer = 'v1_6';
                        resolvedModelVerMap.set(requestedVer, 'v1_6');
                        return sessionV16;
                    } catch (err) {
                        console.warn('[Neural AI] modular_chess_v1_6.onnx not loaded, falling back to V1.5:', err);
                        failedModelVers.add('v1_6');
                        curVer = 'v1_5';
                    }
                }
            }

            if (curVer === 'v1_5') {
                if (sessionV15) {
                    activeSession = sessionV15;
                    session = sessionV15;
                    activeModelVer = 'v1_5';
                    resolvedModelVerMap.set(requestedVer, 'v1_5');
                    return sessionV15;
                }
                if (failedModelVers.has('v1_5')) {
                    curVer = 'v1';
                } else {
                    try {
                        console.log('[Neural AI] Initializing ModularChessNet V1.5 (modular_chess_v1_5.onnx)...');
                        sessionV15 = await createOrtSession('modular_chess_v1_5.onnx');
                        console.log('[Neural AI] ModularChessNet V1.5 session ready!');
                        activeSession = sessionV15;
                        session = sessionV15;
                        activeModelVer = 'v1_5';
                        resolvedModelVerMap.set(requestedVer, 'v1_5');
                        return sessionV15;
                    } catch (err) {
                        console.warn('[Neural AI] modular_chess_v1_5.onnx not loaded, falling back to V1.0:', err);
                        failedModelVers.add('v1_5');
                        curVer = 'v1';
                    }
                }
            }

            if (sessionV1) {
                activeSession = sessionV1;
                session = sessionV1;
                activeModelVer = 'v1';
                resolvedModelVerMap.set(requestedVer, 'v1');
                return sessionV1;
            }

            console.log('[Neural AI] Initializing ModularChessNet V1 (modular_chess_v1.onnx)...');
            try {
                sessionV1 = await createOrtSession('modular_chess_v1.onnx');
                console.log('[Neural AI] ModularChessNet V1 session ready!');
                activeSession = sessionV1;
                session = sessionV1;
                activeModelVer = 'v1';
                resolvedModelVerMap.set(requestedVer, 'v1');
                return sessionV1;
            } catch (err) {
                console.error('[Neural AI] Failed to load ONNX model locally:', err);
                throw err;
            }
        })();

        try {
            return await initPromise;
        } finally {
            initPromise = null;
            initPromiseVer = null;
        }
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

    function getLegalMovesForFen(fen, parsed = null) {
        const info = parsed || fenToBoard(fen);
        const board = info && info.board;
        const turn = (info && info.turn) || 'w';
        const castling = (info && info.castling) || '-';
        const epSquare = (info && info.epSquare !== undefined) ? info.epSquare : null;

        const getFenFn = (typeof ChessLogic !== 'undefined')
            ? (typeof ChessLogic.getFen === 'function' ? ChessLogic.getFen : (typeof ChessLogic.getFEN === 'function' ? ChessLogic.getFEN : null))
            : null;
        if (
            typeof ChessLogic !== 'undefined' &&
            typeof ChessLogic.getAllLegalMoves === 'function' &&
            getFenFn &&
            typeof fen === 'string'
        ) {
            const logicParts = getFenFn().trim().split(/\s+/).slice(0, 4).join(' ');
            const targetParts = fen.trim().split(/\s+/).slice(0, 4).join(' ');
            if (logicParts === targetParts) {
                return ChessLogic.getAllLegalMoves(turn);
            }
        }

        if (typeof getLegalMovesForBoard === 'function' && board) {
            return getLegalMovesForBoard(board, turn, castling, epSquare);
        }
        if (typeof ChessLogic !== 'undefined' && typeof ChessLogic.getAllLegalMoves === 'function') {
            return ChessLogic.getAllLegalMoves(turn);
        }
        return [];
    }

    function getEndgameMove(fen) {
        if (!fen) return null;
        if (typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getEndgameTablebaseMove === 'function') {
            const tbMove = ChessAIShared.getEndgameTablebaseMove(fen);
            if (tbMove) return tbMove;
        }
        const { board, turn, castling, epSquare } = fenToBoard(fen);
        if (board && isElementaryEndgame(board, turn)) {
            return solveElementaryEndgame(board, turn, castling, epSquare);
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

    function softmaxLogits(logits) {
        if (!logits || logits.length === 0) return [];
        let maxS = -Infinity;
        for (let i = 0; i < logits.length; i++) {
            if (logits[i] > maxS) maxS = logits[i];
        }
        const expS = new Array(logits.length);
        let sumExp = 0.0;
        for (let i = 0; i < logits.length; i++) {
            const e = Math.exp(Math.min(50, logits[i] - maxS));
            expS[i] = e;
            sumExp += e;
        }
        const denom = sumExp || 1.0;
        const out = new Array(logits.length);
        for (let i = 0; i < logits.length; i++) {
            out[i] = expS[i] / denom;
        }
        return out;
    }

    function computePriors(board, turn, moves, policyLogits, historySet = null, rootVal = 0.0, lastOwnKey = null, options = null) {
        const isW = (turn === 'w');
        const oppTurn = isW ? 'b' : 'w';
        const hasPolicy = !!(policyLogits && policyLogits.length > 0);
        const is4672 = hasPolicy && policyLogits.length === 4672;
        const inEg = isEndgamePosition(board);
        const nnLogits = [];
        const sortScores = [];
        let hasValidNnLogit = false;

        for (const m of moves) {
            const p = board[m.fromR][m.fromC];
            const isPromo = p && p.toLowerCase() === 'p' && (m.toR === 0 || m.toR === 7);
            const promoPiece = m.promotion || (isPromo ? 'q' : null);
            let rawNn = hasPolicy ? -999 : 0.0;

            if (hasPolicy) {
                if (is4672) {
                    const idx4672 = moveTo4672(m.fromR, m.fromC, m.toR, m.toC, promoPiece);
                    if (idx4672 !== null && policyLogits[idx4672] !== undefined) {
                        rawNn = policyLogits[idx4672];
                        hasValidNnLogit = true;
                    }
                } else {
                    const idx = (m.fromR * 8 + m.fromC) * 64 + (m.toR * 8 + m.toC);
                    if (policyLogits[idx] !== undefined) {
                        rawNn = policyLogits[idx];
                        hasValidNnLogit = true;
                    }
                }
            }
            nnLogits.push(rawNn);

            // Separate moderate move-ordering bias (+0.4..+2.0) from pure NN policy so swaps never blow up softmax
            let s = rawNn;

            if (isPromo) {
                const nbPromo = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC, promoPiece);
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
                    s -= 6.0;
                } else if (enemyAttack && !friendlyDefend) {
                    s -= 4.0;
                } else {
                    s += 1.5;
                }
            } else {
                const blunder = (m.blunder !== undefined) ? m.blunder : checkMoveTacticalBlunder(board, turn, m);
                if (blunder === 'skewer_fork') s -= 8.0;
                else if (blunder === 'hanging_piece') s -= 8.0;
                else if (blunder === 'bad_trade') s -= 5.0;
                else if (blunder === 'abandons_piece') s -= 6.0;
            }

            // Moderate tactical capture bias based on net exchange value (instead of +25cp logit explosion)
            const target = board[m.toR][m.toC];
            if (target) {
                const vVal = PIECE_VALUES[target.toLowerCase()] || 0;
                const aVal = p ? (PIECE_VALUES[p.toLowerCase()] || 0) : 0;
                const netGain = vVal - aVal;
                if (netGain > 50) {
                    s += Math.min(2.0, 0.6 + netGain / 400.0);
                } else if (netGain >= -50) {
                    s += 0.4;
                } else {
                    s -= 0.8;
                }
            }

            // Moderate passed pawn advancement ordering boost
            if (p && p.toLowerCase() === 'p' && isPassedPawn(board, m.fromR, m.fromC, isW)) {
                const adv = isW ? (7 - m.toR) : m.toR;
                if (adv < 7) {
                    const nbP = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                    const enemyAttack = isSquareAttacked(nbP, m.toR, m.toC, oppTurn);
                    const friendlyDefend = isSquareAttacked(nbP, m.toR, m.toC, turn);
                    if (enemyAttack && !friendlyDefend) {
                        s -= 2.5;
                    } else {
                        const advBoost = [0.0, 0.0, 0.0, 0.3, 0.5, 0.8, 1.2, 0.0][adv] || 0;
                        s += advBoost;
                    }
                }
            }

            // Repetition penalty only when NOT losing (allow perpetual check / saving draw below -0.25)
            if (historySet && historySet.size > 0) {
                const nbRep = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC);
                const destKey = boardToSimpleKey(nbRep, oppTurn);
                if (historySet.has(destKey)) {
                    const engineEval = (turn === 'w') ? rootVal : -rootVal;
                    if (engineEval >= -0.25) {
                        const isOsc = (lastOwnKey && destKey === lastOwnKey);
                        if (inEg) {
                            s -= (isOsc ? 6.0 : 4.0);
                        } else {
                            s -= (engineEval >= -0.15 ? 3.5 : 1.5);
                        }
                    }
                }
            }

            sortScores.push(s);
        }

        const sortPriors = softmaxLogits(sortScores);
        const nnPriors = (hasPolicy && hasValidNnLogit)
            ? softmaxLogits(nnLogits)
            : moves.map(() => 0.0);

        if (options && options.detailed) {
            return { sortPriors, nnPriors };
        }
        return sortPriors;
    }

    async function search5Ply(fen, topK1 = 14, topK2 = 8, topK3 = 4, topK4 = 3, history = null) {
        const startTime = performance.now();

        // 0. Endgame tablebase & solver (0ms)
        const egMove = getEndgameMove(fen);
        if (egMove) return egMove;

        const { board, turn, castling, epSquare } = fenToBoard(fen);
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
        const currentSimpleKey = boardToSimpleKey(board, turn);
        const lastOwnKey = computeLastOwnKey(recentKeys, currentSimpleKey, oppTurn);

        const legalMoves = getLegalMovesForFen(fen, { board, turn, castling, epSquare });
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) {
            return normalizeMovePromotion(board, legalMoves[0]);
        }

        // 1. Instant checkmate attack check
        const instantMate = findInstantMateMove(board, turn, legalMoves);
        if (instantMate) {
            console.log(`[Neural AI:5-Ply] 🏆 Instant checkmate detected: (${instantMate.fromR},${instantMate.fromC}) -> (${instantMate.toR},${instantMate.toC})`);
            return normalizeMovePromotion(board, instantMate);
        }

        // 1b. Checkmate-in-2 attack check
        const mateIn2 = findMateInTwoMove(board, turn, legalMoves, castling, epSquare);
        if (mateIn2) {
            console.log(`[Neural AI:5-Ply] 🎯 Forcing mate-in-2 detected: (${mateIn2.fromR},${mateIn2.fromC}) -> (${mateIn2.toR},${mateIn2.toC})`);
            return normalizeMovePromotion(board, mateIn2);
        }

        // Filter out blunder moves that immediately allow opponent instant mate
        const activeMoves = filterMatingBlunders(board, turn, legalMoves, castling, epSquare);

        // Step 1: Root pass
        const rootPlanes = new Float32Array(16 * 8 * 8);
        fillPlanes(rootPlanes, 0, board, turn, castling);
        const rootTensor = new ort.Tensor('float32', rootPlanes, [1, 16, 8, 8]);
        let rootResults = null;
        let policyLogits = null;
        let rootEval = 0.0;
        try {
            rootResults = await runSessionSerialized(session, { board_state: rootTensor });
            policyLogits = new Float32Array(rootResults.policy_logits.data);
            rootEval = rootResults.value.data[0];
        } finally {
            rootTensor?.dispose?.();
            rootResults?.policy_logits?.dispose?.();
            rootResults?.value?.dispose?.();
        }

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
        let p1Results = null;
        let p2Policies = null;
        try {
            p1Results = await runSessionSerialized(session, { board_state: p1Tensor });
            p2Policies = new Float32Array(p1Results.policy_logits.data);
        } finally {
            p1Tensor?.dispose?.();
            p1Results?.policy_logits?.dispose?.();
            p1Results?.value?.dispose?.();
        }

        const p2Branches = [];
        let totalP2Branches = 0;
        const polDim = Math.floor(p2Policies.length / numCandidates);

        for (let i = 0; i < numCandidates; i++) {
            const offset = i * polDim;
            const oppLegal = getLegalMovesForBoard(p1Boards[i], oppTurn, castling);
            const scoredOpp = [];
            for (const om of oppLegal) {
                const p = p1Boards[i][om.fromR][om.fromC];
                const isPromo = p && p.toLowerCase() === 'p' && (om.toR === 0 || om.toR === 7);
                const idx = (polDim === 4672)
                    ? moveTo4672(om.fromR, om.fromC, om.toR, om.toC, isPromo ? 'q' : null)
                    : (om.fromR * 8 + om.fromC) * 64 + (om.toR * 8 + om.toC);
                scoredOpp.push({ m: om, s: (idx !== null && p2Policies[offset + idx] !== undefined) ? p2Policies[offset + idx] : -999 });
            }
            scoredOpp.sort((a, b) => b.s - a.s);

            const candBranches = [];
            const limit = Math.min(topK2, scoredOpp.length);
            for (let k = 0; k < limit; k++) {
                const { fromR, fromC, toR, toC } = scoredOpp[k].m;
                const oNb = simulateMove(p1Boards[i], fromR, fromC, toR, toC);
                candBranches.push({ board: oNb, fr: fromR, fc: fromC, tr: toR, tc: toC });
            }
            p2Branches.push(candBranches);
            totalP2Branches += candBranches.length;
        }

        // Step 3: Ply 3 - Our counter-moves (Batched)
        let p3Policies = null;
        if (totalP2Branches > 0) {
            const p2Planes = new Float32Array(totalP2Branches * 16 * 8 * 8);
            let bIdxCounter = 0;
            for (let i = 0; i < numCandidates; i++) {
                for (const b of p2Branches[i]) {
                    fillPlanes(p2Planes, bIdxCounter * 16 * 8 * 8, b.board, turn, castling);
                    bIdxCounter++;
                }
            }

            const p2Tensor = new ort.Tensor('float32', p2Planes, [totalP2Branches, 16, 8, 8]);
            let p2Results = null;
            try {
                p2Results = await runSessionSerialized(session, { board_state: p2Tensor });
                p3Policies = new Float32Array(p2Results.policy_logits.data);
            } finally {
                p2Tensor?.dispose?.();
                p2Results?.policy_logits?.dispose?.();
                p2Results?.value?.dispose?.();
            }
        }

        // Step 4: Ply 4 - Opponent responses to our counters
        const p3Branches = [];
        let p3PlaneCounter = 0;
        let totalP3Counters = 0;
        const polDim3 = (totalP2Branches > 0 && p3Policies) ? Math.floor(p3Policies.length / totalP2Branches) : polDim;

        for (let i = 0; i < numCandidates; i++) {
            const candList = [];
            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                const b = p2Branches[i][bIdx];
                const offset = p3PlaneCounter * polDim3;
                p3PlaneCounter++;

                const ourLegal = getLegalMovesForBoard(b.board, turn, castling);
                const scoredOur = [];
                for (const cm of ourLegal) {
                    const p = b.board[cm.fromR][cm.fromC];
                    const isPromo = p && p.toLowerCase() === 'p' && (cm.toR === 0 || cm.toR === 7);
                    const idx = (polDim3 === 4672)
                        ? moveTo4672(cm.fromR, cm.fromC, cm.toR, cm.toC, isPromo ? 'q' : null)
                        : (cm.fromR * 8 + cm.fromC) * 64 + (cm.toR * 8 + cm.toC);
                    scoredOur.push({ m: cm, s: (p3Policies && idx !== null && p3Policies[offset + idx] !== undefined) ? p3Policies[offset + idx] : -999 });
                }
                scoredOur.sort((a, b) => b.s - a.s);

                const counterList = [];
                const limit = Math.min(topK3, scoredOur.length);
                for (let k = 0; k < limit; k++) {
                    const { fromR, fromC, toR, toC } = scoredOur[k].m;
                    const cNb = simulateMove(b.board, fromR, fromC, toR, toC);
                    counterList.push({ board: cNb, fr: fromR, fc: fromC, tr: toR, tc: toC });
                }
                candList.push(counterList);
                totalP3Counters += counterList.length;
            }
            p3Branches.push(candList);
        }

        let p4Policies = null;
        if (totalP3Counters > 0) {
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
            let p3Results = null;
            try {
                p3Results = await runSessionSerialized(session, { board_state: p3Tensor });
                p4Policies = new Float32Array(p3Results.policy_logits.data);
            } finally {
                p3Tensor?.dispose?.();
                p3Results?.policy_logits?.dispose?.();
                p3Results?.value?.dispose?.();
            }
        }

        // Step 5: Ply 5 - Final leaf positions evaluated with Value Head + Quiescence
        const p5Map = [];
        let p4PlaneCounter = 0;
        const polDim4 = (totalP3Counters > 0 && p4Policies) ? Math.floor(p4Policies.length / totalP3Counters) : polDim;

        for (let i = 0; i < numCandidates; i++) {
            for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                for (let cIdx = 0; cIdx < p3Branches[i][bIdx].length; cIdx++) {
                    const cItem = p3Branches[i][bIdx][cIdx];
                    const offset = p4PlaneCounter * polDim4;
                    p4PlaneCounter++;

                    const opp2Legal = getLegalMovesForBoard(cItem.board, oppTurn, castling);
                    const scoredOpp2 = [];
                    for (const om2 of opp2Legal) {
                        const p = cItem.board[om2.fromR][om2.fromC];
                        const isPromo = p && p.toLowerCase() === 'p' && (om2.toR === 0 || om2.toR === 7);
                        const idx = (polDim4 === 4672)
                            ? moveTo4672(om2.fromR, om2.fromC, om2.toR, om2.toC, isPromo ? 'q' : null)
                            : (om2.fromR * 8 + om2.fromC) * 64 + (om2.toR * 8 + om2.toC);
                        scoredOpp2.push({ m: om2, s: (p4Policies && idx !== null && p4Policies[offset + idx] !== undefined) ? p4Policies[offset + idx] : -999 });
                    }
                    scoredOpp2.sort((a, b) => b.s - a.s);

                    const limit = Math.min(topK4, scoredOpp2.length);
                    for (let k = 0; k < limit; k++) {
                        const { fromR, fromC, toR, toC } = scoredOpp2[k].m;
                        const o2Nb = simulateMove(cItem.board, fromR, fromC, toR, toC);
                        p5Map.push({ candI: i, bIdx: bIdx, cIdx: cIdx, board: o2Nb });
                    }
                }
            }
        }

        const totalP5Leaves = p5Map.length;
        let p5Values = null;
        if (totalP5Leaves > 0) {
            const p5Planes = new Float32Array(totalP5Leaves * 16 * 8 * 8);
            for (let l = 0; l < totalP5Leaves; l++) {
                fillPlanes(p5Planes, l * 16 * 8 * 8, p5Map[l].board, turn, castling);
            }

            const p5Tensor = new ort.Tensor('float32', p5Planes, [totalP5Leaves, 16, 8, 8]);
            let p5Results = null;
            try {
                p5Results = await runSessionSerialized(session, { board_state: p5Tensor });
                p5Values = new Float32Array(p5Results.value.data);
            } finally {
                p5Tensor?.dispose?.();
                p5Results?.policy_logits?.dispose?.();
                p5Results?.value?.dispose?.();
            }
        }

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

        if (p5Values) {
            for (let l = 0; l < totalP5Leaves; l++) {
                const item = p5Map[l];
                const neuralV = p5Values[l];
                const qCp = quiesce(item.board, turn, -10000, 10000, 4);
                const qEval = Math.tanh(qCp / 400.0);
                const leafScore = (0.65 * (persp * neuralV)) + (0.35 * qEval);
                tree[item.candI][item.bIdx][item.cIdx].push(leafScore);
            }
        }

        let bestCandidate = candidates[0];
        let bestTotalScore = -Infinity;

        for (let i = 0; i < numCandidates; i++) {
            const m = candidates[i];
            let worstBScore;

            if (p2Branches[i].length === 0) {
                worstBScore = isKingInCheck(p1Boards[i], oppTurn) ? 10.0 : 0.0;
            } else {
                worstBScore = Infinity;
                for (let bIdx = 0; bIdx < p2Branches[i].length; bIdx++) {
                    let bestCounterScore;
                    const counters = (p3Branches[i] && p3Branches[i][bIdx]) ? p3Branches[i][bIdx] : [];
                    if (counters.length === 0) {
                        bestCounterScore = isKingInCheck(p2Branches[i][bIdx].board, turn) ? -10.0 : 0.0;
                    } else {
                        bestCounterScore = -Infinity;
                        for (let cIdx = 0; cIdx < counters.length; cIdx++) {
                            const leafScores = tree[i][bIdx][cIdx];
                            let worstLeafScore;
                            if (leafScores && leafScores.length > 0) {
                                worstLeafScore = Math.min(...leafScores);
                            } else {
                                worstLeafScore = isKingInCheck(counters[cIdx].board, oppTurn) ? 10.0 : 0.0;
                            }
                            if (worstLeafScore > bestCounterScore) {
                                bestCounterScore = worstLeafScore;
                            }
                        }
                    }

                    if (bestCounterScore < worstBScore) {
                        worstBScore = bestCounterScore;
                    }
                }
            }

            let repPenalty = 0.0;
            if (historySet && historySet.size > 0) {
                const destKey = boardToSimpleKey(p1Boards[i], oppTurn);
                if (historySet.has(destKey)) {
                    const inEg = isEndgamePosition(p1Boards[i]);
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

        const { board, turn, castling, epSquare } = fenToBoard(fen);

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
        const oppTurn = (turn === 'w' ? 'b' : 'w');
        const currentSimpleKey = boardToSimpleKey(board, turn);
        const lastOwnKey = computeLastOwnKey(recentKeys, currentSimpleKey, oppTurn);

        const legalMoves = getLegalMovesForFen(fen, { board, turn, castling, epSquare });
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) return normalizeMovePromotion(board, legalMoves[0]);

        // Instant checkmate attack check
        const instantMate = findInstantMateMove(board, turn, legalMoves);
        if (instantMate) {
            console.log(`[Neural AI:MCTS] 🏆 Instant checkmate detected: (${instantMate.fromR},${instantMate.fromC}) -> (${instantMate.toR},${instantMate.toC})`);
            return normalizeMovePromotion(board, instantMate);
        }

        // Checkmate-in-2 attack check
        const mateIn2 = findMateInTwoMove(board, turn, legalMoves, castling, epSquare);
        if (mateIn2) {
            console.log(`[Neural AI:MCTS] 🎯 Forcing mate-in-2 detected: (${mateIn2.fromR},${mateIn2.fromC}) -> (${mateIn2.toR},${mateIn2.toC})`);
            return normalizeMovePromotion(board, mateIn2);
        }

        // Filter out fatal blunder moves that immediately allow opponent instant mate
        const activeMoves = filterMatingBlunders(board, turn, legalMoves, castling, epSquare);

        if (activeMoves.length === 1) return normalizeMovePromotion(board, activeMoves[0]);

        const evalCache = new Map();

        // Root evaluation
        const rootPlanes = new Float32Array(16 * 8 * 8);
        fillPlanes(rootPlanes, 0, board, turn, castling);
        const rootTensor = new ort.Tensor('float32', rootPlanes, [1, 16, 8, 8]);
        let rootResults = null;
        let rootPolicy = null;
        let rootVal = 0.0;
        try {
            rootResults = await runSessionSerialized(session, { board_state: rootTensor });
            rootPolicy = new Float32Array(rootResults.policy_logits.data);
            rootVal = rootResults.value.data[0];
        } finally {
            rootTensor?.dispose?.();
            rootResults?.policy_logits?.dispose?.();
            rootResults?.value?.dispose?.();
        }

        const rootPriors = computePriors(board, turn, activeMoves, rootPolicy, historySet, rootVal, lastOwnKey);

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
                // rootVal is from White's perspective; convert to node.turn's perspective
                const engineEval = (node.turn === 'w') ? rootVal : -rootVal;
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
                    const cacheKey = boardToSimpleKey(node.board, cTurn) + ':' + node.castling;
                    let leafPolicy = null;
                    if (evalCache.has(cacheKey)) {
                        const cached = evalCache.get(cacheKey);
                        leafPolicy = cached.policy;
                        leafVal = cached.val;
                    } else {
                        const planes = new Float32Array(16 * 8 * 8);
                        fillPlanes(planes, 0, node.board, cTurn, node.castling);
                        const tensor = new ort.Tensor('float32', planes, [1, 16, 8, 8]);
                        let res = null;
                        let nnVal = 0.0;
                        try {
                            res = await runSessionSerialized(session, { board_state: tensor });
                            leafPolicy = new Float32Array(res.policy_logits.data);
                            nnVal = res.value.data[0];
                        } finally {
                            tensor?.dispose?.();
                            res?.policy_logits?.dispose?.();
                            res?.value?.dispose?.();
                        }
                        const qCp = quiesce(node.board, cTurn, -10000, 10000, 2);
                        const qVal = Math.tanh(qCp / 400.0);
                        const pVal = (cTurn === 'w' ? nnVal : -nnVal);
                        leafVal = 0.75 * pVal + 0.25 * qVal;
                        if (evalCache.size < 2000) {
                            evalCache.set(cacheKey, { policy: leafPolicy, val: leafVal });
                        }
                    }

                    if (!node.isExpanded) {
                        const nextOpp = (cTurn === 'w' ? 'b' : 'w');
                        // computePriors expects White-perspective rootVal, whereas leafVal is cTurn-perspective
                        const childPriors = computePriors(node.board, cTurn, nextLegal, leafPolicy, historySet, (cTurn === 'w' ? leafVal : -leafVal));
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
                    const rootTurnEval = (turn === 'w') ? rootVal : -rootVal;
                    if (rootTurnEval >= -0.15) {
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

    let workerPool = [];
    let workersDisabled = false;
    let nextWorkerJobId = 1;
    let activeSearchToken = 0;
    let activeSearchCancel = null;
    const WORKER_SCRIPT_PATH = 'js/ai_neural_worker.js';

    function terminateWorkerPool() {
        if (typeof activeSearchCancel === 'function') {
            const cancelFn = activeSearchCancel;
            activeSearchCancel = null;
            cancelFn(true);
        }
        activeSearchToken++;
        for (let i = 0; i < workerPool.length; i++) {
            const entry = workerPool[i];
            if (entry && entry.worker) {
                try {
                    entry.worker.onmessage = null;
                    entry.worker.onerror = null;
                    if (typeof entry.worker.terminate === 'function') {
                        entry.worker.terminate();
                    }
                } catch (_) {
                    // Ignore worker termination errors
                }
            }
        }
        workerPool = [];
        workersDisabled = false;
        mainThreadTTDirty = false;
        lastSearchHistoryLen = 0;
    }

    function disableWorkerPool(reason, err) {
        if (err) {
            console.warn(`[Neural AI:WorkerPool] ${reason}:`, err);
        } else {
            console.warn(`[Neural AI:WorkerPool] ${reason}`);
        }
        terminateWorkerPool();
        workersDisabled = true;
    }

    function getWorkerPool(targetSize = 2) {
        if (workersDisabled || typeof Worker !== 'function') {
            return null;
        }
        const desired = Math.max(1, Math.min(4, targetSize));
        try {
            while (workerPool.length < desired) {
                const w = new Worker(WORKER_SCRIPT_PATH);
                const entry = { worker: w, activeHandler: null, activeErrorHandler: null, ttDirty: false };
                w.onmessage = (e) => {
                    if (entry.activeHandler) {
                        entry.activeHandler(e);
                    }
                };
                w.onerror = (err) => {
                    if (entry.activeErrorHandler) {
                        entry.activeErrorHandler(err);
                    } else {
                        disableWorkerPool('Worker runtime error, disabling pool', err);
                    }
                };
                workerPool.push(entry);
            }
            return workerPool.slice(0, desired);
        } catch (err) {
            disableWorkerPool('Worker pool unavailable, falling back to single-thread search', err);
            return null;
        }
    }

    function getWorkerMoveKey(m, board) {
        let promo = m && m.promotion ? String(m.promotion).toLowerCase() : '';
        if (!promo && board && m && board[m.fromR] && board[m.fromR][m.fromC]) {
            const piece = board[m.fromR][m.fromC];
            if ((piece === 'P' && m.toR === 0) || (piece === 'p' && m.toR === 7)) {
                promo = 'q';
            }
        }
        return `${m.fromR},${m.fromC}->${m.toR},${m.toC}:${promo}`;
    }

    const PRIOR_BONUS_CP = 20;

    function getPriorBonusCpForDepth(depth = 1) {
        if (typeof getDepthPriorBonusCp === 'function') {
            return getDepthPriorBonusCp(depth);
        }
        const d = (typeof depth === 'number' && Number.isFinite(depth) && depth >= 1) ? depth : 1;
        return Math.max(5, Math.round(PRIOR_BONUS_CP - (d - 1) * 1.35));
    }

    function approxCpFromScore(score) {
        if (typeof score !== 'number' || !Number.isFinite(score)) return -50000;
        if (typeof rootScoreToAlphaCp === 'function' && Math.abs(score) >= 8.0) {
            return rootScoreToAlphaCp(score);
        }
        if (Math.abs(score) >= 0.999999) {
            return score > 0 ? 27999 : -27999;
        }
        return Math.round(400.0 * Math.atanh(score));
    }

    function scoreFromCp(cp) {
        if (typeof cpToRootScore === 'function') {
            return cpToRootScore(cp);
        }
        if (cp >= 28000) return 8.0 + (cp - 28000) / 1000.0;
        if (cp <= -28000) return -8.0 + (cp + 28000) / 1000.0;
        return Math.tanh(cp / 400.0);
    }

    function computeBlendedCp(rawCp, prior, depth = 1) {
        if (Math.abs(rawCp) >= 28000) {
            return rawCp;
        }
        return rawCp + Math.round(getPriorBonusCpForDepth(depth) * prior);
    }

    function computeBlendedMoveScore(rawScore, prior, bestCp = null, depth = 1) {
        if (typeof bestCp === 'number' && Number.isFinite(bestCp)) {
            if (Math.abs(bestCp) >= 28000) {
                return scoreFromCp(bestCp);
            }
            return Math.tanh(computeBlendedCp(bestCp, prior, depth) / 400.0);
        }
        const bonusCp = getPriorBonusCpForDepth(depth);
        if (Math.abs(rawScore) < 1.0) {
            const deriv = 1.0 - rawScore * rawScore;
            return rawScore + (bonusCp / 400.0) * deriv * prior;
        }
        return rawScore;
    }

    async function runWorkerPoolSearch({
        board,
        turn,
        castling,
        epSquare,
        historyKeys,
        activeMoves,
        rootPriors,
        rootSortPriors = null,
        maxDepth,
        timeLimitMs,
        startTime
    }) {
        if (workersDisabled || typeof Worker !== 'function' || activeMoves.length < 2) {
            return null;
        }

        // Cancel any superseded in-flight worker search BEFORE acquiring the pool (so !sabView rebuilds pool cleanly)
        if (typeof activeSearchCancel === 'function') {
            const prevCancel = activeSearchCancel;
            activeSearchCancel = null;
            prevCancel(false);
        }

        const hwCores = (typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0)
            ? Math.floor(navigator.hardwareConcurrency)
            : 4;
        const poolSize = Math.min(4, Math.max(2, hwCores - 1), activeMoves.length);
        const pool = getWorkerPool(poolSize);
        if (!pool || pool.length < 2) {
            return null;
        }

        // Order candidates by descending sortPriors (moderate tactical + NN ordering) while keeping pure NN priors for rootBonus
        const paired = [];
        const priorByMoveKey = new Map();
        const sortOrderPriors = Array.isArray(rootSortPriors) ? rootSortPriors : rootPriors;
        for (let i = 0; i < activeMoves.length; i++) {
            const m = activeMoves[i];
            const prior = (rootPriors && typeof rootPriors[i] === 'number' && Number.isFinite(rootPriors[i])) ? rootPriors[i] : 0.0;
            const sortPrior = (sortOrderPriors && typeof sortOrderPriors[i] === 'number' && Number.isFinite(sortOrderPriors[i]))
                ? sortOrderPriors[i]
                : prior;
            const key = getWorkerMoveKey(m, board);
            paired.push({ move: m, prior, sortPrior, key });
            priorByMoveKey.set(key, prior);
        }
        paired.sort((a, b) => b.sortPrior - a.sortPrior);

        const myToken = ++activeSearchToken;

        let sabView = null;
        if (
            typeof self !== 'undefined' &&
            self.crossOriginIsolated === true &&
            typeof SharedArrayBuffer === 'function' &&
            typeof Atomics === 'object'
        ) {
            try {
                sabView = new Int32Array(new SharedArrayBuffer(16));
                sabView[0] = 0;      // stopFlag: 0=run, 1=stop
                sabView[1] = -50000; // globalBestBlendedCp
            } catch (_) {
                sabView = null;
            }
        }

        let searchCancelled = false;
        let poolTerminatedLocally = false;
        let activeWaveCleanup = null;

        const cancelThisSearch = (fromTerminate = false) => {
            if (searchCancelled) return;
            searchCancelled = true;
            if (activeSearchCancel === cancelThisSearch) {
                activeSearchCancel = null;
            }
            let signaledSab = false;
            if (sabView) {
                try {
                    Atomics.store(sabView, 0, 1);
                    signaledSab = true;
                } catch (_) {
                    signaledSab = false;
                }
            }
            if (!fromTerminate && !signaledSab && !poolTerminatedLocally) {
                poolTerminatedLocally = true;
                terminateWorkerPool();
            }
            if (typeof activeWaveCleanup === 'function') {
                const cleanup = activeWaveCleanup;
                activeWaveCleanup = null;
                cleanup();
            }
        };
        activeSearchCancel = cancelThisSearch;

        const isExternallyAborted = () => searchCancelled || (!poolTerminatedLocally && myToken !== activeSearchToken);

        const cleanupHandlers = () => {
            for (let i = 0; i < pool.length; i++) {
                pool[i].activeHandler = null;
                pool[i].activeErrorHandler = null;
            }
        };

        const wave1MaxDepth = Math.min(maxDepth, 4);
        const usePersistentTT = maxDepth > 4;

        const runWave1 = () => {
            const remainingTime = Math.max(50, Math.round(timeLimitMs - (performance.now() - startTime)));
            const shards = Array.from({ length: pool.length }, () => ({ moves: [], priors: [] }));
            for (let i = 0; i < paired.length; i++) {
                const bucket = shards[i % pool.length];
                bucket.moves.push(paired[i].move);
                bucket.priors.push(paired[i].prior);
            }
            const watchdogMs = Math.max(100, remainingTime) + 600;

            return new Promise((resolve) => {
                let settled = false;
                let respondedCount = 0;
                const respondedShards = new Set();
                const results = [];
                let watchdogTimer = null;

                const clearWaveTimerAndHandlers = () => {
                    if (watchdogTimer !== null) {
                        clearTimeout(watchdogTimer);
                        watchdogTimer = null;
                    }
                    cleanupHandlers();
                    if (activeWaveCleanup === cancelWave1) {
                        activeWaveCleanup = null;
                    }
                };

                const cancelWave1 = () => {
                    if (settled) return;
                    settled = true;
                    clearWaveTimerAndHandlers();
                    resolve({ cancelled: true });
                };
                activeWaveCleanup = cancelWave1;

                const finishWave1 = (timedOut, hadError) => {
                    if (settled) return;
                    settled = true;
                    clearWaveTimerAndHandlers();

                    if (isExternallyAborted()) {
                        resolve({ cancelled: true });
                        return;
                    }

                    if (timedOut) {
                        // Watchdog timeout: hung worker did not respect its deadline -> always recreate pool
                        poolTerminatedLocally = true;
                        if (activeSearchCancel === cancelThisSearch) {
                            activeSearchCancel = null;
                        }
                        terminateWorkerPool();
                        if (!respondedShards.has(0)) {
                            // Shard 0 owns the top-prior PV move; do not trust partial side-line moves alone
                            resolve(null);
                            return;
                        }
                    }

                    if (hadError) {
                        resolve(null);
                        return;
                    }

                    const entryByKey = new Map();
                    const moveEntries = paired.map((item, idx) => {
                        const entry = {
                            move: item.move,
                            prior: item.prior,
                            sortPrior: item.sortPrior,
                            key: item.key,
                            score: -Infinity,
                            cp: -50000,
                            blendedCp: -50000,
                            blendedScore: -Infinity,
                            isUpperBound: false,
                            lastWorkerIdx: idx % pool.length,
                            nodes: 0
                        };
                        entryByKey.set(item.key, entry);
                        return entry;
                    });

                    let bestMove = null;
                    let bestRawScore = -Infinity;
                    let bestRawCp = -50000;
                    let bestBlended = -Infinity;
                    let bestBlendedCp = -50000;
                    let totalNodes = 0;
                    let minCompletedDepth = Infinity;
                    let anyWorkerTimedOut = !!timedOut;

                    for (let i = 0; i < results.length; i++) {
                        const { wIdx, res } = results[i];
                        if (!res || !res.bestMove) continue;
                        totalNodes += (typeof res.nodes === 'number' ? res.nodes : 0);
                        if (res.timedOut) anyWorkerTimedOut = true;
                        const wDepth = (typeof res.completedDepth === 'number') ? res.completedDepth : wave1MaxDepth;
                        if (wDepth < minCompletedDepth) {
                            minCompletedDepth = wDepth;
                        }
                        if (Array.isArray(res.moveResults)) {
                            for (let j = 0; j < res.moveResults.length; j++) {
                                const mr = res.moveResults[j];
                                if (!mr || !mr.move) continue;
                                const mrKey = getWorkerMoveKey(mr.move, board);
                                const target = entryByKey.get(mrKey);
                                if (target) {
                                    target.lastWorkerIdx = wIdx;
                                    const mrScore = (typeof mr.score === 'number' && Number.isFinite(mr.score))
                                        ? mr.score
                                        : ((typeof mr.cp === 'number' && Number.isFinite(mr.cp)) ? scoreFromCp(mr.cp) : -Infinity);
                                    const mrCp = (typeof mr.cp === 'number' && Number.isFinite(mr.cp))
                                        ? mr.cp
                                        : (Number.isFinite(mrScore) ? approxCpFromScore(mrScore) : -50000);
                                    const mrBlendedCp = (typeof mr.blendedCp === 'number' && Number.isFinite(mr.blendedCp))
                                        ? mr.blendedCp
                                        : (mrCp > -50000 ? computeBlendedCp(mrCp, target.prior, wDepth || wave1MaxDepth) : -50000);
                                    const mrBlended = (typeof mr.blendedScore === 'number' && Number.isFinite(mr.blendedScore))
                                        ? mr.blendedScore
                                        : (mrBlendedCp > -50000 ? scoreFromCp(mrBlendedCp) : computeBlendedMoveScore(mrScore, target.prior, mrCp > -50000 ? mrCp : null, wDepth || wave1MaxDepth));

                                    if (Number.isFinite(mrScore)) target.score = mrScore;
                                    if (mrCp > -50000) target.cp = mrCp;
                                    if (mrBlendedCp > -50000) target.blendedCp = mrBlendedCp;
                                    if (Number.isFinite(mrBlended)) target.blendedScore = mrBlended;
                                    if (typeof mr.nodes === 'number' && Number.isFinite(mr.nodes)) {
                                        target.nodes = mr.nodes;
                                    }
                                    target.isUpperBound = (mr.failedLow === true || mr.bound === 'upper');
                                }
                            }
                        }

                        const m = res.bestMove;
                        const moveKey = getWorkerMoveKey(m, board);
                        const prior = (typeof res.bestPrior === 'number' && Number.isFinite(res.bestPrior))
                            ? res.bestPrior
                            : (priorByMoveKey.get(moveKey) || 0.0);
                        const rawScore = (typeof res.bestScore === 'number' && Number.isFinite(res.bestScore))
                            ? res.bestScore
                            : ((typeof res.bestCp === 'number' && Number.isFinite(res.bestCp)) ? scoreFromCp(res.bestCp) : -Infinity);
                        const bestCp = (typeof res.bestCp === 'number' && Number.isFinite(res.bestCp))
                            ? res.bestCp
                            : (Number.isFinite(rawScore) ? approxCpFromScore(rawScore) : null);
                        const blendedCp = (bestCp !== null)
                            ? computeBlendedCp(bestCp, prior, wDepth || wave1MaxDepth)
                            : -50000;
                        const blended = (bestCp !== null)
                            ? scoreFromCp(blendedCp)
                            : computeBlendedMoveScore(rawScore, prior, null, wDepth || wave1MaxDepth);

                        const target = entryByKey.get(moveKey);
                        if (target) {
                            target.lastWorkerIdx = wIdx;
                            if (!Number.isFinite(target.score) && Number.isFinite(rawScore)) {
                                target.score = rawScore;
                                if (bestCp !== null) target.cp = bestCp;
                                if (blendedCp > -50000) target.blendedCp = blendedCp;
                                target.blendedScore = blended;
                            }
                        }

                        const isBetter = (bestCp !== null && bestRawCp > -50000)
                            ? (blendedCp > bestBlendedCp || (blendedCp === bestBlendedCp && bestCp > bestRawCp))
                            : (blended > bestBlended);
                        if (!bestMove || isBetter) {
                            bestBlended = blended;
                            bestBlendedCp = blendedCp;
                            bestRawScore = rawScore;
                            bestRawCp = (bestCp !== null) ? bestCp : approxCpFromScore(rawScore);
                            bestMove = m;
                        }
                    }

                    if (!bestMove) {
                        resolve(null);
                        return;
                    }

                    const completedDepth = Number.isFinite(minCompletedDepth) ? minCompletedDepth : wave1MaxDepth;
                    resolve({
                        bestMove,
                        bestScore: bestBlended,
                        bestBlendedCp,
                        bestRawScore,
                        bestRawCp,
                        completedDepth,
                        nodes: totalNodes,
                        workerCount: pool.length,
                        timedOut: anyWorkerTimedOut,
                        moveEntries
                    });
                };

                watchdogTimer = setTimeout(() => {
                    finishWave1(true, false);
                }, watchdogMs);

                for (let wIdx = 0; wIdx < pool.length; wIdx++) {
                    const entry = pool[wIdx];
                    const shard = shards[wIdx];
                    const jobId = nextWorkerJobId++;
                    let workerDone = false;

                    entry.activeHandler = (e) => {
                        if (settled || workerDone || isExternallyAborted()) return;
                        const data = e && e.data ? e.data : {};
                        if (data.jobId === null && data.ok === false) {
                            workerDone = true;
                            poolTerminatedLocally = true;
                            disableWorkerPool('Worker startup failed', data.error);
                            finishWave1(false, true);
                            return;
                        }
                        if (data.jobId !== jobId) return;

                        workerDone = true;
                        respondedCount++;
                        respondedShards.add(wIdx);
                        if (data.ok && data.result && data.result.bestMove) {
                            results.push({ wIdx, res: data.result });
                        } else if (data.stale) {
                            finishWave1(false, true);
                            return;
                        } else {
                            const errDetail = data.stack
                                ? `${data.error || 'No result returned'}\n${data.stack}`
                                : (data.error || 'No result returned');
                            poolTerminatedLocally = true;
                            disableWorkerPool('Worker search failed', errDetail);
                            finishWave1(false, true);
                            return;
                        }

                        if (respondedCount >= pool.length) {
                            finishWave1(false, false);
                        }
                    };

                    entry.activeErrorHandler = (err) => {
                        if (settled || workerDone || isExternallyAborted()) return;
                        workerDone = true;
                        poolTerminatedLocally = true;
                        disableWorkerPool('Worker error event', err);
                        finishWave1(false, true);
                    };

                    try {
                        const sentAt = Date.now();
                        const payload = {
                            jobId,
                            action: 'searchRootMoves',
                            board,
                            turn,
                            castling,
                            epSquare,
                            historyKeys,
                            rootMoves: shard.moves,
                            rootPriors: shard.priors,
                            maxDepth: wave1MaxDepth,
                            timeLimitMs: remainingTime,
                            sentAt,
                            deadlineAt: sentAt + remainingTime
                        };
                        if (sabView) {
                            payload.sharedBuffer = sabView;
                        }
                        if (usePersistentTT) {
                            payload.reuseTT = !entry.ttDirty;
                            entry.ttDirty = false;
                        }
                        entry.worker.postMessage(payload);
                    } catch (postErr) {
                        workerDone = true;
                        poolTerminatedLocally = true;
                        disableWorkerPool('Worker postMessage failed', postErr);
                        finishWave1(false, true);
                        return;
                    }
                }
            });
        };

        const wave1 = await runWave1();
        if (isExternallyAborted() || (wave1 && wave1.cancelled)) {
            if (activeSearchCancel === cancelThisSearch) {
                activeSearchCancel = null;
            }
            return { cancelled: true, bestMove: null };
        }
        if (!wave1) {
            if (activeSearchCancel === cancelThisSearch) {
                activeSearchCancel = null;
            }
            return null;
        }

        const remAfterWave1 = Math.round(timeLimitMs - (performance.now() - startTime));
        if (
            wave1.timedOut ||
            maxDepth <= wave1MaxDepth ||
            wave1.bestRawCp >= 28000 ||
            wave1.bestRawScore >= 9.9 ||
            remAfterWave1 <= 120
        ) {
            if (activeSearchCancel === cancelThisSearch) {
                activeSearchCancel = null;
            }
            return {
                bestMove: wave1.bestMove,
                bestScore: wave1.bestScore,
                bestCp: wave1.bestRawCp,
                completedDepth: wave1.completedDepth,
                nodes: wave1.nodes,
                workerCount: pool.length
            };
        }

        // Helper: keep tactical forcing moves (captures, promotions, checks) during Wave 1->2 pruning
        const oppTurn = (turn === 'w') ? 'b' : 'w';
        const isTacticalRootMove = (m) => {
            if (!m) return false;
            if (m.promotion) return true;
            if (board[m.toR] && board[m.toR][m.toC]) return true;
            const piece = board[m.fromR] && board[m.fromR][m.fromC];
            if (piece && piece.toLowerCase() === 'p' && m.fromC !== m.toC) return true;
            const nb = simulateMove(board, m.fromR, m.fromC, m.toR, m.toC, m.promotion || null, epSquare);
            return isKingInCheck(nb, oppTurn);
        };

        // Wave 2+ (d = wave1MaxDepth + 1 .. maxDepth): Dynamic work-stealing with exact cp bounds and Worker Affinity
        let activeCandidates = wave1.moveEntries.slice();
        const minKeep = Math.min(activeCandidates.length, Math.max(4, pool.length));
        const wave1BestKey = getWorkerMoveKey(wave1.bestMove, board);
        if (Number.isFinite(wave1.bestRawCp) && wave1.bestRawCp > -50000 && activeCandidates.length > minKeep) {
            const pruneCpFloor = wave1.bestRawCp - 400;
            const kept = activeCandidates.filter((c) =>
                c.key === wave1BestKey ||
                !Number.isFinite(c.cp) ||
                c.cp <= -50000 ||
                c.cp >= pruneCpFloor ||
                isTacticalRootMove(c.move)
            );
            if (kept.length >= minKeep) {
                activeCandidates = kept;
            }
        }

        const committed = {
            bestMove: wave1.bestMove,
            bestScore: wave1.bestScore,
            bestBlendedCp: wave1.bestBlendedCp,
            bestRawScore: wave1.bestRawScore,
            bestRawCp: wave1.bestRawCp,
            completedDepth: wave1.completedDepth,
            pvStableCount: 1,
            nodes: wave1.nodes
        };

        const runDynamicDepthWave = (depth, queue, pvKey, remForDepth) => {
            if (sabView) {
                try {
                    Atomics.store(sabView, 0, 0);
                    Atomics.store(sabView, 1, -50000);
                } catch (_) {
                    // Ignore SAB errors
                }
            }
            return new Promise((resolve) => {
                let waveSettled = false;
                const pendingQueue = queue.slice();
                let inFlight = 0;
                let depthTimedOut = false;
                let depthHadError = false;
                let depthWatchdog = null;
                let pvCompletedAtD = false;
                let pvResultAtD = null;
                let depthBestMove = null;
                let depthBestRaw = -Infinity;
                let depthBestRawCp = -50000;
                let depthBestBlended = -Infinity;
                let depthBestBlendedCp = -50000;
                let depthNodes = 0;
                const workerJobs = new Array(pool.length).fill(null);

                // Worker Affinity: pin PV to the worker that evaluated PV best so far (preserves hot subtree TT)
                const pvLastWorker = (pendingQueue[0] && typeof pendingQueue[0].lastWorkerIdx === 'number' && pendingQueue[0].lastWorkerIdx < pool.length)
                    ? pendingQueue[0].lastWorkerIdx
                    : 0;
                const pvWorkerIdx = pvLastWorker;
                let ybwcPending = (
                    pendingQueue.length >= Math.max(4, pool.length + 1) &&
                    pendingQueue[0].key === pvKey
                );

                const clearDepthResources = () => {
                    if (depthWatchdog !== null) {
                        clearTimeout(depthWatchdog);
                        depthWatchdog = null;
                    }
                    cleanupHandlers();
                    if (activeWaveCleanup === cancelDepthWave) {
                        activeWaveCleanup = null;
                    }
                };

                const finishWave = (status) => {
                    if (waveSettled) return;
                    waveSettled = true;
                    clearDepthResources();
                    resolve({
                        status,
                        depthBestMove,
                        depthBestRaw,
                        depthBestRawCp,
                        depthBestBlended,
                        depthBestBlendedCp,
                        depthNodes,
                        pvCompletedAtD,
                        pvResultAtD
                    });
                };

                const cancelDepthWave = () => {
                    if (waveSettled) return;
                    waveSettled = true;
                    clearDepthResources();
                    resolve({ status: 'cancelled' });
                };
                activeWaveCleanup = cancelDepthWave;

                depthWatchdog = setTimeout(() => {
                    if (waveSettled) return;
                    // Watchdog timeout: hung worker did not respect deadline -> always recreate pool
                    poolTerminatedLocally = true;
                    if (activeSearchCancel === cancelThisSearch) {
                        activeSearchCancel = null;
                    }
                    terminateWorkerPool();
                    finishWave('watchdog');
                }, Math.max(120, remForDepth) + 450);

                const pickCandidateForWorker = (wIdx) => {
                    if (pendingQueue.length === 0) return null;
                    if (pendingQueue[0].key === pvKey) {
                        return pendingQueue.shift();
                    }
                    const lookahead = Math.min(3, pendingQueue.length);
                    for (let i = 0; i < lookahead; i++) {
                        if (pendingQueue[i].lastWorkerIdx === wIdx) {
                            return pendingQueue.splice(i, 1)[0];
                        }
                    }
                    return pendingQueue.shift();
                };

                const dispatchNextToWorker = (wIdx) => {
                    if (waveSettled || isExternallyAborted() || depthTimedOut || depthHadError) return false;
                    if (pendingQueue.length === 0 || depthBestRawCp >= 28000 || depthBestRaw >= 9.9) return false;
                    const nowRem = Math.round(timeLimitMs - (performance.now() - startTime));
                    if (nowRem <= 35) {
                        depthTimedOut = true;
                        return false;
                    }

                    const cand = pickCandidateForWorker(wIdx);
                    if (!cand) return false;
                    const jobId = nextWorkerJobId++;
                    const sentAt = Date.now();
                    const hasDepthAlpha = Number.isFinite(depthBestBlendedCp) && depthBestBlendedCp > -50000;
                    const candPriorBonusCp = Math.round(getPriorBonusCpForDepth(depth) * cand.prior);
                    const jobMinAlphaRawCp = (cand.key !== pvKey && hasDepthAlpha)
                        ? ((Math.abs(depthBestBlendedCp) >= 28000) ? depthBestBlendedCp : (depthBestBlendedCp - candPriorBonusCp))
                        : undefined;
                    const jobMinAlphaScore = (jobMinAlphaRawCp !== undefined) ? scoreFromCp(jobMinAlphaRawCp) : undefined;
                    const jobMinAlphaBlendedCp = (cand.key !== pvKey && hasDepthAlpha) ? depthBestBlendedCp : undefined;

                    const jobExpectedCp = (
                        jobMinAlphaRawCp === undefined &&
                        typeof cand.cp === 'number' &&
                        Number.isFinite(cand.cp) &&
                        cand.cp > -50000 &&
                        Math.abs(cand.cp) < 28000
                    ) ? cand.cp : undefined;
                    const jobExpectedScore = (
                        jobMinAlphaRawCp === undefined &&
                        jobExpectedCp === undefined &&
                        Number.isFinite(cand.score) &&
                        Math.abs(cand.score) < 0.999
                    ) ? cand.score : undefined;

                    workerJobs[wIdx] = { jobId, cand, jobMinAlphaRawCp, jobMinAlphaScore, jobMinAlphaBlendedCp };
                    inFlight++;

                    const payload = {
                        jobId,
                        action: 'searchRootMoves',
                        board,
                        turn,
                        castling,
                        epSquare,
                        historyKeys,
                        rootMoves: [cand.move],
                        rootPriors: [cand.prior],
                        startDepth: depth,
                        maxDepth: depth,
                        reuseTT: true,
                        ageHistory: false,
                        timeLimitMs: nowRem,
                        sentAt,
                        deadlineAt: sentAt + nowRem
                    };
                    if (jobMinAlphaRawCp !== undefined) payload.minAlphaCp = jobMinAlphaRawCp;
                    if (jobMinAlphaScore !== undefined) payload.minAlphaScore = jobMinAlphaScore;
                    if (jobExpectedCp !== undefined) payload.expectedCp = jobExpectedCp;
                    if (jobExpectedScore !== undefined) payload.expectedScore = jobExpectedScore;
                    if (sabView) payload.sharedBuffer = sabView;

                    try {
                        pool[wIdx].worker.postMessage(payload);
                        return true;
                    } catch (postErr) {
                        inFlight--;
                        workerJobs[wIdx] = null;
                        depthHadError = true;
                        poolTerminatedLocally = true;
                        if (activeSearchCancel === cancelThisSearch) {
                            activeSearchCancel = null;
                        }
                        disableWorkerPool('Worker postMessage failed in wave', postErr);
                        finishWave('error');
                        return false;
                    }
                };

                for (let wIdx = 0; wIdx < pool.length; wIdx++) {
                    const entry = pool[wIdx];
                    entry.activeHandler = (e) => {
                        if (waveSettled || isExternallyAborted()) return;
                        const data = e && e.data ? e.data : {};
                        if (data.jobId === null && data.ok === false) {
                            depthHadError = true;
                            poolTerminatedLocally = true;
                            if (activeSearchCancel === cancelThisSearch) {
                                activeSearchCancel = null;
                            }
                            disableWorkerPool('Worker startup failed', data.error);
                            finishWave('error');
                            return;
                        }
                        const currentJob = workerJobs[wIdx];
                        if (!currentJob || data.jobId !== currentJob.jobId) return;

                        workerJobs[wIdx] = null;
                        inFlight--;

                        const cand = currentJob.cand;
                        const res = data.result;
                        const moveNodes = (data.ok && res && typeof res.nodes === 'number') ? res.nodes : 0;
                        if (moveNodes > 0) {
                            depthNodes += moveNodes;
                            cand.nodes = moveNodes;
                        }

                        if (
                            data.ok &&
                            res &&
                            res.bestMove &&
                            !res.timedOut &&
                            res.completedDepth >= depth &&
                            Number.isFinite(res.bestScore)
                        ) {
                            const m = res.bestMove;
                            cand.lastWorkerIdx = wIdx;
                            const prior = (typeof res.bestPrior === 'number' && Number.isFinite(res.bestPrior))
                                ? res.bestPrior
                                : cand.prior;
                            const rawScore = res.bestScore;
                            const hasExactCp = (typeof res.bestCp === 'number' && Number.isFinite(res.bestCp));
                            const rawCp = hasExactCp ? res.bestCp : approxCpFromScore(rawScore);
                            const blendedCp = computeBlendedCp(rawCp, prior, depth);
                            const blended = hasExactCp ? scoreFromCp(blendedCp) : computeBlendedMoveScore(rawScore, prior, null, depth);

                            const isFailLowBound = (
                                res.failedLow === true ||
                                res.bound === 'upper' ||
                                (currentJob.jobMinAlphaRawCp !== undefined && hasExactCp && rawCp <= currentJob.jobMinAlphaRawCp) ||
                                (!hasExactCp && currentJob.jobMinAlphaScore !== undefined && rawScore <= currentJob.jobMinAlphaScore)
                            );

                            if (isFailLowBound) {
                                // Only store upper bound if candidate had no finite exact score yet, and mark upper bound
                                if (!Number.isFinite(cand.blendedScore) || (cand.isUpperBound && blendedCp < cand.blendedCp)) {
                                    cand.score = rawScore;
                                    cand.cp = rawCp;
                                    cand.blendedCp = blendedCp;
                                    cand.blendedScore = blended;
                                    cand.isUpperBound = true;
                                }
                            } else {
                                cand.isUpperBound = false;
                                cand.score = rawScore;
                                cand.cp = rawCp;
                                cand.blendedCp = blendedCp;
                                cand.blendedScore = blended;

                                if (cand.key === pvKey) {
                                    pvCompletedAtD = true;
                                    pvResultAtD = { move: m, score: rawScore, rawCp, blendedScore: blended, blendedCp };
                                }

                                const beatsDepthBest = (
                                    !depthBestMove ||
                                    blendedCp > depthBestBlendedCp ||
                                    (blendedCp === depthBestBlendedCp && rawCp > depthBestRawCp)
                                );
                                if (beatsDepthBest) {
                                    depthBestBlendedCp = blendedCp;
                                    depthBestBlended = blended;
                                    depthBestRaw = rawScore;
                                    depthBestRawCp = rawCp;
                                    depthBestMove = m;

                                    if (sabView) {
                                        try {
                                            Atomics.store(sabView, 1, depthBestBlendedCp);
                                            if (depthBestRawCp >= 28000 || depthBestRaw >= 9.9) {
                                                Atomics.store(sabView, 0, 1);
                                            }
                                        } catch (_) {}
                                    }
                                }
                            }

                            if (ybwcPending) {
                                ybwcPending = false;
                                for (let offset = 1; offset <= pool.length; offset++) {
                                    const wi = (pvWorkerIdx + offset) % pool.length;
                                    if (workerJobs[wi] === null) {
                                        if (!dispatchNextToWorker(wi) && (waveSettled || depthHadError)) {
                                            break;
                                        }
                                    }
                                }
                            } else {
                                dispatchNextToWorker(wIdx);
                            }
                        } else if (data.stale || (data.ok && res && (res.timedOut || res.completedDepth < depth))) {
                            depthTimedOut = true;
                        } else {
                            const errDetail = data.stack
                                ? `${data.error || 'No result returned'}\n${data.stack}`
                                : (data.error || 'No result returned');
                            depthHadError = true;
                            poolTerminatedLocally = true;
                            if (activeSearchCancel === cancelThisSearch) {
                                activeSearchCancel = null;
                            }
                            disableWorkerPool('Worker wave search failed', errDetail);
                            finishWave('error');
                            return;
                        }

                        if (!waveSettled && inFlight <= 0) {
                            if (depthHadError) finishWave('error');
                            else if (depthTimedOut) finishWave('timeout');
                            else finishWave('done');
                        }
                    };

                    entry.activeErrorHandler = (err) => {
                        if (waveSettled || isExternallyAborted()) return;
                        depthHadError = true;
                        poolTerminatedLocally = true;
                        if (activeSearchCancel === cancelThisSearch) {
                            activeSearchCancel = null;
                        }
                        disableWorkerPool('Worker error event in wave', err);
                        finishWave('error');
                    };
                }

                if (ybwcPending) {
                    dispatchNextToWorker(pvWorkerIdx);
                } else {
                    for (let wIdx = 0; wIdx < pool.length; wIdx++) {
                        if (!dispatchNextToWorker(wIdx) && (waveSettled || depthHadError)) {
                            break;
                        }
                    }
                }
                if (!waveSettled && inFlight <= 0) {
                    if (depthHadError) finishWave('error');
                    else if (depthTimedOut) finishWave('timeout');
                    else finishWave('done');
                }
            });
        };

        for (let d = wave1.completedDepth + 1; d <= maxDepth; d++) {
            if (isExternallyAborted()) {
                if (activeSearchCancel === cancelThisSearch) {
                    activeSearchCancel = null;
                }
                return { cancelled: true, bestMove: null };
            }
            const remForDepth = Math.round(timeLimitMs - (performance.now() - startTime));
            if (remForDepth <= 120 || committed.bestRawCp >= 28000 || committed.bestRawScore >= 9.9) {
                break;
            }

            const pvKey = getWorkerMoveKey(committed.bestMove, board);
            const prevBestRawCp = committed.bestRawCp;
            const queue = activeCandidates.slice().sort((a, b) => {
                const aPv = a.key === pvKey ? 1 : 0;
                const bPv = b.key === pvKey ? 1 : 0;
                if (aPv !== bPv) return bPv - aPv;

                // Exact-bound moves always sort ahead of fail-low (upper-bound) moves
                const aUpper = !!a.isUpperBound;
                const bUpper = !!b.isUpperBound;
                if (aUpper !== bUpper) return aUpper ? 1 : -1;

                if (!aUpper) {
                    const aFinite = Number.isFinite(a.blendedCp) && a.blendedCp > -50000;
                    const bFinite = Number.isFinite(b.blendedCp) && b.blendedCp > -50000;
                    if (aFinite !== bFinite) return bFinite ? 1 : -1;
                    if (aFinite && bFinite) {
                        const diff = b.blendedCp - a.blendedCp;
                        if (Math.abs(diff) > 8) return diff;
                        if (b.nodes !== a.nodes) return b.nodes - a.nodes;
                        if (diff !== 0) return diff;
                    }
                } else {
                    // Fail-low moves sorted by refutation complexity (nodes)
                    if (b.nodes !== a.nodes) return b.nodes - a.nodes;
                }
                return b.sortPrior - a.sortPrior;
            });

            const waveRes = await runDynamicDepthWave(d, queue, pvKey, remForDepth);
            if (isExternallyAborted() || !waveRes || waveRes.status === 'cancelled') {
                if (activeSearchCancel === cancelThisSearch) {
                    activeSearchCancel = null;
                }
                return { cancelled: true, bestMove: null };
            }

            committed.nodes += (waveRes.depthNodes || 0);

            if (waveRes.status === 'done' && waveRes.depthBestMove) {
                const newBestKey = getWorkerMoveKey(waveRes.depthBestMove, board);
                committed.pvStableCount = (newBestKey === pvKey) ? (committed.pvStableCount + 1) : 1;
                committed.bestMove = waveRes.depthBestMove;
                committed.bestScore = waveRes.depthBestBlended;
                committed.bestBlendedCp = waveRes.depthBestBlendedCp;
                committed.bestRawScore = waveRes.depthBestRaw;
                committed.bestRawCp = waveRes.depthBestRawCp;
                committed.completedDepth = d;

                // Dynamic Time Management: Early Exit on obvious stable moves
                const elapsedSoFar = performance.now() - startTime;
                const droppedFromPrev = (Number.isFinite(prevBestRawCp) && prevBestRawCp > -50000 && committed.bestRawCp < prevBestRawCp - 80);
                if (
                    d >= 6 &&
                    committed.pvStableCount >= 2 &&
                    !droppedFromPrev &&
                    elapsedSoFar >= timeLimitMs * 0.35
                ) {
                    let secondBestBlendedCp = -50000;
                    let allBounded = true;
                    for (let ci = 0; ci < activeCandidates.length; ci++) {
                        const c = activeCandidates[ci];
                        if (c.key === newBestKey) continue;
                        if (!Number.isFinite(c.blendedCp) || c.blendedCp <= -50000) {
                            allBounded = false;
                            break;
                        }
                        if (c.blendedCp > secondBestBlendedCp) {
                            secondBestBlendedCp = c.blendedCp;
                        }
                    }
                    if (allBounded && committed.bestBlendedCp - secondBestBlendedCp >= 220) {
                        break;
                    }
                }
            } else {
                // Always adopt a found forced mate even if another worker timed out before PV completed
                const foundMateInWave = !!(
                    waveRes.depthBestMove &&
                    (waveRes.depthBestRawCp >= 28000 || waveRes.depthBestRaw >= 9.9) &&
                    (waveRes.depthBestBlendedCp > committed.bestBlendedCp || waveRes.depthBestRawCp > committed.bestRawCp)
                );
                if (foundMateInWave) {
                    committed.bestMove = waveRes.depthBestMove;
                    committed.bestScore = waveRes.depthBestBlended;
                    committed.bestBlendedCp = waveRes.depthBestBlendedCp;
                    committed.bestRawScore = waveRes.depthBestRaw;
                    committed.bestRawCp = waveRes.depthBestRawCp;
                    committed.completedDepth = d;
                } else if (waveRes.pvCompletedAtD && waveRes.pvResultAtD && waveRes.depthBestMove) {
                    const challengerKey = getWorkerMoveKey(waveRes.depthBestMove, board);
                    if (
                        challengerKey !== pvKey &&
                        (waveRes.depthBestBlendedCp > waveRes.pvResultAtD.blendedCp + 25 ||
                            waveRes.pvResultAtD.rawCp < committed.bestRawCp - 100)
                    ) {
                        committed.bestMove = waveRes.depthBestMove;
                        committed.bestScore = waveRes.depthBestBlended;
                        committed.bestBlendedCp = waveRes.depthBestBlendedCp;
                        committed.bestRawScore = waveRes.depthBestRaw;
                        committed.bestRawCp = waveRes.depthBestRawCp;
                        committed.completedDepth = d;
                    }
                }
                break;
            }
        }

        if (activeSearchCancel === cancelThisSearch) {
            activeSearchCancel = null;
        }
        if (isExternallyAborted()) {
            return { cancelled: true, bestMove: null };
        }

        return {
            bestMove: committed.bestMove,
            bestScore: committed.bestScore,
            bestCp: committed.bestRawCp,
            completedDepth: committed.completedDepth,
            nodes: committed.nodes,
            workerCount: pool.length
        };
    }

    async function alphaBetaSearchInternal(fen, maxDepth = 6, timeLimitMs = 5000, history = null) {
        const startTime = performance.now();

        // 0. Endgame tablebase & solver (0ms)
        const egMove = getEndgameMove(fen);
        if (egMove) return { move: egMove, completedDepth: maxDepth, cancelled: false };

        const { board, turn, castling, epSquare } = fenToBoard(fen);
        const oppTurn = (turn === 'w') ? 'b' : 'w';

        // Build history set for repetition avoidance
        const historySet = new Set();
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
                    }
                }
            }
        }
        // Invalidate all worker and single-thread TTs across new games or move takebacks
        if (recentKeys.length < lastSearchHistoryLen || (recentKeys.length === 0 && lastSearchHistoryLen > 0)) {
            markAllSearchTTDirty();
        }
        lastSearchHistoryLen = recentKeys.length;

        const currentSimpleKey = boardToSimpleKey(board, turn);
        const lastOwnKey = computeLastOwnKey(recentKeys, currentSimpleKey, oppTurn);

        const legalMoves = getLegalMovesForFen(fen, { board, turn, castling, epSquare });
        if (legalMoves.length === 0) return { move: null, completedDepth: 0, cancelled: false };
        if (legalMoves.length === 1) {
            return { move: normalizeMovePromotion(board, legalMoves[0]), completedDepth: maxDepth, cancelled: false };
        }

        // Instant checkmate attack check
        const instantMate = findInstantMateMove(board, turn, legalMoves);
        if (instantMate) {
            console.log(`[Neural AI:AlphaBeta] 🏆 Instant checkmate detected: (${instantMate.fromR},${instantMate.fromC}) -> (${instantMate.toR},${instantMate.toC})`);
            return { move: normalizeMovePromotion(board, instantMate), completedDepth: maxDepth, cancelled: false };
        }

        // Checkmate-in-2 attack check
        const mateIn2 = findMateInTwoMove(board, turn, legalMoves, castling, epSquare);
        if (mateIn2) {
            console.log(`[Neural AI:AlphaBeta] 🎯 Forcing mate-in-2 detected: (${mateIn2.fromR},${mateIn2.fromC}) -> (${mateIn2.toR},${mateIn2.toC})`);
            return { move: normalizeMovePromotion(board, mateIn2), completedDepth: maxDepth, cancelled: false };
        }

        // Filter only forced mate-in-1 blunders at root (preserve sacrifices for Alpha-Beta to evaluate)
        const activeMoves = filterMatingBlunders(board, turn, legalMoves, castling, epSquare);
        const searchMoves = (activeMoves.length >= 1) ? activeMoves : legalMoves;
        if (searchMoves.length === 1) {
            return { move: normalizeMovePromotion(board, searchMoves[0]), completedDepth: maxDepth, cancelled: false };
        }

        // Root ONNX evaluation with serialized inference, tensor disposal, and non-fatal fallback
        let rootPolicy = null;
        let rootVal = 0.0;
        if (session && typeof ort !== 'undefined') {
            const rootPlanes = new Float32Array(16 * 8 * 8);
            fillPlanes(rootPlanes, 0, board, turn, castling);
            const rootTensor = new ort.Tensor('float32', rootPlanes, [1, 16, 8, 8]);
            let rootResults = null;
            try {
                rootResults = await runSessionSerialized(session, { board_state: rootTensor });
                if (rootResults && rootResults.policy_logits && rootResults.policy_logits.data) {
                    rootPolicy = new Float32Array(rootResults.policy_logits.data);
                }
                if (rootResults && rootResults.value && rootResults.value.data) {
                    rootVal = rootResults.value.data[0];
                }
            } catch (nnErr) {
                console.warn('[Neural AI:AlphaBeta] Root ONNX inference failed, falling back to tactical priors:', nnErr);
                rootPolicy = null;
                rootVal = 0.0;
            } finally {
                rootTensor?.dispose?.();
                rootResults?.policy_logits?.dispose?.();
                rootResults?.value?.dispose?.();
            }
        }

        const { sortPriors, nnPriors } = computePriors(
            board,
            turn,
            searchMoves,
            rootPolicy,
            historySet,
            rootVal,
            lastOwnKey,
            { detailed: true }
        );
        const historyKeys = Array.from(historySet);

        let searchResult = null;
        if (searchMoves.length >= 2) {
            searchResult = await runWorkerPoolSearch({
                board,
                turn,
                castling,
                epSquare,
                historyKeys,
                activeMoves: searchMoves,
                rootPriors: nnPriors,
                rootSortPriors: sortPriors,
                maxDepth,
                timeLimitMs,
                startTime
            });
            if (searchResult && searchResult.cancelled) {
                return { move: null, completedDepth: 0, cancelled: true };
            }
        }

        if (!searchResult || !searchResult.bestMove) {
            const elapsed = performance.now() - startTime;
            const remainingTime = Math.max(50, Math.round(timeLimitMs - elapsed));
            const sortedIndices = searchMoves.map((_, idx) => idx).sort((a, b) => sortPriors[b] - sortPriors[a]);
            const orderedMoves = sortedIndices.map(idx => searchMoves[idx]);
            const orderedNnPriors = sortedIndices.map(idx => nnPriors[idx]);
            const singleReuseTT = !mainThreadTTDirty;
            mainThreadTTDirty = false;
            searchResult = searchRootMoves({
                board,
                turn,
                castling,
                epSquare,
                historyKeys,
                rootMoves: orderedMoves,
                rootPriors: orderedNnPriors,
                maxDepth,
                reuseTT: singleReuseTT,
                timeLimitMs: remainingTime
            });
        }

        let fallbackPriorMove = searchMoves[0];
        if (!searchResult || !searchResult.bestMove) {
            let bestPriorIdx = 0;
            for (let i = 1; i < sortPriors.length; i++) {
                if (sortPriors[i] > sortPriors[bestPriorIdx]) bestPriorIdx = i;
            }
            fallbackPriorMove = searchMoves[bestPriorIdx];
        }
        const bestMoveRoot = (searchResult && searchResult.bestMove) ? searchResult.bestMove : fallbackPriorMove;
        const duration = (performance.now() - startTime).toFixed(1);
        const finalMove = normalizeMovePromotion(board, bestMoveRoot);
        const actualDepth = (searchResult && typeof searchResult.completedDepth === 'number')
            ? searchResult.completedDepth
            : 0;
        const depthInfo = actualDepth > 0 ? actualDepth : maxDepth;
        console.log(`[Neural AI:AlphaBeta] Best move: (${finalMove.fromR},${finalMove.fromC})->(${finalMove.toR},${finalMove.toC}) | Depth: ${depthInfo} | Time: ${duration}ms`);
        return { move: finalMove, completedDepth: actualDepth, cancelled: false };
    }

    async function alphaBetaSearch(fen, maxDepth = 6, timeLimitMs = 5000, history = null) {
        const res = await alphaBetaSearchInternal(fen, maxDepth, timeLimitMs, history);
        return res ? res.move : null;
    }

    async function getBestMove(fen, modelVer = 'v1.6', searchType = 'alphabeta', history = [], options = {}) {
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

        function isPositionInHistory(currentFen, hist) {
            if (!Array.isArray(hist) || hist.length === 0) return false;
            const parts = currentFen.trim().split(/\s+/);
            const currentKey = parts.length >= 2 ? (parts[0] + ' ' + parts[1]) : parts[0];
            for (const h of hist) {
                if (typeof h === 'string') {
                    const hParts = h.trim().split(/\s+/);
                    const hKey = hParts.length >= 2 ? (hParts[0] + ' ' + hParts[1]) : hParts[0];
                    if (hKey === currentKey) return true;
                }
            }
            return false;
        }

        const abMaxDepth = (options && typeof options.maxDepth === 'number' && options.maxDepth > 0) ? options.maxDepth : 12;
        const abTimeLimit = (options && typeof options.timeLimitMs === 'number' && options.timeLimitMs > 0) ? options.timeLimitMs : 5000;
        const requestedDepth = (searchType === 'mcts') ? 4 : ((searchType === 'deep' || searchType === 'minimax') ? 5 : abMaxDepth);

        const fenParts = (typeof fen === 'string') ? fen.trim().split(/\s+/) : [];
        const halfmoveClock = fenParts.length >= 5 ? parseInt(fenParts[4], 10) : 0;
        const nearFiftyMoveRule = Number.isFinite(halfmoveClock) && halfmoveClock >= 70;

        // 2. Transposition Table cache lookup (LRU + depth check + 50-move bypass + destination-history check)
        const normVer = normalizeModelVer(modelVer);
        const inHistory = isPositionInHistory(fen, history);
        const posKey = normVer + ':' + searchType + ':' + fenParts.slice(0, 4).join(' ');
        if (!inHistory && !nearFiftyMoveRule && transpositionTable.has(posKey)) {
            const rawEntry = transpositionTable.get(posKey);
            const cachedMove = (rawEntry && rawEntry.move) ? rawEntry.move : rawEntry;
            const cachedDepth = (rawEntry && typeof rawEntry.depth === 'number') ? rawEntry.depth : 12;
            if (cachedMove && cachedDepth >= requestedDepth) {
                let cachedLeadsToHistory = false;
                if (Array.isArray(history) && history.length > 0) {
                    const { board: curBoard, turn: curTurn, epSquare: curEp } = fenToBoard(fen);
                    const oppT = (curTurn === 'w') ? 'b' : 'w';
                    if (curBoard && cachedMove.fromR >= 0 && cachedMove.fromR < 8 && curBoard[cachedMove.fromR][cachedMove.fromC]) {
                        const afterBoard = simulateMove(curBoard, cachedMove.fromR, cachedMove.fromC, cachedMove.toR, cachedMove.toC, cachedMove.promotion || null, curEp);
                        const afterKey = boardToSimpleKey(afterBoard, oppT);
                        for (const h of history) {
                            if (typeof h === 'string') {
                                const hp = h.trim().split(/\s+/);
                                const hk = hp.length >= 2 ? (hp[0] + ' ' + hp[1]) : hp[0];
                                if (hk === afterKey) {
                                    cachedLeadsToHistory = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (!cachedLeadsToHistory) {
                    // Refresh LRU recency
                    transpositionTable.delete(posKey);
                    transpositionTable.set(posKey, rawEntry);
                    console.log(`[Neural AI:${normVer}:${searchType}] ⚡ Transposition cache hit: (${cachedMove.fromR},${cachedMove.fromC}) -> (${cachedMove.toR},${cachedMove.toC})`);
                    return { ...cachedMove };
                }
            }
        }

        function saveRootTTCache(moveToCache, cachedDepth = requestedDepth) {
            if (!moveToCache || inHistory || nearFiftyMoveRule) return;
            if (transpositionTable.has(posKey)) {
                transpositionTable.delete(posKey);
            } else if (transpositionTable.size >= MAX_TT_SIZE) {
                const firstKey = transpositionTable.keys().next().value;
                transpositionTable.delete(firstKey);
            }
            transpositionTable.set(posKey, { move: { ...moveToCache }, depth: cachedDepth, timeLimitMs: abTimeLimit });
        }

        // 3. Local WebAssembly / WebGPU ONNX inference + local Alpha-Beta fallback even when ONNX fails
        try {
            let sessionReady = false;
            try {
                await init(normVer);
                sessionReady = !!session;
            } catch (initErr) {
                console.warn('[Neural AI] ONNX initialization unavailable, checking local search fallback:', initErr);
            }

            let localHandled = false;
            let move = null;
            let actualDepth = requestedDepth;
            if (searchType === 'mcts') {
                if (sessionReady) {
                    move = await mctsSearch(fen, 80, 1.0, history);
                    localHandled = true;
                }
            } else if (searchType === 'deep' || searchType === 'minimax') {
                if (sessionReady) {
                    move = await search5Ply(fen, 14, 8, 4, 3, history);
                    localHandled = true;
                }
            } else {
                // Alpha-Beta runs locally even if ONNX is unavailable, using tactical priors
                const abRes = await alphaBetaSearchInternal(fen, abMaxDepth, abTimeLimit, history);
                localHandled = true;
                if (abRes && !abRes.cancelled && abRes.move) {
                    move = abRes.move;
                    actualDepth = abRes.completedDepth;
                } else {
                    return null;
                }
            }

            if (move) {
                saveRootTTCache(move, actualDepth);
                return move;
            }
            if (localHandled) {
                return null;
            }
        } catch (err) {
            console.warn('[Neural AI] Local search failed, requesting /api/neural-move...', err);
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
                    const legalMoves = getLegalMovesForFen(fen);
                    if (data.topMoves && data.topMoves.length > 0) {
                        for (const cand of data.topMoves) {
                            const matched = legalMoves.find(m => m.fromR === cand.fromR && m.fromC === cand.fromC && m.toR === cand.toR && m.toC === cand.toC);
                            if (matched) {
                                console.log(`[Neural AI:Server ${data.searchType || searchType}] Move chosen: ${cand.uci} in ${data.elapsedMs?.toFixed(1)}ms`);
                                const finalMove = { ...matched, promotion: cand.promotion || null };
                                saveRootTTCache(finalMove);
                                return finalMove;
                            }
                        }
                        const firstMove = { fromR: data.topMoves[0].fromR, fromC: data.topMoves[0].fromC, toR: data.topMoves[0].toR, toC: data.topMoves[0].toC, promotion: data.topMoves[0].promotion || null };
                        saveRootTTCache(firstMove);
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
        alphaBetaSearch,
        search5Ply,
        search4Ply: search5Ply,
        search2Ply: search5Ply, // Backwards compatibility
        mctsSearch,
        getEndgameMove,
        clearCache: () => {
            transpositionTable.clear();
            markAllSearchTTDirty();
        },
        terminatePool: terminateWorkerPool
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
