/**
 * Chess UI Board Interaction Module
 * Handles canvas coordinate mapping, legal move caching, pointer/drag/click interaction,
 * move execution, AI move planning, hints, and undo.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIBoardInteraction = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    function createBoardInteraction(S, deps = {}) {
        let mousemoveRafId = null;
        let pendingMouseX = 0;
        let pendingMouseY = 0;

        function updateCanvasRect() {
            if (S.canvas && typeof S.canvas.getBoundingClientRect === 'function') {
                S.cachedCanvasRect = S.canvas.getBoundingClientRect();
            }
        }

        function getCanvasRect() {
            if (!S.cachedCanvasRect && S.canvas && typeof S.canvas.getBoundingClientRect === 'function') {
                S.cachedCanvasRect = S.canvas.getBoundingClientRect();
            }
            return S.cachedCanvasRect;
        }

        function getSquareFromCoords(clientX, clientY) {
            const rect = getCanvasRect() || (S.canvas && typeof S.canvas.getBoundingClientRect === 'function' ? S.canvas.getBoundingClientRect() : null);
            if (!rect || !rect.width) {
                return { r: -1, c: -1, x: 0, y: 0, valid: false };
            }
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const squareSize = rect.width / 8;
            const col = Math.floor(x / squareSize);
            const row = Math.floor(y / squareSize);
            const flipped = deps.isFlipped();
            const r = flipped ? 7 - row : row;
            const c = flipped ? 7 - col : col;
            return { r, c, x, y, valid: r >= 0 && r < 8 && c >= 0 && c < 8 };
        }

        function getLegalDestsForSelectedSquare() {
            if (!S.selectedSquare) {
                S.cachedLegalDests = null;
                S.cachedLegalDestsSquare = null;
                S.cachedLegalDestsFen = null;
                return [];
            }
            const currentFen = (typeof ChessLogic.getFen === 'function') ? ChessLogic.getFen() : null;
            if (S.cachedLegalDests && S.cachedLegalDestsSquare &&
                S.cachedLegalDestsSquare.row === S.selectedSquare.row &&
                S.cachedLegalDestsSquare.col === S.selectedSquare.col &&
                S.cachedLegalDestsFen === currentFen) {
                return S.cachedLegalDests;
            }
            const dests = [];
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (ChessLogic.isValidMove(S.selectedSquare.row, S.selectedSquare.col, r, c)) {
                        dests.push({ row: r, col: c });
                    }
                }
            }
            S.cachedLegalDests = dests;
            S.cachedLegalDestsSquare = { row: S.selectedSquare.row, col: S.selectedSquare.col };
            S.cachedLegalDestsFen = currentFen;
            return dests;
        }

        function executeMove(fromRow, fromCol, toRow, toCol, isRemote = false, skipAnimation = false) {
            if (S.gameEnded || S.analysisSnapshot) return false;
            if (!isRemote && S.isWaitingForStart) return false;

            const previousLastMove = S.lastMove ? { ...S.lastMove } : null;
            S.stateHistory.push({
                boardState: ChessLogic.getState(),
                timers: {
                    white: S.whiteTimeLeft,
                    black: S.blackTimeLeft,
                    inc: S.increment,
                    running: S.isTimerRunning
                },
                moveCount: S.moveCount,
                captures: {
                    white: [...S.capturedByWhite],
                    black: [...S.capturedByBlack]
                },
                lastMove: previousLastMove
            });

            const boardSnap = ChessLogic.getBoard();
            const targetPiece = boardSnap[toRow][toCol];
            const movingPiece = boardSnap[fromRow][fromCol];

            if (isRemote) S.isRemoteAction = true;
            const success = ChessLogic.movePiece(fromRow, fromCol, toRow, toCol);
            if (isRemote) S.isRemoteAction = false;

            if (success) {
                S.suggestedMove = null;
                const movedIsPawn = movingPiece && movingPiece.toLowerCase() === 'p';
                const wasEnPassantCapture = movedIsPawn && !targetPiece && fromCol !== toCol;
                const wasCapture = Boolean(targetPiece) || wasEnPassantCapture;
                const givesCheck = ChessLogic.isKingInCheck(ChessLogic.getTurn());
                const enPassantCapturedPiece = wasEnPassantCapture
                    ? boardSnap[movingPiece === movingPiece.toUpperCase() ? toRow + 1 : toRow - 1][toCol]
                    : null;
                const capturedPiece = targetPiece || enPassantCapturedPiece;

                if (typeof deps.updateLastMove === 'function') {
                    deps.updateLastMove({ fromRow, fromCol, toRow, toCol });
                } else {
                    S.lastMove = { fromRow, fromCol, toRow, toCol };
                }

                if (givesCheck && typeof ChessAudio !== 'undefined' && typeof ChessAudio.check === 'function') {
                    ChessAudio.check();
                } else if (wasCapture && typeof ChessAudio !== 'undefined') {
                    ChessAudio.capture();
                } else if (typeof ChessAudio !== 'undefined') {
                    ChessAudio.move();
                }

                if (!skipAnimation) {
                    deps.animateMove(fromRow, fromCol, toRow, toCol, movingPiece);
                }

                if (wasCapture) {
                    const movingIsWhite = movingPiece === movingPiece.toUpperCase();
                    if (capturedPiece) {
                        if (movingIsWhite) S.capturedByWhite.push(capturedPiece.toLowerCase());
                        else S.capturedByBlack.push(capturedPiece.toLowerCase());
                        deps.updateCapturesDisplay();
                    }
                }
                if (!S.isTimerRunning) deps.startTimer();
                deps.handleTurnEnd();
                deps.addToHistory(fromRow, fromCol, toRow, toCol);
                deps.updateResignButtonState();

                if (!isRemote && typeof ChessNetwork !== 'undefined' && S.networkState && S.networkState.connected) {
                    ChessNetwork.sendMove({
                        fromRow,
                        fromCol,
                        toRow,
                        toCol,
                        timers: {
                            white: S.whiteTimeLeft,
                            black: S.blackTimeLeft,
                            inc: S.increment,
                            running: S.isTimerRunning
                        }
                    });
                }
                return true;
            }
            S.stateHistory.pop();
            return false;
        }

        function isDraggingPiece(clientX, clientY) {
            if (S.isWaitingForPC || S.gameEnded || S.analysisSnapshot) return false;
            const pcToggle = S.dom && S.dom.pcToggle;
            if (S.isWaitingForStart && pcToggle && pcToggle.checked && S.playerColor !== 'w') return false;
            const sq = getSquareFromCoords(clientX, clientY);
            if (sq.valid) {
                const board = ChessLogic.getBoard();
                const piece = board[sq.r][sq.c];
                const currentTurn = ChessLogic.getTurn();
                if (piece) {
                    const isWhite = piece === piece.toUpperCase();
                    const isPieceOfCurrentTurn = (isWhite && currentTurn === 'w') || (!isWhite && currentTurn === 'b');
                    const isMyTurn = ((pcToggle && pcToggle.checked) || (S.networkState && S.networkState.connected))
                        ? (currentTurn === S.playerColor)
                        : true;
                    return isPieceOfCurrentTurn && isMyTurn;
                }
            }
            return false;
        }

        function handleMousedown(clientX, clientY) {
            if (S.isWaitingForPC || S.gameEnded || S.analysisSnapshot) return;
            if (S.isWaitingForStart && !deps.tryAutoStartOnInteraction()) return;
            updateCanvasRect();
            const sq = getSquareFromCoords(clientX, clientY);

            if (sq.valid) {
                S.lastMousedownSquare = { row: sq.r, col: sq.c };

                const board = ChessLogic.getBoard();
                const piece = board[sq.r][sq.c];
                const currentTurn = ChessLogic.getTurn();

                if (piece) {
                    const isWhite = piece === piece.toUpperCase();
                    const isPieceOfCurrentTurn = (isWhite && currentTurn === 'w') || (!isWhite && currentTurn === 'b');
                    const pcToggle = S.dom && S.dom.pcToggle;
                    const isMyTurn = ((pcToggle && pcToggle.checked) || (S.networkState && S.networkState.connected))
                        ? (currentTurn === S.playerColor)
                        : true;
                    const canMove = isPieceOfCurrentTurn && isMyTurn;

                    if (canMove) {
                        S.isDragging = true;
                        S.dragStartSquare = { row: sq.r, col: sq.c };
                        S.draggedPiece = piece;
                        S.dragCurrentX = sq.x;
                        S.dragCurrentY = sq.y;
                        S.selectedSquare = { row: sq.r, col: sq.c };
                        S.draggedOccurred = false;
                        deps.scheduleRender();
                    }
                }
            }
        }

        function processMousemove(clientX, clientY) {
            const sq = getSquareFromCoords(clientX, clientY);

            if (S.isDragging) {
                S.dragCurrentX = sq.x;
                S.dragCurrentY = sq.y;
                S.draggedOccurred = true;
                S.hoverSquare = sq.valid ? { row: sq.r, col: sq.c } : null;
                deps.renderBoard();
            } else {
                if (S.isWaitingForPC || S.isWaitingForStart || S.gameEnded || S.analysisSnapshot) {
                    if (S.hoverSquare) {
                        S.hoverSquare = null;
                        deps.scheduleRender();
                    }
                    return;
                }

                if (sq.valid) {
                    if (!S.hoverSquare || S.hoverSquare.row !== sq.r || S.hoverSquare.col !== sq.c) {
                        S.hoverSquare = { row: sq.r, col: sq.c };
                        deps.scheduleRender();
                    }
                } else {
                    if (S.hoverSquare) {
                        S.hoverSquare = null;
                        deps.scheduleRender();
                    }
                }
            }
        }

        function handleMousemove(clientX, clientY) {
            pendingMouseX = clientX;
            pendingMouseY = clientY;
            if (mousemoveRafId) return;

            mousemoveRafId = deps.safeRaf(() => {
                mousemoveRafId = null;
                processMousemove(pendingMouseX, pendingMouseY);
            });
        }

        function handleMouseup(clientX, clientY) {
            if (S.isWaitingForPC || S.isWaitingForStart || S.gameEnded || S.analysisSnapshot) return;
            const sq = getSquareFromCoords(clientX, clientY);

            if (S.isDragging) {
                S.isDragging = false;
                const startRow = S.dragStartSquare.row;
                const startCol = S.dragStartSquare.col;

                S.dragStartSquare = null;
                S.draggedPiece = null;

                if (sq.valid) {
                    if (startRow === sq.r && startCol === sq.c) {
                        handleSquareClick(sq.r, sq.c);
                    } else {
                        const success = executeMove(startRow, startCol, sq.r, sq.c, false, true);
                        if (success) {
                            S.selectedSquare = null;
                        } else {
                            S.selectedSquare = { row: startRow, col: startCol };
                        }
                    }
                }
                deps.scheduleRender();
            } else {
                if (sq.valid && S.lastMousedownSquare && S.lastMousedownSquare.row === sq.r && S.lastMousedownSquare.col === sq.c) {
                    handleSquareClick(sq.r, sq.c);
                }
            }
            S.lastMousedownSquare = null;
        }

        function selectPiece(row, col, currentTurn) {
            const board = ChessLogic.getBoard();
            const piece = board[row][col];
            if (piece) {
                const isWhite = piece === piece.toUpperCase();
                if ((isWhite && currentTurn === 'w') || (!isWhite && currentTurn === 'b')) {
                    S.selectedSquare = { row, col };
                } else {
                    S.selectedSquare = null;
                }
            } else {
                S.selectedSquare = null;
            }
        }

        function handleSquareClick(row, col) {
            if (S.isWaitingForPC || S.gameEnded || S.analysisSnapshot) return;
            if (S.isWaitingForStart && !deps.tryAutoStartOnInteraction()) return;
            const currentTurn = ChessLogic.getTurn();
            const pcToggle = S.dom && S.dom.pcToggle;

            if (((pcToggle && pcToggle.checked) || (S.networkState && S.networkState.connected)) && currentTurn !== S.playerColor) return;

            if (S.suggestedMove) {
                S.suggestedMove = null;
            }

            if (S.selectedSquare) {
                const fromRow = S.selectedSquare.row;
                const fromCol = S.selectedSquare.col;

                if (executeMove(fromRow, fromCol, row, col)) {
                    S.selectedSquare = null;
                    deps.scheduleRender();
                    return;
                } else {
                    selectPiece(row, col, currentTurn);
                }
            } else {
                selectPiece(row, col, currentTurn);
            }
            deps.scheduleRender();
        }

        function applyPCMove(bestMove) {
            S.isWaitingForPC = false;
            if (!bestMove || S.gameEnded) {
                deps.scheduleRender();
                return;
            }

            const fromR = bestMove.fromR !== undefined ? bestMove.fromR : bestMove.fromRow;
            const fromC = bestMove.fromC !== undefined ? bestMove.fromC : bestMove.fromCol;
            const toR = bestMove.toR !== undefined ? bestMove.toR : bestMove.toRow;
            const toC = bestMove.toC !== undefined ? bestMove.toC : bestMove.toCol;

            executeMove(fromR, fromC, toR, toC);
            deps.scheduleRender();
        }

        function makePCMove() {
            S.pcMoveTimeoutId = null;
            if (S.gameEnded) return;

            const difficultySelect = S.dom && S.dom.difficultySelect;
            const difficulty = difficultySelect ? difficultySelect.value : '2';
            const state = ChessLogic.getState();
            console.log('[UI] Planning PC move. Difficulty:', difficulty, 'Turn:', state.turn);

            S.isWaitingForPC = true;
            if (S.dom && S.dom.statusElement) S.dom.statusElement.textContent = 'ПК думает...';
            deps.updatePlayerNames();
            deps.updateAvatars();

            const fen = ChessLogic.getFen();
            const history = (typeof ChessLogic.getGameHistory === 'function')
                ? ChessLogic.getGameHistory().map(h => h && h.fen).filter(Boolean)
                : [];

            if (typeof ChessAIManager !== 'undefined') {
                ChessAIManager.getBestMove(fen, difficulty, history).then(bestMove => {
                    if (S.gameEnded) return;
                    applyPCMove(bestMove);
                }).catch(err => {
                    console.error('[UI] ChessAIManager error:', err);
                    S.isWaitingForPC = false;
                    deps.renderBoard();
                });
            } else {
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

        function restoreHintButton() {
            const hintBtn = typeof document !== 'undefined' ? document.getElementById('hint-btn') : null;
            if (hintBtn) {
                hintBtn.innerHTML = `
                    <span class="material-symbols-outlined text-sm">lightbulb</span>
                    <span>Подсказка</span>
                `;
                deps.updateHintButtonState();
            }
        }

        function getHint() {
            if (S.gameEnded || S.isWaitingForPC || S.isWaitingForStart || S.isCalculatingHint) return;
            const pcToggle = S.dom && S.dom.pcToggle;
            if (!pcToggle || !pcToggle.checked) return;

            const currentTurn = ChessLogic.getTurn();
            if (currentTurn !== S.playerColor) return;

            const hintBtn = typeof document !== 'undefined' ? document.getElementById('hint-btn') : null;
            if (hintBtn) {
                hintBtn.disabled = true;
                hintBtn.innerHTML = `
                    <span class="material-symbols-outlined text-sm animate-spin inline-block">sync</span>
                    <span>Думаю...</span>
                `;
                hintBtn.classList.remove('hover:border-primary', 'hover:text-primary');
            }

            S.isCalculatingHint = true;
            const startFen = ChessLogic.getFen();

            if (typeof ChessAIManager !== 'undefined') {
                ChessAIManager.getHint(startFen).then(bestMove => {
                    S.isCalculatingHint = false;
                    restoreHintButton();

                    if (ChessLogic.getFen() !== startFen || S.gameEnded || S.isWaitingForPC) {
                        return;
                    }

                    if (bestMove) {
                        S.suggestedMove = {
                            fromRow: bestMove.fromR !== undefined ? bestMove.fromR : bestMove.fromRow,
                            fromCol: bestMove.fromC !== undefined ? bestMove.fromC : bestMove.fromCol,
                            toRow: bestMove.toR !== undefined ? bestMove.toR : bestMove.toRow,
                            toCol: bestMove.toC !== undefined ? bestMove.toC : bestMove.toCol
                        };
                        deps.renderBoard();
                    }
                }).catch(err => {
                    console.error('[UI] Hint calculation error:', err);
                    S.isCalculatingHint = false;
                    restoreHintButton();
                });
            } else {
                S.isCalculatingHint = false;
                restoreHintButton();
            }
        }

        function performUndo(levels) {
            deps.cancelPendingMove();

            if (S.stateHistory.length < levels) levels = S.stateHistory.length;
            if (levels === 0) return;

            deps.stopTimer();

            let previousState;
            const gameHasTimeControl = deps.parseTimeControl().time > 0;

            for (let i = 0; i < levels; i++) {
                previousState = S.stateHistory.pop();
                deps.removeLastHistoryMove();
                if (previousState && gameHasTimeControl) {
                    const turn = previousState.boardState.turn || 'w';
                    if (turn === 'w') {
                        S.whiteTimeLeft = Math.max(0.1, S.whiteTimeLeft - S.increment);
                    } else {
                        S.blackTimeLeft = Math.max(0.1, S.blackTimeLeft - S.increment);
                    }
                }
            }

            if (previousState) {
                ChessLogic.loadState(previousState.boardState);

                if (S.stateHistory.length === 0 && gameHasTimeControl) {
                    const tc = deps.parseTimeControl();
                    S.whiteTimeLeft = tc.time;
                    S.blackTimeLeft = tc.time;
                    S.increment = tc.inc;
                } else {
                    S.increment = previousState.timers.inc;
                }

                if (previousState.timers.running) {
                    deps.startTimer();
                }

                S.moveCount = previousState.moveCount;
                S.capturedByWhite = previousState.captures.white;
                S.capturedByBlack = previousState.captures.black;
                S.lastMove = deps.convertToUiMove(previousState.lastMove || (previousState.boardState && previousState.boardState.gameHistory && previousState.boardState.gameHistory.length
                    ? previousState.boardState.gameHistory[previousState.boardState.gameHistory.length - 1].move
                    : null));

                S.selectedSquare = null;
                S.gameEnded = false;
                S.suggestedMove = null;

                S.cachedLegalDests = null;
                S.cachedLegalDestsSquare = null;
                deps.updateCapturesDisplay();
                deps.scheduleRender();
                deps.updateStatus();
                deps.updateTimerDisplays();
                deps.updateResignButtonState();
            }
        }

        return {
            updateCanvasRect,
            getCanvasRect,
            getSquareFromCoords,
            getLegalDestsForSelectedSquare,
            isDraggingPiece,
            handleMousedown,
            handleMousemove,
            processMousemove,
            handleMouseup,
            handleSquareClick,
            selectPiece,
            executeMove,
            applyPCMove,
            makePCMove,
            getHint,
            restoreHintButton,
            performUndo
        };
    }

    return { createBoardInteraction };
});
