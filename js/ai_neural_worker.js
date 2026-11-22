let workerImportError = null;
let workerImportStack = null;

function resolveSearchCore() {
    if (typeof ChessAINeuralSearch !== 'undefined' && ChessAINeuralSearch) {
        return ChessAINeuralSearch;
    }
    if (typeof globalThis !== 'undefined' && globalThis.ChessAINeuralSearch) {
        return globalThis.ChessAINeuralSearch;
    }
    if (typeof self !== 'undefined' && self.ChessAINeuralSearch) {
        return self.ChessAINeuralSearch;
    }
    return null;
}

function loadSearchCoreInWorker() {
    const existing = resolveSearchCore();
    if (existing) return existing;

    if (typeof importScripts === 'function') {
        const candidates = [];
        if (typeof self !== 'undefined' && typeof self.__CHESS_WORKER_SEARCH_URL === 'string' && self.__CHESS_WORKER_SEARCH_URL) {
            candidates.push(self.__CHESS_WORKER_SEARCH_URL);
        }

        const href = (typeof location !== 'undefined' && typeof location.href === 'string') ? location.href : '';
        const origin = (typeof location !== 'undefined' && typeof location.origin === 'string') ? location.origin : '';
        const isBlob = href.startsWith('blob:');

        if (!isBlob && href) {
            try {
                candidates.push(new URL('ai_neural_search.js', href).href);
            } catch (_) {
                // Ignore invalid base URL
            }
        }
        if (isBlob && origin && origin !== 'null') {
            candidates.push(origin + '/js/ai_neural_search.js');
            candidates.push(origin + '/ai_neural_search.js');
        }
        if (!isBlob) {
            candidates.push('ai_neural_search.js');
        }

        let lastErr = null;
        for (let i = 0; i < candidates.length; i++) {
            try {
                importScripts(candidates[i]);
                const loaded = resolveSearchCore();
                if (loaded) return loaded;
            } catch (err) {
                lastErr = err;
            }
        }

        if (lastErr) {
            workerImportError = (lastErr && lastErr.message) ? lastErr.message : String(lastErr);
            workerImportStack = (lastErr && lastErr.stack) ? lastErr.stack : null;
        } else {
            workerImportError = 'ChessAINeuralSearch failed to register after importScripts';
        }
        return null;
    }

    if (typeof require === 'function') {
        try {
            return require('./ai_neural_search.js');
        } catch (err) {
            workerImportError = (err && err.message) ? err.message : String(err);
            workerImportStack = (err && err.stack) ? err.stack : null;
            return null;
        }
    }

    workerImportError = 'No module loader available for ai_neural_search.js in worker';
    return null;
}

let workerSearchCore = loadSearchCoreInWorker();

function isValidBoard8x8(board) {
    if (!Array.isArray(board) || board.length !== 8) return false;
    for (let r = 0; r < 8; r++) {
        if (!Array.isArray(board[r]) || board[r].length !== 8) return false;
    }
    return true;
}

function resolvePositionPayload(data, searchCore) {
    if (isValidBoard8x8(data.board)) {
        return {
            board: data.board,
            turn: (data.turn === 'b') ? 'b' : 'w',
            castling: (typeof data.castling === 'string' && data.castling) ? data.castling : '-',
            epSquare: (data.epSquare !== undefined) ? data.epSquare : null
        };
    }

    if (typeof data.fen === 'string' && data.fen.trim().length > 0 && typeof searchCore.fenToBoard === 'function') {
        const parsed = searchCore.fenToBoard(data.fen);
        if (parsed && isValidBoard8x8(parsed.board)) {
            return {
                board: parsed.board,
                turn: (data.turn === 'w' || data.turn === 'b') ? data.turn : (parsed.turn || 'w'),
                castling: (typeof data.castling === 'string') ? data.castling : (parsed.castling || '-'),
                epSquare: (data.epSquare !== undefined) ? data.epSquare : (parsed.epSquare || null)
            };
        }
    }

    return null;
}

