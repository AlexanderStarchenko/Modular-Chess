/**
 * Chess UI Module
 * Handles rendering, user interaction, AI opponent, timers, and settings.
 */

const ChessUI = (() => {
    let boardElement, statusElement, gameInfoElement, historyListElement, resetBtn, pcToggle, difficultySelect;
    let timeControlSelect, customTimeInputs, customMinsInput, customIncInput, themeSelect;
    let topPlayerName, bottomPlayerName, topTimerDisplay, bottomTimerDisplay;
    
    let selectedSquare = null;
    let moveCount = 1;
    let isWaitingForPC = false;
    let playerColor = 'w'; 
    let pcColor = 'b';     

    // Timer variables
    let timerInterval = null;
    let whiteTimeLeft = 600;
    let blackTimeLeft = 600;
    let increment = 0;
    let isTimerRunning = false;
    let gameEnded = false;

    // Capture tracking
    let capturedByWhite = []; // pieces white captured (black pieces)
    let capturedByBlack = []; // pieces black captured (white pieces)
    let topCapturedEl, bottomCapturedEl, topAdvantageEl, bottomAdvantageEl;

    const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

    const PIECE_UNICODE = {
        'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
        'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
    };

    function init() {
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

        topPlayerName = document.getElementById('top-player-name');
        bottomPlayerName = document.getElementById('bottom-player-name');
        topTimerDisplay = document.getElementById('top-timer');
        bottomTimerDisplay = document.getElementById('bottom-timer');
        topCapturedEl = document.getElementById('top-captured');
        bottomCapturedEl = document.getElementById('bottom-captured');
        topAdvantageEl = document.getElementById('top-advantage');
        bottomAdvantageEl = document.getElementById('bottom-advantage');

        // Event Listeners
        resetBtn.addEventListener('click', startNewGame);
        
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
        historyListElement.innerHTML = '';
        selectedSquare = null;
        isWaitingForPC = false;
        gameEnded = false;
        capturedByWhite = [];
        capturedByBlack = [];
        updateCapturesDisplay();

        // Colors
        if (pcToggle.checked) {
            playerColor = Math.random() < 0.5 ? 'w' : 'b';
            pcColor = playerColor === 'w' ? 'b' : 'w';
            bottomPlayerName.textContent = playerColor === 'w' ? 'Вы (Белые)' : 'Вы (Черные)';
            topPlayerName.textContent = `ПК (${pcColor === 'w' ? 'Белые' : 'Черные'})`;
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

        if (pcToggle.checked && pcColor === 'w') {
            isWaitingForPC = true;
            statusElement.textContent = 'ПК думает...';
            setTimeout(makePCMove, 600);
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
        
        timerInterval = setInterval(() => {
            const turn = ChessLogic.getTurn();
            if (turn === 'w') {
                whiteTimeLeft -= 0.1;
                if (whiteTimeLeft <= 0) handleTimeout('w');
            } else {
                blackTimeLeft -= 0.1;
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
        gameEnded = true;
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

    function renderBoard() {
        boardElement.innerHTML = '';
        const board = ChessLogic.getBoard();
        const flipped = playerColor === 'b' && pcToggle.checked;

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
                
                const currentTurn = ChessLogic.getTurn();
                const isCurrentTurnKing = (currentTurn === 'w' && piece === 'K') || (currentTurn === 'b' && piece === 'k');
                if (isCurrentTurnKing && ChessLogic.isKingInCheck(currentTurn)) {
                    square.classList.add('in-check');
                }

                square.addEventListener('click', () => {
                    if (!isWaitingForPC && !gameEnded) handleSquareClick(r, c);
                });
                boardElement.appendChild(square);
            }
        }

        updateStatus();
    }

    function handleSquareClick(row, col) {
        const currentTurn = ChessLogic.getTurn();

        if (pcToggle.checked && currentTurn !== playerColor) return;

        if (selectedSquare) {
            const fromRow = selectedSquare.row;
            const fromCol = selectedSquare.col;
            
            const boardSnap = ChessLogic.getBoard();
            const targetPiece = boardSnap[row][col];
            const movingPiece = boardSnap[fromRow][fromCol];

            const success = ChessLogic.movePiece(fromRow, fromCol, row, col);
            if (success) {
                // Record capture if there was a piece on the target square
                if (targetPiece) {
                    const movingIsWhite = movingPiece === movingPiece.toUpperCase();
                    if (movingIsWhite) capturedByWhite.push(targetPiece.toLowerCase());
                    else capturedByBlack.push(targetPiece.toLowerCase());
                    updateCapturesDisplay();
                }
                if (!isTimerRunning) startTimer();
                handleTurnEnd();
                addToHistory(fromRow, fromCol, row, col);
                selectedSquare = null;
                renderBoard();

                if (pcToggle.checked && !gameEnded) {
                    isWaitingForPC = true;
                    statusElement.textContent = 'ПК думает...';
                    setTimeout(makePCMove, 500);
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

    function makePCMove() {
        if (gameEnded) return;
        
        if (!isTimerRunning) startTimer();

        const turn = ChessLogic.getTurn();
        const difficulty = difficultySelect.value;
        const bestMove = ChessLogic.getBestMove(turn, difficulty);
        
        if (bestMove) {
            const boardSnap = ChessLogic.getBoard();
            const targetPiece = boardSnap[bestMove.toR][bestMove.toC];
            const movingPiece = boardSnap[bestMove.fromR][bestMove.fromC];

            ChessLogic.movePiece(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);

            if (targetPiece) {
                const movingIsWhite = movingPiece === movingPiece.toUpperCase();
                if (movingIsWhite) capturedByWhite.push(targetPiece.toLowerCase());
                else capturedByBlack.push(targetPiece.toLowerCase());
                updateCapturesDisplay();
            }

            handleTurnEnd();
            addToHistory(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
        }
        
        isWaitingForPC = false;
        renderBoard();
    }

    function updateCapturesDisplay() {
        // White captured black pieces → shown near top player
        // Black captured white pieces → shown near bottom player
        // (This is from the perspective of "who has more material")

        const whiteScore = capturedByWhite.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
        const blackScore = capturedByBlack.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
        const advantage = whiteScore - blackScore;

        // Sort captured pieces by value descending for display
        const sortByValue = arr => [...arr].sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));

        const CAPTURE_UNICODE = {
            'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };

        // Top player = opponent. They captured bottom player's pieces (white captured black or vice versa)
        // Determine perspective: bottom player is the user
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

    function updateStatus() {
        if (gameEnded) return;

        const turn = ChessLogic.getTurn();
        const inCheck = ChessLogic.isKingInCheck(turn);
        
        let statusText = turn === 'w' ? 'Ход белых' : 'Ход черных';
        if (inCheck) statusText += ' (ШАХ!)';
        
        statusElement.textContent = statusText;
        gameInfoElement.textContent = inCheck ? 'Король под ударом!' : 'Игра продолжается';
        updateTimerDisplays();
    }

    return {
        init
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    ChessUI.init();
});
