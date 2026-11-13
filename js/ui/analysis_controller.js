/**
 * Chess UI Analysis Controller Module
 * Manages post-game Stockfish analysis lifecycle and move inspection.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIAnalysis = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    function parseUciMove(uci) {
        if (!uci || uci.length < 4) return null;
        const files = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
        return {
            fromCol: files[uci[0]],
            fromRow: 8 - parseInt(uci[1], 10),
            toCol: files[uci[2]],
            toRow: 8 - parseInt(uci[3], 10)
        };
    }

    function createAnalysisController(deps) {
        function getEls() {
            return deps.getElements ? deps.getElements() : (deps.elements || {});
        }

        function getManager() {
            if (deps.AnalysisManager) return deps.AnalysisManager;
            if (typeof AnalysisManager !== 'undefined') return AnalysisManager;
            return null;
        }

        function updateAnalysisTabVisibility() {
            if (typeof document === 'undefined') return;
            const tabBtnAnalysis = document.getElementById('tab-btn-analysis');
            if (!tabBtnAnalysis) return;

            if (deps.isGameEnded()) {
                tabBtnAnalysis.style.display = '';
            } else {
                tabBtnAnalysis.style.display = 'none';
                const tabContentAnalysis = document.getElementById('tab-content-analysis');
                if (tabContentAnalysis && !tabContentAnalysis.classList.contains('hidden')) {
                    if (typeof deps.switchTab === 'function') deps.switchTab('notation');
                }
            }
        }

        function hideAnalysis() {
            const { analysisPanel, analysisList, analysisProgress, stockfishTip } = getEls();
            if (analysisPanel) analysisPanel.style.display = 'none';
            if (analysisList) analysisList.innerHTML = '';
            if (analysisProgress) analysisProgress.textContent = '';
            if (stockfishTip) {
                stockfishTip.textContent = '';
                stockfishTip.style.display = 'none';
            }
            if (typeof deps.setAnalysisSnapshot === 'function') deps.setAnalysisSnapshot(null);
            if (typeof deps.setSuggestedMove === 'function') deps.setSuggestedMove(null);

            const manager = getManager();
            if (manager && typeof manager.stopAnalysis === 'function') {
                manager.stopAnalysis();
            }
            updateAnalysisTabVisibility();
        }

        function renderResults(stats) {
            if (typeof deps.setAnalysisResults === 'function') {
                deps.setAnalysisResults(stats.moves);
            }
            if (typeof deps.renderAnalysisList === 'function') {
                deps.renderAnalysisList(stats.moves);
            }
            if (typeof deps.displayAccuracyStats === 'function') {
                deps.displayAccuracyStats(stats);
            }
        }

        function startAnalysis() {
            const { analysisBtn, analysisPanel, analysisList, analysisProgress, stockfishTip } = getEls();
            if (typeof deps.switchTab === 'function') deps.switchTab('analysis');
            if (analysisBtn) analysisBtn.style.display = 'none';
            if (analysisPanel) analysisPanel.style.display = 'block';

            if (deps.isFileProtocol) {
                if (analysisProgress) {
                    analysisProgress.innerHTML = '<span class="text-error font-semibold block text-center py-4">Анализ недоступен при открытии файла напрямую через браузер.<br>Пожалуйста, запустите через Electron (npm start) или локальный веб-сервер.</span>';
                }
                return;
            }

            if (analysisProgress) analysisProgress.textContent = 'Подготовка к анализу...';
            if (analysisList) analysisList.innerHTML = '';
            if (stockfishTip) {
                stockfishTip.textContent = '';
                stockfishTip.style.display = 'none';
            }

            const history = deps.getGameHistory();
            const sessionId = deps.getAnalysisSessionId();
            const manager = getManager();
            if (!manager || typeof manager.analyzeGame !== 'function') return;

            manager.analyzeGame(history, (current, total) => {
                if (sessionId !== deps.getAnalysisSessionId()) return;
                const progress = (current / total) * 100;
                if (analysisProgress) {
                    analysisProgress.innerHTML = `
                <div class="w-full bg-surface-container-highest rounded overflow-hidden mt-1" style="height: 4px;">
                    <div class="bg-primary h-full transition-all duration-300" style="width: ${Math.round(progress)}%;"></div>
                </div>
                <div style="text-align: right; margin-top: 2px;">${Math.round(progress)}%</div>
            `;
                }
            }, (stats) => {
                if (sessionId !== deps.getAnalysisSessionId()) return;
                if (analysisProgress) analysisProgress.textContent = 'Анализ завершен!';
                renderResults(stats);
            });
        }

        function startAutomaticBackgroundAnalysis() {
            if (deps.isFileProtocol) return;

            const history = deps.getGameHistory();
            if (!history || history.length === 0) return;

            const {
                accuracyBarContainer,
                accuracyWhiteBar,
                accuracyBlackBar,
                analysisProgress,
                analysisList,
                stockfishTip,
                analysisBtn,
                analysisPanel
            } = getEls();

            if (accuracyBarContainer) {
                accuracyBarContainer.style.display = 'flex';
                accuracyBarContainer.classList.add('animate-pulse');
            }
            if (accuracyWhiteBar) {
                accuracyWhiteBar.style.height = '50%';
                accuracyWhiteBar.title = 'Вычисляется точность белых...';
            }
            if (accuracyBlackBar) {
                accuracyBlackBar.style.height = '50%';
                accuracyBlackBar.title = 'Вычисляется точность черных...';
            }
            if (typeof deps.scheduleRender === 'function') deps.scheduleRender();

            if (analysisProgress) analysisProgress.textContent = 'Подготовка к анализу...';
            if (analysisList) analysisList.innerHTML = '';
            if (stockfishTip) {
                stockfishTip.textContent = '';
                stockfishTip.style.display = 'none';
            }
            if (analysisBtn) analysisBtn.style.display = 'none';
            if (analysisPanel) analysisPanel.style.display = 'block';

            const sessionId = deps.getAnalysisSessionId();
            const manager = getManager();
            if (!manager || typeof manager.analyzeGame !== 'function') return;

            manager.analyzeGame(history, (current, total) => {
                if (sessionId !== deps.getAnalysisSessionId()) return;
                const progress = (current / total) * 100;
                if (analysisProgress) {
                    analysisProgress.innerHTML = `
                        <div class="w-full bg-surface-container-highest rounded overflow-hidden mt-1" style="height: 4px;">
                            <div class="bg-primary h-full transition-all duration-300" style="width: ${Math.round(progress)}%;"></div>
                        </div>
                        <div style="text-align: right; margin-top: 2px;">Анализ: ${Math.round(progress)}%</div>
                    `;
                }
            }, (stats) => {
                if (sessionId !== deps.getAnalysisSessionId()) return;
                if (analysisProgress) analysisProgress.textContent = 'Анализ завершен!';
                if (accuracyBarContainer) {
                    accuracyBarContainer.classList.remove('animate-pulse');
                }
                renderResults(stats);
            });
        }

        function selectAnalysisMove(index) {
            if (typeof deps.setSelectedAnalysisIndex === 'function') {
                deps.setSelectedAnalysisIndex(index);
            }
            const results = deps.getAnalysisResults();
            const result = results && results[index];
            if (!result) return;

            const isBadMove = result.qualityClass === 'inaccuracy' ||
                              result.qualityClass === 'mistake' ||
                              result.qualityClass === 'blunder';

            const fenToLoad = (isBadMove && result.beforeFen) ? result.beforeFen : result.fen;
            deps.loadFen(fenToLoad, { keepHistory: true, skipRecord: true });

            const currentTurn = deps.getTurn();
            if (typeof deps.setAnalysisSnapshot === 'function') {
                deps.setAnalysisSnapshot({ turn: currentTurn });
            }

            const uiMove = result.move ? deps.convertToUiMove(result.move) : null;
            if (typeof deps.setLastMove === 'function') {
                deps.setLastMove((isBadMove && result.beforeFen) ? null : uiMove);
            }

            const formatMove = (uci) => {
                if (!uci || uci === '(none)') return '';
                return uci.replace(/([a-h][1-8])([a-h][1-8])/, '$1-$2');
            };

            const turnLabel = currentTurn === 'w' ? 'Белых' : 'Чёрных';
            let tipText = '';
            let nextSuggestedMove = null;

            if (isBadMove) {
                const playedUci = (result.move && result.move.uci) ? formatMove(result.move.uci) : '';
                if (result.bestmove && result.bestmove !== '(none)') {
                    const bestStr = formatMove(result.bestmove);
                    tipText = playedUci
                        ? `Вместо ${playedUci} лучшим ходом за ${turnLabel} было: ${bestStr}`
                        : `Лучший ход за ${turnLabel}: ${bestStr}`;
                    nextSuggestedMove = parseUciMove(result.bestmove);
                }
            } else if (result.nextBestMove && result.nextBestMove !== '(none)') {
                const nextBestStr = formatMove(result.nextBestMove);
                tipText = `Лучший ответ за ${turnLabel}: ${nextBestStr}`;
                nextSuggestedMove = parseUciMove(result.nextBestMove);
            }

            if (typeof deps.setSuggestedMove === 'function') {
                deps.setSuggestedMove(nextSuggestedMove);
            }

            const { stockfishTip } = getEls();
            if (stockfishTip) {
                stockfishTip.textContent = tipText;
                stockfishTip.style.display = tipText ? 'flex' : 'none';
            }

            if (typeof deps.setSelectedSquare === 'function') {
                deps.setSelectedSquare((isBadMove && result.beforeFen) ? null : (uiMove ? { row: uiMove.fromRow, col: uiMove.fromCol } : null));
            }

            if (typeof deps.updateStatus === 'function') deps.updateStatus();
            if (typeof deps.renderBoard === 'function') deps.renderBoard();
        }

        return {
            updateAnalysisTabVisibility,
            hideAnalysis,
            startAnalysis,
            startAutomaticBackgroundAnalysis,
            parseUciMove,
            selectAnalysisMove
        };
    }

    return {
        parseUciMove,
        createAnalysisController
    };
});
