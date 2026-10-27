/**
 * Analysis Manager using Stockfish Web Worker
 */

const AnalysisManager = (() => {
    let stockfish = null;
    let isAnalyzing = false;
    let currentTask = null;

    function initWorker() {
        if (!stockfish) {
            console.log("[Analysis] Starting Stockfish Worker v56");
            try {
                stockfish = new Worker('js/stockfish.js?v=56');
                stockfish.onmessage = function(event) {
                    const line = event.data;
                    if (currentTask && typeof currentTask.onMessage === 'function') {
                        currentTask.onMessage(line);
                    }
                };
                stockfish.onerror = function(err) {
                    console.warn("[Analysis] Stockfish Worker error:", err);
                };
                if (stockfish.postMessage) {
                    stockfish.postMessage('uci');
                    stockfish.postMessage('setoption name Skill Level value 20');
                    stockfish.postMessage('setoption name Hash value 16');
                }
            } catch (err) {
                console.warn("[Analysis] Worker initialization failed:", err);
                stockfish = null;
            }
        }
    }

    function evaluateFen(fen, depth = 14) {
        return new Promise(resolve => {
            initWorker();
            let evalResult = { cp: 0, mate: null, bestmove: null };
            let resolved = false;
            let safetyTimeout = null;

            if (!stockfish) {
                resolve(evalResult);
                return;
            }

            const timeout = setTimeout(() => {
                if (!resolved) {
                    if (stockfish && stockfish.postMessage) {
                        stockfish.postMessage('stop');
                        safetyTimeout = setTimeout(() => {
                            if (!resolved) {
                                resolved = true;
                                resolve(evalResult);
                            }
                        }, 150);
                    } else {
                        resolved = true;
                        resolve(evalResult);
                    }
                }
            }, 800);

            currentTask = {
                onMessage: (line) => {
                    if (typeof line === 'string' && line.startsWith('info depth')) {
                        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
                        if (scoreMatch) {
                            if (scoreMatch[1] === 'cp') {
                                evalResult.cp = parseInt(scoreMatch[2], 10);
                                evalResult.mate = null;
                            } else {
                                evalResult.mate = parseInt(scoreMatch[2], 10);
                            }
                        }
                        const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                        if (pvMatch) {
                            evalResult.bestmove = pvMatch[1];
                        }
                    }
                    if (typeof line === 'string' && line.startsWith('bestmove')) {
                        if (!resolved) {
                            clearTimeout(timeout);
                            if (safetyTimeout) clearTimeout(safetyTimeout);
                            resolved = true;
                            const parts = line.split(' ');
                            if (parts[1] && parts[1] !== '(none)') {
                                evalResult.bestmove = parts[1];
                            }
                            resolve(evalResult);
                        }
                    }
                },
                cancel: () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        if (safetyTimeout) clearTimeout(safetyTimeout);
                        resolved = true;
                        resolve(evalResult);
                    }
                }
            };
            if (stockfish.postMessage) {
                stockfish.postMessage(`position fen ${fen}`);
                stockfish.postMessage(`go depth ${depth}`);
            } else {
                resolve(evalResult);
            }
        });
    }

    async function analyzeGame(history, onProgress, onComplete) {
        if (isAnalyzing) return;
        isAnalyzing = true;
        
        let evaluations = [];
        const total = history.length;
        
        if (total === 0) {
            isAnalyzing = false;
            if (onComplete) {
                onComplete({
                    whiteAccuracy: 100,
                    blackAccuracy: 100,
                    moves: [],
                    summary: {
                        white: { brilliant: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
                        black: { brilliant: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
                    }
                });
            }
            return;
        }

        // Evaluate initial state
        if (!isAnalyzing) return;
        let resStart = await evaluateFen(history[0].beforeFen);
        if (!isAnalyzing) return;
        evaluations.push(resStart);

        for (let i = 0; i < total; i++) {
            if (!isAnalyzing) break;
            let res = await evaluateFen(history[i].fen);
            if (!isAnalyzing) break;
            evaluations.push(res);
            if (onProgress) onProgress(i + 1, total);
        }

        if (!isAnalyzing) return;

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
            let isBest = history[i].move && evalBefore.bestmove && (history[i].move.uci === evalBefore.bestmove);
            let quality = '';
            let qualityClass = '';
            let accuracy = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-0.005 * Math.max(0, -diff)))));

            if (diff >= 150) {
                quality = '!!';
                qualityClass = 'brilliant';
            } else if (isBest) {
                quality = '★';
                qualityClass = 'best';
                accuracy = 100;
            } else if (diff >= -10) {
                quality = '!';
                qualityClass = 'excellent';
                accuracy = Math.max(95, accuracy);
            } else if (diff >= -49) {
                quality = '+';
                qualityClass = 'good';
                accuracy = Math.max(80, accuracy);
            } else if (diff <= -200) {
                quality = '??';
                qualityClass = 'blunder';
            } else if (diff <= -100) {
                quality = '?';
                qualityClass = 'mistake';
            } else if (diff <= -50) {
                quality = '?!';
                qualityClass = 'inaccuracy';
            }

            results.push({
                index: i,
                move: history[i].move,
                fen: history[i].fen,
                beforeFen: history[i].beforeFen,
                quality,
                qualityClass,
                bestmove: evalBefore.bestmove,
                nextBestMove: evalAfter.bestmove,
                diff,
                scoreBefore,
                scoreAfter: myScoreAfter,
                accuracy
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
            moves: results,
            summary: {
                white: { brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
                black: { brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
            }
        };

        results.forEach((res, idx) => {
            const side = idx % 2 === 0 ? 'white' : 'black';
            if (res.qualityClass && stats.summary[side][res.qualityClass] !== undefined) {
                stats.summary[side][res.qualityClass]++;
            }
        });

        isAnalyzing = false;
        if (onComplete) onComplete(stats);
    }

    function stopAnalysis() {
        console.log("[Analysis] Stopping analysis and terminating worker");
        isAnalyzing = false;
        if (currentTask && typeof currentTask.cancel === 'function') {
            currentTask.cancel();
        }
        currentTask = null;
        if (stockfish) {
            stockfish.terminate();
            stockfish = null;
        }
    }

    return {
        analyzeGame,
        evaluateFen,
        stopAnalysis
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AnalysisManager;
