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
        getBestMove(fen, difficulty) {
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
