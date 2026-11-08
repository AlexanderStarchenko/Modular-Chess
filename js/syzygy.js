/**
 * Syzygy Endgame Tablebase Client & Engine (Up to 7 Pieces)
 * Provides mathematically optimal endgame moves, WDL (Win/Draw/Loss), DTZ and DTM.
 */

const ChessSyzygy = (() => {
    const cache = new Map();
    const MAX_CACHE = 2000;
    const DEFAULT_TIMEOUT_MS = 2500;

    function countPieces(fen) {
        if (!fen) return 32;
        const boardPart = fen.split(' ')[0];
        let count = 0;
        for (let i = 0; i < boardPart.length; i++) {
            const ch = boardPart[i];
            if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
                count++;
            }
        }
        return count;
    }

    function isTablebasePosition(fen) {
        if (!fen || typeof fen !== 'string') return false;
        const parts = fen.trim().split(/\s+/);
        if (parts.length < 2) return false;
        const boardPart = parts[0];
        if (!boardPart.includes('k') || !boardPart.includes('K')) return false;
        return countPieces(fen) <= 7;
    }

    function parseUCI(moveStr) {
        if (!moveStr || moveStr.length < 4 || moveStr === '(none)') return null;
        const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
        const fromC = files[moveStr[0]];
        const fromR = 8 - parseInt(moveStr[1], 10);
        const toC = files[moveStr[2]];
        const toR = 8 - parseInt(moveStr[3], 10);
        const promotion = moveStr.length > 4 ? moveStr[4].toLowerCase() : null;
        if (isNaN(fromR) || fromC === undefined || isNaN(toR) || toC === undefined) {
            return null;
        }
        return { fromR, fromC, toR, toC, promotion };
    }

    function pickBestMove(data) {
        if (!data || !Array.isArray(data.moves) || data.moves.length === 0) {
            return null;
        }

        const moves = data.moves;
        const posCategory = data.category || 'unknown';

        // 1. If position is a Win: pick move leading to opponent's Loss with fastest mate (min |dtm|) or min |dtz|
        if (posCategory === 'win' || posCategory === 'maybe_win') {
            const winningMoves = moves.filter(m => m.category === 'loss');
            if (winningMoves.length > 0) {
                winningMoves.sort((a, b) => {
                    const aDtm = (typeof a.dtm === 'number') ? Math.abs(a.dtm) : 9999;
                    const bDtm = (typeof b.dtm === 'number') ? Math.abs(b.dtm) : 9999;
                    if (aDtm !== bDtm) return aDtm - bDtm;
                    const aDtz = (typeof a.dtz === 'number') ? Math.abs(a.dtz) : 9999;
                    const bDtz = (typeof b.dtz === 'number') ? Math.abs(b.dtz) : 9999;
                    return aDtz - bDtz;
                });
                return winningMoves[0];
            }
        }

        // 2. If position is a Draw: prefer moves leading to Draw (or Loss if opponent can blunder)
        if (posCategory === 'draw') {
            const safeMoves = moves.filter(m => m.category === 'draw' || m.category === 'loss');
            if (safeMoves.length > 0) {
                // If any move wins (in case category was draw but winning move exists), take it
                const winM = safeMoves.find(m => m.category === 'loss');
                if (winM) return winM;
                return safeMoves[0];
            }
        }

        // 3. If position is a Loss: resist longest (max |dtm| or max |dtz|)
        if (posCategory === 'loss') {
            moves.sort((a, b) => {
                const aDtm = (typeof a.dtm === 'number') ? Math.abs(a.dtm) : 0;
                const bDtm = (typeof b.dtm === 'number') ? Math.abs(b.dtm) : 0;
                if (aDtm !== bDtm) return bDtm - aDtm;
                const aDtz = (typeof a.dtz === 'number') ? Math.abs(a.dtz) : 0;
                const bDtz = (typeof b.dtz === 'number') ? Math.abs(b.dtz) : 0;
                return bDtz - aDtz;
            });
            return moves[0];
        }

        // Default: take first move
        return moves[0];
    }

    async function fetchFromEndpoints(fen) {
        const encodedFen = encodeURIComponent(fen);
        const endpoints = [
            `https://tablebase.lichess.ovh/standard?fen=${encodedFen}`,
            `/api/tablebase?fen=${encodedFen}`
        ];

        for (const url of endpoints) {
            try {
                const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const timeoutId = controller ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS) : null;

                const fetchOpts = controller ? { signal: controller.signal } : {};
                const res = await fetch(url, fetchOpts);
                if (timeoutId) clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data && (Array.isArray(data.moves) || data.category)) {
                        return data;
                    }
                }
            } catch (e) {
                // Ignore and try next endpoint
            }
        }
        return null;
    }

    async function probe(fen) {
        if (!fen || !isTablebasePosition(fen)) return null;

        const cleanFen = fen.trim();
        if (cache.has(cleanFen)) {
            return cache.get(cleanFen);
        }

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
                            dtm: bestMove.dtm !== undefined ? bestMove.dtm : data.dtm,
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
            if (cache.size >= MAX_CACHE) {
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            cache.set(cleanFen, result);
        }

        return result;
    }

    function clearCache() {
        cache.clear();
    }

    const API = {
        probe,
        isTablebasePosition,
        countPieces,
        parseUCI,
        pickBestMove,
        clearCache
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
