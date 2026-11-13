(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIDomEvents = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    function initDomAndEvents(S, deps) {
        console.log("Chess UI Initializing... [Version v40]");
        deps.clearPendingTimers();
        S.cachedCanvasRect = null;
        S.dom = S.dom || {};
        S.dom.cachedOppCard = null;
        S.dom.cachedPlayerCard = null;
        S.renderScheduled = false;
        S.animatingMove = null;
        S.cachedLegalDests = null;
        S.cachedLegalDestsSquare = null;
        S.cachedLegalDestsFen = null;
        deps.initPieceImages();

        if (typeof ChessWASM !== 'undefined') {
            ChessWASM.init().then(success => {
                console.log('[UI] ChessWASM initialized successfully:', success);
            }).catch(err => {
                console.warn('[UI] ChessWASM failed to initialize:', err);
            });
        }

        const boardContainer = document.getElementById('board-container');
        const boardElement = document.getElementById('chessboard');
        S.dom.boardContainer = boardContainer;
        S.dom.boardElement = boardElement;
        S.dom.accuracyBarContainer = document.getElementById('accuracy-bar-container');
        S.dom.accuracyWhiteBar = document.getElementById('accuracy-white-bar');
        S.dom.accuracyBlackBar = document.getElementById('accuracy-black-bar');

        // Initialize Canvas
        if (boardElement) {
            let canvas = document.getElementById('chess-canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'chess-canvas';
                boardElement.appendChild(canvas);
            }
            S.canvas = canvas;
            S.ctx = canvas.getContext('2d');

            if (!canvas._uiEventsBound) {
                canvas._uiEventsBound = true;
                // Bind Canvas Events
                canvas.addEventListener('click', (event) => {
                    if (S.draggedOccurred) {
                        S.draggedOccurred = false;
                        return;
                    }
                    if (S.isWaitingForPC || S.gameEnded || S.analysisSnapshot) return;
                    if (S.isWaitingForStart && !deps.tryAutoStartOnInteraction()) return;
                    const sq = deps.getSquareFromCoords(event.clientX, event.clientY);
                    if (sq.valid) {
                        deps.handleSquareClick(sq.r, sq.c);
                    }
                });

                canvas.addEventListener('mousedown', (event) => {
                    deps.handleMousedown(event.clientX, event.clientY);
                });

                canvas.addEventListener('mousemove', (event) => {
                    deps.handleMousemove(event.clientX, event.clientY);
                });

                canvas.addEventListener('mouseup', (event) => {
                    deps.handleMouseup(event.clientX, event.clientY);
                });

                canvas.addEventListener('mouseleave', (event) => {
                    if (S.isDragging) {
                        deps.handleMouseup(event.clientX, event.clientY);
                    } else if (S.hoverSquare) {
                        S.hoverSquare = null;
                        deps.renderBoard();
                    }
                });

                canvas.addEventListener('touchstart', (event) => {
                    if (event.touches.length > 0) {
                        if (deps.isDraggingPiece(event.touches[0].clientX, event.touches[0].clientY)) {
                            event.preventDefault();
                        }
                        deps.handleMousedown(event.touches[0].clientX, event.touches[0].clientY);
                    }
                }, { passive: false });

                canvas.addEventListener('touchmove', (event) => {
                    if (event.touches.length > 0) {
                        if (S.isDragging) {
                            event.preventDefault();
                        }
                        deps.handleMousemove(event.touches[0].clientX, event.touches[0].clientY);
                    }
                }, { passive: false });

                canvas.addEventListener('touchend', (event) => {
                    if (event.changedTouches.length > 0) {
                        deps.handleMouseup(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
                    }
                });

                window.addEventListener('resize', () => {
                    deps.updateCanvasRect();
                    deps.scheduleRender();
                });
                if (typeof ResizeObserver !== 'undefined' && boardElement && !boardElement._resizeObserver) {
                    boardElement._resizeObserver = new ResizeObserver(() => {
                        deps.updateCanvasRect();
                        deps.scheduleRender();
                    });
                    boardElement._resizeObserver.observe(boardElement);
                }
                if (typeof window !== 'undefined' && window.addEventListener) {
                    window.addEventListener('scroll', deps.updateCanvasRect, { passive: true });
                }
            }
        }

        const statusElement = document.getElementById('status');
        const gameInfoElement = document.getElementById('game-info');
        const historyListElement = document.getElementById('history-list');
        const resetBtn = document.getElementById('reset-btn');
        const pcToggle = document.getElementById('pc-toggle');
        const difficultySelect = document.getElementById('difficulty-select');
        const sideSelect = document.getElementById('side-select');
        const timeControlSelect = document.getElementById('time-control');
        const customTimeInputs = document.getElementById('custom-time-inputs');
        const customMinsInput = document.getElementById('custom-mins');
        const customIncInput = document.getElementById('custom-inc');
        const themeSelect = document.getElementById('theme-select');
        const networkBtn = document.getElementById('network-btn');
        const analysisBtn = document.getElementById('analyze-btn');

        S.dom.statusElement = statusElement;
        S.dom.gameInfoElement = gameInfoElement;
        S.dom.cachedOppCard = document.getElementById('opponent-card');
        S.dom.cachedPlayerCard = document.getElementById('player-card');
        S.dom.historyListElement = historyListElement;
        S.dom.resetBtn = resetBtn;
        S.dom.pcToggle = pcToggle;
        S.dom.difficultySelect = difficultySelect;
        S.dom.sideSelect = sideSelect;
        S.dom.timeControlSelect = timeControlSelect;
        S.dom.customTimeInputs = customTimeInputs;
        S.dom.customMinsInput = customMinsInput;
        S.dom.customIncInput = customIncInput;
        S.dom.themeSelect = themeSelect;
        S.dom.analysisBtn = analysisBtn;
        S.dom.analysisPanel = document.getElementById('analysis-panel');
        S.dom.analysisList = document.getElementById('analysis-list');
        S.dom.analysisProgress = document.getElementById('analysis-progress');
        S.dom.stockfishTip = document.getElementById('analysis-advice');
        S.dom.gameConditionBadge = document.getElementById('game-condition-badge');

        // Аудио-фикс: активируем звук при первом клике пользователя
        const resumeAudio = () => {
            const audioCtx = (typeof ChessAudio !== 'undefined' && ChessAudio.getContext) ? ChessAudio.getContext() : null;
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => {
                    console.log('[Audio] Context resumed successfully');
                });
            }
            window.removeEventListener('click', resumeAudio);
            window.removeEventListener('touchstart', resumeAudio);
        };
        window.addEventListener('click', resumeAudio);
        window.addEventListener('touchstart', resumeAudio);

        // Network button logic
        if (networkBtn) {
            const isNativeApp = typeof window !== 'undefined' && (
                !!window.Capacitor ||
                (window.location && window.location.protocol === 'capacitor:') ||
                (window.location && window.location.origin && window.location.origin.startsWith('capacitor://'))
            );

            if (isNativeApp) {
                console.log('[UI] Native app environment detected. Hiding network play button.');
                networkBtn.style.display = 'none';
            } else {
                networkBtn.style.display = '';
            }

            console.log('[UI] Network button found, setting up listeners...');

            function connectToRoom(roomId, serverUrl = null) {
                try {
                    if (pcToggle) pcToggle.checked = false;
                    const gameModeContainer = document.getElementById('game-mode-container');
                    if (gameModeContainer) gameModeContainer.style.display = 'none';
                    const diffContainer = document.getElementById('difficulty-container');
                    if (diffContainer) diffContainer.style.display = 'none';
                    const sideContainer = document.getElementById('side-container');
                    if (sideContainer) sideContainer.style.display = '';

                    if (networkBtn) {
                        networkBtn.textContent = `Покинуть комнату (${roomId})`;
                        networkBtn.classList.add('leave-room-btn');
                    }

                    const preferredSide = sideSelect ? sideSelect.value : 'random';
                    deps.startNewGame();

                    SocketTransport.init(roomId, serverUrl, preferredSide);
                } catch (e) {
                    console.error('Network Error:', e);
                }
            }

            const networkRoomModal = document.getElementById('network-room-modal');
            const networkRoomInput = document.getElementById('network-room-input');
            const networkSideSelect = document.getElementById('network-side-select');
            const networkRoomConfirmBtn = document.getElementById('network-room-confirm-btn');
            const networkRoomCancelBtn = document.getElementById('network-room-cancel-btn');
            const networkRoomCloseBtn = document.getElementById('network-room-close-btn');

            if (sideSelect && networkSideSelect) {
                sideSelect.addEventListener('change', () => {
                    networkSideSelect.value = sideSelect.value;
                });
                networkSideSelect.addEventListener('change', () => {
                    sideSelect.value = networkSideSelect.value;
                });
            }

            if (networkRoomModal) {
                const closeRoomModal = () => {
                    networkRoomModal.style.display = 'none';
                };

                if (networkRoomCloseBtn) networkRoomCloseBtn.addEventListener('click', closeRoomModal);
                if (networkRoomCancelBtn) networkRoomCancelBtn.addEventListener('click', closeRoomModal);

                if (networkRoomConfirmBtn && networkRoomInput) {
                    networkRoomConfirmBtn.addEventListener('click', () => {
                        const roomId = networkRoomInput.value.trim();
                        if (roomId) {
                            closeRoomModal();
                            connectToRoom(roomId);
                        } else {
                            alert('Пожалуйста, введите имя или номер комнаты.');
                        }
                    });
                }
            }

            const settingsModal = document.getElementById('settings-modal');
            const settingsBtn = document.getElementById('settings-btn');
            const settingsCloseBtn = document.getElementById('settings-close-btn');
            const settingsSaveBtn = document.getElementById('settings-save-btn');

            if (settingsModal) {
                const openSettingsModal = () => {
                    settingsModal.style.display = 'flex';
                };
                const closeSettingsModal = () => {
                    settingsModal.style.display = 'none';
                };

                if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
                if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsModal);
                if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', closeSettingsModal);
            }

            networkBtn.addEventListener('click', () => {
                const currentStatus = (typeof ChessNetwork !== 'undefined') ? ChessNetwork.getState() : { connected: false };
                console.log('[UI] Network button click triggered. Status:', currentStatus);

                if (currentStatus.connected) {
                    if (confirm('Покинуть комнату и вернуться в одиночную игру?')) {
                        if (window.location.hash) {
                            history.replaceState(null, null, ' ');
                        }

                        if (typeof SocketTransport !== 'undefined') {
                            SocketTransport.disconnect();
                        } else if (typeof ChessNetwork !== 'undefined') {
                            ChessNetwork.disconnect();
                        }
                        deps.startNewGame();
                    }
                } else {
                    let roomId = window.location.hash.replace('#', '').trim();
                    if (!roomId) {
                        if (networkRoomModal && networkRoomInput) {
                            networkRoomInput.value = "123";
                            networkRoomModal.style.display = 'flex';
                            networkRoomInput.focus();
                            if (typeof networkRoomInput.select === 'function') {
                                networkRoomInput.select();
                            }
                        } else {
                            roomId = prompt("Введите ID комнаты для игры (латиница/цифры):", "123");
                            if (roomId) connectToRoom(roomId);
                        }
                    } else {
                        connectToRoom(roomId);
                    }
                }
            });

            const initialHash = window.location.hash.replace('#', '').trim();
            if (initialHash) {
                console.log('[UI] Auto-connecting to room from URL hash:', initialHash);
                deps.safeSetTimeout(() => {
                    connectToRoom(initialHash);
                }, 100);
            }
        } else {
            console.error('[UI] network-btn element not found in DOM!');
        }

        S.dom.topPlayerName = document.getElementById('top-player-name');
        S.dom.bottomPlayerName = document.getElementById('bottom-player-name');
        S.dom.topTimerDisplay = document.getElementById('top-timer');
        S.dom.bottomTimerDisplay = document.getElementById('bottom-timer');
        S.dom.topTimerContainer = document.getElementById('top-timer-container');
        S.dom.bottomTimerContainer = document.getElementById('bottom-timer-container');
        S.dom.topCapturedEl = document.getElementById('top-captured');
        S.dom.bottomCapturedEl = document.getElementById('bottom-captured');
        S.dom.topAdvantageEl = document.getElementById('top-advantage');
        S.dom.bottomAdvantageEl = document.getElementById('bottom-advantage');

        if (typeof ChessNetwork !== 'undefined') {
            ChessNetwork.on('status', state => {
                S.networkState = state;
                const drawBtn = document.getElementById('draw-btn');
                if (drawBtn) {
                    drawBtn.style.display = (S.networkState && S.networkState.connected && !S.gameEnded) ? 'block' : 'none';
                }

                const netBtn = document.getElementById('network-btn');
                if (S.networkState && S.networkState.connected) {
                    if (netBtn) {
                        netBtn.textContent = `Покинуть комнату${S.networkState.roomId ? ' (' + S.networkState.roomId + ')' : ''}`;
                        netBtn.classList.add('leave-room-btn');
                    }
                } else {
                    if (netBtn) {
                        netBtn.textContent = 'Играть по сети';
                        netBtn.classList.remove('leave-room-btn');
                    }
                }
                deps.updateGameModeControlState();

                if (!S.networkState || !S.networkState.connected) {
                    const statusBanner = document.getElementById('network-status-banner');
                    if (statusBanner) {
                        statusBanner.classList.add('-translate-y-full');
                    }
                }

                deps.updateOpponentAvatar();
                deps.updateNetworkUiAndTelemetry();
                deps.updateResignButtonState();
            });
            ChessNetwork.on('move', move => {
                const timersToUpdate = move.timers ? { ...move.timers } : null;
                deps.executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol, true);
                if (timersToUpdate) {
                    S.whiteTimeLeft = timersToUpdate.white;
                    S.blackTimeLeft = timersToUpdate.black;
                    S.increment = timersToUpdate.inc;
                    if (!S.isTimerRunning && timersToUpdate.running) deps.startTimer();
                    deps.updateTimerDisplays();
                }
                deps.renderBoard();
            });
            ChessNetwork.on('sync', data => {
                S.isRemoteAction = true;
                if (data.timeControl && timeControlSelect) {
                    timeControlSelect.value = data.timeControl;
                    if (customTimeInputs) {
                        customTimeInputs.style.display = data.timeControl === 'custom' ? 'flex' : 'none';
                    }
                }
                if (data.boardState) {
                    ChessLogic.loadState(data.boardState);
                    const history = data.boardState.gameHistory || [];
                    S.lastMove = history.length ? deps.convertToUiMove(history[history.length - 1].move) : null;
                }
                if (data.timers) {
                    S.whiteTimeLeft = data.timers.white;
                    S.blackTimeLeft = data.timers.black;
                    S.increment = data.timers.inc;
                    deps.updateTimerDisplays();
                    if (data.timers.running && !S.isTimerRunning && !S.gameEnded) {
                        deps.startTimer();
                    } else if (!data.timers.running && S.isTimerRunning) {
                        deps.stopTimer();
                    }
                }
                if (data.boardState && data.boardState.gameHistory && data.boardState.gameHistory.length > 0) {
                    deps.renderHistoryFromMoves(data.boardState.gameHistory);
                } else if (data.history) {
                    deps.setSafeHistoryHtml(data.history);
                }
                if (data.moveCount) {
                    S.moveCount = data.moveCount;
                }
                if (data.captures) {
                    S.capturedByWhite = data.captures.white;
                    S.capturedByBlack = data.captures.black;
                    deps.updateCapturesDisplay();
                }
                deps.updateGameFormatBadge();
                S.isRemoteAction = false;
                deps.renderBoard();
            });
            ChessNetwork.on('joined', () => {
                deps.syncNetworkState();
            });
            ChessNetwork.on('colorAssigned', color => {
                if (color === 'spectator') {
                    alert('Комната полная, вы вошли как зритель!');
                    return;
                }
                S.playerColor = color;
                S.isManualFlip = false;
                deps.updatePlayerNames();
                deps.updateAvatars();
                deps.renderBoard();
            });

            ChessNetwork.on('undoRequest', (levels) => {
                if (confirm('Соперник просит отменить ход. Разрешить?')) {
                    ChessNetwork.sendUndoResponse(levels);
                    deps.performUndo(levels);
                } else {
                    ChessNetwork.sendUndoResponse(false);
                }
            });

            ChessNetwork.on('resign', () => {
                const opponentColor = S.playerColor === 'w' ? 'b' : 'w';
                deps.finishGame('resign', opponentColor);
            });

            ChessNetwork.on('reconnecting', () => {
                const statusBanner = document.getElementById('network-status-banner');
                if (statusBanner) {
                    statusBanner.classList.remove('bg-success/90', 'text-on-success', '-translate-y-full');
                    statusBanner.classList.add('bg-error/90', 'text-on-error');
                    statusBanner.innerHTML = `
                        <span class="animate-spin h-3.5 w-3.5 border-2 border-on-error border-t-transparent rounded-full"></span>
                        <span>Соединение потеряно. Попытка переподключения...</span>
                    `;
                }
            });

            ChessNetwork.on('reconnected', () => {
                const statusBanner = document.getElementById('network-status-banner');
                if (statusBanner) {
                    statusBanner.classList.remove('bg-error/90', 'text-on-error');
                    statusBanner.classList.add('bg-success/90', 'text-on-success');
                    statusBanner.innerHTML = `
                        <span class="material-symbols-outlined text-xs">check_circle</span>
                        <span>Соединение восстановлено!</span>
                    `;
                    deps.safeSetTimeout(() => {
                        if (statusBanner && statusBanner.classList.contains('bg-success/90')) {
                            statusBanner.classList.add('-translate-y-full');
                        }
                    }, 2000);
                }
            });

            ChessNetwork.on('undoResponse', accepted => {
                if (accepted !== false) {
                    deps.performUndo(accepted);
                } else {
                    alert('Соперник отказался отменить ход.');
                    deps.updateStatus();
                }
            });

            ChessNetwork.on('drawOffer', () => {
                if (confirm('Соперник предлагает ничью. Согласиться?')) {
                    ChessNetwork.sendDrawResponse(true);
                    deps.finishGame('draw');
                } else {
                    ChessNetwork.sendDrawResponse(false);
                }
            });

            ChessNetwork.on('drawResponse', accepted => {
                deps.resetDrawButton();
                if (accepted) {
                    deps.finishGame('draw');
                } else {
                    alert('Соперник отклонил ничью.');
                    deps.updateStatus();
                }
            });

            ChessNetwork.on('opponentPresence', status => {
                const topDot = document.getElementById('opponent-status-dot');
                const bottomDot = document.getElementById('player-status-dot');
                const isPlayerBottom = !S.isManualFlip;
                const dot = isPlayerBottom ? topDot : bottomDot;
                if (dot) {
                    if (status.online) {
                        dot.classList.remove('offline');
                        dot.classList.add('online');
                        dot.style.backgroundColor = '#22c55e';
                        dot.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.7)';
                        dot.title = "Оппонент в игре";
                    } else {
                        dot.classList.remove('online');
                        dot.classList.add('offline');
                        dot.style.backgroundColor = 'rgba(140, 144, 159, 0.4)';
                        dot.style.boxShadow = 'none';
                        dot.title = "Оппонент не в игре";
                    }
                }
            });

            ChessNetwork.on('pingUpdate', data => {
                const pingVal = document.getElementById('settings-ping-val');
                const latencyVal = document.getElementById('settings-latency-val');
                if (pingVal) {
                    pingVal.textContent = data.ping === 0 ? '< 1 ms' : `${data.ping} ms`;
                    if (data.ping < 100) {
                        pingVal.className = "text-xs font-mono text-green-500 font-bold";
                    } else if (data.ping < 250) {
                        pingVal.className = "text-xs font-mono text-yellow-500 font-bold";
                    } else {
                        pingVal.className = "text-xs font-mono text-error font-bold";
                    }
                }
                if (latencyVal) {
                    latencyVal.textContent = data.latency === 0 ? '< 1 ms' : `${data.latency} ms`;
                    if (data.latency < 50) {
                        latencyVal.className = "text-xs font-mono text-green-500 font-bold";
                    } else if (data.latency < 125) {
                        latencyVal.className = "text-xs font-mono text-yellow-500 font-bold";
                    } else {
                        latencyVal.className = "text-xs font-mono text-error font-bold";
                    }
                }
            });
        }

        // Event Listeners
        if (resetBtn) resetBtn.addEventListener('click', () => deps.startNewGame(false));
        if (analysisBtn) analysisBtn.addEventListener('click', deps.startAnalysis);

        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
            hintBtn.addEventListener('click', deps.getHint);
        }

        const gameOverModal = document.getElementById('game-over-modal');
        const gameOverCloseBtn = document.getElementById('game-over-close-btn');
        const gameOverResetBtn = document.getElementById('game-over-reset-btn');
        if (gameOverCloseBtn) {
            gameOverCloseBtn.addEventListener('click', () => {
                if (gameOverModal) gameOverModal.style.display = 'none';
            });
        }
        if (gameOverResetBtn) {
            gameOverResetBtn.addEventListener('click', () => {
                if (gameOverModal) gameOverModal.style.display = 'none';
                deps.startNewGame(false);
            });
        }

        const undoBtn = document.getElementById('undo-btn');
        const resignBtn = document.getElementById('resign-btn');
        const drawBtn = document.getElementById('draw-btn');

        const flipBtn = document.getElementById('flip-btn');
        if (flipBtn) {
            flipBtn.addEventListener('click', deps.flipBoard);
        }

        if (resignBtn) {
            resignBtn.addEventListener('click', () => {
                if (S.gameEnded) return;
                if (confirm('Вы уверены, что хотите сдаться?')) {
                    if (S.networkState && S.networkState.connected) {
                        ChessNetwork.sendResign();
                    }
                    deps.finishGame('resign', S.playerColor);
                }
            });
        }

        if (drawBtn) {
            drawBtn.addEventListener('click', () => {
                if (S.gameEnded) return;
                if (S.networkState && S.networkState.connected) {
                    if (confirm('Предложить ничью сопернику?')) {
                        ChessNetwork.sendDrawOffer();
                        if (statusElement) statusElement.textContent = 'Ожидание ответа...';
                        drawBtn.disabled = true;
                        drawBtn.textContent = 'Ожидание ответа...';
                        drawBtn.classList.add('animate-pulse');
                    }
                }
            });
        }

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (S.stateHistory.length === 0) return;

                if (S.networkState && S.networkState.connected) {
                    if (confirm('Запросить отмену хода у соперника?')) {
                        const levelsToUndo = ChessLogic.getTurn() !== S.playerColor ? 1 : 2;
                        ChessNetwork.sendUndoRequest(levelsToUndo);
                        if (statusElement) statusElement.textContent = 'Ожидание ответа...';
                    }
                } else if (pcToggle && pcToggle.checked) {
                    if (ChessLogic.getTurn() !== S.playerColor) {
                        deps.performUndo(1);
                    } else {
                        deps.performUndo(2);
                    }
                } else {
                    deps.performUndo(1);
                }
            });
        }

        if (pcToggle) {
            pcToggle.addEventListener('change', () => {
                deps.updateGameModeControlState();
                deps.startNewGame(true);
            });
        }

        if (difficultySelect) {
            difficultySelect.addEventListener('change', () => {
                if (pcToggle && pcToggle.checked && !S.gameEnded) {
                    deps.updatePlayerNames();
                }
                deps.updateAvatars();
            });
        }

        if (sideSelect) {
            sideSelect.addEventListener('change', () => {
                deps.startNewGame(true);
            });
        }

        if (timeControlSelect) {
            timeControlSelect.addEventListener('change', () => {
                if (customTimeInputs) {
                    customTimeInputs.style.display = timeControlSelect.value === 'custom' ? 'flex' : 'none';
                }
                deps.startNewGame(true);
            });
        }

        if (customMinsInput) {
            customMinsInput.addEventListener('input', deps.updateGameFormatBadge);
        }
        if (customIncInput) {
            customIncInput.addEventListener('input', deps.updateGameFormatBadge);
        }

        if (themeSelect) {
            themeSelect.addEventListener('change', deps.updateTheme);
            const savedBoardTheme = typeof ChessStorage !== 'undefined' ? ChessStorage.getBoardTheme() : 'classic';
            themeSelect.value = savedBoardTheme;
        }

        // UI Theme Selector (System / Dark / Light Theme)
        const uiThemeSelect = document.getElementById('ui-theme-select');
        const applyUITheme = (themeChoice) => {
            if (typeof deps.applyUITheme === 'function') {
                deps.applyUITheme(themeChoice);
            }
        };

        if (uiThemeSelect) {
            uiThemeSelect.addEventListener('change', () => {
                const chosenTheme = uiThemeSelect.value;
                if (typeof ChessStorage !== 'undefined') ChessStorage.setUITheme(chosenTheme);
                applyUITheme(chosenTheme);
            });

            if (typeof window !== 'undefined' && window.matchMedia) {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                const handleSystemChange = () => {
                    const currentSavedTheme = typeof ChessStorage !== 'undefined' ? ChessStorage.getUITheme('system') : 'system';
                    if (currentSavedTheme === 'system') {
                        applyUITheme('system');
                    }
                };
                if (mediaQuery.addEventListener) {
                    mediaQuery.addEventListener('change', handleSystemChange);
                } else if (mediaQuery.addListener) {
                    mediaQuery.addListener(handleSystemChange);
                }
            }

            const savedTheme = typeof ChessStorage !== 'undefined' ? ChessStorage.getUITheme('system') : 'system';
            uiThemeSelect.value = savedTheme;
            applyUITheme(savedTheme);
        }

        // Mobile Settings Drawer Toggle Event Listeners
        const sidebarDrawer = document.getElementById('sidebar-drawer');
        const sidebarBackdrop = document.getElementById('sidebar-backdrop');
        const menuBtn = document.getElementById('menu-btn');
        const floatingMenuBtn = document.getElementById('floating-menu-btn');
        const closeSidebarBtn = document.getElementById('close-sidebar-btn');

        if (sidebarDrawer && sidebarBackdrop) {
            const openDrawer = () => {
                sidebarDrawer.classList.remove('-translate-x-full');
                sidebarBackdrop.classList.remove('hidden');
                sidebarBackdrop.offsetHeight;
                sidebarBackdrop.classList.add('active');
            };

            const closeDrawer = () => {
                sidebarDrawer.classList.add('-translate-x-full');
                sidebarBackdrop.classList.remove('active');
                deps.safeSetTimeout(() => {
                    if (!sidebarBackdrop.classList.contains('active')) {
                        sidebarBackdrop.classList.add('hidden');
                    }
                }, 300);
            };

            if (menuBtn) menuBtn.addEventListener('click', openDrawer);
            if (floatingMenuBtn) floatingMenuBtn.addEventListener('click', openDrawer);
            if (closeSidebarBtn) {
                closeSidebarBtn.addEventListener('click', closeDrawer);
            }
            sidebarBackdrop.addEventListener('click', closeDrawer);
        }

        // Sound Settings
        const soundToggle = document.getElementById('sound-toggle');
        const soundVolumeSlider = document.getElementById('sound-volume');
        const volumeValDisplay = document.getElementById('volume-val-display');

        const savedSoundMuted = typeof ChessStorage !== 'undefined' ? ChessStorage.getSoundMuted() : false;
        const savedSoundVolume = typeof ChessStorage !== 'undefined' ? ChessStorage.getSoundVolume(null) : null;

        S.isSoundMuted = savedSoundMuted;
        if (savedSoundVolume !== null) {
            S.soundVolume = parseFloat(savedSoundVolume);
        } else {
            S.soundVolume = 1.0;
        }
        if (typeof ChessAudio !== 'undefined') {
            ChessAudio.setMuted(S.isSoundMuted);
            ChessAudio.setVolume(S.soundVolume);
        }

        if (soundToggle) {
            soundToggle.checked = !S.isSoundMuted;
            soundToggle.addEventListener('change', () => {
                S.isSoundMuted = !soundToggle.checked;
                if (typeof ChessStorage !== 'undefined') ChessStorage.setSoundMuted(S.isSoundMuted);
                if (typeof ChessAudio !== 'undefined') ChessAudio.setMuted(S.isSoundMuted);
            });
        }
        if (soundVolumeSlider && volumeValDisplay) {
            soundVolumeSlider.value = Math.round(S.soundVolume * 100);
            volumeValDisplay.textContent = `${soundVolumeSlider.value}%`;
            soundVolumeSlider.addEventListener('input', () => {
                S.soundVolume = parseInt(soundVolumeSlider.value) / 100;
                volumeValDisplay.textContent = `${soundVolumeSlider.value}%`;
                if (typeof ChessStorage !== 'undefined') ChessStorage.setSoundVolume(S.soundVolume);
                if (typeof ChessAudio !== 'undefined') ChessAudio.setVolume(S.soundVolume);
            });
        }

        // Chat messaging logic
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const chatMessages = document.getElementById('chat-messages');

        const appendChatMessage = (sender, text) => {
            deps.appendChatMessage(chatMessages, sender, text);
        };

        const sendChat = () => {
            if (!chatInput) return;
            const text = chatInput.value.trim();
            if (!text) return;
            chatInput.value = '';

            appendChatMessage('Вы', text);

            if (S.networkState && S.networkState.connected && typeof ChessNetwork !== 'undefined') {
                ChessNetwork.sendChatMessage(text);
            }
        };

        if (chatSendBtn) {
            chatSendBtn.addEventListener('click', sendChat);
        }
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    sendChat();
                }
            });
        }

        if (typeof document.querySelectorAll === 'function') {
            const emojiBtns = document.querySelectorAll('.emoji-btn');
            if (emojiBtns) {
                emojiBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const text = btn.textContent;
                        appendChatMessage('Вы', text);
                        if (S.networkState && S.networkState.connected && typeof ChessNetwork !== 'undefined') {
                            ChessNetwork.sendChatMessage(text);
                        }
                    });
                });
            }
        }

        if (typeof document.querySelectorAll === 'function') {
            const phraseBtns = document.querySelectorAll('.quick-phrase-btn');
            if (phraseBtns) {
                phraseBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const text = btn.textContent;
                        appendChatMessage('Вы', text);
                        if (S.networkState && S.networkState.connected && typeof ChessNetwork !== 'undefined') {
                            ChessNetwork.sendChatMessage(text);
                        }
                    });
                });
            }
        }

        // Tab switching logic for Right Panel
        const tabBtnNotation = document.getElementById('tab-btn-notation');
        const tabBtnAnalysis = document.getElementById('tab-btn-analysis');
        const tabBtnChat = document.getElementById('tab-btn-chat');

        const tabContentNotation = document.getElementById('tab-content-notation');
        const tabContentAnalysis = document.getElementById('tab-content-analysis');
        const tabContentChat = document.getElementById('tab-content-chat');

        S.switchTab = function (activeTab) {
            const btns = [tabBtnNotation, tabBtnAnalysis, tabBtnChat];
            const contents = [tabContentNotation, tabContentAnalysis, tabContentChat];

            btns.forEach(btn => {
                if (btn) {
                    btn.classList.remove('border-primary', 'text-primary', 'font-bold');
                    btn.classList.add('border-transparent', 'text-on-surface-variant', 'font-semibold');
                }
            });
            contents.forEach(content => {
                if (content) content.classList.add('hidden');
            });

            if (activeTab === 'notation') {
                if (tabBtnNotation) {
                    tabBtnNotation.classList.add('border-primary', 'text-primary', 'font-bold');
                    tabBtnNotation.classList.remove('border-transparent', 'text-on-surface-variant', 'font-semibold');
                }
                if (tabContentNotation) tabContentNotation.classList.remove('hidden');
            } else if (activeTab === 'analysis') {
                if (tabBtnAnalysis) {
                    tabBtnAnalysis.classList.add('border-primary', 'text-primary', 'font-bold');
                    tabBtnAnalysis.classList.remove('border-transparent', 'text-on-surface-variant', 'font-semibold');
                }
                if (tabContentAnalysis) tabContentAnalysis.classList.remove('hidden');
            } else if (activeTab === 'chat') {
                if (tabBtnChat) {
                    tabBtnChat.classList.add('border-primary', 'text-primary', 'font-bold');
                    tabBtnChat.classList.remove('border-transparent', 'text-on-surface-variant', 'font-semibold');
                }
                if (tabContentChat) tabContentChat.classList.remove('hidden');
            }
        };

        if (typeof ChessNetwork !== 'undefined') {
            ChessNetwork.receiveChatMessage = (text) => {
                appendChatMessage('Соперник', text);
                S.switchTab('chat');
            };
        }

        if (tabBtnNotation) tabBtnNotation.addEventListener('click', () => S.switchTab('notation'));
        if (tabBtnAnalysis) tabBtnAnalysis.addEventListener('click', () => S.switchTab('analysis'));
        if (tabBtnChat) tabBtnChat.addEventListener('click', () => S.switchTab('chat'));

        // Subscribe to logic changes
        if (S.logicUnsubscribe) {
            S.logicUnsubscribe();
            S.logicUnsubscribe = null;
        }
        S.logicUnsubscribe = ChessLogic.subscribe(state => {
            deps.scheduleRender();
            deps.updateStatus(state.status);

            if (pcToggle && pcToggle.checked && state.turn !== S.playerColor && !S.gameEnded && !S.isWaitingForPC && !S.isWaitingForStart) {
                if (S.pcMoveTimeoutId) deps.cancelPendingMove();
                S.pcMoveTimeoutId = deps.safeSetTimeout(deps.makePCMove, 500);
            }
        });

        // Save/Load feature event listeners
        const saveGameBtn = document.getElementById('save-game-btn');
        const saveLoadCloseBtn = document.getElementById('save-load-close-btn');
        const saveLoadModal = document.getElementById('save-load-modal');
        const exportJsonBtn = document.getElementById('export-json-btn');
        const importJsonBtn = document.getElementById('import-json-btn');
        const importFileInput = document.getElementById('import-file-input');

        const saveMenuToggleBtn = document.getElementById('save-menu-toggle-btn');
        const saveMenuDropdown = document.getElementById('save-menu-dropdown');
        const saveMenuArrow = document.getElementById('save-menu-arrow');

        if (saveMenuToggleBtn && saveMenuDropdown) {
            saveMenuToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = saveMenuDropdown.classList.contains('hidden');
                if (isHidden) {
                    saveMenuDropdown.classList.remove('hidden');
                    if (saveMenuArrow) saveMenuArrow.style.transform = 'rotate(180deg)';
                } else {
                    saveMenuDropdown.classList.add('hidden');
                    if (saveMenuArrow) saveMenuArrow.style.transform = 'rotate(0deg)';
                }
            });

            saveMenuDropdown.addEventListener('click', () => {
                saveMenuDropdown.classList.add('hidden');
                if (saveMenuArrow) saveMenuArrow.style.transform = 'rotate(0deg)';
            });

            document.addEventListener('click', (e) => {
                if (!saveMenuDropdown.contains(e.target) && e.target !== saveMenuToggleBtn) {
                    saveMenuDropdown.classList.add('hidden');
                    if (saveMenuArrow) saveMenuArrow.style.transform = 'rotate(0deg)';
                }
            });
        }

        if (saveGameBtn) saveGameBtn.addEventListener('click', deps.openSaveLoadModal);
        if (saveLoadCloseBtn) saveLoadCloseBtn.addEventListener('click', deps.closeSaveLoadModal);
        if (saveLoadModal) {
            saveLoadModal.addEventListener('click', (e) => {
                if (e.target === saveLoadModal) deps.closeSaveLoadModal();
            });
        }
        if (exportJsonBtn) exportJsonBtn.addEventListener('click', deps.exportToJSON);
        if (importJsonBtn && importFileInput) {
            importJsonBtn.addEventListener('click', () => importFileInput.click());
        }
        if (importFileInput) {
            importFileInput.addEventListener('change', deps.importFromJSON);
        }

        // Save/Load Slot listeners
        for (let i = 1; i <= 3; i++) {
            const slotEl = document.getElementById(`slot-${i}`);
            if (slotEl) {
                const saveBtn = slotEl.querySelector('.slot-save-btn');
                const loadBtn = slotEl.querySelector('.slot-load-btn');
                const deleteBtn = slotEl.querySelector('.slot-delete-btn');

                if (saveBtn) saveBtn.addEventListener('click', () => deps.saveToSlot(i));
                if (loadBtn) loadBtn.addEventListener('click', () => deps.loadFromSlot(i));
                if (deleteBtn) deleteBtn.addEventListener('click', () => deps.deleteSlot(i));
            }
        }

        deps.initDraggableSwitches();
        deps.updateTheme();
        deps.updateGameModeControlState();
        deps.startNewGame();
    }

    return {
        initDomAndEvents
    };
});
