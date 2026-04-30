/**
 * Analysis Manager using Stockfish Web Worker
 */

const AnalysisManager = (() => {
    let stockfish = null;
    let isAnalyzing = false;
    let currentTask = null;

    function initWorker() {
        if (!stockfish) {
            stockfish = new Worker('js/stockfish.js?v=3');
            stockfish.onmessage = function(event) {
                const line = event.data;
                if (currentTask && typeof currentTask.onMessage === 'function') {
                    currentTask.onMessage(line);
                }
            };
        }
    }

    function evaluateFen(fen, depth = 8) {
        return new Promise(resolve => {
            initWorker();
            let evalResult = { cp: 0, mate: null, bestmove: null };
            currentTask = {
                onMessage: (line) => {
                    if (line.startsWith('info depth')) {
                        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
                        if (scoreMatch) {
                            if (scoreMatch[1] === 'cp') evalResult.cp = parseInt(scoreMatch[2], 10);
                            else evalResult.mate = parseInt(scoreMatch[2], 10);
                        }
                    }
                    if (line.startsWith('bestmove')) {
                        evalResult.bestmove = line.split(' ')[1];
                        resolve(evalResult);
                    }
                }
            };
            // Remove ucinewgame to speed up, just position and go
            stockfish.postMessage(`position fen ${fen}`);
            stockfish.postMessage(`go movetime 400`);
        });
    }

    async function analyzeGame(history, onProgress, onComplete) {
        if (isAnalyzing) return;
        isAnalyzing = true;
        
        let evaluations = [];
        const total = history.length;
        
        if (total === 0) {
            isAnalyzing = false;
            if (onComplete) onComplete([]);
            return;
        }

        // Evaluate initial state
        let resStart = await evaluateFen(history[0].beforeFen);
        evaluations.push(resStart);

        for (let i = 0; i < total; i++) {
            let res = await evaluateFen(history[i].fen);
            evaluations.push(res);
            if (onProgress) onProgress(i + 1, total);
        }

        let results = [];
        for (let i = 0; i < total; i++) {
            let evalBefore = evaluations[i];
            let evalAfter = evaluations[i + 1];
            
            // Stockfish returns score from the perspective of the side to move.
            // evalBefore is from perspective of player who makes move i.
            // evalAfter is from perspective of opponent.
            // So scoreAfter for the player who made the move is -evalAfter.
            
            function getScoreValue(ev) {
                if (ev.mate !== null) {
                    return ev.mate > 0 ? 10000 - ev.mate : -10000 - ev.mate;
                }
                return ev.cp || 0;
            }

            let scoreBefore = getScoreValue(evalBefore);
            let scoreAfter = getScoreValue(evalAfter);
            let myScoreAfter = -scoreAfter;
            
            let diff = myScoreAfter - scoreBefore;
            
            let quality = '';
            let qualityClass = '';
            
            if (diff <= -200) { quality = '??'; qualityClass = 'blunder'; }
            else if (diff <= -100) { quality = '?'; qualityClass = 'mistake'; }
            else if (diff <= -50) { quality = '?!'; qualityClass = 'inaccuracy'; }
            else if (diff >= 150) { quality = '!!'; qualityClass = 'brilliant'; }
            else if (diff >= 50) { quality = '!'; qualityClass = 'good'; }

            results.push({
                index: i,
                move: history[i].move,
                fen: history[i].fen,
                beforeFen: history[i].beforeFen,
                quality,
                qualityClass,
                bestmove: evalBefore.bestmove,
                diff,
                scoreBefore,
                scoreAfter: myScoreAfter,
                accuracy: Math.max(0, Math.min(100, Math.round(100 * Math.exp(-0.005 * Math.max(0, -diff)))))
            });
        }

        // Calculate overall accuracy
        let whiteSum = 0, whiteCount = 0;
        let blackSum = 0, blackCount = 0;

        results.forEach((res, idx) => {
            if (idx % 2 === 0) { // White move
                whiteSum += res.accuracy;
                whiteCount++;
            } else { // Black move
                blackSum += res.accuracy;
                blackCount++;
            }
        });

        const stats = {
            whiteAccuracy: whiteCount > 0 ? Math.round(whiteSum / whiteCount) : 100,
            blackAccuracy: blackCount > 0 ? Math.round(blackSum / blackCount) : 100,
            moves: results
        };

        isAnalyzing = false;
        if (onComplete) onComplete(stats);
    }

    return {
        analyzeGame
    };
})();
