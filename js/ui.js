/**
 * Chess UI Module
 * Handles rendering, user interaction, AI opponent, timers, and settings.
 */

const ChessUI = (() => {
    let boardElement, boardContainer, animationLayer, statusElement, gameInfoElement, historyListElement, resetBtn, pcToggle, difficultySelect;
    let timeControlSelect, customTimeInputs, customMinsInput, customIncInput, themeSelect;
    let topPlayerName, bottomPlayerName, topTimerDisplay, bottomTimerDisplay, topTimerContainer, bottomTimerContainer;
    let analysisBtn, analysisPanel, analysisList, analysisProgress, stockfishTip;
    let gameConditionBadge;
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
    let playerColor = 'w'; 
    let pcColor = 'b';     
    let stateHistory = [];     
    let isSoundMuted = false;
    let soundVolume = 0.5;

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

    // Capture tracking
    let capturedByWhite = []; // pieces white captured (black pieces)
    let capturedByBlack = []; // pieces black captured (white pieces)
    let topCapturedEl, bottomCapturedEl, topAdvantageEl, bottomAdvantageEl;

    const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

    const PIECE_UNICODE = {
        'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
        'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
    };

    function convertToUiMove(move) {
        if (!move) return null;
        return {
            fromRow: move.fromRow !== undefined ? move.fromRow : move.fR,
            fromCol: move.fromCol !== undefined ? move.fromCol : move.fC,
            toRow: move.toRow !== undefined ? move.toRow : move.tR,
            toCol: move.toCol !== undefined ? move.toCol : move.tC
        };
    }

    const ChessAudio = (() => {
        let context = null;

        function getContext() {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            if (!context) context = new AudioCtx();
            if (context.state === 'suspended') context.resume().catch(() => {});
            return context;
        }

        function playTone({ type, startFreq, endFreq, duration, volume, delay = 0 }) {
            if (isSoundMuted) return;
            const ctx = getContext();
            if (!ctx) return;

            const startAt = ctx.currentTime + delay;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, startAt);
            if (endFreq && endFreq !== startFreq) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startAt + duration);
            }

            const targetVolume = volume * soundVolume;
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(targetVolume, startAt + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startAt);
            osc.stop(startAt + duration + 0.03);
        }

        return {
            getContext,
            move() {
                playTone({ type: 'sine', startFreq: 240, endFreq: 180, duration: 0.09, volume: 0.15 });
            },
            capture() {
                playTone({ type: 'triangle', startFreq: 170, endFreq: 115, duration: 0.07, volume: 0.25 });
                playTone({ type: 'square', startFreq: 96, endFreq: 72, duration: 0.12, volume: 0.08, delay: 0.04 });
            },
            check() {
                // Более выразительный и громкий звук шаха
                playTone({ type: 'sawtooth', startFreq: 400, endFreq: 600, duration: 0.12, volume: 0.3 });
                playTone({ type: 'sine', startFreq: 800, endFreq: 700, duration: 0.15, volume: 0.2, delay: 0.05 });
            }
        };
    })();

    let isRemoteAction = false;

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

        const flyPiece = document.createElement('div');
        flyPiece.className = `piece piece-fly ${piece === piece.toLowerCase() ? 'black-piece' : ''}`;
        flyPiece.textContent = PIECE_UNICODE[piece];
        flyPiece.style.width = `${squareSize}px`;
        flyPiece.style.height = `${squareSize}px`;
        flyPiece.style.left = `${fC * squareSize}px`;
        flyPiece.style.top = `${fR * squareSize}px`;
        flyPiece.style.transform = 'translate3d(0, 0, 0)';
        flyPiece.style.opacity = '1';
        
        // Font size settings to match pieces
        flyPiece.style.fontSize = `${squareSize * 0.75}px`;
        flyPiece.style.display = 'flex';
        flyPiece.style.alignItems = 'center';
        flyPiece.style.justifyContent = 'center';
        
        layer.appendChild(flyPiece);

        requestAnimationFrame(() => {
            const dx = (tC - fC) * squareSize;
            const dy = (tR - fR) * squareSize;
            flyPiece.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;
        });

        flyPiece.addEventListener('transitionend', () => {
            flyPiece.remove();
        }, { once: true });

        window.setTimeout(() => {
            if (flyPiece.isConnected) flyPiece.remove();
        }, 320);
    }

    function init() {
        console.log("Chess UI Initializing... [Version v40]");
        
        if (typeof ChessWASM !== 'undefined') {
            ChessWASM.init().then(success => {
                console.log('[UI] ChessWASM initialized successfully:', success);
            }).catch(err => {
                console.warn('[UI] ChessWASM failed to initialize:', err);
            });
        }
        
        boardContainer = document.getElementById('board-container');
        boardElement = document.getElementById('chessboard');
        
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
                if (isWaitingForPC || gameEnded || analysisSnapshot) return;
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
            
            canvas.addEventListener('mousemove', (event) => {
                if (isWaitingForPC || gameEnded || analysisSnapshot) {
                    if (hoverSquare) {
                        hoverSquare = null;
                        renderBoard();
                    }
                    return;
                }
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
            });
            
            canvas.addEventListener('mouseleave', () => {
                if (hoverSquare) {
                    hoverSquare = null;
                    renderBoard();
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
            const ctx = ChessAudio.getContext ? ChessAudio.getContext() : null;
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
                    const diffContainer = document.getElementById('difficulty-container');
                    if (diffContainer) diffContainer.style.display = 'none';
                    startNewGame(); 
                    
                    SocketTransport.init(roomId, serverUrl);
                } catch (e) {
                    console.error('Network Error:', e);
                }
            }

            // Настройка красивого HTML модального окна для комнаты
            const networkRoomModal = document.getElementById('network-room-modal');
            const networkRoomInput = document.getElementById('network-room-input');
            const networkRoomConfirmBtn = document.getElementById('network-room-confirm-btn');
            const networkRoomCancelBtn = document.getElementById('network-room-cancel-btn');
            const networkRoomCloseBtn = document.getElementById('network-room-close-btn');

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
                setTimeout(() => {
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
                
                // Update network button based on state
                const networkBtn = document.getElementById('network-btn');
                if (networkBtn) {
                    if (networkState.connected) {
                        networkBtn.textContent = `Покинуть комнату${networkState.roomId ? ' (' + networkState.roomId + ')' : ''}`;
                        networkBtn.classList.add('leave-room-btn');
                    } else {
                        networkBtn.textContent = 'Играть по сети';
                        networkBtn.classList.remove('leave-room-btn');
                    }
                }
                
                updateOpponentAvatar();
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
                if (playerColor === 'w') {
                    bottomPlayerName.textContent = 'Вы (Белые)';
                    topPlayerName.textContent = 'Соперник (Черные)';
                } else {
                    bottomPlayerName.textContent = 'Вы (Черные)';
                    topPlayerName.textContent = 'Соперник (Белые)';
                }
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
            ChessNetwork.on('undoResponse', accepted => {
                if (accepted !== false) {
                    performUndo(accepted);
                } else {
                    alert('Соперник отказался отменить ход.');
                    updateStatus();
                }
            });

            ChessNetwork.on('resign', () => {
                const opponentColor = playerColor === 'w' ? 'b' : 'w';
                finishGame('resign', opponentColor);
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
                if (accepted) {
                    finishGame('draw');
                } else {
                    alert('Соперник отклонил ничью.');
                    updateStatus();
                }
            });
        }

        // Event Listeners
        resetBtn.addEventListener('click', startNewGame);
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
                startNewGame();
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
            document.getElementById('difficulty-container').style.display = pcToggle.checked ? '' : 'none';
            topPlayerName.textContent = pcToggle.checked ? 'ПК Оппонент' : 'Игрок 2';
            startNewGame();
        });

        timeControlSelect.addEventListener('change', () => {
            if (timeControlSelect.value === 'custom') {
                customTimeInputs.style.display = 'flex';
            } else {
                customTimeInputs.style.display = 'none';
            }
            startNewGame();
        });

        if (customMinsInput) {
            customMinsInput.addEventListener('input', updateGameFormatBadge);
        }
        if (customIncInput) {
            customIncInput.addEventListener('input', updateGameFormatBadge);
        }

        if (themeSelect) {
            themeSelect.addEventListener('change', updateTheme);
            const savedBoardTheme = localStorage.getItem('board-theme') || 'classic';
            themeSelect.value = savedBoardTheme;
        }

        // UI Theme Selector (Light / Dark Theme)
        const uiThemeSelect = document.getElementById('ui-theme-select');
        if (uiThemeSelect) {
            uiThemeSelect.addEventListener('change', () => {
                const uiTheme = uiThemeSelect.value;
                if (uiTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('ui-theme', 'dark');
                } else {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('ui-theme', 'light');
                }
            });

            // Restore from localStorage or default to dark
            const savedTheme = localStorage.getItem('ui-theme') || 'dark';
            uiThemeSelect.value = savedTheme;
            if (savedTheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
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
                setTimeout(() => {
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

        // Restore sound settings from localStorage
        const savedSoundMuted = localStorage.getItem('sound-muted') === 'true';
        const savedSoundVolume = localStorage.getItem('sound-volume');
        
        isSoundMuted = savedSoundMuted;
        if (savedSoundVolume !== null) {
            soundVolume = parseFloat(savedSoundVolume);
        } else {
            soundVolume = 0.5;
        }

        if (soundToggle) {
            soundToggle.checked = !isSoundMuted;
            soundToggle.addEventListener('change', () => {
                isSoundMuted = !soundToggle.checked;
                localStorage.setItem('sound-muted', isSoundMuted);
            });
        }
        if (soundVolumeSlider && volumeValDisplay) {
            soundVolumeSlider.value = Math.round(soundVolume * 100);
            volumeValDisplay.textContent = `${soundVolumeSlider.value}%`;
            soundVolumeSlider.addEventListener('input', () => {
                soundVolume = parseInt(soundVolumeSlider.value) / 100;
                volumeValDisplay.textContent = `${soundVolumeSlider.value}%`;
                localStorage.setItem('sound-volume', soundVolume);
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

        // Set receiver for chat messages
        if (typeof ChessNetwork !== 'undefined') {
            ChessNetwork.receiveChatMessage = (text) => {
                appendChatMessage('Соперник', text);
                switchTab('chat');
            };
        }

        // Tab switching logic for Right Panel
        const tabBtnNotation = document.getElementById('tab-btn-notation');
        const tabBtnStats = document.getElementById('tab-btn-stats');
        const tabBtnAnalysis = document.getElementById('tab-btn-analysis');
        const tabBtnChat = document.getElementById('tab-btn-chat');
        
        const tabContentNotation = document.getElementById('tab-content-notation');
        const tabContentStats = document.getElementById('tab-content-stats');
        const tabContentAnalysis = document.getElementById('tab-content-analysis');
        const tabContentChat = document.getElementById('tab-content-chat');
        
        switchTab = function(activeTab) {
            const btns = [tabBtnNotation, tabBtnStats, tabBtnAnalysis, tabBtnChat];
            const contents = [tabContentNotation, tabContentStats, tabContentAnalysis, tabContentChat];
            
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
            } else if (activeTab === 'stats') {
                if (tabBtnStats) {
                    tabBtnStats.classList.add('border-primary', 'text-primary', 'font-bold');
                    tabBtnStats.classList.remove('border-transparent', 'text-on-surface-variant', 'font-semibold');
                }
                if (tabContentStats) tabContentStats.classList.remove('hidden');
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
        if (tabBtnStats) tabBtnStats.addEventListener('click', () => switchTab('stats'));
        if (tabBtnAnalysis) tabBtnAnalysis.addEventListener('click', () => switchTab('analysis'));
        if (tabBtnChat) tabBtnChat.addEventListener('click', () => switchTab('chat'));
        
        // Subscribe to logic changes
        ChessLogic.subscribe(state => {
            renderBoard();
            updateStatus(state.status);
            
            // Auto PC move if it's PC's turn
            if (pcToggle.checked && state.turn !== playerColor && !gameEnded && !isWaitingForPC) {
                pcMoveTimeoutId = setTimeout(makePCMove, 500);
            }
        });

        // Save/Load feature event listeners
        const saveGameBtn = document.getElementById('save-game-btn');
        const loadGameBtn = document.getElementById('load-game-btn');
        const saveLoadCloseBtn = document.getElementById('save-load-close-btn');
        const saveLoadModal = document.getElementById('save-load-modal');
        const exportJsonBtn = document.getElementById('export-json-btn');
        const importJsonBtn = document.getElementById('import-json-btn');
        const importFileInput = document.getElementById('import-file-input');

        if (saveGameBtn) saveGameBtn.addEventListener('click', openSaveLoadModal);
        if (loadGameBtn) loadGameBtn.addEventListener('click', openSaveLoadModal);
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

        updateTheme();
        startNewGame();
    }

    function updateTheme() {
        const theme = themeSelect.value;
        const root = document.documentElement;
        root.style.setProperty('--board-light', `var(--${theme}-light)`);
        root.style.setProperty('--board-dark', `var(--${theme}-dark)`);
        root.style.setProperty('--board-coord-light', `var(--${theme}-coord-light)`);
        root.style.setProperty('--board-coord-dark', `var(--${theme}-coord-dark)`);
        localStorage.setItem('board-theme', theme);
        renderBoard();
    }

    function updateOpponentAvatar() {
        const opponentAvatarIcon = document.getElementById('opponent-avatar-icon');
        const opponentAvatarContainer = document.getElementById('opponent-avatar-container');
        
        if (!opponentAvatarIcon || !opponentAvatarContainer) return;
        
        const isPC = (pcToggle && pcToggle.checked);
        
        if (isPC) {
            opponentAvatarIcon.textContent = 'smart_toy';
            opponentAvatarContainer.className = "w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center shadow-md";
        } else {
            opponentAvatarIcon.textContent = 'person';
            opponentAvatarContainer.className = "w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-primary-container/20 border border-primary/20 flex items-center justify-center shadow-md";
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

    function startNewGame() {
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.style.display = 'none';

        ChessLogic.initBoard();
        moveCount = 1;
        stateHistory = [];
        if (pcMoveTimeoutId) clearTimeout(pcMoveTimeoutId);
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
        capturedByWhite = [];
        capturedByBlack = [];
        
        // Reset accuracies stats
        const statsWhiteText = document.getElementById('stats-white-accuracy-text');
        const statsWhiteBar = document.getElementById('stats-white-accuracy-bar');
        const statsBlackText = document.getElementById('stats-black-accuracy-text');
        const statsBlackBar = document.getElementById('stats-black-accuracy-bar');
        
        if (statsWhiteText) statsWhiteText.textContent = `--%`;
        if (statsWhiteBar) statsWhiteBar.style.width = `0%`;
        if (statsBlackText) statsBlackText.textContent = `--%`;
        if (statsBlackBar) statsBlackBar.style.width = `0%`;
        
        if (switchTab) switchTab('notation');
        updateCapturesDisplay();
        
        document.getElementById('top-accuracy').style.display = 'none';
        document.getElementById('bottom-accuracy').style.display = 'none';

        if (document.getElementById('resign-btn')) document.getElementById('resign-btn').disabled = false;
        if (document.getElementById('draw-btn')) {
            const drawBtn = document.getElementById('draw-btn');
            drawBtn.disabled = false;
            drawBtn.style.display = (networkState && networkState.connected) ? 'block' : 'none';
        }
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = false;

        // Colors
        if (pcToggle.checked) {
            playerColor = Math.random() < 0.5 ? 'w' : 'b';
            pcColor = playerColor === 'w' ? 'b' : 'w';
            bottomPlayerName.textContent = playerColor === 'w' ? 'Вы (Белые)' : 'Вы (Черные)';
            topPlayerName.textContent = `ПК (${pcColor === 'w' ? 'Белые' : 'Черные'})`;
        } else if (networkState && networkState.connected) {
            bottomPlayerName.textContent = playerColor === 'w' ? 'Вы (Белые)' : 'Вы (Черные)';
            topPlayerName.textContent = playerColor === 'w' ? 'Соперник (Черные)' : 'Соперник (Белые)';
        } else {
            playerColor = 'w';
            pcColor = 'b';
            bottomPlayerName.textContent = 'Белые';
            topPlayerName.textContent = 'Черные';
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

        if (pcToggle.checked && pcColor === 'w') {
            isWaitingForPC = true;
            statusElement.textContent = 'ПК думает...';
            pcMoveTimeoutId = setTimeout(makePCMove, 600);
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

        if (isMyTurn) {
            bottomTimerContainer.classList.add('active');
            topTimerContainer.classList.remove('active');
        } else {
            topTimerContainer.classList.add('active');
            bottomTimerContainer.classList.remove('active');
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
                if (whiteTimeLeft <= 0) handleTimeout('w');
            } else {
                blackTimeLeft -= dt;
                if (blackTimeLeft <= 0) handleTimeout('b');
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
        gameEnded = true;
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

        if (document.getElementById('resign-btn')) document.getElementById('resign-btn').disabled = true;
        if (document.getElementById('draw-btn')) document.getElementById('draw-btn').disabled = true;
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = true;
        updateHintButtonState();
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
        if (size > 0 && (canvas.width !== size || canvas.height !== size)) {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            ctx.scale(dpr, dpr);
        }
        
        const squareSize = canvas.clientWidth / 8;
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        
        const board = ChessLogic.getBoard();
        const flipped = isFlipped();
        
        // Read theme colors
        const style = getComputedStyle(document.documentElement);
        const lightColor = style.getPropertyValue('--board-light').trim() || '#f0d9b5';
        const darkColor = style.getPropertyValue('--board-dark').trim() || '#b58863';
        const coordLight = style.getPropertyValue('--board-coord-light').trim() || '#ffffff';
        const coordDark = style.getPropertyValue('--board-coord-dark').trim() || '#704828';
        
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
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
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
                if (hoverSquare && hoverSquare.row === r && hoverSquare.col === c && !isWaitingForPC && !gameEnded && !analysisSnapshot) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
            }
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
                    const isBlack = piece === piece.toLowerCase();
                    const isHovered = hoverSquare && hoverSquare.row === r && hoverSquare.col === c && !isWaitingForPC && !gameEnded && !analysisSnapshot;
                    
                    ctx.save();
                    
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
                    
                    ctx.restore();
                }
            }
        }
        
        updateStatus();
    }

    function executeMove(fromRow, fromCol, toRow, toCol, isRemote = false) {
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

            if (givesCheck) {
                ChessAudio.check();
            } else if (wasCapture) {
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
            }
            updateStatus();
            return true;
        }
        return false;
    }

    function handleSquareClick(row, col) {
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

    let aiWorker = null;

    function getFallbackPCMove(difficulty) {
        const turn = ChessLogic.getTurn();
        if (typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getOpeningBookMove === 'function') {
            const currentFen = ChessLogic.getFen();
            const bookMove = ChessAIShared.getOpeningBookMove(currentFen);
            if (bookMove) {
                console.log('[UI] Opening book move found:', bookMove);
                return bookMove;
            }
        }
        if (difficulty === '1' && typeof ChessAIEasy !== 'undefined') return ChessAIEasy.getBestMove(turn);
        if (difficulty === '2' && typeof ChessAIMedium !== 'undefined') return ChessAIMedium.getBestMove(turn);
        if (difficulty === '3' && typeof ChessAIHard !== 'undefined') return ChessAIHard.getBestMove(turn);
        if (difficulty === '4' && typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);
        if (difficulty === '5' && typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);
        return null;
    }

    function applyPCMove(bestMove) {
        if (!bestMove || gameEnded) {
            isWaitingForPC = false;
            renderBoard();
            return;
        }

        executeMove(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
        isWaitingForPC = false;
        renderBoard();
    }

    function makePCMove() {
        if (gameEnded) return;
        
        const difficulty = difficultySelect.value;
        const state = ChessLogic.getState();
        console.log('[UI] Planning PC move. Difficulty:', difficulty, 'Turn:', state.turn);
        
        isWaitingForPC = true;
        statusElement.textContent = 'ПК думает...';
        
        const topPlayerName = document.getElementById('top-player-name');
        
        // Stockfish Level Mapping: [Skill Level, Move Time]
        const stockfishSettings = {
            '1': [0, 500],   // Easy
            '2': [5, 700],   // Medium
            '3': [12, 1000], // Hard
            '4': [18, 1500], // Extra Hard
            '5': [20, 2500]  // Unreal
        };

        if (!isFileProtocol) {
            const [skill, time] = stockfishSettings[difficulty] || [10, 1000];
            const fen = ChessLogic.getFen();
            
            if (difficulty === '5') {
                topPlayerName.textContent = 'Оппонент (Stockfish MAX)';
            } else {
                topPlayerName.textContent = `Оппонент (Stockfish Lvl ${difficulty})`;
            }

            ChessAIUnreal.getBestMove(fen, skill, time).then(bestMove => {
                if (gameEnded) return;
                applyPCMove(bestMove);
            }).catch(err => {
                console.error('[UI] Stockfish error, falling back:', err);
                topPlayerName.textContent = 'Оппонент';
                applyPCMove(getFallbackPCMove(difficulty));
            });
            return;
        }

        // --- FALLBACK MODE (file:// protocol) ---
        topPlayerName.textContent = 'Оппонент';
        const bestMove = getFallbackPCMove(difficulty);
        applyPCMove(bestMove);
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
        const canGetHint = isPlayerVsPC && isPlayerTurn && !gameEnded && !isWaitingForPC && !isCalculatingHint;

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
        if (gameEnded || isWaitingForPC || isCalculatingHint) return;
        
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

        const isElectron = navigator.userAgent.toLowerCase().includes(' electron/');
        const isFileProtocol = window.location.protocol === 'file:' && !isElectron;

        if (!isFileProtocol && typeof ChessAIUnreal !== 'undefined') {
            ChessAIUnreal.getBestMove(startFen, 20, 1000).then(bestMove => {
                isCalculatingHint = false;
                restoreHintButton();
                
                // Safety check: ensure game state hasn't changed
                if (ChessLogic.getFen() !== startFen || gameEnded || isWaitingForPC) {
                    return;
                }

                if (bestMove) {
                    suggestedMove = {
                        fromRow: bestMove.fromR,
                        fromCol: bestMove.fromC,
                        toRow: bestMove.toR,
                        toCol: bestMove.toC
                    };
                    renderBoard();
                } else {
                    fallbackHint(startFen);
                }
            }).catch(err => {
                console.error('[UI] Hint calculation error:', err);
                isCalculatingHint = false;
                restoreHintButton();
                if (ChessLogic.getFen() === startFen && !gameEnded && !isWaitingForPC) {
                    fallbackHint(startFen);
                }
            });
        } else {
            isCalculatingHint = false;
            restoreHintButton();
            fallbackHint(startFen);
        }
    }

    function fallbackHint(startFen) {
        if (ChessLogic.getFen() !== startFen || gameEnded || isWaitingForPC) return;
        const bestMove = getFallbackPCMove('4'); // Use level 4 (Very Hard) for fallback hint
        if (bestMove) {
            suggestedMove = {
                fromRow: bestMove.fromR,
                fromCol: bestMove.fromC,
                toRow: bestMove.toR,
                toCol: bestMove.toC
            };
            renderBoard();
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
        if (pcMoveTimeoutId) {
            clearTimeout(pcMoveTimeoutId);
            isWaitingForPC = false;
        }

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
            
            updateCapturesDisplay();
            renderBoard();
            updateTimerDisplays();
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
        
        AnalysisManager.analyzeGame(history, (current, total) => {
            const progress = (current / total) * 100;
            if (analysisProgress) analysisProgress.innerHTML = `
                <div class="w-full bg-surface-container-highest rounded overflow-hidden mt-1" style="height: 4px;">
                    <div class="bg-primary h-full transition-all duration-300" style="width: ${Math.round(progress)}%;"></div>
                </div>
                <div style="text-align: right; margin-top: 2px;">${Math.round(progress)}%</div>
            `;
        }, (stats) => {
            if (analysisProgress) analysisProgress.textContent = 'Анализ завершен!';
            analysisResults = stats.moves;
            renderAnalysisList();
            displayAccuracyStats(stats);
        });
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

        // Set Bento card accuracies in the Stats panel
        const statsWhiteText = document.getElementById('stats-white-accuracy-text');
        const statsWhiteBar = document.getElementById('stats-white-accuracy-bar');
        const statsBlackText = document.getElementById('stats-black-accuracy-text');
        const statsBlackBar = document.getElementById('stats-black-accuracy-bar');
        
        if (statsWhiteText) statsWhiteText.textContent = `${stats.whiteAccuracy}%`;
        if (statsWhiteBar) statsWhiteBar.style.width = `${stats.whiteAccuracy}%`;
        if (statsBlackText) statsBlackText.textContent = `${stats.blackAccuracy}%`;
        if (statsBlackBar) statsBlackBar.style.width = `${stats.blackAccuracy}%`;
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
        
        ChessLogic.loadFen(result.fen, { keepHistory: true, skipRecord: true });
        analysisSnapshot = { turn: ChessLogic.getTurn() };
        const uiMove = result.move ? convertToUiMove(result.move) : null;
        lastMove = uiMove;
        
        const formatMove = (uci) => {
            if (!uci || uci === '(none)') return '';
            return uci.replace(/([a-h][1-8])([a-h][1-8])/, '$1-$2');
        };

        const isExcellentOrBetter = result.qualityClass === 'best' || 
                                    result.qualityClass === 'brilliant' || 
                                    result.qualityClass === 'excellent';
        
        let tipText = '';
        if (isExcellentOrBetter) {
            tipText = '';
            suggestedMove = (result.nextBestMove && result.nextBestMove !== '(none)') ? parseUciMove(result.nextBestMove) : null;
        } else {
            if (result.bestmove && result.bestmove !== '(none)') {
                tipText = `Рекомендуемый ход: ${formatMove(result.bestmove)}`;
            }
            suggestedMove = (result.nextBestMove && result.nextBestMove !== '(none)') ? parseUciMove(result.nextBestMove) : null;
        }
        
        if (stockfishTip) {
            stockfishTip.textContent = tipText;
            stockfishTip.style.display = tipText ? 'flex' : 'none';
        }
        
        selectedSquare = uiMove ? { row: uiMove.fromRow, col: uiMove.fromCol } : null;
        
        renderBoard();
        
        // Highlight selection is handled by lastMove in renderBoard
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
                pcColor: pcColor
            },
            date: new Date().toISOString()
        };
    }

    function deserializeGameState(saveObj) {
        if (!saveObj || !saveObj.boardState || !saveObj.settings) {
            console.error('Invalid save game object');
            return false;
        }

        if (pcMoveTimeoutId) clearTimeout(pcMoveTimeoutId);
        
        // Restore chess logic state
        const ok = ChessLogic.loadState(saveObj.boardState);
        if (!ok) return false;

        // Restore settings
        pcToggle.checked = saveObj.settings.pcToggle;
        document.getElementById('difficulty-container').style.display = pcToggle.checked ? '' : 'none';
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
        selectedSquare = null;
        isWaitingForPC = false;
        gameEnded = false;
        analysisResults = [];
        selectedAnalysisIndex = null;
        suggestedMove = null;
        analysisSnapshot = null;
        if (animationLayer) animationLayer.innerHTML = '';
        hideAnalysis();

        // Reset accuracy UI
        const statsWhiteText = document.getElementById('stats-white-accuracy-text');
        const statsWhiteBar = document.getElementById('stats-white-accuracy-bar');
        const statsBlackText = document.getElementById('stats-black-accuracy-text');
        const statsBlackBar = document.getElementById('stats-black-accuracy-bar');
        if (statsWhiteText) statsWhiteText.textContent = `--%`;
        if (statsWhiteBar) statsWhiteBar.style.width = `0%`;
        if (statsBlackText) statsBlackText.textContent = `--%`;
        if (statsBlackBar) statsBlackBar.style.width = `0%`;
        document.getElementById('top-accuracy').style.display = 'none';
        document.getElementById('bottom-accuracy').style.display = 'none';

        if (document.getElementById('resign-btn')) document.getElementById('resign-btn').disabled = false;
        if (document.getElementById('draw-btn')) {
            const drawBtn = document.getElementById('draw-btn');
            drawBtn.disabled = false;
            drawBtn.style.display = (networkState && networkState.connected) ? 'block' : 'none';
        }
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = false;

        // Update player labels
        if (pcToggle.checked) {
            bottomPlayerName.textContent = playerColor === 'w' ? 'Вы (Белые)' : 'Вы (Черные)';
            topPlayerName.textContent = `ПК (${pcColor === 'w' ? 'Белые' : 'Черные'})`;
        } else if (networkState && networkState.connected) {
            bottomPlayerName.textContent = playerColor === 'w' ? 'Вы (Белые)' : 'Вы (Черные)';
            topPlayerName.textContent = playerColor === 'w' ? 'Соперник (Черные)' : 'Соперник (Белые)';
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
            pcMoveTimeoutId = setTimeout(makePCMove, 600);
        }

        renderBoard();
        return true;
    }

    function getSaveSlot(slotNum) {
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
            localStorage.setItem(SAVE_SLOTS_KEY_PREFIX + slotNum, JSON.stringify(saveObj));
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
            localStorage.removeItem(SAVE_SLOTS_KEY_PREFIX + slotNum);
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
