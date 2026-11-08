/**
 * Chess AI Manager
 * Coordinates decision making between ChessAI implementations (Stockfish, Neural & fallbacks).
 */

const ChessAIManager = (() => {
    const isElectron = typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes(' electron/');
    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:' && !isElectron;

    const DEFAULT_TIMEOUT_MS = 15000;

    const stockfishSettings = {
        '1': [0, 500],   // Easy
        '2': [5, 700],   // Medium
        '3': [12, 1000], // Hard
        '4': [18, 1500], // Extra Hard
        '5': [20, 2500]  // Unreal
    };

    /**
     * Races a promise against a timeout, automatically clearing the timer on settle.
     */
    function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, errorMsg = 'AI timeout') {
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(errorMsg));
            }, ms);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
        });

        return Promise.race([
            Promise.resolve(promise).finally(() => {
                if (timer) clearTimeout(timer);
            }),
            timeoutPromise
        ]);
    }

    /**
     * Synchronous fallback for local PC move calculation.
     * Uses target FEN to derive color and opening book move to avoid race conditions.
     */
    function getFallbackPCMove(difficulty, fen) {
        const targetFen = (fen && typeof fen === 'string')
            ? fen
            : ((typeof ChessLogic !== 'undefined' && typeof ChessLogic.getFen === 'function') ? ChessLogic.getFen() : '');

        let turn = 'w';
        if (targetFen && targetFen.includes(' ')) {
            const parts = targetFen.split(' ');
            turn = parts[1] === 'b' ? 'b' : 'w';
        } else if (typeof ChessLogic !== 'undefined' && typeof ChessLogic.getTurn === 'function') {
            turn = ChessLogic.getTurn();
        }

        if (typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getOpeningBookMove === 'function') {
            const bookMove = targetFen ? ChessAIShared.getOpeningBookMove(targetFen) : null;
            if (bookMove) {
                console.log('[AI Manager] Opening book move found:', bookMove);
                return bookMove;
            }
        }

        if (difficulty === '1' && typeof ChessAIEasy !== 'undefined') return ChessAIEasy.getBestMove(turn);
        if (difficulty === '2' && typeof ChessAIMedium !== 'undefined') return ChessAIMedium.getBestMove(turn);
        if (difficulty === '3' && typeof ChessAIHard !== 'undefined') return ChessAIHard.getBestMove(turn);
        if ((difficulty === '4' || difficulty === '5') && typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);

        // Fallback for custom difficulty strings (e.g. neural-*) or if specific difficulty module is missing
        if (typeof ChessAIMedium !== 'undefined') return ChessAIMedium.getBestMove(turn);
        if (typeof ChessAIEasy !== 'undefined') return ChessAIEasy.getBestMove(turn);
        if (typeof ChessAIHard !== 'undefined') return ChessAIHard.getBestMove(turn);
        if (typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);
        return null;
    }

    const API = {
        getEngineMove(fen, difficulty, history = []) {
            if (typeof difficulty === 'string' && difficulty.startsWith('neural')) {
                if (typeof ChessAINeural !== 'undefined') {
                    const match = difficulty.match(/^neural-(v\d+-\d+)/);
                    const modelVer = match ? match[1].replace('-', '_') : (difficulty === 'neural' ? 'v1' : 'v1_7');

                    let searchType = 'alphabeta';
                    if (difficulty.endsWith('-mcts')) {
                        searchType = 'mcts';
                    } else if (difficulty.endsWith('-minimax') || difficulty === 'neural-v1-6' || difficulty === 'neural-v1-5') {
                        searchType = 'minimax';
                    } else {
                        searchType = 'alphabeta';
                    }

                    return withTimeout(
                        ChessAINeural.getBestMove(fen, modelVer, searchType, history),
                        DEFAULT_TIMEOUT_MS,
                        `Neural AI (${modelVer}/${searchType}) timed out after ${DEFAULT_TIMEOUT_MS}ms`
                    ).then(move => {
                        if (move) return move;
                        return getFallbackPCMove('2', fen);
                    }).catch(err => {
                        console.error('[AI Manager] Neural AI error, falling back:', err);
                        return getFallbackPCMove('2', fen);
                    });
                }
            }

            if (!isFileProtocol && typeof ChessAIUnreal !== 'undefined') {
                const [skill, time] = stockfishSettings[difficulty] || [10, 1000];
                const stockfishTimeoutMs = Math.max(time + 5000, 10000);
                return withTimeout(
                    ChessAIUnreal.getBestMove(fen, skill, time),
                    stockfishTimeoutMs,
                    `Stockfish timed out after ${stockfishTimeoutMs}ms`
                ).then(move => {
                    if (move) return move;
                    return getFallbackPCMove(difficulty, fen);
                }).catch(err => {
                    console.error('[AI Manager] Stockfish error, falling back:', err);
                    return getFallbackPCMove(difficulty, fen);
                });
            }

            return Promise.resolve(getFallbackPCMove(difficulty, fen));
        },

        getBestMove(fen, difficulty, history = []) {
            // Syzygy Endgame Tablebases Probe (Up to 7 pieces)
            if (typeof ChessSyzygy !== 'undefined' && typeof ChessSyzygy.isTablebasePosition === 'function' && ChessSyzygy.isTablebasePosition(fen)) {
                return ChessSyzygy.probe(fen).then(syzygyMove => {
                    if (syzygyMove) {
                        console.log(`[AI Manager] 🏆 Syzygy Tablebase optimal move: (${syzygyMove.fromR},${syzygyMove.fromC}) -> (${syzygyMove.toR},${syzygyMove.toC}) [${syzygyMove.category || 'optimal'}, dtz: ${syzygyMove.dtz}, dtm: ${syzygyMove.dtm}]`);
                        return syzygyMove;
                    }
                    return API.getEngineMove(fen, difficulty, history);
                }).catch(err => {
                    console.warn('[AI Manager] Syzygy probe error, continuing with engine:', err);
                    return API.getEngineMove(fen, difficulty, history);
                });
            }

            return API.getEngineMove(fen, difficulty, history);
        },

        getHint(fen) {
            // If in tablebase territory, Syzygy provides mathematically flawless advice
            if (typeof ChessSyzygy !== 'undefined' && typeof ChessSyzygy.isTablebasePosition === 'function' && ChessSyzygy.isTablebasePosition(fen)) {
                return ChessSyzygy.probe(fen).then(syzygyMove => {
                    if (syzygyMove) {
                        return syzygyMove;
                    }
                    return API.getHintEngine(fen);
                }).catch(() => API.getHintEngine(fen));
            }
            return API.getHintEngine(fen);
        },

        getHintEngine(fen) {
            if (!isFileProtocol && typeof ChessAIUnreal !== 'undefined') {
                const hintTimeoutMs = 6000;
                return withTimeout(
                    ChessAIUnreal.getBestMove(fen, 20, 1000),
                    hintTimeoutMs,
                    `Hint Stockfish timed out after ${hintTimeoutMs}ms`
                ).then(move => {
                    if (move) return move;
                    return getFallbackPCMove('5', fen);
                }).catch(err => {
                    console.error('[AI Manager] Hint Stockfish error, falling back:', err);
                    return getFallbackPCMove('5', fen);
                });
            }
            return Promise.resolve(getFallbackPCMove('5', fen));
        },

        isFileProtocol() {
            return isFileProtocol;
        },

        getFallbackPCMove(difficulty, fen) {
            return getFallbackPCMove(difficulty, fen);
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