function handleWorkerMessage(e, postFn) {
    const post = postFn || ((typeof postMessage === 'function') ? postMessage : null);
    if (!post) return;

    const data = (e && e.data && typeof e.data === 'object') ? e.data : {};
    const jobId = (data.jobId !== undefined) ? data.jobId : null;
    const action = (typeof data.action === 'string' && data.action)
        ? data.action
        : ((typeof data.type === 'string' && data.type) ? data.type : 'searchRootMoves');

    // Drop stale queued jobs early to prevent head-of-line blocking
    const nowWall = Date.now();
    let effectiveTimeLimitMs = (typeof data.timeLimitMs === 'number' && Number.isFinite(data.timeLimitMs))
        ? data.timeLimitMs
        : 5000;

    if (typeof data.deadlineAt === 'number' && Number.isFinite(data.deadlineAt)) {
        const remainingMs = data.deadlineAt - nowWall;
        if (remainingMs <= 0) {
            post({
                jobId,
                ok: false,
                stale: true,
                error: 'Job expired in worker queue before execution',
                stack: null
            });
            return;
        }
        effectiveTimeLimitMs = Math.max(1, Math.min(effectiveTimeLimitMs, remainingMs));
    }

    if (
        typeof data.sentAt === 'number' &&
        Number.isFinite(data.sentAt) &&
        typeof data.maxQueueDelayMs === 'number' &&
        Number.isFinite(data.maxQueueDelayMs) &&
        (nowWall - data.sentAt) > data.maxQueueDelayMs
    ) {
        post({
            jobId,
            ok: false,
            stale: true,
            error: 'Job exceeded maxQueueDelayMs while waiting in worker queue',
            stack: null
        });
        return;
    }

    if (action === 'ping') {
        post({ jobId, ok: true, result: { pong: true, ts: nowWall } });
        return;
    }

    const searchCore = workerSearchCore || resolveSearchCore();
    if (!searchCore || typeof searchCore.searchRootMoves !== 'function') {
        post({
            jobId,
            ok: false,
            error: workerImportError || 'ChessAINeuralSearch is unavailable in worker',
            stack: workerImportStack || null
        });
        return;
    }
    workerSearchCore = searchCore;

    const posData = resolvePositionPayload(data, searchCore);
    if (!posData) {
        post({
            jobId,
            ok: false,
            error: 'Invalid worker payload: expected 8x8 "board" array or valid "fen" string',
            stack: null
        });
        return;
    }

    try {
        let result;
        if (action === 'searchRootMoves') {
            if (typeof Int32Array !== 'undefined' && data.sharedBuffer instanceof Int32Array && data.sharedBuffer.length >= 1 && typeof Atomics !== 'undefined' && Atomics.load(data.sharedBuffer, 0) !== 0) {
                post({
                    jobId,
                    ok: false,
                    stale: true,
                    error: 'Job aborted via shared stopFlag before execution',
                    stack: null
                });
                return;
            }
            result = searchCore.searchRootMoves({
                board: posData.board,
                turn: posData.turn,
                castling: posData.castling,
                epSquare: posData.epSquare,
                historyKeys: data.historyKeys,
                rootMoves: data.rootMoves,
                rootPriors: data.rootPriors,
                startDepth: data.startDepth,
                maxDepth: data.maxDepth,
                timeLimitMs: effectiveTimeLimitMs,
                minAlphaScore: data.minAlphaScore,
                minAlphaCp: data.minAlphaCp,
                sharedBuffer: data.sharedBuffer,
                reuseTT: data.reuseTT,
                persistentTT: data.persistentTT,
                ageHistory: data.ageHistory,
                expectedCp: data.expectedCp,
                expectedScore: data.expectedScore
            });
        } else if (action === 'filterTacticalBlunders') {
            const legalMoves = Array.isArray(data.legalMoves)
                ? data.legalMoves
                : searchCore.getLegalMovesForBoard(posData.board, posData.turn, posData.castling, posData.epSquare);
            result = searchCore.filterTacticalBlunders(
                posData.board,
                posData.turn,
                legalMoves,
                posData.castling,
                posData.epSquare
            );
        } else if (action === 'solveElementaryEndgame') {
            result = searchCore.solveElementaryEndgame(
                posData.board,
                posData.turn,
                posData.castling,
                posData.epSquare
            );
        } else if (action === 'findMateInTwoMove') {
            const legalMoves = Array.isArray(data.legalMoves)
                ? data.legalMoves
                : searchCore.getLegalMovesForBoard(posData.board, posData.turn, posData.castling, posData.epSquare);
            result = searchCore.findMateInTwoMove(
                posData.board,
                posData.turn,
                legalMoves,
                posData.castling,
                posData.epSquare
            );
        } else {
            post({
                jobId,
                ok: false,
                error: 'Unknown worker action: ' + action,
                stack: null
            });
            return;
        }

        post({ jobId, ok: true, result });
    } catch (err) {
        post({
            jobId,
            ok: false,
            error: (err && err.message) ? err.message : String(err),
            stack: (err && err.stack) ? err.stack : null
        });
    }
}

onmessage = function (e) {
    handleWorkerMessage(e, (typeof postMessage === 'function') ? postMessage : null);
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleWorkerMessage,
        loadSearchCoreInWorker,
        resolvePositionPayload,
        isValidBoard8x8
    };
}
