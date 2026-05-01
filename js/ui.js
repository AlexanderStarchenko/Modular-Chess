/**
 * Chess UI Module
 * Handles rendering, user interaction, AI opponent, timers, and settings.
 */

const ChessUI = (() => {
    let boardElement, boardContainer, animationLayer, statusElement, gameInfoElement, historyListElement, resetBtn, pcToggle, difficultySelect;
    let timeControlSelect, customTimeInputs, customMinsInput, customIncInput, themeSelect;
    let topPlayerName, bottomPlayerName, topTimerDisplay, bottomTimerDisplay;
    let analysisBtn, analysisPanel, analysisList, analysisProgress, stockfishTip;
    let networkState = null;
    
    let selectedSquare = null;
    let lastMove = null;
    let moveCount = 1;
    let isWaitingForPC = false;
    let pcMoveTimeoutId = null; // To cancel PC move
    let playerColor = 'w'; 
    let pcColor = 'b';     
    let stateHistory = [];     
    let analysisResults = [];
    let selectedAnalysisIndex = null;
    let suggestedMove = null;
    let analysisSnapshot = null;

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

            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startAt);
            osc.stop(startAt + duration + 0.03);
        }

        return {
            move() {
                playTone({ type: 'sine', startFreq: 240, endFreq: 180, duration: 0.09, volume: 0.15 });
            },
            capture() {
                playTone({ type: 'triangle', startFreq: 170, endFreq: 115, duration: 0.07, volume: 0.25 });
                playTone({ type: 'square', startFreq: 96, endFreq: 72, duration: 0.12, volume: 0.08, delay: 0.04 });
            },
            check() {
                playTone({ type: 'sawtooth', startFreq: 360, endFreq: 540, duration: 0.07, volume: 0.18 });
                playTone({ type: 'sine', startFreq: 720, endFreq: 640, duration: 0.1, volume: 0.12, delay: 0.05 });
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

        const fromSquare = boardElement.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
        const toSquare = boardElement.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
        if (!fromSquare || !toSquare) return;

        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();
        const boardRect = boardElement.getBoundingClientRect();
        const layer = getBoardOverlay();
        if (!layer) return;

        const flyPiece = document.createElement('div');
        flyPiece.className = `piece piece-fly ${piece === piece.toLowerCase() ? 'black-piece' : ''}`;
        flyPiece.textContent = PIECE_UNICODE[piece];
        flyPiece.style.width = `${fromRect.width}px`;
        flyPiece.style.height = `${fromRect.height}px`;
        flyPiece.style.left = `${fromRect.left - boardRect.left}px`;
        flyPiece.style.top = `${fromRect.top - boardRect.top}px`;
        flyPiece.style.transform = 'translate3d(0, 0, 0)';
        flyPiece.style.opacity = '1';
        layer.appendChild(flyPiece);

        requestAnimationFrame(() => {
            const dx = toRect.left - fromRect.left;
            const dy = toRect.top - fromRect.top;
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
        console.log("Chess UI Initializing...");
        
        boardContainer = document.getElementById('board-container');
        boardElement = document.getElementById('chessboard');
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

        // Network button logic
        if (networkBtn) {
            const modal = document.getElementById('network-modal');
            const connectBtn = document.getElementById('network-connect-btn');
            const cancelBtn = document.getElementById('network-cancel-btn');
            const ipInput = document.getElementById('network-ip-input');
            const roomInput = document.getElementById('network-room-input');

            networkBtn.onclick = () => {
                if (networkState && networkState.connected) {
                    if (confirm('Покинуть комнату и вернуться в одиночную игру?')) {
                        SocketTransport.disconnect();
                        networkBtn.textContent = 'Играть по сети';
                        networkBtn.classList.remove('leave-room-btn');
                        document.getElementById('difficulty-container').style.display = pcToggle.checked ? '' : 'none';
                        startNewGame();
                    }
                    return;
                }
                modal.style.display = 'flex';
            };

            cancelBtn.onclick = () => {
                modal.style.display = 'none';
            };

            connectBtn.onclick = () => {
                const serverIp = ipInput.value.trim() || '192.168.0.105';
                const roomId = roomInput.value.trim() || '123';
                
                try {
                    modal.style.display = 'none';
                    pcToggle.checked = false;
                    document.getElementById('difficulty-container').style.display = 'none';
                    startNewGame(); 
                    
                    const fullUrl = serverIp.includes(':') ? serverIp : `http://${serverIp}:3000`;
                    SocketTransport.init(roomId, fullUrl);
                    
                    networkBtn.textContent = `Покинуть комнату (${roomId})`;
                    networkBtn.classList.add('leave-room-btn');
                } catch (e) {
                    console.error('Network Error:', e);
                }
            };
        }

        topPlayerName = document.getElementById('top-player-name');
        bottomPlayerName = document.getElementById('bottom-player-name');
        topTimerDisplay = document.getElementById('top-timer');
        bottomTimerDisplay = document.getElementById('bottom-timer');
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
            });
            ChessNetwork.on('move', move => {
                if (move.timers) {
                    whiteTimeLeft = move.timers.white;
                    blackTimeLeft = move.timers.black;
                    increment = move.timers.inc;
                    if (!isTimerRunning && move.timers.running) startTimer();
                    updateTimerDisplays();
                }
                executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol, true);
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
                    lastMove = history.length ? { ...history[history.length - 1].move } : null;
                }
                if (data.timers) {
                    whiteTimeLeft = data.timers.white;
                    blackTimeLeft = data.timers.black;
                    increment = data.timers.inc;
                    updateTimerDisplays();
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

        themeSelect.addEventListener('change', updateTheme);
        
        // Subscribe to logic changes
        ChessLogic.subscribe(state => {
            renderBoard();
            updateStatus(state.status);
            
            // Auto PC move if it's PC's turn
            if (pcToggle.checked && state.turn !== playerColor && !gameEnded && !isWaitingForPC) {
                pcMoveTimeoutId = setTimeout(makePCMove, 500);
            }
        });

        updateTheme();
        startNewGame();
    }

    function updateTheme() {
        const theme = themeSelect.value;
        const root = document.documentElement;
        root.style.setProperty('--board-light', `var(--${theme}-light)`);
        root.style.setProperty('--board-dark', `var(--${theme}-dark)`);
    }

    function parseTimeControl() {
        if (timeControlSelect.value === 'custom') {
            const mins = parseInt(customMinsInput.value) || 10;
            const inc = parseInt(customIncInput.value) || 0;
            return { time: mins * 60, inc: inc };
        } else {
            const parts = timeControlSelect.value.split(',');
            return { time: parseInt(parts[0]), inc: parseInt(parts[1]) };
        }
    }

    function startNewGame() {
        ChessLogic.initBoard();
        moveCount = 1;
        stateHistory = [];
        if (pcMoveTimeoutId) clearTimeout(pcMoveTimeoutId);
        historyListElement.innerHTML = '';
        selectedSquare = null;
        isWaitingForPC = false;
        gameEnded = false;
        analysisResults = [];
        selectedAnalysisIndex = null;
        suggestedMove = null;
        analysisSnapshot = null;
        lastMove = null;
        if (animationLayer) animationLayer.innerHTML = '';
        if (analysisBtn) analysisBtn.style.display = 'none';
        hideAnalysis();
        capturedByWhite = [];
        capturedByBlack = [];
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
            topTimerDisplay.style.display = 'none';
            bottomTimerDisplay.style.display = 'none';
        } else {
            topTimerDisplay.style.display = 'block';
            bottomTimerDisplay.style.display = 'block';
            updateTimerDisplays();
        }

        renderBoard();
        syncNetworkState();

        if (pcToggle.checked && pcColor === 'w') {
            isWaitingForPC = true;
            statusElement.textContent = 'ПК думает...';
            pcMoveTimeoutId = setTimeout(makePCMove, 600);
        }
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
        bottomTimerDisplay.className = `timer ${turn === playerColor ? 'active' : ''}`;
        topTimerDisplay.className = `timer ${turn !== playerColor ? 'active' : ''}`;

        if ((isWhiteBottom && whiteTimeLeft < 60) || (!isWhiteBottom && blackTimeLeft < 60)) {
            bottomTimerDisplay.classList.add('low-time');
        } else {
            bottomTimerDisplay.classList.remove('low-time');
        }

        if ((isWhiteBottom && blackTimeLeft < 60) || (!isWhiteBottom && whiteTimeLeft < 60)) {
            topTimerDisplay.classList.add('low-time');
        } else {
            topTimerDisplay.classList.remove('low-time');
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
        finishGame();
        statusElement.textContent = 'Время вышло!';
        gameInfoElement.textContent = color === 'w' ? 'Черные победили' : 'Белые победили';
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

        if (reason === 'resign') {
            const winnerText = loserColor === 'w' ? 'Черные победили' : 'Белые победили';
            const loserText = loserColor === 'w' ? 'Белые сдались' : 'Черные сдались';
            statusElement.textContent = loserText;
            gameInfoElement.textContent = winnerText;
        } else if (reason === 'draw') {
            statusElement.textContent = 'Ничья';
            gameInfoElement.textContent = 'По обоюдному согласию';
        }

        if (analysisBtn && ChessLogic.getGameHistory().length > 0) {
            analysisBtn.style.display = 'block';
        }

        if (document.getElementById('resign-btn')) document.getElementById('resign-btn').disabled = true;
        if (document.getElementById('draw-btn')) document.getElementById('draw-btn').disabled = true;
        if (document.getElementById('undo-btn')) document.getElementById('undo-btn').disabled = true;
    }

    function renderBoard() {
        boardElement.innerHTML = '';
        const board = ChessLogic.getBoard();
        const flipped = playerColor === 'b';

        for (let ri = 0; ri < 8; ri++) {
            for (let ci = 0; ci < 8; ci++) {
                const r = flipped ? 7 - ri : ri;
                const c = flipped ? 7 - ci : ci;

                const square = document.createElement('div');
                square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = r;
                square.dataset.col = c;

                const piece = board[r][c];
                if (piece) {
                    const pieceSpan = document.createElement('span');
                    const isBlack = piece === piece.toLowerCase();
                    pieceSpan.className = `piece ${isBlack ? 'black-piece' : ''}`;
                    pieceSpan.textContent = PIECE_UNICODE[piece];
                    square.appendChild(pieceSpan);
                }

                if (selectedSquare && selectedSquare.row === r && selectedSquare.col === c) {
                    square.classList.add('highlight');
                }

                if (lastMove && lastMove.fromRow === r && lastMove.fromCol === c) {
                    square.classList.add('last-move-from');
                }

                if (lastMove && lastMove.toRow === r && lastMove.toCol === c) {
                    square.classList.add('last-move-to');
                }

                if (suggestedMove && suggestedMove.fromRow === r && suggestedMove.fromCol === c) {
                    square.classList.add('suggested-from');
                }

                if (suggestedMove && suggestedMove.toRow === r && suggestedMove.toCol === c) {
                    square.classList.add('suggested-to');
                }
                
                const currentTurn = analysisSnapshot ? analysisSnapshot.turn : ChessLogic.getTurn();
                const isCurrentTurnKing = (currentTurn === 'w' && piece === 'K') || (currentTurn === 'b' && piece === 'k');
                if (isCurrentTurnKing && ChessLogic.isKingInCheck(currentTurn)) {
                    square.classList.add('in-check');
                }

                square.addEventListener('click', () => {
                    if (!isWaitingForPC && !gameEnded && !analysisSnapshot) handleSquareClick(r, c);
                });
                boardElement.appendChild(square);
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
            checkGameEnd();
            return true;
        }
        return false;
    }

    function handleSquareClick(row, col) {
        const currentTurn = ChessLogic.getTurn();

        if ((pcToggle.checked || (networkState && networkState.connected)) && currentTurn !== playerColor) return;

        if (selectedSquare) {
            const fromRow = selectedSquare.row;
            const fromCol = selectedSquare.col;
            
            if (executeMove(fromRow, fromCol, row, col)) {
                selectedSquare = null;
                renderBoard();

                if (pcToggle.checked && !gameEnded) {
                    isWaitingForPC = true;
                    statusElement.textContent = 'ПК думает...';
                    pcMoveTimeoutId = setTimeout(makePCMove, 500);
                }
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
        if (difficulty === '1' && typeof ChessAIEasy !== 'undefined') return ChessAIEasy.getBestMove(turn);
        if (difficulty === '2' && typeof ChessAIMedium !== 'undefined') return ChessAIMedium.getBestMove(turn);
        if (difficulty === '3' && typeof ChessAIHard !== 'undefined') return ChessAIHard.getBestMove(turn);
        if (difficulty === '4' && typeof ChessAIVeryHard !== 'undefined') return ChessAIVeryHard.getBestMove(turn);
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
        
        if (difficulty === '5') {
            // Unreal difficulty uses Stockfish (handled outside the main AI worker)
            const fen = ChessLogic.getFen();
            ChessAIUnreal.getBestMove(fen).then(bestMove => {
                if (gameEnded) return;
                applyPCMove(bestMove);
            });
            return;
        }
        
        if (!aiWorker) {
            aiWorker = new Worker('js/ai_worker.js');
            aiWorker.onmessage = function(e) {
                if (gameEnded) return;
                
                const { bestMove } = e.data;
                applyPCMove(bestMove);
            };
            aiWorker.onerror = function() {
                aiWorker = null;
                applyPCMove(getFallbackPCMove(difficulty));
            };
        }
        
        try {
            aiWorker.postMessage({ state, difficulty });
        } catch (error) {
            aiWorker = null;
            applyPCMove(getFallbackPCMove(difficulty));
        }
    }

    function updateCapturesDisplay() {
        // ... (existing updateCapturesDisplay code)
        const whiteScore = capturedByWhite.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
        const blackScore = capturedByBlack.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
        const advantage = whiteScore - blackScore;

        const sortByValue = arr => [...arr].sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));

        const CAPTURE_UNICODE = {
            'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };

        const isBottomWhite = playerColor === 'w' || !pcToggle.checked;
        const topCaptured = isBottomWhite ? sortByValue(capturedByWhite) : sortByValue(capturedByBlack);
        const bottomCaptured = isBottomWhite ? sortByValue(capturedByBlack) : sortByValue(capturedByWhite);
        const topScore = isBottomWhite ? whiteScore : blackScore;
        const bottomScore = isBottomWhite ? blackScore : whiteScore;

        topCapturedEl.textContent = topCaptured.map(p => CAPTURE_UNICODE[p] || '').join('');
        bottomCapturedEl.textContent = bottomCaptured.map(p => CAPTURE_UNICODE[p] || '').join('');

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
        if (gameEnded && !gameStatus) return;

        const turn = ChessLogic.getTurn();
        const moveColor = turn === 'w' ? 'Белых' : 'Черных';
        const opponentColor = turn === 'w' ? 'Черные' : 'Белые';
        
        // Use provided status or check manually
        const status = gameStatus || (ChessLogic.getAllLegalMoves(turn).length === 0 ? 
                        (ChessLogic.isKingInCheck(turn) ? 'checkmate' : 'stalemate') : null);

        if (status === 'checkmate') {
            statusElement.textContent = `МАТ! ${opponentColor} победили!`;
            gameInfoElement.textContent = 'Игра завершена';
            finishGame();
        } else if (status === 'stalemate') {
            statusElement.textContent = 'НИЧЬЯ! Пат.';
            gameInfoElement.textContent = 'У игрока нет доступных ходов';
            finishGame();
        } else if (status === 'repetition') {
            statusElement.textContent = 'НИЧЬЯ! Повторение ходов.';
            gameInfoElement.textContent = 'Позиция повторилась трижды';
            finishGame();
        } else {
            const inCheck = ChessLogic.isKingInCheck(turn);
            statusElement.textContent = `Ход ${moveColor}${inCheck ? ' (ШАХ!)' : ''}`;
            gameInfoElement.textContent = inCheck ? 'Король под ударом!' : 'Игра продолжается';
        }
        updateTimerDisplays();
    }

    // Removed checkGameEnd as it is now handled by updateStatus

    function performUndo(levels) {
        if (pcMoveTimeoutId) {
            clearTimeout(pcMoveTimeoutId);
            isWaitingForPC = false;
        }

        if (stateHistory.length < levels) levels = stateHistory.length;
        if (levels === 0) return;

        let previousState;
        for (let i = 0; i < levels; i++) {
            previousState = stateHistory.pop();
        }

        if (previousState) {
            ChessLogic.loadState(previousState.boardState);
            whiteTimeLeft = previousState.timers.white;
            blackTimeLeft = previousState.timers.black;
            increment = previousState.timers.inc;
            if (!previousState.timers.running) stopTimer();
            historyListElement.innerHTML = previousState.history;
            moveCount = previousState.moveCount;
            capturedByWhite = previousState.captures.white;
            capturedByBlack = previousState.captures.black;
            lastMove = previousState.lastMove || (previousState.boardState && previousState.boardState.gameHistory && previousState.boardState.gameHistory.length
                ? { ...previousState.boardState.gameHistory[previousState.boardState.gameHistory.length - 1].move }
                : null);
            
            selectedSquare = null;
            gameEnded = false;
            
            updateCapturesDisplay();
            renderBoard();
        }
    }

    function hideAnalysis() {
        if (analysisPanel) analysisPanel.style.display = 'none';
        if (analysisList) analysisList.innerHTML = '';
        if (analysisProgress) analysisProgress.textContent = '';
        if (stockfishTip) stockfishTip.textContent = '';
        analysisSnapshot = null;
        suggestedMove = null;
    }

    function startAnalysis() {
        if (analysisBtn) analysisBtn.style.display = 'none';
        if (analysisPanel) analysisPanel.style.display = 'block';
        if (analysisProgress) analysisProgress.textContent = 'Подготовка к анализу...';
        if (analysisList) analysisList.innerHTML = '';
        if (stockfishTip) stockfishTip.textContent = '';

        const history = ChessLogic.getGameHistory();
        
        AnalysisManager.analyzeGame(history, (current, total) => {
            if (analysisProgress) analysisProgress.textContent = `Анализ: ход ${current} из ${total}...`;
        }, (stats) => {
            if (analysisProgress) analysisProgress.textContent = 'Анализ завершен!';
            analysisResults = stats.moves;
            renderAnalysisList();
            displayAccuracyStats(stats);
        });
    }

    function displayAccuracyStats(stats) {
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
            li.style.padding = '5px';
            li.style.borderBottom = '1px solid var(--border-color)';
            
            const num = Math.floor(index / 2) + 1;
            const turnStr = index % 2 === 0 ? 'Белые' : 'Черные';
            
            let qualityHtml = '';
            if (result.quality) {
                qualityHtml = `<span class="quality-badge ${result.qualityClass}" style="margin-left:5px; font-weight:bold;">${result.quality}</span>`;
            }
            
            const accuracyHtml = `<span style="margin-left: 5px; color: #3b82f6; font-weight: bold;">${result.accuracy}%</span>`;
            
            li.innerHTML = `<strong>${num}. ${turnStr}</strong>: ${result.move.uci} <span style="color:gray;font-size:0.8em">[${result.scoreBefore} -> ${result.scoreAfter}]</span> ${accuracyHtml} ${qualityHtml}`;
            
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
        
        ChessLogic.loadFen(result.beforeFen, { keepHistory: true });
        analysisSnapshot = { turn: ChessLogic.getTurn() };
        lastMove = result.move ? { ...result.move } : null;
        
        if (result.bestmove && result.bestmove !== '(none)') {
            suggestedMove = parseUciMove(result.bestmove);
            if (stockfishTip) stockfishTip.textContent = `Stockfish советует: ${result.bestmove}`;
        } else {
            suggestedMove = null;
            if (stockfishTip) stockfishTip.textContent = 'Нет совета';
        }
        
        selectedSquare = { row: result.move.fromRow, col: result.move.fromCol };
        
        renderBoard();
        
        // Temporarily highlight the actual move destination
        const destSquare = boardElement.querySelector(`[data-row="${result.move.toRow}"][data-col="${result.move.toCol}"]`);
        if (destSquare) {
            destSquare.classList.add('highlight');
        }
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
                lastMove = history.length ? { ...history[history.length - 1].move } : null;
                renderBoard();
            }
            return ok;
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    ChessUI.init();
});
