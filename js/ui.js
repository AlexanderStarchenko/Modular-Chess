/**
 * Chess UI Module
 * Handles rendering, user interaction, AI opponent, timers, and settings.
 */

const ChessUI = (() => {
    let boardElement, boardContainer, animationLayer, statusElement, gameInfoElement, historyListElement, resetBtn, pcToggle, difficultySelect, sideSelect;
    let timeControlSelect, customTimeInputs, customMinsInput, customIncInput, themeSelect;
    let topPlayerName, bottomPlayerName, topTimerDisplay, bottomTimerDisplay, topTimerContainer, bottomTimerContainer;
    let analysisBtn, analysisPanel, analysisList, analysisProgress, stockfishTip;
    let gameConditionBadge;
    let accuracyBarContainer, accuracyWhiteBar, accuracyBlackBar;
    let initialTime = 600;
    let initialInc = 0;
    let networkState = (typeof ChessNetwork !== 'undefined') ? ChessNetwork.getState() : { connected: false };
    let switchTab;
    let canvas = null, ctx = null, hoverSquare = null;
    
    const isElectron = navigator.userAgent.toLowerCase().includes(' electron/');
    const isFileProtocol = window.location.protocol === 'file:' && !isElectron;
    
    let selectedSquare = null;
    let lastMove = null;
    let moveCount = 1;
    let isWaitingForPC = false;
    let pcMoveTimeoutId = null; // To cancel PC move
    let pendingTimeouts = new Set();
    let logicUnsubscribe = null;

    function safeSetTimeout(fn, delay) {
        const id = setTimeout(() => {
            pendingTimeouts.delete(id);
            fn();
        }, delay);
        pendingTimeouts.add(id);
        return id;
    }

    function safeClearTimeout(id) {
        if (id) {
            clearTimeout(id);
            pendingTimeouts.delete(id);
        }
    }

    function cancelPendingMove() {
        if (pcMoveTimeoutId) {
            safeClearTimeout(pcMoveTimeoutId);
            pcMoveTimeoutId = null;
        }
        isWaitingForPC = false;
    }

    function clearPendingTimers() {
        cancelPendingMove();
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        for (const id of pendingTimeouts) {
            clearTimeout(id);
        }
        pendingTimeouts.clear();
    }
    let playerColor = 'w'; 
    let pcColor = 'b';     
    let stateHistory = [];     
    let isSoundMuted = false;
    let soundVolume = 1.0;

    let isDragging = false;
    let dragStartSquare = null;
    let draggedPiece = null;
    let dragCurrentX = 0;
    let dragCurrentY = 0;
    let lastMousedownSquare = null;
    let draggedOccurred = false;
    let isWaitingForStart = false;

    function isFlipped() {
        return playerColor === 'b';
    }
    let analysisResults = [];
    let selectedAnalysisIndex = null;
    let suggestedMove = null;
    let analysisSnapshot = null;
    let isCalculatingHint = false;

    // Timer variables
    let timerInterval = null;
    let whiteTimeLeft = 600;
    let blackTimeLeft = 600;
    let increment = 0;
    let isTimerRunning = false;
    let gameEnded = false;
    let lastTickTime = null;
    let hasPlayedLowTimeWarning = false;
    let currentAnalysisSessionId = 0;

    // Capture tracking
    let capturedByWhite = []; // pieces white captured (black pieces)
    let capturedByBlack = []; // pieces black captured (white pieces)
    let topCapturedEl, bottomCapturedEl, topAdvantageEl, bottomAdvantageEl;

    const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

    const PIECE_UNICODE = {
        'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
        'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
    };

    const pieceImages = {};
    const PIECE_CODES = {
        'P': 'wP', 'R': 'wR', 'N': 'wN', 'B': 'wB', 'Q': 'wQ', 'K': 'wK',
        'p': 'bP', 'r': 'bR', 'n': 'bN', 'b': 'bB', 'q': 'bQ', 'k': 'bK'
    };

    function initPieceImages() {
        if (typeof Image === 'undefined') return;
        if (Object.keys(pieceImages).length > 0) return;
        let loadedCount = 0;
        const totalPieces = Object.keys(PIECE_CODES).length;
        for (const [code, file] of Object.entries(PIECE_CODES)) {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === totalPieces) {
                    renderBoard();
                }
            };
            img.onerror = () => {
                console.warn(`[UI] Piece image failed to load: pieces/${file}.svg`);
            };
            img.src = `pieces/${file}.svg`;
            pieceImages[code] = img;
        }
    }

    function convertToUiMove(move) {
        if (!move) return null;
        return {
            fromRow: move.fromRow !== undefined ? move.fromRow : move.fR,
            fromCol: move.fromCol !== undefined ? move.fromCol : move.fC,
            toRow: move.toRow !== undefined ? move.toRow : move.tR,
            toCol: move.toCol !== undefined ? move.toCol : move.tC
        };
    }

    let isRemoteAction = false;

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

    function getStockfishName() {
        if (!difficultySelect) return 'Stockfish 19';
        const val = difficultySelect.value || '2';
        if (val === 'neural-v1-7-alphabeta' || val === 'neural-v1-7') return '🌟 Нейросеть V1.7 (Alpha-Beta 12-SE)';
        if (val === 'neural-v1-6-alphabeta') return '👑 Нейросеть V1.6 (Alpha-Beta)';
        if (val === 'neural-v1-6-mcts') return '⚡ Нейросеть V1.6 (MCTS 4672)';
        if (val === 'neural-v1-6') return '🚀 Нейросеть V1.6 (5-Ply Minimax)';
        if (val === 'neural-v1-5-mcts') return '🏆 Нейросеть V1.5 (MCTS)';
        if (val === 'neural-v1-5') return '✨ Нейросеть V1.5 (5-Ply Minimax)';
        if (val === 'neural') return '🧠 Нейросеть V1 (ModularNet)';
        const labels = {
            '1': 'Легкий',
            '2': 'Средний',
            '3': 'Сложный',
            '4': 'Экстра-сложный',
            '5': 'Нереальный'
        };
        const levelName = labels[val] || (difficultySelect.options && difficultySelect.selectedIndex >= 0 ? difficultySelect.options[difficultySelect.selectedIndex].text : '');
        return levelName ? `Stockfish 19 (${levelName})` : 'Stockfish 19';
    }

    function updateGameModeControlState() {
        const gameModeContainer = document.getElementById('game-mode-container');
        const diffContainer = document.getElementById('difficulty-container');
        const sideContainer = document.getElementById('side-container');
        const isNetwork = networkState && networkState.connected;
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
            // PC / Desktop: Player vs Player on same machine disabled. Only Stockfish or Network play allowed.
            if (pcToggle) pcToggle.checked = true;
            if (gameModeContainer) gameModeContainer.style.display = 'none';
            if (diffContainer) diffContainer.style.display = '';
            if (topPlayerName && !gameEnded) topPlayerName.textContent = getStockfishName();
        } else {
            // Mobile device: Player vs Player switch available.
            if (gameModeContainer) gameModeContainer.style.display = '';
            if (diffContainer) diffContainer.style.display = (pcToggle && pcToggle.checked) ? '' : 'none';
            if (topPlayerName && !gameEnded) {
                topPlayerName.textContent = (pcToggle && pcToggle.checked) ? getStockfishName() : 'Игрок 2';
            }
        }
    }

    function syncNetworkState() {
        if (typeof ChessNetwork !== 'undefined' && networkState && networkState.connected && !isRemoteAction) {
            ChessNetwork.sendState({
                boardState: ChessLogic.getState(),
                timers: {
                    white: whiteTimeLeft,
                    black: blackTimeLeft,
                    inc: increment,
                    running: isTimerRunning
                },
                history: historyListElement.innerHTML,
                moveCount: moveCount,
                captures: {
                    white: [...capturedByWhite],
                    black: [...capturedByBlack]
                },
                timeControl: timeControlSelect.value
            });
        }
    }

    function updateLastMove(move) {
        lastMove = move ? { ...move } : null;
    }

    function getBoardOverlay() {
        if (!boardContainer) return null;
        if (!animationLayer) {
            animationLayer = document.createElement('div');
            animationLayer.className = 'move-animation-layer';
            boardContainer.appendChild(animationLayer);
        }
        return animationLayer;
    }

    function animateMove(fromRow, fromCol, toRow, toCol, piece) {
        if (!boardElement || !boardContainer || !piece) return;

        const size = boardElement.clientWidth;
        if (size <= 0) return;
        const squareSize = size / 8;
        const flipped = isFlipped();
        
        const fR = flipped ? 7 - fromRow : fromRow;
        const fC = flipped ? 7 - fromCol : fromCol;
        const tR = flipped ? 7 - toRow : toRow;
        const tC = flipped ? 7 - toCol : toCol;

        const layer = getBoardOverlay();
        if (!layer) return;

        const flyPiece = document.createElement('img');
        flyPiece.className = 'piece-fly';
        flyPiece.src = `pieces/${PIECE_CODES[piece]}.svg`;
        flyPiece.style.width = `${squareSize * 0.92}px`;
        flyPiece.style.height = `${squareSize * 0.92}px`;
        const offset = (squareSize * 0.08) / 2;
        flyPiece.style.left = `${fC * squareSize + offset}px`;
        flyPiece.style.top = `${fR * squareSize + offset}px`;
        flyPiece.style.transform = 'translate3d(0, 0, 0)';
        flyPiece.style.opacity = '1';
        
        layer.appendChild(flyPiece);

        requestAnimationFrame(() => {
            const dx = (tC - fC) * squareSize;
            const dy = (tR - fR) * squareSize;
            flyPiece.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;
        });

        flyPiece.addEventListener('transitionend', () => {
            flyPiece.remove();
        }, { once: true });

        safeSetTimeout(() => {
            if (flyPiece.isConnected) flyPiece.remove();
        }, 320);
    }

    function init() {
        console.log("Chess UI Initializing... [Version v40]");
        clearPendingTimers();
        initPieceImages();
        
        if (typeof ChessWASM !== 'undefined') {
            ChessWASM.init().then(success => {
                console.log('[UI] ChessWASM initialized successfully:', success);
            }).catch(err => {
                console.warn('[UI] ChessWASM failed to initialize:', err);
            });
        }
        
        boardContainer = document.getElementById('board-container');
        boardElement = document.getElementById('chessboard');
        accuracyBarContainer = document.getElementById('accuracy-bar-container');
        accuracyWhiteBar = document.getElementById('accuracy-white-bar');
        accuracyBlackBar = document.getElementById('accuracy-black-bar');
        
        // Initialize Canvas
        if (boardElement) {
            canvas = document.getElementById('chess-canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'chess-canvas';
                boardElement.appendChild(canvas);
            }
            ctx = canvas.getContext('2d');
            
            // Bind Canvas Events
            canvas.addEventListener('click', (event) => {
                if (draggedOccurred) {
                    draggedOccurred = false;
                    return;
                }
                if (isWaitingForPC || isWaitingForStart || gameEnded || analysisSnapshot) return;
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                
                const squareSize = rect.width / 8;
                const col = Math.floor(x / squareSize);
                const row = Math.floor(y / squareSize);
                
                const flipped = isFlipped();
                const r = flipped ? 7 - row : row;
                const c = flipped ? 7 - col : col;
                
                if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                    handleSquareClick(r, c);
                }
            });
            
            canvas.addEventListener('mousedown', (event) => {
                handleMousedown(event.clientX, event.clientY);
            });
            
            canvas.addEventListener('mousemove', (event) => {
                handleMousemove(event.clientX, event.clientY);
            });
            
            canvas.addEventListener('mouseup', (event) => {
                handleMouseup(event.clientX, event.clientY);
            });
            
            canvas.addEventListener('mouseleave', (event) => {
                if (isDragging) {
                    handleMouseup(event.clientX, event.clientY);
                } else if (hoverSquare) {
                    hoverSquare = null;
                    renderBoard();
                }
            });

            canvas.addEventListener('touchstart', (event) => {
                if (event.touches.length > 0) {
                    if (isDraggingPiece(event.touches[0].clientX, event.touches[0].clientY)) {
                        event.preventDefault();
                    }
                    handleMousedown(event.touches[0].clientX, event.touches[0].clientY);
                }
            }, { passive: false });

            canvas.addEventListener('touchmove', (event) => {
                if (event.touches.length > 0) {
                    if (isDragging) {
                        event.preventDefault();
                    }
                    handleMousemove(event.touches[0].clientX, event.touches[0].clientY);
                }
            }, { passive: false });

            canvas.addEventListener('touchend', (event) => {
                if (event.changedTouches.length > 0) {
                    handleMouseup(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
                }
            });

            window.addEventListener('resize', () => {
                renderBoard();
            });
        }

        statusElement = document.getElementById('status');
        gameInfoElement = document.getElementById('game-info');
        historyListElement = document.getElementById('history-list');
        resetBtn = document.getElementById('reset-btn');
        pcToggle = document.getElementById('pc-toggle');
        difficultySelect = document.getElementById('difficulty-select');
        sideSelect = document.getElementById('side-select');
        
        timeControlSelect = document.getElementById('time-control');
        customTimeInputs = document.getElementById('custom-time-inputs');
        customMinsInput = document.getElementById('custom-mins');
        customIncInput = document.getElementById('custom-inc');
        themeSelect = document.getElementById('theme-select');
        const networkBtn = document.getElementById('network-btn');
        analysisBtn = document.getElementById('analyze-btn');
        analysisPanel = document.getElementById('analysis-panel');
        analysisList = document.getElementById('analysis-list');
        analysisProgress = document.getElementById('analysis-progress');
        stockfishTip = document.getElementById('analysis-advice');
        gameConditionBadge = document.getElementById('game-condition-badge');
        
        // Аудио-фикс: активируем звук при первом клике пользователя
        const resumeAudio = () => {
            const ctx = (typeof ChessAudio !== 'undefined' && ChessAudio.getContext) ? ChessAudio.getContext() : null;
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().then(() => {
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
            const isMobileApp = typeof window !== 'undefined' && (
                !!window.Capacitor || 
                (window.location && window.location.protocol === 'capacitor:') ||
                (window.location && window.location.origin && window.location.origin.startsWith('capacitor://')) ||
                (window.location && window.location.hostname === 'localhost' && /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent))
            );

            if (isMobileApp) {
                console.log('[UI] Mobile environment detected. Hiding network play button.');
                networkBtn.style.display = 'none';
            }

            console.log('[UI] Network button found, setting up listeners...');
            
            function connectToRoom(roomId, serverUrl = null) {
                try {
                    pcToggle.checked = false;
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
                    startNewGame(); 
                    
                    SocketTransport.init(roomId, serverUrl, preferredSide);
                } catch (e) {
                    console.error('Network Error:', e);
                }
            }

            // Настройка красивого HTML модального окна для комнаты
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

            // Настройка красивого HTML модального окна для настроек
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
                        // Clear hash
                        if (window.location.hash) {
                            history.replaceState(null, null, ' ');
                        }
                        
                        if (typeof SocketTransport !== 'undefined') {
                            SocketTransport.disconnect();
                        } else if (typeof ChessNetwork !== 'undefined') {
                            ChessNetwork.disconnect();
                        }
                        startNewGame();
                    }
                } else {
                    // Extract room ID from URL hash or show custom HTML modal
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

            // Automatically connect on page load if hash is present in URL
            const initialHash = window.location.hash.replace('#', '').trim();
            if (initialHash) {
                console.log('[UI] Auto-connecting to room from URL hash:', initialHash);
                // Delay slightly to ensure full initialization of other systems
                safeSetTimeout(() => {
                    connectToRoom(initialHash);
                }, 100);
            }
        } else {
            console.error('[UI] network-btn element not found in DOM!');
        }

        topPlayerName = document.getElementById('top-player-name');
        bottomPlayerName = document.getElementById('bottom-player-name');
        topTimerDisplay = document.getElementById('top-timer');
        bottomTimerDisplay = document.getElementById('bottom-timer');
        topTimerContainer = document.getElementById('top-timer-container');
        bottomTimerContainer = document.getElementById('bottom-timer-container');
        topCapturedEl = document.getElementById('top-captured');
        bottomCapturedEl = document.getElementById('bottom-captured');
        topAdvantageEl = document.getElementById('top-advantage');
        bottomAdvantageEl = document.getElementById('bottom-advantage');

        if (typeof ChessNetwork !== 'undefined') {
            ChessNetwork.on('status', state => {
                networkState = state;
                const drawBtn = document.getElementById('draw-btn');
                if (drawBtn) {
                    drawBtn.style.display = (networkState && networkState.connected && !gameEnded) ? 'block' : 'none';
                }
                
                // Update network button and PC mode accessibility based on network state
                const networkBtn = document.getElementById('network-btn');
                const gameModeContainer = document.getElementById('game-mode-container');
                const diffContainer = document.getElementById('difficulty-container');

                if (networkState && networkState.connected) {
                    if (networkBtn) {
                        networkBtn.textContent = `Покинуть комнату${networkState.roomId ? ' (' + networkState.roomId + ')' : ''}`;
                        networkBtn.classList.add('leave-room-btn');
                    }
                } else {
                    if (networkBtn) {
                        networkBtn.textContent = 'Играть по сети';
                        networkBtn.classList.remove('leave-room-btn');
                    }
                }
                updateGameModeControlState();

                if (!networkState || !networkState.connected) {
                    const statusBanner = document.getElementById('network-status-banner');
                    if (statusBanner) {
                        statusBanner.classList.add('-translate-y-full');
                    }
                }
                
                updateOpponentAvatar();
                updateNetworkUiAndTelemetry();
                updateResignButtonState();
            });
            ChessNetwork.on('move', move => {
                const timersToUpdate = move.timers ? { ...move.timers } : null;
                executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol, true);
                if (timersToUpdate) {
                    whiteTimeLeft = timersToUpdate.white;
                    blackTimeLeft = timersToUpdate.black;
                    increment = timersToUpdate.inc;
                    if (!isTimerRunning && timersToUpdate.running) startTimer();
                    updateTimerDisplays();
                }
                renderBoard();
            });
            ChessNetwork.on('sync', data => {
                isRemoteAction = true;
                if (data.timeControl) {
                    timeControlSelect.value = data.timeControl;
                    if (data.timeControl === 'custom') {
                        customTimeInputs.style.display = 'flex';
                    } else {
                        customTimeInputs.style.display = 'none';
                    }
                }
                if (data.boardState) {
                    ChessLogic.loadState(data.boardState);
                    const history = data.boardState.gameHistory || [];
                    lastMove = history.length ? convertToUiMove(history[history.length - 1].move) : null;
                }
                if (data.timers) {
                    whiteTimeLeft = data.timers.white;
                    blackTimeLeft = data.timers.black;
                    increment = data.timers.inc;
                    updateTimerDisplays();
                    if (data.timers.running && !isTimerRunning && !gameEnded) {
                        startTimer();
                    } else if (!data.timers.running && isTimerRunning) {
                        stopTimer();
                    }
                }
                if (data.history) {
                    historyListElement.innerHTML = data.history;
                    moveCount = data.moveCount;
                }
                if (data.captures) {
                    capturedByWhite = data.captures.white;
                    capturedByBlack = data.captures.black;
                    updateCapturesDisplay();
                }
                updateGameFormatBadge();
                isRemoteAction = false;
                renderBoard();
            });
            ChessNetwork.on('joined', () => {
                syncNetworkState();
            });
            ChessNetwork.on('colorAssigned', color => {
                if (color === 'spectator') {
                    alert('Комната полная, вы вошли как зритель!');
                    return;
                }
                playerColor = color;
                bottomPlayerName.textContent = 'Вы';
                topPlayerName.textContent = 'Соперник';
                renderBoard();
            });

            ChessNetwork.on('undoRequest', (levels) => {
                if (confirm('Соперник просит отменить ход. Разрешить?')) {
                    ChessNetwork.sendUndoResponse(levels);
                    performUndo(levels);
                } else {
                    ChessNetwork.sendUndoResponse(false);
                }
            });
            
            ChessNetwork.on('resign', () => {
                const opponentColor = playerColor === 'w' ? 'b' : 'w';
                finishGame('resign', opponentColor);
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
                    safeSetTimeout(() => {
                        if (statusBanner && statusBanner.classList.contains('bg-success/90')) {
                            statusBanner.classList.add('-translate-y-full');
                        }
                    }, 2000);
                }
            });

            ChessNetwork.on('undoResponse', accepted => {
                if (accepted !== false) {
                    performUndo(accepted);
                } else {
                    alert('Соперник отказался отменить ход.');
                    updateStatus();
                }
            });

            ChessNetwork.on('drawOffer', () => {
                if (confirm('Соперник предлагает ничью. Согласиться?')) {
                    ChessNetwork.sendDrawResponse(true);
                    finishGame('draw');
                } else {
                    ChessNetwork.sendDrawResponse(false);
                }
            });

            ChessNetwork.on('drawResponse', accepted => {
                resetDrawButton();
                if (accepted) {
                    finishGame('draw');
                } else {
                    alert('Соперник отклонил ничью.');
                    updateStatus();
                }
            });

            ChessNetwork.on('opponentPresence', status => {
                const dot = document.getElementById('opponent-status-dot');
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
        resetBtn.addEventListener('click', () => startNewGame(false));
        if (analysisBtn) analysisBtn.addEventListener('click', startAnalysis);
        
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
            hintBtn.addEventListener('click', getHint);
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
                startNewGame(false);
            });
        }
        
        const undoBtn = document.getElementById('undo-btn');
        const resignBtn = document.getElementById('resign-btn');
        const drawBtn = document.getElementById('draw-btn');

        if (resignBtn) {
            resignBtn.addEventListener('click', () => {
                if (gameEnded) return;
                if (confirm('Вы уверены, что хотите сдаться?')) {
                    if (networkState && networkState.connected) {
                        ChessNetwork.sendResign();
                    }
                    finishGame('resign', playerColor);
                }
            });
        }

        if (drawBtn) {
            drawBtn.addEventListener('click', () => {
                if (gameEnded) return;
                if (networkState && networkState.connected) {
                    if (confirm('Предложить ничью сопернику?')) {
                        ChessNetwork.sendDrawOffer();
                        statusElement.textContent = 'Ожидание ответа...';
                        drawBtn.disabled = true;
                        drawBtn.textContent = 'Ожидание ответа...';
                        drawBtn.classList.add('animate-pulse');
                    }
                }
            });
        }

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (stateHistory.length === 0) return;

                if (networkState && networkState.connected) {
                    if (confirm('Запросить отмену хода у соперника?')) {
                        const levelsToUndo = ChessLogic.getTurn() !== playerColor ? 1 : 2;
                        ChessNetwork.sendUndoRequest(levelsToUndo);
                        statusElement.textContent = 'Ожидание ответа...';
                    }
                } else if (pcToggle.checked) {
                    if (ChessLogic.getTurn() !== playerColor) {
                        performUndo(1); // PC's turn, so PC hasn't finished thinking. Undo our move.
                    } else {
                        performUndo(2); // Undo PC move and our move
                    }
                } else {
                    performUndo(1);
                }
            });
        }
        
        pcToggle.addEventListener('change', () => {
            updateGameModeControlState();
            startNewGame(true);
        });

        if (difficultySelect) {
            difficultySelect.addEventListener('change', () => {
                if (pcToggle && pcToggle.checked && topPlayerName && !gameEnded) {
                    topPlayerName.textContent = getStockfishName();
                }
            });
        }

        if (sideSelect) {
            sideSelect.addEventListener('change', () => {
                startNewGame(true);
            });
        }

        timeControlSelect.addEventListener('change', () => {
            if (timeControlSelect.value === 'custom') {
                customTimeInputs.style.display = 'flex';
            } else {
                customTimeInputs.style.display = 'none';
            }
            startNewGame(true);
        });

        if (customMinsInput) {
            customMinsInput.addEventListener('input', updateGameFormatBadge);
        }
        if (customIncInput) {
            customIncInput.addEventListener('input', updateGameFormatBadge);
        }

        if (themeSelect) {
            themeSelect.addEventListener('change', updateTheme);
            const savedBoardTheme = typeof ChessStorage !== 'undefined' ? ChessStorage.getBoardTheme() : 'classic';
            themeSelect.value = savedBoardTheme;
        }

        // UI Theme Selector (System / Dark / Light Theme)
        const uiThemeSelect = document.getElementById('ui-theme-select');

        function applyUITheme(themeChoice) {
            let effectiveTheme = themeChoice;
            if (themeChoice === 'system') {
                const isSystemDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                effectiveTheme = isSystemDark ? 'dark' : 'light';
            }

            if (effectiveTheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }

        if (uiThemeSelect) {
            uiThemeSelect.addEventListener('change', () => {
                const chosenTheme = uiThemeSelect.value;
                if (typeof ChessStorage !== 'undefined') ChessStorage.setUITheme(chosenTheme);
                applyUITheme(chosenTheme);
            });

            // Listen for OS system theme changes
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

            // Restore from localStorage or default to system
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
                // Force reflow
                sidebarBackdrop.offsetHeight;
                sidebarBackdrop.classList.add('active');
            };

            const closeDrawer = () => {
                sidebarDrawer.classList.add('-translate-x-full');
                sidebarBackdrop.classList.remove('active');
                safeSetTimeout(() => {
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

        // Restore sound settings from ChessStorage
        const savedSoundMuted = typeof ChessStorage !== 'undefined' ? ChessStorage.getSoundMuted() : false;
        const savedSoundVolume = typeof ChessStorage !== 'undefined' ? ChessStorage.getSoundVolume(null) : null;
        
        isSoundMuted = savedSoundMuted;
        if (savedSoundVolume !== null) {
            soundVolume = parseFloat(savedSoundVolume);
        } else {
            soundVolume = 1.0; // Default to 1.0 (maximum)
        }
        if (typeof ChessAudio !== 'undefined') {
            ChessAudio.setMuted(isSoundMuted);
            ChessAudio.setVolume(soundVolume);
        }

        if (soundToggle) {
            soundToggle.checked = !isSoundMuted;
            soundToggle.addEventListener('change', () => {
                isSoundMuted = !soundToggle.checked;
                if (typeof ChessStorage !== 'undefined') ChessStorage.setSoundMuted(isSoundMuted);
                if (typeof ChessAudio !== 'undefined') ChessAudio.setMuted(isSoundMuted);
            });
        }
        if (soundVolumeSlider && volumeValDisplay) {
            soundVolumeSlider.value = Math.round(soundVolume * 100);
            volumeValDisplay.textContent = `${soundVolumeSlider.value}%`;
            soundVolumeSlider.addEventListener('input', () => {
                soundVolume = parseInt(soundVolumeSlider.value) / 100;
                volumeValDisplay.textContent = `${soundVolumeSlider.value}%`;
                if (typeof ChessStorage !== 'undefined') ChessStorage.setSoundVolume(soundVolume);
                if (typeof ChessAudio !== 'undefined') ChessAudio.setVolume(soundVolume);
            });
        }


        // Chat messaging logic
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const chatMessages = document.getElementById('chat-messages');

        function appendChatMessage(sender, text) {
            if (!chatMessages) return;
            const msgEl = document.createElement('div');
            msgEl.className = 'p-1 rounded bg-surface-container/20 border border-outline-variant/5 mb-1';
            
            const senderSpan = document.createElement('strong');
            senderSpan.className = sender === 'Вы' ? 'text-primary' : 'text-on-surface-variant';
            senderSpan.textContent = `${sender}: `;
            
            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            
            msgEl.appendChild(senderSpan);
            msgEl.appendChild(textSpan);
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function sendChat() {
            if (!chatInput) return;
            const text = chatInput.value.trim();
            if (!text) return;
            chatInput.value = '';
            
            appendChatMessage('Вы', text);
            
            if (networkState && networkState.connected && typeof ChessNetwork !== 'undefined') {
                ChessNetwork.sendChatMessage(text);
            }
        }

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

        // Quick Emojis
        if (typeof document.querySelectorAll === 'function') {
            const emojiBtns = document.querySelectorAll('.emoji-btn');
            if (emojiBtns) {
                emojiBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const text = btn.textContent;
                        appendChatMessage('Вы', text);
                        if (networkState && networkState.connected && typeof ChessNetwork !== 'undefined') {
                            ChessNetwork.sendChatMessage(text);
                        }
                    });
                });
            }
        }

        // Quick Phrases
        if (typeof document.querySelectorAll === 'function') {
            const phraseBtns = document.querySelectorAll('.quick-phrase-btn');
            if (phraseBtns) {
                phraseBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const text = btn.textContent;
                        appendChatMessage('Вы', text);
                        if (networkState && networkState.connected && typeof ChessNetwork !== 'undefined') {
                            ChessNetwork.sendChatMessage(text);
                        }
                    });
                });
            }
        }

        // Set receiver for chat messages
        if (typeof ChessNetwork !== 'undefined') {
            ChessNetwork.receiveChatMessage = (text) => {
                appendChatMessage('Соперник', text);
                switchTab('chat');
            };
        }

        // Tab switching logic for Right Panel
        const tabBtnNotation = document.getElementById('tab-btn-notation');
        const tabBtnAnalysis = document.getElementById('tab-btn-analysis');
        const tabBtnChat = document.getElementById('tab-btn-chat');
        
        const tabContentNotation = document.getElementById('tab-content-notation');
        const tabContentAnalysis = document.getElementById('tab-content-analysis');
        const tabContentChat = document.getElementById('tab-content-chat');
        
        switchTab = function(activeTab) {
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
        
        if (tabBtnNotation) tabBtnNotation.addEventListener('click', () => switchTab('notation'));
        if (tabBtnAnalysis) tabBtnAnalysis.addEventListener('click', () => switchTab('analysis'));
        if (tabBtnChat) tabBtnChat.addEventListener('click', () => switchTab('chat'));
        
        // Subscribe to logic changes
        if (logicUnsubscribe) {
            logicUnsubscribe();
            logicUnsubscribe = null;
        }
        logicUnsubscribe = ChessLogic.subscribe(state => {
            renderBoard();
            updateStatus(state.status);
            
            // Auto PC move if it's PC's turn
            if (pcToggle && pcToggle.checked && state.turn !== playerColor && !gameEnded && !isWaitingForPC && !isWaitingForStart) {
                if (pcMoveTimeoutId) cancelPendingMove();
                pcMoveTimeoutId = safeSetTimeout(makePCMove, 500);
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

        if (saveGameBtn) saveGameBtn.addEventListener('click', openSaveLoadModal);
        if (saveLoadCloseBtn) saveLoadCloseBtn.addEventListener('click', closeSaveLoadModal);
        if (saveLoadModal) {
            saveLoadModal.addEventListener('click', (e) => {
                if (e.target === saveLoadModal) closeSaveLoadModal();
            });
        }
        if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportToJSON);
        if (importJsonBtn && importFileInput) {
            importJsonBtn.addEventListener('click', () => importFileInput.click());
        }
        if (importFileInput) {
            importFileInput.addEventListener('change', importFromJSON);
        }

        // Save/Load Slot listeners
        for (let i = 1; i <= 3; i++) {
            const slotEl = document.getElementById(`slot-${i}`);
            if (slotEl) {
                const saveBtn = slotEl.querySelector('.slot-save-btn');
                const loadBtn = slotEl.querySelector('.slot-load-btn');
                const deleteBtn = slotEl.querySelector('.slot-delete-btn');
                
                if (saveBtn) saveBtn.addEventListener('click', () => saveToSlot(i));
                if (loadBtn) loadBtn.addEventListener('click', () => loadFromSlot(i));
                if (deleteBtn) deleteBtn.addEventListener('click', () => deleteSlot(i));
            }
        }

        initDraggableSwitches();
        updateTheme();
        updateGameModeControlState();
        startNewGame();
    }

    function initDraggableSwitches() {
        const switches = document.querySelectorAll('.switch');
        switches.forEach(switchEl => {
            const checkbox = switchEl.querySelector('input[type="checkbox"]');
            const slider = switchEl.querySelector('.slider');
            if (!checkbox || !slider) return;

            let isDragging = false;
            let startX = 0;
            let startChecked = false;
            const maxDrag = 24; // Slider width (48) - thumb width (18) - left/right gap (3*2) = 24

            let thumb = slider.querySelector('.thumb');
            if (!thumb) return;

            const getClientX = (e) => {
                return e.touches ? e.touches[0].clientX : e.clientX;
            };

            const handleStart = (e) => {
                isDragging = true;
                startX = getClientX(e);
                startChecked = checkbox.checked;
                thumb.style.transition = 'none';
                slider.style.transition = 'none';
            };

            const handleMove = (e) => {
                if (!isDragging) return;
                const clientX = getClientX(e);
                let delta = clientX - startX;
                
                let currentTranslation = startChecked ? maxDrag : 0;
                let targetTranslation = currentTranslation + delta;
                
                targetTranslation = Math.max(0, Math.min(maxDrag, targetTranslation));
                
                thumb.style.transform = `translateX(${targetTranslation}px)`;
                
                const ratio = targetTranslation / maxDrag;
                slider.style.backgroundColor = `color-mix(in srgb, #4d8eff ${ratio * 100}%, #424754)`;
            };

            const handleEnd = (e) => {
                if (!isDragging) return;
                isDragging = false;
                
                thumb.style.transition = '';
                slider.style.transition = '';
                thumb.style.transform = '';
                slider.style.backgroundColor = '';

                const clientX = e.changedTouches ? e.changedTouches[0].clientX : getClientX(e);
                const delta = clientX - startX;
                
                if (Math.abs(delta) > 3) {
                    const currentTranslation = startChecked ? maxDrag : 0;
                    const finalTranslation = currentTranslation + delta;
                    const checked = finalTranslation > (maxDrag / 2);
                    
                    if (checkbox.checked !== checked) {
                        checkbox.checked = checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                }
            };

            slider.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                handleStart(e);
                
                const onMouseMove = (moveEvent) => handleMove(moveEvent);
                const onMouseUp = (upEvent) => {
                    handleEnd(upEvent);
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            slider.addEventListener('touchstart', (e) => {
                handleStart(e);
            }, { passive: true });
            
            slider.addEventListener('touchmove', (e) => {
                handleMove(e);
            }, { passive: true });
            
            slider.addEventListener('touchend', (e) => {
                handleEnd(e);
            }, { passive: true });
        });

        updateAnalysisTabVisibility();
    }

    let cachedThemeColors = null;
    function refreshThemeColors() {
        try {
            const style = getComputedStyle(document.documentElement);
            cachedThemeColors = {
                light: style.getPropertyValue('--board-light').trim() || '#f0d9b5',
                dark: style.getPropertyValue('--board-dark').trim() || '#b58863',
                coordLight: style.getPropertyValue('--board-coord-light').trim() || '#ffffff',
                coordDark: style.getPropertyValue('--board-coord-dark').trim() || '#704828'
            };
        } catch (e) {
            cachedThemeColors = {
                light: '#f0d9b5',
                dark: '#b58863',
                coordLight: '#ffffff',
                coordDark: '#704828'
            };
        }
    }

    let cachedLegalDests = null;
    let cachedLegalDestsSquare = null;
    function getLegalDestsForSelectedSquare() {
        if (!selectedSquare) {
            cachedLegalDests = null;
            cachedLegalDestsSquare = null;
            return [];
        }
        if (cachedLegalDests && cachedLegalDestsSquare &&
            cachedLegalDestsSquare.row === selectedSquare.row &&
            cachedLegalDestsSquare.col === selectedSquare.col) {
            return cachedLegalDests;
        }
        const dests = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (ChessLogic.isValidMove(selectedSquare.row, selectedSquare.col, r, c)) {
                    dests.push({ row: r, col: c });
                }
            }
        }
        cachedLegalDests = dests;
        cachedLegalDestsSquare = { row: selectedSquare.row, col: selectedSquare.col };
        return dests;
    }

    function updateTheme() {
        const theme = themeSelect.value;
        const root = document.documentElement;
        root.style.setProperty('--board-light', `var(--${theme}-light)`);
        root.style.setProperty('--board-dark', `var(--${theme}-dark)`);
        root.style.setProperty('--board-coord-light', `var(--${theme}-coord-light)`);
        root.style.setProperty('--board-coord-dark', `var(--${theme}-coord-dark)`);
        if (typeof ChessStorage !== 'undefined') ChessStorage.setBoardTheme(theme);
        refreshThemeColors();
        renderBoard();
    }

    function updateOpponentAvatar() {
        const opponentAvatarContainer = document.getElementById('opponent-avatar-container');
        if (!opponentAvatarContainer) return;
        
        let opponentAvatarImg = document.getElementById('opponent-avatar-img');
        let opponentAvatarIcon = document.getElementById('opponent-avatar-icon');
        
        const isPC = (pcToggle && pcToggle.checked);
        
        if (isPC) {
            if (!opponentAvatarImg) {
                opponentAvatarImg = document.createElement('img');
                opponentAvatarImg.id = 'opponent-avatar-img';
                opponentAvatarImg.alt = 'Stockfish';
                opponentAvatarImg.className = 'w-full h-full object-contain rounded-lg';
                opponentAvatarImg.src = 'images/stockfish.png';
                opponentAvatarContainer.appendChild(opponentAvatarImg);
            } else {
                opponentAvatarImg.src = 'images/stockfish.png';
                opponentAvatarImg.style.display = 'block';
            }
            if (opponentAvatarIcon) opponentAvatarIcon.style.display = 'none';
            opponentAvatarContainer.className = "w-9 h-9 md:w-10 md:h-10 rounded-lg bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center shadow-md overflow-hidden p-0.5";
        } else {
            if (opponentAvatarImg) opponentAvatarImg.style.display = 'none';
            if (opponentAvatarIcon) {
                opponentAvatarIcon.style.display = 'block';
                opponentAvatarIcon.textContent = 'person';
            }
            opponentAvatarContainer.className = "w-9 h-9 md:w-10 md:h-10 rounded-lg bg-primary-container/20 border border-primary/20 flex items-center justify-center shadow-md";
        }
    }

    function updateNetworkUiAndTelemetry() {
        const dot = document.getElementById('opponent-status-dot');
        const telemetry = document.getElementById('settings-network-telemetry');
        const isNetworkGame = networkState && networkState.connected;
        
        if (dot) {
            dot.style.display = isNetworkGame ? 'inline-block' : 'none';
            if (!isNetworkGame) {
                dot.classList.remove('online');
                dot.classList.add('offline');
                dot.style.backgroundColor = 'rgba(140, 144, 159, 0.4)';
                dot.style.boxShadow = 'none';
                dot.title = "Оппонент не в игре";
            }
        }
        if (telemetry) {
            telemetry.style.display = isNetworkGame ? 'block' : 'none';
            if (!isNetworkGame) {
                const pingVal = document.getElementById('settings-ping-val');
                const latencyVal = document.getElementById('settings-latency-val');
                if (pingVal) {
                    pingVal.textContent = '— ms';
                    pingVal.className = "text-xs font-mono text-primary font-bold";
                }
                if (latencyVal) {
                    latencyVal.textContent = '— ms';
                    latencyVal.className = "text-xs font-mono text-primary font-bold";
                }
            }
        }
    }

    function updateResignButtonState() {
        const resignBtn = document.getElementById('resign-btn');
        if (!resignBtn) return;
        
        if (gameEnded) {
            resignBtn.style.display = 'none';
            return;
        }
        
        const isNetwork = networkState && networkState.connected;
        const isPC = pcToggle && pcToggle.checked;
        
        // Hide in local two-player game on the same device
        if (!isNetwork && !isPC) {
            resignBtn.style.display = 'none';
        } else {
            resignBtn.style.display = 'block';
        }
    }

    function parseTimeControl() {
        if (timeControlSelect.value === 'custom') {
            const mins = parseFloat(customMinsInput.value) || 10;
            const inc = parseFloat(customIncInput.value) || 0;
            return { time: mins * 60, inc: inc };
        } else {
            const parts = timeControlSelect.value.split(',');
            return { time: parseFloat(parts[0]), inc: parseFloat(parts[1]) || 0 };
        }
    }

    function updateGameFormatBadge() {
        if (!gameConditionBadge) return;
        
        const tc = parseTimeControl();
        if (tc.time === 0) {
            gameConditionBadge.textContent = 'Unlimited';
            return;
        }
        
        const estimatedDuration = tc.time + 40 * tc.inc;
        
        let formatText = 'Rapid';
        if (estimatedDuration < 30) {
            formatText = 'UltraBullet';
        } else if (estimatedDuration < 180) {
            formatText = 'Bullet';
        } else if (estimatedDuration < 480) {
            formatText = 'Blitz';
        } else if (estimatedDuration < 1500) {
            formatText = 'Rapid';
        } else {
            formatText = 'Classical';
        }
        
        gameConditionBadge.textContent = formatText;
    }

    function resetDrawButton() {
        const drawBtn = document.getElementById('draw-btn');
        if (drawBtn) {
            drawBtn.disabled = false;
            drawBtn.textContent = 'Предложить ничью';
            drawBtn.classList.remove('animate-pulse');
        }
    }

    function startNewGame(isAutomatic = true) {
        currentAnalysisSessionId++;
        resetDrawButton();
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.style.display = 'none';

        ChessLogic.initBoard();
        moveCount = 1;
        stateHistory = [];
        hasPlayedLowTimeWarning = false;
        clearPendingTimers();
        historyListElement.innerHTML = '';
        
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';
        selectedSquare = null;
        isWaitingForPC = false;
        gameEnded = false;
        analysisResults = [];
        selectedAnalysisIndex = null;
        suggestedMove = null;
        analysisSnapshot = null;
        lastMove = null;
        if (animationLayer) animationLayer.innerHTML = '';
        hideAnalysis();
        updateAnalysisTabVisibility();
        capturedByWhite = [];
        capturedByBlack = [];
        
        // Reset accuracies stats
        if (accuracyBarContainer) accuracyBarContainer.style.display = 'none';
        if (accuracyWhiteBar) accuracyWhiteBar.style.height = '50%';
        if (accuracyBlackBar) accuracyBlackBar.style.height = '50%';
        safeSetTimeout(renderBoard, 0);
        
        if (switchTab) switchTab('notation');
        updateCapturesDisplay();
        
        document.getElementById('top-accuracy').style.display = 'none';
        document.getElementById('bottom-accuracy').style.display = 'none';

        updateResignButtonState();
        if (document.getElementById('draw-btn')) {
            const drawBtn = document.getElementById('draw-btn');
            drawBtn.disabled = false;
            drawBtn.style.display = (networkState && networkState.connected) ? 'block' : 'none';
        }
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = false;

        // Colors
        if (pcToggle.checked) {
            const chosenSide = sideSelect ? sideSelect.value : 'random';
            if (chosenSide === 'w') {
                playerColor = 'w';
            } else if (chosenSide === 'b') {
                playerColor = 'b';
            } else {
                playerColor = Math.random() < 0.5 ? 'w' : 'b';
            }
            pcColor = playerColor === 'w' ? 'b' : 'w';
            bottomPlayerName.textContent = 'Вы';
            topPlayerName.textContent = getStockfishName();
        } else if (networkState && networkState.connected) {
            bottomPlayerName.textContent = 'Вы';
            topPlayerName.textContent = 'Соперник';
        } else {
            const chosenSide = sideSelect ? sideSelect.value : 'random';
            if (chosenSide === 'w') {
                playerColor = 'w';
            } else if (chosenSide === 'b') {
                playerColor = 'b';
            } else {
                playerColor = Math.random() < 0.5 ? 'w' : 'b';
            }
            pcColor = playerColor === 'w' ? 'b' : 'w';
            bottomPlayerName.textContent = playerColor === 'w' ? 'Белые' : 'Черные';
            topPlayerName.textContent = playerColor === 'w' ? 'Черные' : 'Белые';
        }

        // Timers
        stopTimer();
        const tc = parseTimeControl();
        whiteTimeLeft = tc.time;
        blackTimeLeft = tc.time;
        increment = tc.inc;
        isTimerRunning = false;
        
        if (whiteTimeLeft === 0) {
            topTimerDisplay.parentElement.style.display = 'none';
            bottomTimerDisplay.parentElement.style.display = 'none';
        } else {
            topTimerDisplay.parentElement.style.display = '';
            bottomTimerDisplay.parentElement.style.display = '';
            topTimerDisplay.style.display = '';
            bottomTimerDisplay.style.display = '';
            updateTimerDisplays();
        }

        updateGameFormatBadge();
        renderBoard();
        syncNetworkState();

        if (isAutomatic) {
            isWaitingForStart = true;
            isWaitingForPC = false;
            statusElement.textContent = 'Нажмите "Новая игра" для начала';
            gameInfoElement.textContent = (pcToggle && pcToggle.checked) ? 'Чтобы начать игру против ПК' : 'Чтобы начать партию';
        } else {
            isWaitingForStart = false;
            if (pcToggle && pcToggle.checked) {
                if (pcColor === 'w') {
                    isWaitingForPC = true;
                    statusElement.textContent = 'ПК думает...';
                    gameInfoElement.textContent = 'Ход ПК';
                    if (pcMoveTimeoutId) cancelPendingMove();
                    pcMoveTimeoutId = safeSetTimeout(makePCMove, 600);
                } else {
                    isWaitingForPC = false;
                    statusElement.textContent = 'Ход Белых';
                    gameInfoElement.textContent = 'Игра продолжается';
                }
            } else {
                isWaitingForPC = false;
                statusElement.textContent = 'Ход Белых';
                gameInfoElement.textContent = 'Игра продолжается';
            }
        }
        
        updateOpponentAvatar();
    }

    function formatTime(seconds) {
        if (seconds <= 0) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function updateTimerDisplays() {
        if (whiteTimeLeft === 0 && blackTimeLeft === 0 && parseTimeControl().time === 0) return;

        const isWhiteBottom = playerColor === 'w';
        
        if (isWhiteBottom) {
            bottomTimerDisplay.textContent = formatTime(whiteTimeLeft);
            topTimerDisplay.textContent = formatTime(blackTimeLeft);
        } else {
            bottomTimerDisplay.textContent = formatTime(blackTimeLeft);
            topTimerDisplay.textContent = formatTime(whiteTimeLeft);
        }

        const turn = ChessLogic.getTurn();
        const isMyTurn = turn === playerColor;

        const oppCard = document.getElementById('opponent-card');
        const playerCard = document.getElementById('player-card');

        if (isMyTurn) {
            bottomTimerContainer.classList.add('active');
            topTimerContainer.classList.remove('active');
            if (playerCard) playerCard.classList.add('glow-turn');
            if (oppCard) oppCard.classList.remove('glow-turn');
        } else {
            topTimerContainer.classList.add('active');
            bottomTimerContainer.classList.remove('active');
            if (oppCard) oppCard.classList.add('glow-turn');
            if (playerCard) playerCard.classList.remove('glow-turn');
        }

        const myTimeLeft = playerColor === 'w' ? whiteTimeLeft : blackTimeLeft;
        const oppTimeLeft = playerColor === 'w' ? blackTimeLeft : whiteTimeLeft;

        if (myTimeLeft > 0 && myTimeLeft < 60) {
            bottomTimerContainer.classList.add('low-time');
        } else {
            bottomTimerContainer.classList.remove('low-time');
        }

        if (oppTimeLeft > 0 && oppTimeLeft < 60) {
            topTimerContainer.classList.add('low-time');
        } else {
            topTimerContainer.classList.remove('low-time');
        }
    }

    function startTimer() {
        if (isTimerRunning || parseTimeControl().time === 0 || gameEnded) return;
        isTimerRunning = true;
        
        lastTickTime = Date.now();
        
        timerInterval = setInterval(() => {
            const now = Date.now();
            const dt = (now - lastTickTime) / 1000;
            lastTickTime = now;

            const turn = ChessLogic.getTurn();
            if (turn === 'w') {
                whiteTimeLeft -= dt;
                if (whiteTimeLeft <= 0) {
                    handleTimeout('w');
                } else if (whiteTimeLeft <= 10 && !hasPlayedLowTimeWarning) {
                    hasPlayedLowTimeWarning = true;
                    if (typeof ChessAudio !== 'undefined') ChessAudio.lowTime();
                }
            } else {
                blackTimeLeft -= dt;
                if (blackTimeLeft <= 0) {
                    handleTimeout('b');
                } else if (blackTimeLeft <= 10 && !hasPlayedLowTimeWarning) {
                    hasPlayedLowTimeWarning = true;
                    if (typeof ChessAudio !== 'undefined') ChessAudio.lowTime();
                }
            }
            updateTimerDisplays();
        }, 100);
    }

    function stopTimer() {
        isTimerRunning = false;
        clearInterval(timerInterval);
    }

    function handleTimeout(color) {
        stopTimer();
        finishGame('timeout', color);
    }

    function handleTurnEnd() {
        hasPlayedLowTimeWarning = false;
        if (parseTimeControl().time > 0) {
            const turn = ChessLogic.getTurn();
            // Add increment to the player who JUST moved
            if (turn === 'w') { // Black just moved
                blackTimeLeft += increment;
            } else { // White just moved
                whiteTimeLeft += increment;
            }
        }
    }

    function finishGame(reason = null, loserColor = null) {
        resetDrawButton();
        gameEnded = true;
        clearPendingTimers();
        stopTimer();
        suggestedMove = null;



        let title = 'Игра завершена';
        let sub = '';
        let icon = '🏆';

        if (reason === 'resign') {
            const winnerText = loserColor === 'w' ? 'Победа черных!' : 'Победа белых!';
            const loserText = loserColor === 'w' ? 'Белые сдались' : 'Черные сдались';
            statusElement.textContent = loserText;
            gameInfoElement.textContent = winnerText;
            title = winnerText;
            sub = loserText;
            icon = '🏳️';
        } else if (reason === 'draw') {
            statusElement.textContent = 'Ничья';
            gameInfoElement.textContent = 'По обоюдному согласию';
            title = 'Ничья';
            sub = 'По согласию сторон';
            icon = '🤝';
        } else if (reason === 'timeout') {
            const winnerText = loserColor === 'w' ? 'Победа черных!' : 'Победа белых!';
            statusElement.textContent = 'Время вышло!';
            gameInfoElement.textContent = winnerText;
            title = winnerText;
            sub = 'Время вышло';
            icon = '⏱️';
        } else if (reason === 'checkmate') {
            const winnerText = loserColor === 'w' ? 'Победа черных!' : 'Победа белых!';
            statusElement.textContent = `МАТ! ${winnerText}`;
            gameInfoElement.textContent = 'Игра завершена';
            title = winnerText;
            sub = 'Шах и мат';
            icon = '👑';
        } else if (reason === 'stalemate') {
            statusElement.textContent = 'Ничья! Пат.';
            gameInfoElement.textContent = 'У игрока нет доступных ходов';
            title = 'Ничья';
            sub = 'Пат';
            icon = '🤝';
        } else if (reason === 'repetition') {
            statusElement.textContent = 'Ничья! Повторение ходов.';
            gameInfoElement.textContent = 'Позиция повторилась трижды';
            title = 'Ничья';
            sub = 'Трехкратное повторение позиции';
            icon = '🤝';
        } else if (reason === '50moves') {
            statusElement.textContent = 'Ничья! Правило 50 ходов.';
            gameInfoElement.textContent = '50 ходов без взятий и движения пешек';
            title = 'Ничья';
            sub = 'Правило 50 ходов';
            icon = '🤝';
        } else if (reason === 'material') {
            statusElement.textContent = 'Ничья! Недостаточно фигур.';
            gameInfoElement.textContent = 'Невозможно поставить мат';
            title = 'Ничья';
            sub = 'Недостаточно фигурного материала';
            icon = '🤝';
        }

        // Show game over modal to notify the user
        showGameOverModal(title, sub, icon);

        if (analysisBtn && ChessLogic.getGameHistory().length > 0) {
            analysisBtn.style.display = 'block';
        }

        updateResignButtonState();
        if (document.getElementById('draw-btn')) document.getElementById('draw-btn').disabled = true;
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = true;
        updateHintButtonState();
        updateAnalysisTabVisibility();
        startAutomaticBackgroundAnalysis();
    }

    function showGameOverModal(title, reason, icon = '🏆') {
        const modal = document.getElementById('game-over-modal');
        const titleEl = document.getElementById('game-over-title');
        const reasonEl = document.getElementById('game-over-reason');
        const iconEl = document.getElementById('game-over-icon-container');
        
        if (modal && titleEl && reasonEl && iconEl) {
            titleEl.textContent = title;
            reasonEl.textContent = reason;
            iconEl.textContent = icon;
            modal.style.display = 'flex';
        }
    }

    function renderBoard() {
        if (!ctx) return;
        
        // Resize canvas to match boardElement size
        const size = boardElement.clientWidth;
        const dpr = window.devicePixelRatio || 1;
        const expectedWidth = Math.round(size * dpr);
        if (size > 0 && (canvas.width !== expectedWidth || canvas.height !== expectedWidth)) {
            canvas.width = expectedWidth;
            canvas.height = expectedWidth;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            ctx.scale(dpr, dpr);
        }
        
        const squareSize = canvas.clientWidth / 8;
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        
        const board = ChessLogic.getBoard();
        const flipped = isFlipped();
        
        // Read theme colors from cache (prevents layout thrashing on every frame)
        if (!cachedThemeColors) refreshThemeColors();
        const lightColor = cachedThemeColors.light;
        const darkColor = cachedThemeColors.dark;
        const coordLight = cachedThemeColors.coordLight;
        const coordDark = cachedThemeColors.coordDark;
        
        // 1. Draw Squares & Highlights
        for (let ri = 0; ri < 8; ri++) {
            for (let ci = 0; ci < 8; ci++) {
                const r = flipped ? 7 - ri : ri;
                const c = flipped ? 7 - ci : ci;
                
                const x = ci * squareSize;
                const y = ri * squareSize;
                
                // Base Square
                ctx.fillStyle = (r + c) % 2 === 0 ? lightColor : darkColor;
                ctx.fillRect(x, y, squareSize, squareSize);
                
                // Selected Square Highlight
                if (selectedSquare && selectedSquare.row === r && selectedSquare.col === c) {
                    ctx.fillStyle = 'rgba(34, 139, 34, 0.65)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                
                // Last Move Highlights
                if (lastMove && lastMove.fromRow === r && lastMove.fromCol === c) {
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                if (lastMove && lastMove.toRow === r && lastMove.toCol === c) {
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                
                // Suggested Best Move Highlights
                if (suggestedMove && suggestedMove.fromRow === r && suggestedMove.fromCol === c) {
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                if (suggestedMove && suggestedMove.toRow === r && suggestedMove.toCol === c) {
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                
                // Check Highlight
                const piece = board[r][c];
                const currentTurn = analysisSnapshot ? analysisSnapshot.turn : ChessLogic.getTurn();
                const isCurrentTurnKing = (currentTurn === 'w' && piece === 'K') || (currentTurn === 'b' && piece === 'k');
                if (isCurrentTurnKing && ChessLogic.isKingInCheck(currentTurn)) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                
                // Hover square overlay
                if (hoverSquare && hoverSquare.row === r && hoverSquare.col === c && !isWaitingForPC && !isWaitingForStart && !gameEnded && !analysisSnapshot) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
            }
        }
        
        // 1.5 Draw Legal Moves Dots
        if (selectedSquare) {
            const dests = getLegalDestsForSelectedSquare();
            dests.forEach(dest => {
                const displayRow = flipped ? 7 - dest.row : dest.row;
                const displayCol = flipped ? 7 - dest.col : dest.col;
                
                const x = displayCol * squareSize;
                const y = displayRow * squareSize;
                
                const centerX = x + squareSize / 2;
                const centerY = y + squareSize / 2;
                
                ctx.save();
                ctx.fillStyle = 'rgba(34, 139, 34, 0.6)';
                ctx.strokeStyle = 'rgba(34, 139, 34, 0.6)';
                
                const pieceOnDest = board[dest.row][dest.col];
                if (pieceOnDest) {
                    ctx.lineWidth = Math.max(2, squareSize * 0.08);
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, squareSize * 0.4, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, squareSize * 0.15, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            });
        }
        
        // 2. Draw Coordinates & Pieces
        for (let ri = 0; ri < 8; ri++) {
            for (let ci = 0; ci < 8; ci++) {
                const r = flipped ? 7 - ri : ri;
                const c = flipped ? 7 - ci : ci;
                
                const x = ci * squareSize;
                const y = ri * squareSize;
                
                // Coordinates
                ctx.font = 'bold 10px Inter, Outfit, sans-serif';
                ctx.fillStyle = (r + c) % 2 === 0 ? coordDark : coordLight;
                
                if (ci === 0) { // Rank Label (left edge)
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(8 - r, x + 4, y + 4);
                }
                if (ri === 7) { // File Label (bottom edge)
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(String.fromCharCode(97 + c), x + squareSize - 4, y + squareSize - 4);
                }
                
                // Piece
                const piece = board[r][c];
                if (piece) {
                    const isDraggingThis = isDragging && dragStartSquare && dragStartSquare.row === r && dragStartSquare.col === c;
                    const isBlack = piece === piece.toLowerCase();
                    const isHovered = hoverSquare && hoverSquare.row === r && hoverSquare.col === c && !isWaitingForPC && !isWaitingForStart && !gameEnded && !analysisSnapshot && !isDragging;
                    
                    ctx.save();
                    if (isDraggingThis) {
                        ctx.globalAlpha = 0.25;
                    }
                    
                    // Shadow effect
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                    ctx.shadowBlur = isHovered ? 8 : 4;
                    ctx.shadowOffsetY = isHovered ? 5 : 3;
                    
                    // Centering
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // Hover scaling and vertical float
                    const scale = isHovered ? 1.12 : 1.0;
                    const floatY = isHovered ? -2 : 0;
                    
                    ctx.translate(x + squareSize / 2, y + squareSize / 2 + floatY);
                    ctx.scale(scale, scale);
                    
                    initPieceImages();
                    const img = pieceImages[piece];
                    let drewImage = false;
                    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                        try {
                            const pieceSize = squareSize * 0.92;
                            ctx.drawImage(
                                img,
                                -pieceSize / 2,
                                -pieceSize / 2,
                                pieceSize,
                                pieceSize
                            );
                            drewImage = true;
                        } catch (e) {
                            drewImage = false;
                        }
                    }
                    
                    if (!drewImage) {
                        // Font size based on cqw equivalent: ~75% of square size
                        const fontSize = squareSize * 0.75;
                        ctx.font = `${fontSize}px Outfit, "Arial Unicode MS", sans-serif`;
                        
                        const text = PIECE_UNICODE[piece];
                        
                        // Render outlines & fill
                        if (isBlack) {
                            ctx.fillStyle = '#0d0d0d';
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = Math.max(1.5, squareSize / 30);
                            ctx.strokeText(text, 0, 0);
                            ctx.fillText(text, 0, 0);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.strokeStyle = '#000000';
                            ctx.lineWidth = Math.max(1.5, squareSize / 30);
                            ctx.strokeText(text, 0, 0);
                            ctx.fillText(text, 0, 0);
                        }
                    }
                    
                    ctx.restore();
                }
            }
        }

        // 3. Draw Dragged Piece
        if (isDragging && draggedPiece) {
            ctx.save();
            
            // Draw piece shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 6;
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.translate(dragCurrentX, dragCurrentY);
            // Scale dragged piece slightly larger for a premium "picked up" feel
            ctx.scale(1.2, 1.2);
            
            initPieceImages();
            const img = pieceImages[draggedPiece];
            let drewImage = false;
            if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                try {
                    const pieceSize = squareSize * 0.92;
                    ctx.drawImage(
                        img,
                        -pieceSize / 2,
                        -pieceSize / 2,
                        pieceSize,
                        pieceSize
                    );
                    drewImage = true;
                } catch (e) {
                    drewImage = false;
                }
            }
            
            if (!drewImage) {
                const fontSize = squareSize * 0.75;
                ctx.font = `${fontSize}px Outfit, "Arial Unicode MS", sans-serif`;
                
                const text = PIECE_UNICODE[draggedPiece];
                const isBlack = draggedPiece === draggedPiece.toLowerCase();
                
                if (isBlack) {
                    ctx.fillStyle = '#0d0d0d';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = Math.max(1.5, squareSize / 30);
                    ctx.strokeText(text, 0, 0);
                    ctx.fillText(text, 0, 0);
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = Math.max(1.5, squareSize / 30);
                    ctx.strokeText(text, 0, 0);
                    ctx.fillText(text, 0, 0);
                }
            }
            
            ctx.restore();
        }
    }

    function executeMove(fromRow, fromCol, toRow, toCol, isRemote = false) {
        if (gameEnded || analysisSnapshot) return false;
        if (!isRemote && isWaitingForStart) return false;
        const previousLastMove = lastMove ? { ...lastMove } : null;
        stateHistory.push({
            boardState: ChessLogic.getState(),
            timers: {
                white: whiteTimeLeft,
                black: blackTimeLeft,
                inc: increment,
                running: isTimerRunning
            },
            history: historyListElement.innerHTML,
            moveCount: moveCount,
            captures: {
                white: [...capturedByWhite],
                black: [...capturedByBlack]
            },
            lastMove: previousLastMove
        });

        const boardSnap = ChessLogic.getBoard();
        const targetPiece = boardSnap[toRow][toCol];
        const movingPiece = boardSnap[fromRow][fromCol];

        if (isRemote) isRemoteAction = true;
        const success = ChessLogic.movePiece(fromRow, fromCol, toRow, toCol);
        if (isRemote) isRemoteAction = false;

        if (success) {
            suggestedMove = null;
            const movedIsPawn = movingPiece && movingPiece.toLowerCase() === 'p';
            const wasEnPassantCapture = movedIsPawn && !targetPiece && fromCol !== toCol;
            const wasCapture = Boolean(targetPiece) || wasEnPassantCapture;
            const givesCheck = ChessLogic.isKingInCheck(ChessLogic.getTurn());
            const enPassantCapturedPiece = wasEnPassantCapture
                ? boardSnap[movingPiece === movingPiece.toUpperCase() ? toRow + 1 : toRow - 1][toCol]
                : null;
            const capturedPiece = targetPiece || enPassantCapturedPiece;

            updateLastMove({ fromRow, fromCol, toRow, toCol });

            if (wasCapture) {
                ChessAudio.capture();
            } else {
                ChessAudio.move();
            }

            animateMove(fromRow, fromCol, toRow, toCol, movingPiece);

            if (wasCapture) {
                const movingIsWhite = movingPiece === movingPiece.toUpperCase();
                if (capturedPiece) {
                    if (movingIsWhite) capturedByWhite.push(capturedPiece.toLowerCase());
                    else capturedByBlack.push(capturedPiece.toLowerCase());
                    updateCapturesDisplay();
                }
            }
            if (!isTimerRunning) startTimer();
            handleTurnEnd();
            addToHistory(fromRow, fromCol, toRow, toCol);

            if (!isRemote && typeof ChessNetwork !== 'undefined' && networkState && networkState.connected) {
                ChessNetwork.sendMove({
                    fromRow,
                    fromCol,
                    toRow,
                    toCol,
                    timers: {
                        white: whiteTimeLeft,
                        black: blackTimeLeft,
                        inc: increment,
                        running: isTimerRunning
                    }
                });
                syncNetworkState();
            }
            updateStatus();
            return true;
        }
        stateHistory.pop();
        return false;
    }

    function isDraggingPiece(clientX, clientY) {
        if (isWaitingForPC || isWaitingForStart || gameEnded || analysisSnapshot) return false;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const squareSize = rect.width / 8;
        const col = Math.floor(x / squareSize);
        const row = Math.floor(y / squareSize);
        
        const flipped = isFlipped();
        const r = flipped ? 7 - row : row;
        const c = flipped ? 7 - col : col;
        
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const board = ChessLogic.getBoard();
            const piece = board[r][c];
            const currentTurn = ChessLogic.getTurn();
            if (piece) {
                const isWhite = piece === piece.toUpperCase();
                const isPieceOfCurrentTurn = (isWhite && currentTurn === 'w') || (!isWhite && currentTurn === 'b');
                const isMyTurn = (pcToggle.checked || (networkState && networkState.connected)) ? (currentTurn === playerColor) : true;
                return isPieceOfCurrentTurn && isMyTurn;
            }
        }
        return false;
    }

    function handleMousedown(clientX, clientY) {
        if (isWaitingForPC || isWaitingForStart || gameEnded || analysisSnapshot) return;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const squareSize = rect.width / 8;
        const col = Math.floor(x / squareSize);
        const row = Math.floor(y / squareSize);
        
        const flipped = isFlipped();
        const r = flipped ? 7 - row : row;
        const c = flipped ? 7 - col : col;
        
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            lastMousedownSquare = { row: r, col: c };
            
            const board = ChessLogic.getBoard();
            const piece = board[r][c];
            const currentTurn = ChessLogic.getTurn();
            
            if (piece) {
                const isWhite = piece === piece.toUpperCase();
                const isPieceOfCurrentTurn = (isWhite && currentTurn === 'w') || (!isWhite && currentTurn === 'b');
                const isMyTurn = (pcToggle.checked || (networkState && networkState.connected)) ? (currentTurn === playerColor) : true;
                const canMove = isPieceOfCurrentTurn && isMyTurn;
                
                if (canMove) {
                    isDragging = true;
                    dragStartSquare = { row: r, col: c };
                    draggedPiece = piece;
                    dragCurrentX = x;
                    dragCurrentY = y;
                    selectedSquare = { row: r, col: c };
                    draggedOccurred = false;
                    renderBoard();
                }
            }
        }
    }

    let mousemoveRafId = null;
    let pendingMouseX = 0;
    let pendingMouseY = 0;

    function handleMousemove(clientX, clientY) {
        pendingMouseX = clientX;
        pendingMouseY = clientY;
        if (mousemoveRafId) return;

        mousemoveRafId = requestAnimationFrame(() => {
            mousemoveRafId = null;
            processMousemove(pendingMouseX, pendingMouseY);
        });
    }

    function processMousemove(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const squareSize = rect.width / 8;
        const col = Math.floor(x / squareSize);
        const row = Math.floor(y / squareSize);
        
        const flipped = isFlipped();
        const r = flipped ? 7 - row : row;
        const c = flipped ? 7 - col : col;
        
        if (isDragging) {
            dragCurrentX = x;
            dragCurrentY = y;
            draggedOccurred = true;
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                hoverSquare = { row: r, col: c };
            } else {
                hoverSquare = null;
            }
            renderBoard();
        } else {
            if (isWaitingForPC || isWaitingForStart || gameEnded || analysisSnapshot) {
                if (hoverSquare) {
                    hoverSquare = null;
                    renderBoard();
                }
                return;
            }
            
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                if (!hoverSquare || hoverSquare.row !== r || hoverSquare.col !== c) {
                    hoverSquare = { row: r, col: c };
                    renderBoard();
                }
            } else {
                if (hoverSquare) {
                    hoverSquare = null;
                    renderBoard();
                }
            }
        }
    }

    function handleMouseup(clientX, clientY) {
        if (isWaitingForPC || isWaitingForStart || gameEnded || analysisSnapshot) return;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const squareSize = rect.width / 8;
        const col = Math.floor(x / squareSize);
        const row = Math.floor(y / squareSize);
        
        const flipped = isFlipped();
        const r = flipped ? 7 - row : row;
        const c = flipped ? 7 - col : col;
        
        if (isDragging) {
            isDragging = false;
            const startRow = dragStartSquare.row;
            const startCol = dragStartSquare.col;
            
            dragStartSquare = null;
            draggedPiece = null;
            
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                if (startRow === r && startCol === c) {
                    // Same square: treat as click
                    handleSquareClick(r, c);
                } else {
                    // Try to execute the move
                    const success = executeMove(startRow, startCol, r, c);
                    if (success) {
                        selectedSquare = null;
                    } else {
                        selectedSquare = { row: startRow, col: startCol };
                    }
                }
            }
            renderBoard();
        } else {
            if (r >= 0 && r < 8 && c >= 0 && c < 8 && lastMousedownSquare && lastMousedownSquare.row === r && lastMousedownSquare.col === c) {
                handleSquareClick(r, c);
            }
        }
        lastMousedownSquare = null;
    }

    function handleSquareClick(row, col) {
        if (isWaitingForPC || isWaitingForStart || gameEnded || analysisSnapshot) return;
        const currentTurn = ChessLogic.getTurn();

        if ((pcToggle.checked || (networkState && networkState.connected)) && currentTurn !== playerColor) return;

        if (suggestedMove) {
            suggestedMove = null;
        }

        if (selectedSquare) {
            const fromRow = selectedSquare.row;
            const fromCol = selectedSquare.col;
            
            if (executeMove(fromRow, fromCol, row, col)) {
                selectedSquare = null;
                renderBoard();

                return;
            } else {
                selectPiece(row, col, currentTurn);
            }
        } else {
            selectPiece(row, col, currentTurn);
        }
        renderBoard();
    }

    function selectPiece(row, col, currentTurn) {
        const board = ChessLogic.getBoard();
        const piece = board[row][col];
        if (piece) {
            const isWhite = piece === piece.toUpperCase();
            if ((isWhite && currentTurn === 'w') || (!isWhite && currentTurn === 'b')) {
                selectedSquare = { row, col };
            } else {
                selectedSquare = null;
            }
        } else {
            selectedSquare = null;
        }
    }

    function applyPCMove(bestMove) {
        isWaitingForPC = false;
        if (!bestMove || gameEnded) {
            renderBoard();
            return;
        }

        const fromR = bestMove.fromR !== undefined ? bestMove.fromR : bestMove.fromRow;
        const fromC = bestMove.fromC !== undefined ? bestMove.fromC : bestMove.fromCol;
        const toR = bestMove.toR !== undefined ? bestMove.toR : bestMove.toRow;
        const toC = bestMove.toC !== undefined ? bestMove.toC : bestMove.toCol;

        executeMove(fromR, fromC, toR, toC);
        renderBoard();
    }

    function makePCMove() {
        pcMoveTimeoutId = null;
        if (gameEnded) return;
        
        const difficulty = difficultySelect.value;
        const state = ChessLogic.getState();
        console.log('[UI] Planning PC move. Difficulty:', difficulty, 'Turn:', state.turn);
        
        isWaitingForPC = true;
        statusElement.textContent = 'ПК думает...';
        
        const topPlayerName = document.getElementById('top-player-name');
        if (topPlayerName) {
            topPlayerName.textContent = getStockfishName();
        }

        const fen = ChessLogic.getFen();
        const history = (typeof ChessLogic.getGameHistory === 'function')
            ? ChessLogic.getGameHistory().map(h => h && h.fen).filter(Boolean)
            : [];

        if (typeof ChessAIManager !== 'undefined') {
            ChessAIManager.getBestMove(fen, difficulty, history).then(bestMove => {
                if (gameEnded) return;
                applyPCMove(bestMove);
            }).catch(err => {
                console.error('[UI] ChessAIManager error:', err);
                isWaitingForPC = false;
                renderBoard();
            });
        } else {
            // Hard fallback if ChessAIManager is not loaded
            const turn = ChessLogic.getTurn();
            let bestMove = null;
            if (difficulty === '1' && typeof ChessAIEasy !== 'undefined') bestMove = ChessAIEasy.getBestMove(turn);
            else if (difficulty === '2' && typeof ChessAIMedium !== 'undefined') bestMove = ChessAIMedium.getBestMove(turn);
            else if (difficulty === '3' && typeof ChessAIHard !== 'undefined') bestMove = ChessAIHard.getBestMove(turn);
            else if (difficulty === '4' && typeof ChessAIVeryHard !== 'undefined') bestMove = ChessAIVeryHard.getBestMove(turn);
            else if (difficulty === '5' && typeof ChessAIVeryHard !== 'undefined') bestMove = ChessAIVeryHard.getBestMove(turn);
            applyPCMove(bestMove);
        }
    }

    function updateCapturesDisplay() {
        const whiteScore = capturedByWhite.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
        const blackScore = capturedByBlack.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);

        const sortByValue = arr => [...arr].sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));

        const BLACK_UNICODE = {
            'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };
        const WHITE_UNICODE = {
            'q': '♕', 'r': '♖', 'b': '♗', 'n': '♘', 'p': '♙'
        };

        const isBottomWhite = playerColor === 'w' || !pcToggle.checked;
        const bottomCaptured = isBottomWhite ? sortByValue(capturedByWhite) : sortByValue(capturedByBlack);
        const topCaptured = isBottomWhite ? sortByValue(capturedByBlack) : sortByValue(capturedByWhite);
        const bottomScore = isBottomWhite ? whiteScore : blackScore;
        const topScore = isBottomWhite ? blackScore : whiteScore;

        bottomCapturedEl.textContent = bottomCaptured.map(p => (isBottomWhite ? BLACK_UNICODE[p] : WHITE_UNICODE[p]) || '').join('');
        topCapturedEl.textContent = topCaptured.map(p => (isBottomWhite ? WHITE_UNICODE[p] : BLACK_UNICODE[p]) || '').join('');

        const topAdv = topScore - bottomScore;
        topAdvantageEl.textContent = topAdv > 0 ? `+${topAdv}` : '';
        bottomAdvantageEl.textContent = topAdv < 0 ? `+${-topAdv}` : '';
    }

    function addToHistory(fR, fC, tR, tC) {
        // ... (existing addToHistory code)
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const to = `${files[tC]}${8 - tR}`;
        
        const turn = ChessLogic.getTurn(); 
        
        if (turn === 'w') { 
            const lastLi = historyListElement.lastElementChild;
            if (lastLi) {
                const blackMove = lastLi.children[2];
                blackMove.textContent = to;
            }
        } else { 
            const li = document.createElement('li');
            li.innerHTML = `<span>${moveCount}.</span><span>${to}</span><span></span>`;
            historyListElement.appendChild(li);
            historyListElement.scrollTop = historyListElement.scrollHeight;
            moveCount++;
        }
    }

    function updateStatus(gameStatus = null) {
        if (isWaitingForStart) {
            statusElement.textContent = 'Нажмите "Новая игра" для начала';
            gameInfoElement.textContent = (pcToggle && pcToggle.checked) ? 'Чтобы начать игру против ПК' : 'Чтобы начать партию';
            updateTimerDisplays();
            updateHintButtonState();
            return;
        }

        if (gameEnded) {
            const turn = ChessLogic.getTurn();
            const moveColor = turn === 'w' ? 'Белых' : 'Черных';
            const inCheck = ChessLogic.isKingInCheck(turn);
            
            const isHistoricalMove = typeof selectedAnalysisIndex !== 'undefined' && selectedAnalysisIndex !== null && selectedAnalysisIndex < analysisResults.length - 1;
            const status = (isHistoricalMove ? null : gameStatus) || (ChessLogic.getAllLegalMoves(turn).length === 0 ? 
                            (ChessLogic.isKingInCheck(turn) ? 'checkmate' : 'stalemate') : null);
                            
            if (status === 'checkmate') {
                statusElement.textContent = `МАТ! Победа ${turn === 'w' ? 'черных' : 'белых'}!`;
                gameInfoElement.textContent = 'Анализ позиции';
            } else if (status === 'stalemate') {
                statusElement.textContent = 'Ничья! Пат.';
                gameInfoElement.textContent = 'Анализ позиции';
            } else if (status === 'repetition') {
                statusElement.textContent = 'Ничья! Повторение ходов.';
                gameInfoElement.textContent = 'Анализ позиции';
            } else if (status === '50moves') {
                statusElement.textContent = 'Ничья! 50 ходов.';
                gameInfoElement.textContent = 'Анализ позиции';
            } else if (status === 'material') {
                statusElement.textContent = 'Ничья! Недостаточно фигур.';
                gameInfoElement.textContent = 'Анализ позиции';
            } else {
                statusElement.textContent = `Ход ${moveColor}${inCheck ? ' (ШАХ!)' : ''}`;
                gameInfoElement.textContent = inCheck ? 'Король под ударом!' : 'Анализ позиции';
            }
            updateTimerDisplays();
            updateHintButtonState();
            return;
        }

        const turn = ChessLogic.getTurn();
        const moveColor = turn === 'w' ? 'Белых' : 'Черных';
        const opponentColor = turn === 'w' ? 'Черные' : 'Белые';
        
        // Use provided status or check manually
        const status = gameStatus || (ChessLogic.getAllLegalMoves(turn).length === 0 ? 
                        (ChessLogic.isKingInCheck(turn) ? 'checkmate' : 'stalemate') : null);

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
            statusElement.textContent = `Ход ${moveColor}${inCheck ? ' (ШАХ!)' : ''}`;
            gameInfoElement.textContent = inCheck ? 'Король под ударом!' : 'Игра продолжается';
        }
        updateTimerDisplays();
        updateHintButtonState();
    }

    function updateHintButtonState() {
        const hintBtn = document.getElementById('hint-btn');
        if (!hintBtn) return;

        const isPlayerTurn = ChessLogic.getTurn() === playerColor;
        const isPlayerVsPC = pcToggle.checked;
        const canGetHint = isPlayerVsPC && isPlayerTurn && !gameEnded && !isWaitingForPC && !isWaitingForStart && !isCalculatingHint;

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

    function getHint() {
        if (gameEnded || isWaitingForPC || isWaitingForStart || isCalculatingHint) return;
        
        // Only allowed in player-vs-AI mode
        if (!pcToggle.checked) return;
        
        // Only allowed during player's turn
        const currentTurn = ChessLogic.getTurn();
        if (currentTurn !== playerColor) return;

        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
            hintBtn.disabled = true;
            hintBtn.innerHTML = `
                <span class="material-symbols-outlined text-sm animate-spin inline-block">sync</span>
                <span>Думаю...</span>
            `;
            hintBtn.classList.remove('hover:border-primary', 'hover:text-primary');
        }

        isCalculatingHint = true;
        const startFen = ChessLogic.getFen();

        if (typeof ChessAIManager !== 'undefined') {
            ChessAIManager.getHint(startFen).then(bestMove => {
                isCalculatingHint = false;
                restoreHintButton();
                
                // Safety check: ensure game state hasn't changed
                if (ChessLogic.getFen() !== startFen || gameEnded || isWaitingForPC) {
                    return;
                }

                if (bestMove) {
                    suggestedMove = {
                        fromRow: bestMove.fromR !== undefined ? bestMove.fromR : bestMove.fromRow,
                        fromCol: bestMove.fromC !== undefined ? bestMove.fromC : bestMove.fromCol,
                        toRow: bestMove.toR !== undefined ? bestMove.toR : bestMove.toRow,
                        toCol: bestMove.toC !== undefined ? bestMove.toC : bestMove.toCol
                    };
                    renderBoard();
                }
            }).catch(err => {
                console.error('[UI] Hint calculation error:', err);
                isCalculatingHint = false;
                restoreHintButton();
            });
        } else {
            isCalculatingHint = false;
            restoreHintButton();
        }
    }

    function restoreHintButton() {
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
            hintBtn.innerHTML = `
                <span class="material-symbols-outlined text-sm">lightbulb</span>
                <span>Подсказка</span>
            `;
            updateHintButtonState();
        }
    }

    // Removed checkGameEnd as it is now handled by updateStatus

    function performUndo(levels) {
        cancelPendingMove();

        if (stateHistory.length < levels) levels = stateHistory.length;
        if (levels === 0) return;

        // Stop the timer during the rollback process
        stopTimer();

        let previousState;
        const gameHasTimeControl = parseTimeControl().time > 0;

        for (let i = 0; i < levels; i++) {
            previousState = stateHistory.pop();
            // Subtract the increment that was added to the player when they made the move
            if (previousState && gameHasTimeControl) {
                const turn = previousState.boardState.turn || 'w';
                if (turn === 'w') {
                    whiteTimeLeft = Math.max(0.1, whiteTimeLeft - increment);
                } else {
                    blackTimeLeft = Math.max(0.1, blackTimeLeft - increment);
                }
            }
        }

        if (previousState) {
            ChessLogic.loadState(previousState.boardState);
            
            // If we have completely rolled back to the initial state (before the first move),
            // reset the timers to the full starting time.
            if (stateHistory.length === 0 && gameHasTimeControl) {
                const tc = parseTimeControl();
                whiteTimeLeft = tc.time;
                blackTimeLeft = tc.time;
                increment = tc.inc;
            } else {
                increment = previousState.timers.inc;
            }

            if (previousState.timers.running) {
                startTimer();
            }
            
            historyListElement.innerHTML = previousState.history;
            moveCount = previousState.moveCount;
            capturedByWhite = previousState.captures.white;
            capturedByBlack = previousState.captures.black;
            lastMove = convertToUiMove(previousState.lastMove || (previousState.boardState && previousState.boardState.gameHistory && previousState.boardState.gameHistory.length
                ? previousState.boardState.gameHistory[previousState.boardState.gameHistory.length - 1].move
                : null));
            
            selectedSquare = null;
            gameEnded = false;
            suggestedMove = null;
            
            cachedLegalDests = null;
            cachedLegalDestsSquare = null;
            updateCapturesDisplay();
            renderBoard();
            updateStatus();
            updateTimerDisplays();
        }
    }

    function updateAnalysisTabVisibility() {
        const tabBtnAnalysis = document.getElementById('tab-btn-analysis');
        if (!tabBtnAnalysis) return;
        
        if (gameEnded) {
            tabBtnAnalysis.style.display = '';
        } else {
            tabBtnAnalysis.style.display = 'none';
            const tabContentAnalysis = document.getElementById('tab-content-analysis');
            if (tabContentAnalysis && !tabContentAnalysis.classList.contains('hidden')) {
                if (typeof switchTab === 'function') switchTab('notation');
            }
        }
    }

    function hideAnalysis() {
        if (analysisPanel) analysisPanel.style.display = 'none';
        if (analysisList) analysisList.innerHTML = '';
        if (analysisProgress) analysisProgress.textContent = '';
        if (stockfishTip) {
            stockfishTip.textContent = '';
            stockfishTip.style.display = 'none';
        }
        analysisSnapshot = null;
        suggestedMove = null;
        if (typeof AnalysisManager !== 'undefined' && typeof AnalysisManager.stopAnalysis === 'function') {
            AnalysisManager.stopAnalysis();
        }
        updateAnalysisTabVisibility();
    }

    function startAnalysis() {
        if (switchTab) switchTab('analysis');
        if (analysisBtn) analysisBtn.style.display = 'none';
        if (analysisPanel) analysisPanel.style.display = 'block';
        
        if (isFileProtocol) {
            if (analysisProgress) {
                analysisProgress.innerHTML = `<span class="text-error font-semibold block text-center py-4">Анализ недоступен при открытии файла напрямую через браузер.<br>Пожалуйста, запустите через Electron (npm start) или локальный веб-сервер.</span>`;
            }
            return;
        }

        if (analysisProgress) analysisProgress.textContent = 'Подготовка к анализу...';
        if (analysisList) analysisList.innerHTML = '';
        if (stockfishTip) {
            stockfishTip.textContent = '';
            stockfishTip.style.display = 'none';
        }

        const history = ChessLogic.getGameHistory();
        const sessionId = currentAnalysisSessionId;
        
        AnalysisManager.analyzeGame(history, (current, total) => {
            if (sessionId !== currentAnalysisSessionId) return;
            const progress = (current / total) * 100;
            if (analysisProgress) analysisProgress.innerHTML = `
                <div class="w-full bg-surface-container-highest rounded overflow-hidden mt-1" style="height: 4px;">
                    <div class="bg-primary h-full transition-all duration-300" style="width: ${Math.round(progress)}%;"></div>
                </div>
                <div style="text-align: right; margin-top: 2px;">${Math.round(progress)}%</div>
            `;
        }, (stats) => {
            if (sessionId !== currentAnalysisSessionId) return;
            if (analysisProgress) analysisProgress.textContent = 'Анализ завершен!';
            analysisResults = stats.moves;
            renderAnalysisList();
            displayAccuracyStats(stats);
        });
    }

    function startAutomaticBackgroundAnalysis() {
        if (isFileProtocol) return;
        
        const history = ChessLogic.getGameHistory();
        if (history.length === 0) return;

        // Reset and show accuracy bar container with loading state
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
        safeSetTimeout(renderBoard, 0);

        if (analysisProgress) analysisProgress.textContent = 'Подготовка к анализу...';
        if (analysisList) analysisList.innerHTML = '';
        if (stockfishTip) {
            stockfishTip.textContent = '';
            stockfishTip.style.display = 'none';
        }
        if (analysisBtn) analysisBtn.style.display = 'none';
        if (analysisPanel) analysisPanel.style.display = 'block';

        const sessionId = currentAnalysisSessionId;
        if (typeof AnalysisManager !== 'undefined') {
            AnalysisManager.analyzeGame(history, (current, total) => {
                if (sessionId !== currentAnalysisSessionId) return;
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
                if (sessionId !== currentAnalysisSessionId) return;
                if (analysisProgress) analysisProgress.textContent = 'Анализ завершен!';
                if (accuracyBarContainer) {
                    accuracyBarContainer.classList.remove('animate-pulse');
                }
                analysisResults = stats.moves;
                renderAnalysisList();
                displayAccuracyStats(stats);
            });
        }
    }

    function displayAccuracyStats(stats) {
        if (analysisProgress) {
            const w = stats.summary.white;
            const b = stats.summary.black;
            
            const renderStats = (s, color) => `
                <div class="analysis-stats-row ${color === 'w' ? 'white' : 'black'}">
                    <strong>${color === 'w' ? 'Белые' : 'Черные'}:</strong> 
                    <span class="quality-badge brilliant" title="Блестящий ход (!!)">${s.brilliant}</span>
                    <span class="quality-badge best" title="Лучший ход (★)">${s.best}</span>
                    <span class="quality-badge excellent" title="Отличный ход (!)">${s.excellent}</span>
                    <span class="quality-badge good" title="Хороший ход (+)">${s.good}</span>
                    <span class="quality-badge inaccuracy" title="Неточность (?!)">${s.inaccuracy}</span>
                    <span class="quality-badge mistake" title="Ошибка (?)">${s.mistake}</span>
                    <span class="quality-badge blunder" title="Зевок (??)">${s.blunder}</span>
                </div>
            `;
            
            analysisProgress.innerHTML = `
                <div class="analysis-accuracy-header">Точность: 
                    <span class="white-acc">Б: ${stats.whiteAccuracy}%</span> | 
                    <span class="black-acc">Ч: ${stats.blackAccuracy}%</span>
                </div>
                ${renderStats(w, 'w')}
                ${renderStats(b, 'b')}
            `;
        }
        
        const topAcc = document.getElementById('top-accuracy');
        const bottomAcc = document.getElementById('bottom-accuracy');
        
        if (topAcc && bottomAcc) {
            const isWhiteBottom = playerColor === 'w';
            const whiteValue = `${stats.whiteAccuracy}%`;
            const blackValue = `${stats.blackAccuracy}%`;
            
            if (isWhiteBottom) {
                bottomAcc.textContent = whiteValue;
                topAcc.textContent = blackValue;
            } else {
                bottomAcc.textContent = blackValue;
                topAcc.textContent = whiteValue;
            }
            
            topAcc.style.display = 'inline-block';
            bottomAcc.style.display = 'inline-block';
        }

        let whitePct = 50;
        let blackPct = 50;
        if (stats.whiteAccuracy > 0 || stats.blackAccuracy > 0) {
            const total = stats.whiteAccuracy + stats.blackAccuracy;
            whitePct = (stats.whiteAccuracy / total) * 100;
            blackPct = 100 - whitePct;
        }

        // Show accuracy bar and set heights
        if (accuracyBarContainer) {
            accuracyBarContainer.style.display = 'flex';
            accuracyBarContainer.classList.remove('animate-pulse');
        }
        if (accuracyWhiteBar) {
            accuracyWhiteBar.style.height = whitePct + '%';
            accuracyWhiteBar.title = `Точность Белых: ${stats.whiteAccuracy}%`;
        }
        if (accuracyBlackBar) {
            accuracyBlackBar.style.height = blackPct + '%';
            accuracyBlackBar.title = `Точность Черных: ${stats.blackAccuracy}%`;
        }
        safeSetTimeout(renderBoard, 0);
    }

    function parseUciMove(uci) {
        if (!uci || uci.length < 4) return null;
        const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
        return {
            fromCol: files[uci[0]],
            fromRow: 8 - parseInt(uci[1]),
            toCol: files[uci[2]],
            toRow: 8 - parseInt(uci[3])
        };
    }

    function renderAnalysisList() {
        if (!analysisList) return;
        analysisList.innerHTML = '';
        
        analysisResults.forEach((result, index) => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            
            const num = Math.floor(index / 2) + 1;
            const turnStr = index % 2 === 0 ? 'Белые' : 'Черные';
            
            let qualityHtml = '';
            if (result.quality) {
                qualityHtml = `<span class="quality-badge ${result.qualityClass}" style="margin-left:5px;">${result.quality}</span>`;
            }
            
            const accuracyHtml = `<span class="text-primary" style="margin-left: 5px; font-size:0.85em; font-weight: bold;">${result.accuracy}%</span>`;
            
            li.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
                    <strong style="width:30px;">${num}.</strong>
                    <span style="flex:1;">${result.move.uci}</span>
                    ${qualityHtml}
                    ${accuracyHtml}
                </div>
            `;
            
            li.addEventListener('click', () => {
                selectAnalysisMove(index);
                // Highlight selection
                Array.from(analysisList.children).forEach(child => child.style.backgroundColor = 'transparent');
                li.style.backgroundColor = 'rgba(128, 128, 128, 0.2)';
            });
            
            analysisList.appendChild(li);
        });
    }

    function selectAnalysisMove(index) {
        selectedAnalysisIndex = index;
        const result = analysisResults[index];
        if (!result) return;
        
        const isBadMove = result.qualityClass === 'inaccuracy' || 
                          result.qualityClass === 'mistake' || 
                          result.qualityClass === 'blunder';
        
        // For inaccuracies/mistakes/blunders, load position BEFORE the move so active turn matches recommended correction move.
        // For good/best/brilliant moves, load position AFTER the move to show opponent's best response.
        const fenToLoad = (isBadMove && result.beforeFen) ? result.beforeFen : result.fen;
        ChessLogic.loadFen(fenToLoad, { keepHistory: true, skipRecord: true });
        
        const currentTurn = ChessLogic.getTurn(); // 'w' or 'b'
        analysisSnapshot = { turn: currentTurn };
        
        const uiMove = result.move ? convertToUiMove(result.move) : null;
        lastMove = (isBadMove && result.beforeFen) ? null : uiMove;
        
        const formatMove = (uci) => {
            if (!uci || uci === '(none)') return '';
            return uci.replace(/([a-h][1-8])([a-h][1-8])/, '$1-$2');
        };

        const turnLabel = currentTurn === 'w' ? 'Белых' : 'Чёрных';
        
        let tipText = '';
        if (isBadMove) {
            const playedUci = (result.move && result.move.uci) ? formatMove(result.move.uci) : '';
            if (result.bestmove && result.bestmove !== '(none)') {
                const bestStr = formatMove(result.bestmove);
                tipText = playedUci 
                    ? `Вместо ${playedUci} лучшим ходом за ${turnLabel} было: ${bestStr}`
                    : `Лучший ход за ${turnLabel}: ${bestStr}`;
                suggestedMove = parseUciMove(result.bestmove);
            } else {
                suggestedMove = null;
            }
        } else {
            if (result.nextBestMove && result.nextBestMove !== '(none)') {
                const nextBestStr = formatMove(result.nextBestMove);
                tipText = `Лучший ответ за ${turnLabel}: ${nextBestStr}`;
                suggestedMove = parseUciMove(result.nextBestMove);
            } else {
                suggestedMove = null;
            }
        }
        
        if (stockfishTip) {
            stockfishTip.textContent = tipText;
            stockfishTip.style.display = tipText ? 'flex' : 'none';
        }
        
        selectedSquare = (isBadMove && result.beforeFen) ? null : (uiMove ? { row: uiMove.fromRow, col: uiMove.fromCol } : null);
        
        updateStatus();
        renderBoard();
    }

    // --- Save/Load Feature Core Logic ---
    const SAVE_SLOTS_KEY_PREFIX = 'modular-chess-save-slot-';

    function serializeGameState() {
        return {
            boardState: ChessLogic.getState(),
            timers: {
                white: whiteTimeLeft,
                black: blackTimeLeft,
                inc: increment,
                running: isTimerRunning
            },
            history: historyListElement.innerHTML,
            moveCount: moveCount,
            captures: {
                white: [...capturedByWhite],
                black: [...capturedByBlack]
            },
            lastMove: lastMove ? { ...lastMove } : null,
            stateHistory: stateHistory.map(entry => ({
                ...entry,
                boardState: entry.boardState ? { ...entry.boardState } : null,
                lastMove: entry.lastMove ? { ...entry.lastMove } : null
            })),
            settings: {
                pcToggle: pcToggle.checked,
                difficulty: difficultySelect.value,
                timeControl: timeControlSelect.value,
                customMins: customMinsInput ? customMinsInput.value : '',
                customInc: customIncInput ? customIncInput.value : '',
                playerColor: playerColor,
                pcColor: pcColor,
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

        clearPendingTimers();
        
        // Restore chess logic state
        const ok = ChessLogic.loadState(saveObj.boardState);
        if (!ok) return false;

        // Restore settings
        pcToggle.checked = saveObj.settings.pcToggle;
        updateGameModeControlState();
        if (sideSelect && saveObj.settings.chosenSide) {
            sideSelect.value = saveObj.settings.chosenSide;
        }
        difficultySelect.value = saveObj.settings.difficulty;
        timeControlSelect.value = saveObj.settings.timeControl;
        if (timeControlSelect.value === 'custom') {
            customTimeInputs.style.display = 'flex';
        } else {
            customTimeInputs.style.display = 'none';
        }
        if (customMinsInput && saveObj.settings.customMins) {
            customMinsInput.value = saveObj.settings.customMins;
        }
        if (customIncInput && saveObj.settings.customInc) {
            customIncInput.value = saveObj.settings.customInc;
        }
        playerColor = saveObj.settings.playerColor || 'w';
        pcColor = saveObj.settings.pcColor || 'b';

        // Restore timers
        whiteTimeLeft = saveObj.timers.white;
        blackTimeLeft = saveObj.timers.black;
        increment = saveObj.timers.inc;
        isTimerRunning = false;
        updateTimerDisplays();

        // Restore notation and history
        historyListElement.innerHTML = saveObj.history || '';
        moveCount = saveObj.moveCount || 1;
        stateHistory = saveObj.stateHistory || [];

        // Restore captures
        capturedByWhite = saveObj.captures ? [...(saveObj.captures.white || [])] : [];
        capturedByBlack = saveObj.captures ? [...(saveObj.captures.black || [])] : [];
        updateCapturesDisplay();

        // Restore lastMove
        lastMove = saveObj.lastMove;

        // Resets
        currentAnalysisSessionId++;
        selectedSquare = null;
        isWaitingForPC = false;
        isWaitingForStart = false;
        gameEnded = false;
        analysisResults = [];
        selectedAnalysisIndex = null;
        suggestedMove = null;
        analysisSnapshot = null;
        if (animationLayer) animationLayer.innerHTML = '';
        hideAnalysis();

        // Reset accuracy UI
        if (accuracyBarContainer) accuracyBarContainer.style.display = 'none';
        if (accuracyWhiteBar) accuracyWhiteBar.style.height = '50%';
        if (accuracyBlackBar) accuracyBlackBar.style.height = '50%';
        document.getElementById('top-accuracy').style.display = 'none';
        document.getElementById('bottom-accuracy').style.display = 'none';
        safeSetTimeout(renderBoard, 0);

        updateResignButtonState();
        if (document.getElementById('draw-btn')) {
            const drawBtn = document.getElementById('draw-btn');
            drawBtn.disabled = false;
            drawBtn.style.display = (networkState && networkState.connected) ? 'block' : 'none';
        }
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = false;

        // Update player labels
        if (pcToggle.checked) {
            bottomPlayerName.textContent = 'Вы';
            topPlayerName.textContent = getStockfishName();
        } else if (networkState && networkState.connected) {
            bottomPlayerName.textContent = 'Вы';
            topPlayerName.textContent = 'Соперник';
        } else {
            bottomPlayerName.textContent = 'Белые';
            topPlayerName.textContent = 'Черные';
        }

        updateGameFormatBadge();
        updateStatus();

        // Start timer if it was running
        stopTimer();
        if (saveObj.timers.running && !gameEnded) {
            startTimer();
        }

        // Trigger AI if it's PC's turn
        if (pcToggle.checked && ChessLogic.getTurn() === pcColor && !gameEnded) {
            isWaitingForPC = true;
            if (pcMoveTimeoutId) cancelPendingMove();
            pcMoveTimeoutId = safeSetTimeout(makePCMove, 600);
        }

        renderBoard();
        updateAnalysisTabVisibility();
        return true;
    }

    function getSaveSlot(slotNum) {
        if (typeof ChessStorage !== 'undefined') {
            return ChessStorage.getSaveSlot(slotNum);
        }
        try {
            const data = localStorage.getItem(SAVE_SLOTS_KEY_PREFIX + slotNum);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error loading save slot ' + slotNum, e);
            return null;
        }
    }

    function saveToSlot(slotNum) {
        try {
            const saveObj = serializeGameState();
            if (typeof ChessStorage !== 'undefined') {
                ChessStorage.setSaveSlot(slotNum, saveObj);
            } else {
                localStorage.setItem(SAVE_SLOTS_KEY_PREFIX + slotNum, JSON.stringify(saveObj));
            }
            updateSlotsUI();
        } catch (e) {
            console.error('Error saving to slot ' + slotNum, e);
            alert('Ошибка при сохранении игры!');
        }
    }

    function loadFromSlot(slotNum) {
        const saveObj = getSaveSlot(slotNum);
        if (!saveObj) {
            alert('Слот пуст!');
            return;
        }
        
        if (networkState && networkState.connected) {
            alert('Загрузка игр отключена во время сетевого матча.');
            return;
        }

        if (deserializeGameState(saveObj)) {
            closeSaveLoadModal();
        } else {
            alert('Ошибка при загрузке сохраненной игры!');
        }
    }

    function deleteSlot(slotNum) {
        if (confirm('Вы действительно хотите удалить сохранение из Слота ' + slotNum + '?')) {
            if (typeof ChessStorage !== 'undefined') {
                ChessStorage.deleteSaveSlot(slotNum);
            } else {
                localStorage.removeItem(SAVE_SLOTS_KEY_PREFIX + slotNum);
            }
            updateSlotsUI();
        }
    }

    function updateSlotsUI() {
        for (let i = 1; i <= 3; i++) {
            const slotEl = document.getElementById(`slot-${i}`);
            if (!slotEl) continue;

            const saveObj = getSaveSlot(i);
            const timeEl = slotEl.querySelector('.slot-time');
            const detailsEl = slotEl.querySelector('.slot-details');
            const modeEl = slotEl.querySelector('.slot-mode');
            const movesEl = slotEl.querySelector('.slot-moves');
            const loadBtn = slotEl.querySelector('.slot-load-btn');
            const deleteBtn = slotEl.querySelector('.slot-delete-btn');

            if (saveObj) {
                const date = new Date(saveObj.date);
                timeEl.textContent = date.toLocaleString('ru-RU', { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                const isPC = saveObj.settings.pcToggle;
                modeEl.textContent = isPC ? 'Против ИИ' : 'Два игрока';
                movesEl.textContent = Math.floor((saveObj.moveCount || 1) / 2) + 1;
                
                detailsEl.classList.remove('hidden');
                
                loadBtn.disabled = networkState && networkState.connected;
                loadBtn.classList.remove('text-on-surface-variant');
                loadBtn.classList.add('text-on-surface', 'hover:border-primary', 'hover:text-primary');
                deleteBtn.classList.remove('hidden');
            } else {
                timeEl.textContent = 'Пусто';
                detailsEl.classList.add('hidden');
                loadBtn.disabled = true;
                loadBtn.classList.add('text-on-surface-variant');
                loadBtn.classList.remove('text-on-surface', 'hover:border-primary', 'hover:text-primary');
                deleteBtn.classList.add('hidden');
            }
        }
    }

    function openSaveLoadModal() {
        const modal = document.getElementById('save-load-modal');
        if (modal) {
            updateSlotsUI();
            
            const saveBtns = modal.querySelectorAll('.slot-save-btn');
            const loadBtns = modal.querySelectorAll('.slot-load-btn');
            
            saveBtns.forEach(btn => {
                btn.disabled = false;
            });
            loadBtns.forEach((btn, idx) => {
                const saveObj = getSaveSlot(idx + 1);
                btn.disabled = !saveObj || (networkState && networkState.connected);
            });
            
            modal.style.display = 'flex';
        }
    }

    function closeSaveLoadModal() {
        const modal = document.getElementById('save-load-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function exportToJSON() {
        try {
            const saveObj = serializeGameState();
            const jsonString = JSON.stringify(saveObj, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            const movesNum = Math.floor((saveObj.moveCount || 1) / 2);
            a.href = url;
            a.download = `modular-chess-save-${dateStr}-move-${movesNum}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error exporting game state', e);
            alert('Ошибка при экспорте игры!');
        }
    }

    function importFromJSON(event) {
        if (networkState && networkState.connected) {
            alert('Импорт игр отключен во время сетевого матча.');
            return;
        }

        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const saveObj = JSON.parse(e.target.result);
                if (deserializeGameState(saveObj)) {
                    alert('Игра успешно импортирована!');
                } else {
                    alert('Некорректный файл сохранения!');
                }
            } catch (err) {
                console.error('Error parsing imported JSON', err);
                alert('Не удалось прочитать файл сохранения!');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    return {
        init,
        clearPendingTimers,
        cancelPendingMove,
        applyRemoteMove(move) {
            if (move.timers) {
                whiteTimeLeft = move.timers.white;
                blackTimeLeft = move.timers.black;
                increment = move.timers.inc;
                if (!isTimerRunning && move.timers.running) startTimer();
                updateTimerDisplays();
            }
            const ok = executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol, true);
            if (ok) renderBoard();
            return ok;
        },
        syncState(state) {
            isRemoteAction = true;
            const ok = ChessLogic.loadState(state);
            isRemoteAction = false;
            if (ok) {
                const history = state && state.gameHistory ? state.gameHistory : [];
                lastMove = history.length ? convertToUiMove(history[history.length - 1].move) : null;
                renderBoard();
            }
            return ok;
        }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChessUI;
}

document.addEventListener('DOMContentLoaded', () => {
    ChessUI.init();
});
