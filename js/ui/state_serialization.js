(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIStateSerialization = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    function createStateSerialization(deps) {
        function getLogic() {
            if (typeof deps.getChessLogic === 'function') return deps.getChessLogic();
            return typeof ChessLogic !== 'undefined' ? ChessLogic : null;
        }

        function serializeGameState() {
            const logic = getLogic();
            const timers = deps.getTimersState();
            const capturedW = deps.getCapturedByWhite() || [];
            const capturedB = deps.getCapturedByBlack() || [];
            const lastMove = deps.getLastMove();
            const stateHistory = deps.getStateHistory() || [];

            return {
                boardState: logic ? logic.getState() : null,
                timers: {
                    white: timers.whiteTimeLeft,
                    black: timers.blackTimeLeft,
                    inc: timers.increment,
                    running: timers.isTimerRunning
                },
                history: deps.historyListElement ? deps.historyListElement.innerHTML : '',
                moveCount: deps.getMoveCount(),
                captures: {
                    white: [...capturedW],
                    black: [...capturedB]
                },
                lastMove: lastMove ? { ...lastMove } : null,
                stateHistory: stateHistory.map(entry => {
                    const { history, ...rest } = entry;
                    return {
                        ...rest,
                        boardState: entry.boardState ? { ...entry.boardState } : null,
                        lastMove: entry.lastMove ? { ...entry.lastMove } : null
                    };
                }),
                settings: {
                    pcToggle: deps.pcToggle ? deps.pcToggle.checked : false,
                    difficulty: deps.difficultySelect ? deps.difficultySelect.value : '',
                    timeControl: deps.timeControlSelect ? deps.timeControlSelect.value : '',
                    customMins: deps.customMinsInput ? deps.customMinsInput.value : '',
                    customInc: deps.customIncInput ? deps.customIncInput.value : '',
                    playerColor: deps.getPlayerColor(),
                    pcColor: deps.getPcColor(),
                    chosenSide: deps.sideSelect ? deps.sideSelect.value : 'random'
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

            const logic = getLogic();
            const ok = logic ? logic.loadState(saveObj.boardState) : false;
            if (!ok) return false;

            if (deps.pcToggle) deps.pcToggle.checked = saveObj.settings.pcToggle;
            if (typeof deps.updateGameModeControlState === 'function') deps.updateGameModeControlState();
            if (deps.sideSelect && saveObj.settings.chosenSide) {
                deps.sideSelect.value = saveObj.settings.chosenSide;
            }
            if (deps.difficultySelect) deps.difficultySelect.value = saveObj.settings.difficulty;
            if (deps.timeControlSelect) {
                deps.timeControlSelect.value = saveObj.settings.timeControl;
                if (deps.customTimeInputs) {
                    deps.customTimeInputs.style.display = deps.timeControlSelect.value === 'custom' ? 'flex' : 'none';
                }
            }
            if (deps.customMinsInput && saveObj.settings.customMins) {
                deps.customMinsInput.value = saveObj.settings.customMins;
            }
            if (deps.customIncInput && saveObj.settings.customInc) {
                deps.customIncInput.value = saveObj.settings.customInc;
            }

            const playerColor = saveObj.settings.playerColor || 'w';
            const pcColor = saveObj.settings.pcColor || 'b';
            deps.setPlayerColor(playerColor);
            deps.setPcColor(pcColor);

            deps.setTimersState({
                whiteTimeLeft: saveObj.timers.white,
                blackTimeLeft: saveObj.timers.black,
                increment: saveObj.timers.inc,
                isTimerRunning: false
            });
            if (typeof deps.updateTimerDisplays === 'function') deps.updateTimerDisplays();

            if (saveObj.history) {
                if (typeof deps.setSafeHistoryHtml === 'function') deps.setSafeHistoryHtml(saveObj.history);
            } else if (saveObj.boardState && saveObj.boardState.gameHistory) {
                if (typeof deps.renderHistoryFromMoves === 'function') deps.renderHistoryFromMoves(saveObj.boardState.gameHistory);
            } else if (deps.historyListElement) {
                deps.historyListElement.innerHTML = '';
            }

            deps.setMoveCount(saveObj.moveCount || 1);
            deps.setStateHistory(saveObj.stateHistory || []);

            deps.setCapturedByWhite(saveObj.captures ? [...(saveObj.captures.white || [])] : []);
            deps.setCapturedByBlack(saveObj.captures ? [...(saveObj.captures.black || [])] : []);
            if (typeof deps.updateCapturesDisplay === 'function') deps.updateCapturesDisplay();

            deps.setLastMove(saveObj.lastMove);

            if (typeof deps.incrementAnalysisSessionId === 'function') deps.incrementAnalysisSessionId();
            if (typeof deps.resetBoardInteractionState === 'function') deps.resetBoardInteractionState();
            if (deps.animationLayer) deps.animationLayer.innerHTML = '';
            if (typeof deps.hideAnalysis === 'function') deps.hideAnalysis();

            if (deps.accuracyBarContainer) deps.accuracyBarContainer.style.display = 'none';
            if (deps.accuracyWhiteBar) deps.accuracyWhiteBar.style.height = '50%';
            if (deps.accuracyBlackBar) deps.accuracyBlackBar.style.height = '50%';
            if (typeof document !== 'undefined') {
                const topAcc = document.getElementById('top-accuracy');
                const bottomAcc = document.getElementById('bottom-accuracy');
                if (topAcc) topAcc.style.display = 'none';
                if (bottomAcc) bottomAcc.style.display = 'none';
            }
            if (typeof deps.scheduleRender === 'function') deps.scheduleRender();

            if (typeof deps.updateResignButtonState === 'function') deps.updateResignButtonState();
            const networkState = typeof deps.getNetworkState === 'function' ? deps.getNetworkState() : null;
            if (typeof document !== 'undefined') {
                const drawBtn = document.getElementById('draw-btn');
                if (drawBtn) {
                    drawBtn.disabled = false;
                    drawBtn.style.display = (networkState && networkState.connected) ? 'block' : 'none';
                }
            }

            if (typeof deps.updatePlayerNames === 'function') deps.updatePlayerNames();
            if (typeof deps.updateAvatars === 'function') deps.updateAvatars();
            if (typeof deps.updateGameFormatBadge === 'function') deps.updateGameFormatBadge();
            if (typeof deps.updateStatus === 'function') deps.updateStatus();

            if (typeof deps.stopTimer === 'function') deps.stopTimer();
            const gameEnded = typeof deps.getGameEnded === 'function' ? deps.getGameEnded() : false;
            if (saveObj.timers.running && !gameEnded && typeof deps.startTimer === 'function') {
                deps.startTimer();
            }

            if (deps.pcToggle && deps.pcToggle.checked && logic && logic.getTurn() === pcColor && !gameEnded) {
                if (typeof deps.setWaitingForPC === 'function') deps.setWaitingForPC(true);
                if (typeof deps.getPcMoveTimeoutId === 'function' && deps.getPcMoveTimeoutId() && typeof deps.cancelPendingMove === 'function') {
                    deps.cancelPendingMove();
                }
                if (typeof deps.safeSetTimeout === 'function' && typeof deps.setPcMoveTimeoutId === 'function') {
                    deps.setPcMoveTimeoutId(deps.safeSetTimeout(deps.makePCMove, 600));
                }
            }

            if (typeof deps.renderBoard === 'function') deps.renderBoard();
            if (typeof deps.updateAnalysisTabVisibility === 'function') deps.updateAnalysisTabVisibility();
            return true;
        }

        return {
            serializeGameState,
            deserializeGameState
        };
    }

    return {
        createStateSerialization
    };
});
