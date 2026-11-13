/**
 * Chess UI Game Flow Module
 * Manages game lifecycle, turn transitions, status updates, network UI sync, and state serialization.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIGameFlow = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    function convertToUiMove(move) {
        if (!move) return null;
        return {
            fromRow: move.fromRow !== undefined ? move.fromRow : move.fR,
            fromCol: move.fromCol !== undefined ? move.fromCol : move.fC,
            toRow: move.toRow !== undefined ? move.toRow : move.tR,
            toCol: move.toCol !== undefined ? move.toCol : move.tC
        };
    }

    function isMobilePlatform() {
        if (typeof window === 'undefined') return false;
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test' && !window.__FORCE_DESKTOP_TEST__) {
            return true;
        }
        return !!(
            window.Capacitor ||
            (window.location && window.location.protocol === 'capacitor:') ||
            (window.location && window.location.origin && window.location.origin.startsWith('capacitor://')) ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        );
    }

    function createGameFlow(S, deps) {
        const dom = () => S.dom || S;

        function isFlipped() {
            return (S.playerColor === 'b') !== S.isManualFlip;
        }

        function updatePlayerNames() {
            const { topPlayerName, bottomPlayerName, pcToggle } = dom();
            if (!topPlayerName || !bottomPlayerName) return;
            const isPC = !!(pcToggle && pcToggle.checked);
            const isNetwork = !!(S.networkState && S.networkState.connected);

            const myName = 'Вы';
            let oppName = 'Соперник';

            if (isPC) {
                oppName = deps.getStockfishName();
            } else if (!isNetwork) {
                const isBottomWhite = !isFlipped();
                bottomPlayerName.textContent = isBottomWhite ? 'Белые' : 'Черные';
                topPlayerName.textContent = isBottomWhite ? 'Черные' : 'Белые';
                return;
            }

            const isPlayerBottom = !S.isManualFlip;
            bottomPlayerName.textContent = isPlayerBottom ? myName : oppName;
            topPlayerName.textContent = isPlayerBottom ? oppName : myName;
        }

        function flipBoard() {
            S.isManualFlip = !S.isManualFlip;

            if (typeof document !== 'undefined') {
                const topAcc = document.getElementById('top-accuracy');
                const bottomAcc = document.getElementById('bottom-accuracy');
                if (topAcc && bottomAcc) {
                    const temp = topAcc.textContent;
                    topAcc.textContent = bottomAcc.textContent;
                    bottomAcc.textContent = temp;
                }
            }

            updatePlayerNames();
            if (typeof deps.updateAvatars === 'function') deps.updateAvatars();
            if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();
            if (typeof deps.updateCapturesDisplay === 'function') deps.updateCapturesDisplay();
            if (typeof deps.renderBoard === 'function') deps.renderBoard();
        }

        function updateGameModeControlState() {
            const { pcToggle } = dom();
            const gameModeContainer = typeof document !== 'undefined' ? document.getElementById('game-mode-container') : null;
            const diffContainer = typeof document !== 'undefined' ? document.getElementById('difficulty-container') : null;
            const sideContainer = typeof document !== 'undefined' ? document.getElementById('side-container') : null;
            const isNetwork = S.networkState && S.networkState.connected;
            const isMobile = isMobilePlatform();

            if (sideContainer) {
                sideContainer.style.display = '';
            }

            if (isNetwork) {
                if (pcToggle) pcToggle.checked = false;
                if (gameModeContainer) gameModeContainer.style.display = 'none';
                if (diffContainer) diffContainer.style.display = 'none';
                return;
            }

            if (!isMobile) {
                if (pcToggle) pcToggle.checked = true;
                if (gameModeContainer) gameModeContainer.style.display = 'none';
                if (diffContainer) diffContainer.style.display = '';
            } else {
                if (gameModeContainer) gameModeContainer.style.display = '';
                if (diffContainer) diffContainer.style.display = (pcToggle && pcToggle.checked) ? '' : 'none';
            }

            if (!S.gameEnded) {
                updatePlayerNames();
                if (typeof deps.updateAvatars === 'function') deps.updateAvatars();
            }
        }

        function syncNetworkState() {
            const { historyListElement, timeControlSelect } = dom();
            if (typeof ChessNetwork !== 'undefined' && S.networkState && S.networkState.connected && !S.isRemoteAction) {
                ChessNetwork.sendState({
                    boardState: ChessLogic.getState(),
                    timers: {
                        white: S.whiteTimeLeft,
                        black: S.blackTimeLeft,
                        inc: S.increment,
                        running: S.isTimerRunning
                    },
                    history: historyListElement ? historyListElement.innerHTML : '',
                    moveCount: S.moveCount,
                    captures: {
                        white: [...S.capturedByWhite],
                        black: [...S.capturedByBlack]
                    },
                    timeControl: timeControlSelect ? timeControlSelect.value : '600,0'
                });
            }
        }

        function updateNetworkUiAndTelemetry() {
            if (typeof document === 'undefined') return;
            const topDot = document.getElementById('opponent-status-dot');
            const bottomDot = document.getElementById('player-status-dot');
            const telemetry = document.getElementById('settings-network-telemetry');
            const isNetworkGame = S.networkState && S.networkState.connected;
            const isPlayerBottom = !S.isManualFlip;

            const activeDot = isPlayerBottom ? topDot : bottomDot;
            const inactiveDot = isPlayerBottom ? bottomDot : topDot;

            if (inactiveDot) inactiveDot.style.display = 'none';

            if (activeDot) {
                activeDot.style.display = isNetworkGame ? 'inline-block' : 'none';
                if (!isNetworkGame) {
                    activeDot.classList.remove('online');
                    activeDot.classList.add('offline');
                    activeDot.style.backgroundColor = 'rgba(140, 144, 159, 0.4)';
                    activeDot.style.boxShadow = 'none';
                    activeDot.title = 'Оппонент не в игре';
                }
            }
            if (telemetry) {
                telemetry.style.display = isNetworkGame ? 'block' : 'none';
                if (!isNetworkGame) {
                    const pingVal = document.getElementById('settings-ping-val');
                    const latencyVal = document.getElementById('settings-latency-val');
                    if (pingVal) {
                        pingVal.textContent = '— ms';
                        pingVal.className = 'text-xs font-mono text-primary font-bold';
                    }
                    if (latencyVal) {
                        latencyVal.textContent = '— ms';
                        latencyVal.className = 'text-xs font-mono text-primary font-bold';
                    }
                }
            }
        }

        function updateResignButtonState() {
            if (typeof document === 'undefined') return;
            const { pcToggle } = dom();
            const resignBtn = document.getElementById('resign-btn');
            const undoBtn = document.getElementById('undo-btn');
            const hasMoves = S.stateHistory.length > 0;

            if (undoBtn) {
                const canUndo = hasMoves && !S.gameEnded && !S.isWaitingForStart;
                undoBtn.disabled = !canUndo;
                if (undoBtn.classList) {
                    if (typeof undoBtn.classList.toggle === 'function') {
                        undoBtn.classList.toggle('opacity-40', !canUndo);
                        undoBtn.classList.toggle('cursor-not-allowed', !canUndo);
                    } else if (!canUndo) {
                        if (typeof undoBtn.classList.add === 'function') {
                            undoBtn.classList.add('opacity-40');
                            undoBtn.classList.add('cursor-not-allowed');
                        }
                    } else if (typeof undoBtn.classList.remove === 'function') {
                        undoBtn.classList.remove('opacity-40');
                        undoBtn.classList.remove('cursor-not-allowed');
                    }
                }
            }

            if (!resignBtn) return;

            if (S.gameEnded || S.isWaitingForStart || !hasMoves) {
                resignBtn.style.display = 'none';
                return;
            }

            const isNetwork = S.networkState && S.networkState.connected;
            const isPC = pcToggle && pcToggle.checked;

            resignBtn.style.display = (!isNetwork && !isPC) ? 'none' : 'block';
        }

        function updateHintButtonState() {
            if (typeof document === 'undefined') return;
            const { pcToggle } = dom();
            const hintBtn = document.getElementById('hint-btn');
            if (!hintBtn) return;

            const isPlayerTurn = ChessLogic.getTurn() === S.playerColor;
            const isPlayerVsPC = !!(pcToggle && pcToggle.checked);
            const canGetHint = isPlayerVsPC && isPlayerTurn && !S.gameEnded && !S.isWaitingForPC && !S.isWaitingForStart && !S.isCalculatingHint;

            if (canGetHint) {
                hintBtn.disabled = false;
                hintBtn.classList.remove('opacity-40', 'cursor-not-allowed');
                hintBtn.classList.add('cursor-pointer', 'hover:border-primary', 'hover:text-primary');
            } else {
                hintBtn.disabled = true;
                hintBtn.classList.add('opacity-40', 'cursor-not-allowed');
                hintBtn.classList.remove('cursor-pointer', 'hover:border-primary', 'hover:text-primary');
            }
        }

        function tryAutoStartOnInteraction() {
            if (!S.isWaitingForStart) return true;
            const { resetBtn, pcToggle, statusElement, gameInfoElement } = dom();
            S.isWaitingForStart = false;
            if (resetBtn) resetBtn.classList.remove('animate-pulse');

            if (!pcToggle || !pcToggle.checked || S.playerColor === 'w') {
                updateStatus();
                updateResignButtonState();
                updateHintButtonState();
                return true;
            }

            S.isWaitingForPC = true;
            if (statusElement) statusElement.textContent = 'ПК думает...';
            if (gameInfoElement) gameInfoElement.textContent = 'Ход соперника';
            updateResignButtonState();
            updateHintButtonState();
            if (S.pcMoveTimeoutId && typeof deps.cancelPendingMove === 'function') {
                deps.cancelPendingMove();
            }
            S.pcMoveTimeoutId = deps.safeSetTimeout(deps.makePCMove, 400);
            return false;
        }

        function resetDrawButton() {
            if (typeof document === 'undefined') return;
            const drawBtn = document.getElementById('draw-btn');
            if (drawBtn) {
                drawBtn.disabled = false;
                drawBtn.textContent = 'Предложить ничью';
                drawBtn.classList.remove('animate-pulse');
            }
        }

        function startNewGame(isAutomatic = true) {
            const {
                historyListElement,
                animationLayer,
                accuracyBarContainer,
                accuracyWhiteBar,
                accuracyBlackBar,
                pcToggle,
                sideSelect,
                topTimerDisplay,
                bottomTimerDisplay,
                statusElement,
                gameInfoElement,
                resetBtn
            } = dom();

            S.currentAnalysisSessionId++;
            resetDrawButton();
            if (typeof document !== 'undefined') {
                const gameOverModal = document.getElementById('game-over-modal');
                if (gameOverModal) gameOverModal.style.display = 'none';
            }

            ChessLogic.initBoard();
            S.moveCount = 1;
            S.stateHistory = [];
            S.hasPlayedLowTimeWarning = false;
            if (typeof deps.clearPendingTimers === 'function') deps.clearPendingTimers();
            if (historyListElement) historyListElement.innerHTML = '';

            if (typeof document !== 'undefined') {
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) chatMessages.innerHTML = '';
            }
            S.selectedSquare = null;
            S.isWaitingForPC = false;
            S.gameEnded = false;
            S.analysisResults = [];
            S.selectedAnalysisIndex = null;
            S.suggestedMove = null;
            S.analysisSnapshot = null;
            S.lastMove = null;
            if (animationLayer) animationLayer.innerHTML = '';
            if (typeof deps.hideAnalysis === 'function') deps.hideAnalysis();
            if (typeof deps.updateAnalysisTabVisibility === 'function') deps.updateAnalysisTabVisibility();
            S.capturedByWhite = [];
            S.capturedByBlack = [];
            S.isManualFlip = false;

            if (accuracyBarContainer) accuracyBarContainer.style.display = 'none';
            if (accuracyWhiteBar) accuracyWhiteBar.style.height = '50%';
            if (accuracyBlackBar) accuracyBlackBar.style.height = '50%';
            if (typeof deps.scheduleRender === 'function') deps.scheduleRender();

            if (typeof deps.switchTab === 'function') deps.switchTab('notation');
            if (typeof deps.updateCapturesDisplay === 'function') deps.updateCapturesDisplay();

            if (typeof document !== 'undefined') {
                const topAcc = document.getElementById('top-accuracy');
                const bottomAcc = document.getElementById('bottom-accuracy');
                if (topAcc) topAcc.style.display = 'none';
                if (bottomAcc) bottomAcc.style.display = 'none';
            }

            updateResignButtonState();
            if (typeof document !== 'undefined') {
                const drawBtn = document.getElementById('draw-btn');
                if (drawBtn) {
                    drawBtn.disabled = false;
                    drawBtn.style.display = (S.networkState && S.networkState.connected) ? 'block' : 'none';
                }
            }

            if (pcToggle && pcToggle.checked) {
                const chosenSide = sideSelect ? sideSelect.value : 'random';
                if (chosenSide === 'w') {
                    S.playerColor = 'w';
                } else if (chosenSide === 'b') {
                    S.playerColor = 'b';
                } else {
                    S.playerColor = Math.random() < 0.5 ? 'w' : 'b';
                }
                S.pcColor = S.playerColor === 'w' ? 'b' : 'w';
            } else if (!(S.networkState && S.networkState.connected)) {
                const chosenSide = sideSelect ? sideSelect.value : 'random';
                if (chosenSide === 'w') {
                    S.playerColor = 'w';
                } else if (chosenSide === 'b') {
                    S.playerColor = 'b';
                } else {
                    S.playerColor = Math.random() < 0.5 ? 'w' : 'b';
                }
                S.pcColor = S.playerColor === 'w' ? 'b' : 'w';
            }
            updatePlayerNames();
            if (typeof deps.updateAvatars === 'function') deps.updateAvatars();

            if (typeof deps.stopTimer === 'function') deps.stopTimer();
            const tc = deps.parseTimeControl();
            S.whiteTimeLeft = tc.time;
            S.blackTimeLeft = tc.time;
            S.increment = tc.inc;
            S.initialTime = tc.time;
            S.initialInc = tc.inc;
            S.isTimerRunning = false;

            if (S.whiteTimeLeft === 0) {
                if (topTimerDisplay && topTimerDisplay.parentElement) topTimerDisplay.parentElement.style.display = 'none';
                if (bottomTimerDisplay && bottomTimerDisplay.parentElement) bottomTimerDisplay.parentElement.style.display = 'none';
            } else {
                if (topTimerDisplay) {
                    if (topTimerDisplay.parentElement) topTimerDisplay.parentElement.style.display = '';
                    topTimerDisplay.style.display = '';
                }
                if (bottomTimerDisplay) {
                    if (bottomTimerDisplay.parentElement) bottomTimerDisplay.parentElement.style.display = '';
                    bottomTimerDisplay.style.display = '';
                }
                if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();
            }

            if (typeof deps.updateGameFormatBadge === 'function') deps.updateGameFormatBadge();
            if (typeof deps.renderBoard === 'function') deps.renderBoard();
            syncNetworkState();

            if (isAutomatic) {
                if (pcToggle && pcToggle.checked && S.playerColor === 'w') {
                    S.isWaitingForStart = false;
                    if (statusElement) statusElement.textContent = 'Ваш ход (Белые)';
                    if (gameInfoElement) gameInfoElement.textContent = 'Сделайте ход на доске или измените настройки слева';
                    if (resetBtn) resetBtn.classList.remove('animate-pulse');
                } else if (!pcToggle || !pcToggle.checked) {
                    S.isWaitingForStart = false;
                    if (statusElement) statusElement.textContent = 'Ход Белых';
                    if (gameInfoElement) gameInfoElement.textContent = 'Сделайте ход на доске или измените настройки слева';
                    if (resetBtn) resetBtn.classList.remove('animate-pulse');
                } else {
                    S.isWaitingForStart = true;
                    S.isWaitingForPC = false;
                    if (statusElement) statusElement.textContent = 'Готово к игре за Чёрных';
                    if (gameInfoElement) gameInfoElement.textContent = 'Нажмите «Новая игра» или кликните по доске для старта';
                    if (resetBtn) resetBtn.classList.add('animate-pulse');
                }
            } else {
                S.isWaitingForStart = false;
                if (resetBtn) resetBtn.classList.remove('animate-pulse');
                if (pcToggle && pcToggle.checked && S.pcColor === 'w') {
                    S.isWaitingForPC = true;
                    if (statusElement) statusElement.textContent = 'ПК думает...';
                    if (gameInfoElement) gameInfoElement.textContent = 'Ход соперника';
                    if (S.pcMoveTimeoutId && typeof deps.cancelPendingMove === 'function') {
                        deps.cancelPendingMove();
                    }
                    S.pcMoveTimeoutId = deps.safeSetTimeout(deps.makePCMove, 600);
                } else {
                    S.isWaitingForPC = false;
                    if (statusElement) statusElement.textContent = 'Ход Белых';
                    if (gameInfoElement) gameInfoElement.textContent = 'Игра началась';
                }
            }

            if (typeof deps.updateOpponentAvatar === 'function') deps.updateOpponentAvatar();
            updateResignButtonState();
            updateHintButtonState();
        }

        function handleTurnEnd() {
            S.hasPlayedLowTimeWarning = false;
            if (S.initialTime > 0) {
                const turn = ChessLogic.getTurn();
                if (turn === 'w') {
                    S.blackTimeLeft += S.increment;
                } else {
                    S.whiteTimeLeft += S.increment;
                }
            }
        }

        function finishGame(reason = null, loserColor = null) {
            const { statusElement, gameInfoElement, analysisBtn } = dom();
            resetDrawButton();
            S.gameEnded = true;
            if (typeof deps.clearPendingTimers === 'function') deps.clearPendingTimers();
            if (typeof deps.stopTimer === 'function') deps.stopTimer();
            S.suggestedMove = null;

            let title = 'Игра завершена';
            let sub = '';
            let icon = 'workspace_premium';

            if (reason === 'resign') {
                const winnerText = loserColor === 'w' ? 'Победа черных!' : 'Победа белых!';
                const loserText = loserColor === 'w' ? 'Белые сдались' : 'Черные сдались';
                if (statusElement) statusElement.textContent = loserText;
                if (gameInfoElement) gameInfoElement.textContent = winnerText;
                title = winnerText;
                sub = loserText;
                icon = 'flag';
            } else if (reason === 'draw') {
                if (statusElement) statusElement.textContent = 'Ничья';
                if (gameInfoElement) gameInfoElement.textContent = 'По обоюдному согласию';
                title = 'Ничья';
                sub = 'По согласию сторон';
                icon = 'handshake';
            } else if (reason === 'timeout') {
                const winnerText = loserColor === 'w' ? 'Победа черных!' : 'Победа белых!';
                if (statusElement) statusElement.textContent = 'Время вышло!';
                if (gameInfoElement) gameInfoElement.textContent = winnerText;
                title = winnerText;
                sub = 'Время вышло';
                icon = 'schedule';
            } else if (reason === 'checkmate') {
                const winnerText = loserColor === 'w' ? 'Победа черных!' : 'Победа белых!';
                if (statusElement) statusElement.textContent = `МАТ! ${winnerText}`;
                if (gameInfoElement) gameInfoElement.textContent = 'Игра завершена';
                title = winnerText;
                sub = 'Шах и мат';
                icon = 'workspace_premium';
            } else if (reason === 'stalemate') {
                if (statusElement) statusElement.textContent = 'Ничья! Пат.';
                if (gameInfoElement) gameInfoElement.textContent = 'У игрока нет доступных ходов';
                title = 'Ничья';
                sub = 'Пат';
                icon = 'handshake';
            } else if (reason === 'repetition') {
                if (statusElement) statusElement.textContent = 'Ничья! Повторение ходов.';
                if (gameInfoElement) gameInfoElement.textContent = 'Позиция повторилась трижды';
                title = 'Ничья';
                sub = 'Трехкратное повторение позиции';
                icon = 'handshake';
            } else if (reason === '50moves') {
                if (statusElement) statusElement.textContent = 'Ничья! Правило 50 ходов.';
                if (gameInfoElement) gameInfoElement.textContent = '50 ходов без взятий и движения пешек';
                title = 'Ничья';
                sub = 'Правило 50 ходов';
                icon = 'handshake';
            } else if (reason === 'material') {
                if (statusElement) statusElement.textContent = 'Ничья! Недостаточно фигур.';
                if (gameInfoElement) gameInfoElement.textContent = 'Невозможно поставить мат';
                title = 'Ничья';
                sub = 'Недостаточно фигурного материала';
                icon = 'handshake';
            }

            if (typeof deps.showGameOverModal === 'function') {
                deps.showGameOverModal(title, sub, icon);
            }

            if (analysisBtn && ChessLogic.getGameHistory().length > 0) {
                analysisBtn.style.display = 'block';
            }

            updateResignButtonState();
            if (typeof document !== 'undefined') {
                const drawBtn = document.getElementById('draw-btn');
                const undoBtn = document.getElementById('undo-btn');
                if (drawBtn) drawBtn.disabled = true;
                if (undoBtn) undoBtn.disabled = true;
            }
            updateHintButtonState();
            if (typeof deps.updateAnalysisTabVisibility === 'function') deps.updateAnalysisTabVisibility();
            if (typeof deps.startAutomaticBackgroundAnalysis === 'function') deps.startAutomaticBackgroundAnalysis();
        }

        function updateStatus(gameStatus = null) {
            const { statusElement, gameInfoElement, pcToggle } = dom();
            if (S.isWaitingForStart) {
                if (statusElement) statusElement.textContent = 'Нажмите "Новая игра" для начала';
                if (gameInfoElement) {
                    gameInfoElement.textContent = (pcToggle && pcToggle.checked) ? 'Чтобы начать игру против ПК' : 'Чтобы начать партию';
                }
                if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();
                updateHintButtonState();
                return;
            }

            if (S.gameEnded) {
                const turn = ChessLogic.getTurn();
                const moveColor = turn === 'w' ? 'Белых' : 'Черных';
                const inCheck = ChessLogic.isKingInCheck(turn);

                const isHistoricalMove = typeof S.selectedAnalysisIndex !== 'undefined' && S.selectedAnalysisIndex !== null && S.selectedAnalysisIndex < S.analysisResults.length - 1;
                const status = (isHistoricalMove ? null : gameStatus) || (ChessLogic.getAllLegalMoves(turn).length === 0
                    ? (ChessLogic.isKingInCheck(turn) ? 'checkmate' : 'stalemate')
                    : null);

                if (status === 'checkmate') {
                    if (statusElement) statusElement.textContent = `МАТ! Победа ${turn === 'w' ? 'черных' : 'белых'}!`;
                    if (gameInfoElement) gameInfoElement.textContent = 'Анализ позиции';
                } else if (status === 'stalemate') {
                    if (statusElement) statusElement.textContent = 'Ничья! Пат.';
                    if (gameInfoElement) gameInfoElement.textContent = 'Анализ позиции';
                } else if (status === 'repetition') {
                    if (statusElement) statusElement.textContent = 'Ничья! Повторение ходов.';
                    if (gameInfoElement) gameInfoElement.textContent = 'Анализ позиции';
                } else if (status === '50moves') {
                    if (statusElement) statusElement.textContent = 'Ничья! 50 ходов.';
                    if (gameInfoElement) gameInfoElement.textContent = 'Анализ позиции';
                } else if (status === 'material') {
                    if (statusElement) statusElement.textContent = 'Ничья! Недостаточно фигур.';
                    if (gameInfoElement) gameInfoElement.textContent = 'Анализ позиции';
                } else {
                    if (statusElement) statusElement.textContent = `Ход ${moveColor}${inCheck ? ' (ШАХ!)' : ''}`;
                    if (gameInfoElement) gameInfoElement.textContent = inCheck ? 'Король под ударом!' : 'Анализ позиции';
                }
                if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();
                updateHintButtonState();
                return;
            }

            const turn = ChessLogic.getTurn();
            const moveColor = turn === 'w' ? 'Белых' : 'Черных';

            const status = gameStatus || (ChessLogic.getAllLegalMoves(turn).length === 0
                ? (ChessLogic.isKingInCheck(turn) ? 'checkmate' : 'stalemate')
                : null);

            if (status === 'checkmate') {
                finishGame('checkmate', turn);
            } else if (status === 'stalemate') {
                finishGame('stalemate', turn);
            } else if (status === 'repetition') {
                finishGame('repetition');
            } else if (status === '50moves') {
                finishGame('50moves');
            } else if (status === 'material') {
                finishGame('material');
            } else {
                const inCheck = ChessLogic.isKingInCheck(turn);
                if (statusElement) statusElement.textContent = `Ход ${moveColor}${inCheck ? ' (ШАХ!)' : ''}`;
                if (gameInfoElement) gameInfoElement.textContent = inCheck ? 'Король под ударом!' : 'Игра продолжается';
            }
            if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();
            updateHintButtonState();
        }

        function serializeGameState() {
            const {
                historyListElement,
                pcToggle,
                difficultySelect,
                timeControlSelect,
                customMinsInput,
                customIncInput,
                sideSelect
            } = dom();

            return {
                boardState: ChessLogic.getState(),
                timers: {
                    white: S.whiteTimeLeft,
                    black: S.blackTimeLeft,
                    inc: S.increment,
                    running: S.isTimerRunning
                },
                history: historyListElement ? historyListElement.innerHTML : '',
                moveCount: S.moveCount,
                captures: {
                    white: [...S.capturedByWhite],
                    black: [...S.capturedByBlack]
                },
                lastMove: S.lastMove ? { ...S.lastMove } : null,
                stateHistory: S.stateHistory.map((entry) => {
                    const { history, ...rest } = entry;
                    return {
                        ...rest,
                        boardState: entry.boardState ? { ...entry.boardState } : null,
                        lastMove: entry.lastMove ? { ...entry.lastMove } : null
                    };
                }),
                settings: {
                    pcToggle: pcToggle ? pcToggle.checked : false,
                    difficulty: difficultySelect ? difficultySelect.value : '2',
                    timeControl: timeControlSelect ? timeControlSelect.value : '600,0',
                    customMins: customMinsInput ? customMinsInput.value : '',
                    customInc: customIncInput ? customIncInput.value : '',
                    playerColor: S.playerColor,
                    pcColor: S.pcColor,
                    chosenSide: sideSelect ? sideSelect.value : 'random'
                },
                date: new Date().toISOString()
            };
        }

        function deserializeGameState(saveObj) {
            if (!saveObj || !saveObj.boardState || !saveObj.settings) {
                console.error('Invalid save game object');
                return false;
            }

            if (typeof deps.clearPendingTimers === 'function') deps.clearPendingTimers();

            const ok = ChessLogic.loadState(saveObj.boardState);
            if (!ok) return false;

            const {
                pcToggle,
                sideSelect,
                difficultySelect,
                timeControlSelect,
                customTimeInputs,
                customMinsInput,
                customIncInput,
                historyListElement,
                animationLayer,
                accuracyBarContainer,
                accuracyWhiteBar,
                accuracyBlackBar
            } = dom();

            if (pcToggle) pcToggle.checked = saveObj.settings.pcToggle;
            updateGameModeControlState();
            if (sideSelect && saveObj.settings.chosenSide) {
                sideSelect.value = saveObj.settings.chosenSide;
            }
            if (difficultySelect) difficultySelect.value = saveObj.settings.difficulty;
            if (timeControlSelect) {
                timeControlSelect.value = saveObj.settings.timeControl;
                if (customTimeInputs) {
                    customTimeInputs.style.display = timeControlSelect.value === 'custom' ? 'flex' : 'none';
                }
            }
            if (customMinsInput && saveObj.settings.customMins) {
                customMinsInput.value = saveObj.settings.customMins;
            }
            if (customIncInput && saveObj.settings.customInc) {
                customIncInput.value = saveObj.settings.customInc;
            }
            S.playerColor = saveObj.settings.playerColor || 'w';
            S.pcColor = saveObj.settings.pcColor || 'b';

            S.whiteTimeLeft = saveObj.timers.white;
            S.blackTimeLeft = saveObj.timers.black;
            S.increment = saveObj.timers.inc;
            S.isTimerRunning = false;
            if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();

            if (saveObj.history && typeof deps.setSafeHistoryHtml === 'function') {
                deps.setSafeHistoryHtml(saveObj.history);
            } else if (saveObj.boardState && saveObj.boardState.gameHistory && typeof deps.renderHistoryFromMoves === 'function') {
                deps.renderHistoryFromMoves(saveObj.boardState.gameHistory);
            } else if (historyListElement) {
                historyListElement.innerHTML = '';
            }
            S.moveCount = saveObj.moveCount || 1;
            S.stateHistory = saveObj.stateHistory || [];

            S.capturedByWhite = saveObj.captures ? [...(saveObj.captures.white || [])] : [];
            S.capturedByBlack = saveObj.captures ? [...(saveObj.captures.black || [])] : [];
            if (typeof deps.updateCapturesDisplay === 'function') deps.updateCapturesDisplay();

            S.lastMove = saveObj.lastMove;

            S.currentAnalysisSessionId++;
            S.selectedSquare = null;
            S.isWaitingForPC = false;
            S.isWaitingForStart = false;
            S.gameEnded = false;
            S.analysisResults = [];
            S.selectedAnalysisIndex = null;
            S.suggestedMove = null;
            S.analysisSnapshot = null;
            if (animationLayer) animationLayer.innerHTML = '';
            if (typeof deps.hideAnalysis === 'function') deps.hideAnalysis();
            S.isManualFlip = false;

            if (accuracyBarContainer) accuracyBarContainer.style.display = 'none';
            if (accuracyWhiteBar) accuracyWhiteBar.style.height = '50%';
            if (accuracyBlackBar) accuracyBlackBar.style.height = '50%';
            if (typeof document !== 'undefined') {
                const topAcc = document.getElementById('top-accuracy');
                const bottomAcc = document.getElementById('bottom-accuracy');
                if (topAcc) topAcc.style.display = 'none';
                if (bottomAcc) bottomAcc.style.display = 'none';
            }
            if (typeof deps.scheduleRender === 'function') deps.scheduleRender();

            updateResignButtonState();
            if (typeof document !== 'undefined') {
                const drawBtn = document.getElementById('draw-btn');
                if (drawBtn) {
                    drawBtn.disabled = false;
                    drawBtn.style.display = (S.networkState && S.networkState.connected) ? 'block' : 'none';
                }
            }

            updatePlayerNames();
            if (typeof deps.updateAvatars === 'function') deps.updateAvatars();

            if (typeof deps.updateGameFormatBadge === 'function') deps.updateGameFormatBadge();
            updateStatus();

            if (typeof deps.stopTimer === 'function') deps.stopTimer();
            if (saveObj.timers.running && !S.gameEnded && typeof deps.startTimer === 'function') {
                deps.startTimer();
            }

            if (pcToggle && pcToggle.checked && ChessLogic.getTurn() === S.pcColor && !S.gameEnded) {
                S.isWaitingForPC = true;
                if (S.pcMoveTimeoutId && typeof deps.cancelPendingMove === 'function') {
                    deps.cancelPendingMove();
                }
                S.pcMoveTimeoutId = deps.safeSetTimeout(deps.makePCMove, 600);
            }

            if (typeof deps.renderBoard === 'function') deps.renderBoard();
            if (typeof deps.updateAnalysisTabVisibility === 'function') deps.updateAnalysisTabVisibility();
            return true;
        }

        return {
            isFlipped,
            updatePlayerNames,
            flipBoard,
            convertToUiMove,
            isMobilePlatform,
            updateGameModeControlState,
            syncNetworkState,
            updateNetworkUiAndTelemetry,
            tryAutoStartOnInteraction,
            updateResignButtonState,
            resetDrawButton,
            startNewGame,
            handleTurnEnd,
            finishGame,
            updateStatus,
            updateHintButtonState,
            serializeGameState,
            deserializeGameState
        };
    }

    return {
        convertToUiMove,
        isMobilePlatform,
        createGameFlow
    };
});
