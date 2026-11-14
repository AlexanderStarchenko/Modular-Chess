/**
 * Syzygy Endgame Tablebase Client & Engine (Up to 7 Pieces)
 * Provides mathematically optimal endgame moves, WDL (Win/Draw/Loss), DTZ and DTM.
 */

const ChessSyzygy = (() => {
    const cache = new Map();
    const pendingRequests = new Map();
    const MAX_CACHE = 2000;
    const DEFAULT_TIMEOUT_MS = 2500;
    const LICHESS_COOLDOWN_MS = 60000;
    let lichessCooldownUntil = 0;

    const WIN_CATEGORIES = new Set(['win', 'syzygy-win', 'maybe-win', 'maybe_win', 'cursed-win']);
    const LOSS_CATEGORIES = new Set(['loss', 'syzygy-loss', 'maybe-loss', 'maybe_loss']);
    const OPP_LOSS_CATEGORIES = new Set(['loss', 'syzygy-loss', 'maybe-loss', 'maybe_loss']);

    function countPieces(fen) {
        if (!fen || typeof fen !== 'string') return 32;
        const boardPart = fen.trim().split(/\s+/)[0] || '';
        let count = 0;
        for (let i = 0; i < boardPart.length; i++) {
            const ch = boardPart[i];
            if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
                count++;
            }
        }
        return count;
    }

    function normalizeFenKey(fen) {
        const parts = fen.trim().split(/\s+/);
        // Drop fullmove number (6th field) to dramatically increase cache hit rate
        if (parts.length >= 5) {
            return parts.slice(0, 5).join(' ');
        }
        return parts.join(' ');
    }

    function isTablebasePosition(fen) {
        if (!fen || typeof fen !== 'string') return false;
        const parts = fen.trim().split(/\s+/);
        if (parts.length < 2) return false;

        // Syzygy tablebases do not support positions with remaining castling rights
        if (parts.length >= 3 && parts[2] !== '-') {
            return false;
        }

        const boardPart = parts[0];
        let totalPieces = 0;
        let whiteKings = 0;
        let blackKings = 0;

        for (let i = 0; i < boardPart.length; i++) {
            const ch = boardPart[i];
            if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
                totalPieces++;
                if (ch === 'K') whiteKings++;
                else if (ch === 'k') blackKings++;
            }
        }

        return whiteKings === 1 && blackKings === 1 && totalPieces >= 2 && totalPieces <= 7;
    }

    function parseUCI(moveStr) {
        if (typeof moveStr !== 'string' || moveStr === '(none)' || (moveStr.length !== 4 && moveStr.length !== 5)) {
            return null;
        }

        const files = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
        const fromC = files[moveStr[0].toLowerCase()];
        const toC = files[moveStr[2].toLowerCase()];

        if (!/^[1-8]$/.test(moveStr[1]) || !/^[1-8]$/.test(moveStr[3])) {
            return null;
        }

        const fromR = 8 - parseInt(moveStr[1], 10);
        const toR = 8 - parseInt(moveStr[3], 10);

        if (
            fromC === undefined || toC === undefined ||
            fromR < 0 || fromR > 7 ||
            toR < 0 || toR > 7
        ) {
            return null;
        }

        let promotion = null;
        if (moveStr.length === 5) {
            const promoChar = moveStr[4].toLowerCase();
            if (!/^[qrbn]$/.test(promoChar)) {
                return null;
            }
            promotion = promoChar;
        }

        return { fromR, fromC, toR, toC, promotion };
    }

    function isMateMove(move) {
        return Boolean(
            move &&
            (move.checkmate === true || (typeof move.san === 'string' && move.san.endsWith('#')))
        );
    }

    function getMetricDtz(move) {
        if (!move) return null;
        if (typeof move.precise_dtz === 'number') return Math.abs(move.precise_dtz);
        if (typeof move.dtz === 'number') return Math.abs(move.dtz);
        return null;
    }

    function pickBestMove(data) {
        if (!data || !Array.isArray(data.moves) || data.moves.length === 0) {
            return null;
        }

        const moves = data.moves.filter(Boolean);
        if (moves.length === 0) return null;

        const posCategory = data.category || 'unknown';

        // Always take immediate checkmate if available
        const instantMate = moves.find(isMateMove);
        if (instantMate) {
            return instantMate;
        }

        // 1. Winning / cursed-win positions
        if (WIN_CATEGORIES.has(posCategory)) {
            let winningMoves = moves.filter(m => OPP_LOSS_CATEGORIES.has(m.category));
            if (winningMoves.length === 0 && posCategory === 'cursed-win') {
                winningMoves = moves.filter(m => m.category === 'blessed-loss');
            }
            if (winningMoves.length > 0) {
                const sorted = [...winningMoves].sort((a, b) => {
                    const aHasDtm = typeof a.dtm === 'number';
                    const bHasDtm = typeof b.dtm === 'number';

                    if (aHasDtm && bHasDtm) {
                        const diff = Math.abs(a.dtm) - Math.abs(b.dtm);
                        if (diff !== 0) return diff;
                    } else if (aHasDtm !== bHasDtm) {
                        return aHasDtm ? -1 : 1;
                    }

                    // When DTM is unavailable (6-7 pieces), zeroing moves (captures/pawn pushes/promotions)
                    // advance the game phase instead of shuffling the king by DTZ
                    const aZero = a.zeroing === true;
                    const bZero = b.zeroing === true;
                    if (aZero !== bZero) return aZero ? -1 : 1;

                    const aDtz = getMetricDtz(a);
                    const bDtz = getMetricDtz(b);
                    if (aDtz !== null && bDtz !== null && aDtz !== bDtz) {
                        return aDtz - bDtz;
                    }
                    if ((aDtz !== null) !== (bDtz !== null)) {
                        return aDtz !== null ? -1 : 1;
                    }

                    return 0;
                });
                return sorted[0];
            }
        }

        // 2. Blessed-loss (lost theoretically, but holds 50-move draw): hold cursed-win/draw & avoid zeroing
        if (posCategory === 'blessed-loss') {
            const unexpectedWin = moves.find(m => OPP_LOSS_CATEGORIES.has(m.category));
            if (unexpectedWin) return unexpectedWin;

            const safePool = moves.filter(
                m => m.category === 'draw' || m.category === 'cursed-win' || m.category === 'blessed-loss'
            );
            if (safePool.length > 0) {
                const sorted = [...safePool].sort((a, b) => {
                    const aDraw = a.category === 'draw';
                    const bDraw = b.category === 'draw';
                    if (aDraw !== bDraw) return aDraw ? -1 : 1;

                    const aZero = a.zeroing === true;
                    const bZero = b.zeroing === true;
                    if (aZero !== bZero) return aZero ? 1 : -1;

                    const aDtz = getMetricDtz(a);
                    const bDtz = getMetricDtz(b);
                    if (aDtz !== null && bDtz !== null && aDtz !== bDtz) {
                        return bDtz - aDtz;
                    }
                    return 0;
                });
                return sorted[0];
            }
        }

        // 3. Drawn positions: take unexpected win -> practical win (opponent blessed-loss) -> pure draw -> saving draw
        if (posCategory === 'draw') {
            const unexpectedWin = moves.find(m => OPP_LOSS_CATEGORIES.has(m.category));
            if (unexpectedWin) return unexpectedWin;

            const practicalWin = moves.find(m => m.category === 'blessed-loss');
            if (practicalWin) return practicalWin;

            const pureDraw = moves.find(m => m.category === 'draw');
            if (pureDraw) return pureDraw;

            const savingDraw = moves.find(m => m.category === 'cursed-win');
            if (savingDraw) return savingDraw;
        }

        // 4. Losing positions: resist longest without mutating input, avoid resetting 50-move rule
        if (LOSS_CATEGORIES.has(posCategory)) {
            const sorted = [...moves].sort((a, b) => {
                const aHasDtm = typeof a.dtm === 'number';
                const bHasDtm = typeof b.dtm === 'number';

                if (aHasDtm && bHasDtm) {
                    const diff = Math.abs(b.dtm) - Math.abs(a.dtm);
                    if (diff !== 0) return diff;
                }

                // Defender avoids zeroing moves (pawn pushes/exchanges) unless forced
                const aZero = a.zeroing === true;
                const bZero = b.zeroing === true;
                if (aZero !== bZero) return aZero ? 1 : -1;

                const aDtz = getMetricDtz(a);
                const bDtz = getMetricDtz(b);
                if (aDtz !== null && bDtz !== null && aDtz !== bDtz) {
                    return bDtz - aDtz;
                }
                return 0;
            });
            return sorted[0];
        }

        // Default: preserve upstream Lichess ordering
        return moves[0];
    }

    function canUseRelativeApi() {
        return (
            typeof window !== 'undefined' &&
            window.location &&
            (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        );
    }

    async function fetchFromEndpoints(fen) {
        if (typeof fetch !== 'function') return null;

        const encodedFen = encodeURIComponent(fen);
        const endpoints = [];

        if (Date.now() >= lichessCooldownUntil) {
            endpoints.push({
                url: `https://tablebase.lichess.ovh/standard?fen=${encodedFen}`,
                isLichess: true
            });
        }

        if (canUseRelativeApi()) {
            endpoints.push({
                url: `/api/tablebase?fen=${encodedFen}`,
                isLichess: false
            });
        }

        for (const ep of endpoints) {
            const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            let timeoutId = null;

            try {
                if (controller) {
                    timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
                }

                const fetchOpts = controller ? { signal: controller.signal } : {};
                const res = await fetch(ep.url, fetchOpts);

                if (ep.isLichess && res.status === 429) {
                    const retryHeader = res.headers && typeof res.headers.get === 'function'
                        ? res.headers.get('Retry-After')
                        : null;
                    const retrySec = retryHeader ? parseInt(retryHeader, 10) : NaN;
                    const cooldownMs = (!isNaN(retrySec) && retrySec > 0)
                        ? Math.max(LICHESS_COOLDOWN_MS, retrySec * 1000)
                        : LICHESS_COOLDOWN_MS;
                    lichessCooldownUntil = Date.now() + cooldownMs;
                    continue;
                }

                if (res.ok) {
                    const data = await res.json();
                    if (data && (Array.isArray(data.moves) || data.category)) {
                        return data;
                    }
                }
            } catch (e) {
                // Ignore network/abort error and try next endpoint
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        }

        return null;
    }

    function getFromLruCache(key) {
        if (!cache.has(key)) return undefined;
        const val = cache.get(key);
        cache.delete(key);
        cache.set(key, val);
        return val;
    }

    function setInLruCache(key, value) {
        if (cache.has(key)) {
            cache.delete(key);
        } else if (cache.size >= MAX_CACHE) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
        cache.set(key, value);
    }

    async function probe(fen) {
        if (!fen || !isTablebasePosition(fen)) return null;

        const cleanFen = fen.trim();
        const cacheKey = normalizeFenKey(cleanFen);

        const cached = getFromLruCache(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        if (pendingRequests.has(cacheKey)) {
            return pendingRequests.get(cacheKey);
        }

        const requestPromise = (async () => {
            let result = null;
            try {
                const data = await fetchFromEndpoints(cleanFen);
                if (data) {
                    const bestMove = pickBestMove(data);
                    if (bestMove && bestMove.uci) {
                        const parsed = parseUCI(bestMove.uci);
                        if (parsed) {
                            result = {
                                ...parsed,
                                uci: bestMove.uci,
                                san: bestMove.san,
                                category: data.category,
                                dtz: bestMove.dtz !== undefined ? bestMove.dtz : data.dtz,
                                precise_dtz: bestMove.precise_dtz !== undefined ? bestMove.precise_dtz : data.precise_dtz,
                                dtm: bestMove.dtm !== undefined ? bestMove.dtm : data.dtm,
                                zeroing: Boolean(bestMove.zeroing),
                                checkmate: Boolean(bestMove.checkmate),
                                isSyzygy: true
                            };
                        }
                    }
                }
            } catch (err) {
                console.warn('[Syzygy] Probe request failed:', err.message);
            }

            // Fallback to local tablebase if remote probe yielded nothing
            if (!result && typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getEndgameTablebaseMove === 'function') {
                const localMove = ChessAIShared.getEndgameTablebaseMove(cleanFen);
                if (localMove) {
                    result = { ...localMove, isSyzygy: true, category: 'theoretical_local' };
                }
            }

            if (result) {
                setInLruCache(cacheKey, result);
            }

            return result;
        })();

        pendingRequests.set(cacheKey, requestPromise);
        try {
            return await requestPromise;
        } finally {
            pendingRequests.delete(cacheKey);
        }
    }

    function clearCache() {
        cache.clear();
        pendingRequests.clear();
        lichessCooldownUntil = 0;
    }

    const API = {
        probe,
        isTablebasePosition,
        countPieces,
        normalizeFenKey,
        parseUCI,
        pickBestMove,
        clearCache
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
