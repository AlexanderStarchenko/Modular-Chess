/**
 * Unreal AI (Stockfish integration)
 * Uses Stockfish Web Worker with a configured skill level.
 */

const ChessAIUnreal = (() => {
    let stockfish = null;
    let isThinking = false;
    let resolveMove = null;

    function init() {
        if (!stockfish) {
            // Use the same stockfish file as AnalysisManager
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
            
            // Set Stockfish skill level (0-20). 
            // 20 is GM level, user wants "not max", so 16-17 is very strong but beatable by super-GMs.
            stockfish.postMessage('uci');
            stockfish.postMessage('setoption name Skill Level value 16');
        }
    }

    function getBestMove(fen) {
        if (isThinking) return Promise.resolve(null);
        
        init();
        isThinking = true;
        
        return new Promise(resolve => {
            resolveMove = resolve;
            stockfish.postMessage(`position fen ${fen}`);
            // Give it 1 second to think, which at Skill Level 16 is plenty for "Unreal"
            stockfish.postMessage('go movetime 1000');
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
