/**
 * Chess AI Manager
 * Coordinates decision making between ChessAI implementations (Stockfish & fallbacks).
 */

const ChessAIManager = (() => {
    const isElectron = typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes(' electron/');
    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:' && !isElectron;

    const stockfishSettings = {
        '1': [0, 500],   // Easy
        '2': [5, 700],   // Medium
        '3': [12, 1000], // Hard
        '4': [18, 1500], // Extra Hard
        '5': [20, 2500]  // Unreal
    };

    function getFallbackPCMove(difficulty) {
        const turn = ChessLogic.getTurn();
        if (typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getOpeningBookMove === 'function') {
            const currentFen = ChessLogic.getFen();
            const bookMove = ChessAIShared.getOpeningBookMove(currentFen);
            if (bookMove) {
                console.log('[AI Manager] Opening book move found:', bookMove);
                return bookMove;
            }
        }
        if (difficulty === '1' && typeof ChessAIEasy !== 'undefined') return ChessAIEasy.getBestMove(turn);
        if (difficulty === '2' && typeof ChessAIMedium !== 'undefined') return ChessAIMedium.getBestMove(turn);
        if (difficulty === '3' && typeof ChessAIHard !== 'undefined') return ChessAIHard.getBestMove(turn);
        if (difficulty === '4' && typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);
        if (difficulty === '5' && typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);
        return null;
    }

    const API = {
        getBestMove(fen, difficulty, history = []) {
            if (typeof difficulty === 'string' && difficulty.startsWith('neural')) {
                if (typeof ChessAINeural !== 'undefined') {
                    let modelVer = 'v1_7';
                    if (difficulty === 'neural-v1-7' || difficulty === 'neural-v1-7-alphabeta' || difficulty === 'neural-v1-7-mcts') {
                        modelVer = 'v1_7';
                    } else if (difficulty === 'neural-v1-6' || difficulty === 'neural-v1-6-mcts' || difficulty === 'neural-v1-6-alphabeta') {
                        modelVer = 'v1_6';
                    } else if (difficulty === 'neural-v1-5' || difficulty === 'neural-v1-5-mcts') {
                        modelVer = 'v1_5';
                    } else if (difficulty === 'neural') {
                        modelVer = 'v1';
                    }

                    let searchType = 'alphabeta';
                    if (difficulty.endsWith('-mcts')) {
                        searchType = 'mcts';
                    } else if (difficulty.endsWith('-minimax') || difficulty === 'neural-v1-6' || difficulty === 'neural-v1-5') {
                        searchType = 'minimax';
                    } else {
                        searchType = 'alphabeta';
                    }

                    return ChessAINeural.getBestMove(fen, modelVer, searchType, history).then(move => {
                        if (move) return move;
                        return getFallbackPCMove('2');
                    }).catch(err => {
                        console.error('[AI Manager] Neural AI error, falling back:', err);
                        return getFallbackPCMove('2');
                    });
                }
            }
            if (!isFileProtocol && typeof ChessAIUnreal !== 'undefined') {
                const [skill, time] = stockfishSettings[difficulty] || [10, 1000];
                return ChessAIUnreal.getBestMove(fen, skill, time)
                    .catch(err => {
                        console.error('[AI Manager] Stockfish error, falling back:', err);
                        return getFallbackPCMove(difficulty);
                    });
            }
            return Promise.resolve(getFallbackPCMove(difficulty));
        },
        getHint(fen) {
            if (!isFileProtocol && typeof ChessAIUnreal !== 'undefined') {
                return ChessAIUnreal.getBestMove(fen, 20, 1000);
            }
            return Promise.resolve(getFallbackPCMove('5'));
        },
        isFileProtocol() {
            return isFileProtocol;
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
