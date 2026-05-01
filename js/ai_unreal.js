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
            stockfish = new Worker('js/stockfish.js?v=3');
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
        if (!moveStr || moveStr.length < 4) return null;
        const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
        return {
            fromR: 8 - parseInt(moveStr[1]),
            fromC: files[moveStr[0]],
            toR: 8 - parseInt(moveStr[3]),
            toC: files[moveStr[2]]
        };
    }

    return { getBestMove };
})();
