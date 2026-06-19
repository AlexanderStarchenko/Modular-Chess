/**
 * Stockfish Engine Integration
 * Uses Stockfish Web Worker with dynamic skill levels.
 */

const ChessAIUnreal = (() => {
    let stockfish = null;
    let isThinking = false;
    let resolveMove = null;
    let currentSkillLevel = -1;

    function init(skillLevel) {
        if (!stockfish) {
            stockfish = new Worker('js/stockfish.js?v=35');
            stockfish.onmessage = function(event) {
                const line = event.data;
                if (line.startsWith('bestmove')) {
                    const moveStr = line.split(' ')[1];
                    if (resolveMove) {
                        resolveMove(parseUCI(moveStr));
                        resolveMove = null;
                        isThinking = false;
                    }
                }
            };
            stockfish.postMessage('uci');
        }
        
        // Update skill level if changed
        if (currentSkillLevel !== skillLevel) {
            stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
            currentSkillLevel = skillLevel;
        }
    }

    function getBestMove(fen, skillLevel = 16, moveTime = 1000) {
        if (isThinking) return Promise.resolve(null);
        
        init(skillLevel);
        isThinking = true;
        
        return new Promise(resolve => {
            resolveMove = resolve;
            stockfish.postMessage(`position fen ${fen}`);
            stockfish.postMessage(`go movetime ${moveTime}`);
        });
    }

    function parseUCI(moveStr) {
        if (!moveStr || moveStr.length < 4 || moveStr === '(none)') return null;
        const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
        const fromR = 8 - parseInt(moveStr[1]);
        const fromC = files[moveStr[0]];
        const toR = 8 - parseInt(moveStr[3]);
        const toC = files[moveStr[2]];
        if (isNaN(fromR) || fromC === undefined || isNaN(toR) || toC === undefined) {
            return null;
        }
        return { fromR, fromC, toR, toC };
    }

    const API = { getBestMove };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return API;
})();
