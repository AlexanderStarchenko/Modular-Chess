/**
 * Chess UI Board Renderer Module
 * Handles Canvas chessboard rendering, piece sprites, highlights, hints, and move animations.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIBoardRenderer = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const PIECE_UNICODE = {
        'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
        'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
    };

    const PIECE_CODES = {
        'P': 'wP', 'R': 'wR', 'N': 'wN', 'B': 'wB', 'Q': 'wQ', 'K': 'wK',
        'p': 'bP', 'r': 'bR', 'n': 'bN', 'b': 'bB', 'q': 'bQ', 'k': 'bK'
    };

    const pieceImages = {};
    let imagesInitialized = false;
    let animationLayer = null;

    function initPieceImages(onLoaded) {
        if (imagesInitialized || typeof Image === 'undefined') return pieceImages;
        imagesInitialized = true;
        let loadedCount = 0;
        const totalPieces = Object.keys(PIECE_CODES).length;
        for (const [code, file] of Object.entries(PIECE_CODES)) {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === totalPieces && typeof onLoaded === 'function') {
                    onLoaded();
                }
            };
            img.onerror = () => {
                console.warn(`[UI] Piece image failed to load: pieces/${file}.svg`);
            };
            img.src = `pieces/${file}.svg`;
            pieceImages[code] = img;
        }
        return pieceImages;
    }

    function getBoardOverlay(boardContainer) {
        if (!boardContainer) return null;
        if (!animationLayer || animationLayer.parentNode !== boardContainer) {
            const existing = typeof boardContainer.querySelector === 'function'
                ? boardContainer.querySelector('.move-animation-layer')
                : null;
            if (existing) {
                animationLayer = existing;
            } else {
                animationLayer = document.createElement('div');
                animationLayer.className = 'move-animation-layer';
                boardContainer.appendChild(animationLayer);
            }
        }
        return animationLayer;
    }

    function animateMove(opts = {}) {
        const {
            fromRow,
            fromCol,
            toRow,
            toCol,
            piece,
            boardElement,
            boardContainer,
            flipped = false,
            safeRaf = (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 0)),
            safeSetTimeout = (cb, delay) => setTimeout(cb, delay),
            onComplete
        } = opts;

        if (!boardElement || !boardContainer || !piece) return;

        const size = boardElement.clientWidth;
        if (size <= 0) return;
        const squareSize = size / 8;

        const fR = flipped ? 7 - fromRow : fromRow;
        const fC = flipped ? 7 - fromCol : fromCol;
        const tR = flipped ? 7 - toRow : toRow;
        const tC = flipped ? 7 - toCol : toCol;

        const layer = getBoardOverlay(boardContainer);
        if (!layer) return;

        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            if (typeof onComplete === 'function') {
                onComplete(toRow, toCol);
            }
        };

        const flyPiece = document.createElement('img');
        flyPiece.className = 'piece-fly';
        flyPiece.src = `pieces/${PIECE_CODES[piece]}.svg`;
        flyPiece.style.width = `${squareSize * 0.88}px`;
        flyPiece.style.height = `${squareSize * 0.88}px`;
        const offset = (squareSize * 0.12) / 2;
        flyPiece.style.left = `${fC * squareSize + offset}px`;
        flyPiece.style.top = `${fR * squareSize + offset}px`;
        flyPiece.style.transform = 'translate3d(0, 0, 0)';
        flyPiece.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
        flyPiece.style.opacity = '1';

        layer.appendChild(flyPiece);

        safeRaf(() => {
            const dx = (tC - fC) * squareSize;
            const dy = (tR - fR) * squareSize;
            flyPiece.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        });

        flyPiece.addEventListener('transitionend', () => {
            flyPiece.remove();
            finish();
        }, { once: true });

        safeSetTimeout(() => {
            if (flyPiece.isConnected) flyPiece.remove();
            finish();
        }, 260);
    }

    function drawPieceAtOrigin(ctx, piece, squareSize) {
        if (!ctx) return;
        const img = pieceImages[piece];
        let drewImage = false;
        if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            try {
                const pieceSize = squareSize * 0.88;
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
            const fontSize = squareSize * 0.72;
            ctx.font = `${fontSize}px Inter, "Arial Unicode MS", sans-serif`;
            const text = PIECE_UNICODE[piece];
            const isBlack = piece === piece.toLowerCase();

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
    }

    function renderBoard(state = {}) {
        const {
            ctx,
            canvas,
            boardElement,
            board,
            flipped = false,
            themeColors,
            currentTurn = 'w',
            isTurnKingInCheck = false,
            selectedSquare = null,
            lastMove = null,
            suggestedMove = null,
            hoverSquare = null,
            isWaitingForPC = false,
            isWaitingForStart = false,
            gameEnded = false,
            analysisSnapshot = null,
            legalDests = [],
            animatingMove = null,
            isDragging = false,
            dragStartSquare = null,
            draggedPiece = null,
            dragCurrentX = 0,
            dragCurrentY = 0
        } = state;

        if (!ctx || !canvas || !boardElement || !board) return;

        // Resize canvas to match boardElement size
        const size = boardElement.clientWidth;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
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

        const colors = themeColors || {
            light: '#EFE6D5',
            dark: '#AE845C',
            coordLight: '#EFE6D5',
            coordDark: '#7A5838',
            selected: 'rgba(212, 163, 89, 0.42)',
            lastFrom: 'rgba(216, 184, 62, 0.34)',
            lastTo: 'rgba(216, 184, 62, 0.48)',
            hint: 'rgba(64, 156, 112, 0.32)',
            check: 'rgba(217, 68, 68, 0.40)'
        };

        // 1. Draw Squares & Highlights
        for (let ri = 0; ri < 8; ri++) {
            for (let ci = 0; ci < 8; ci++) {
                const r = flipped ? 7 - ri : ri;
                const c = flipped ? 7 - ci : ci;

                const x = ci * squareSize;
                const y = ri * squareSize;

                // Base Square
                ctx.fillStyle = (r + c) % 2 === 0 ? colors.light : colors.dark;
                ctx.fillRect(x, y, squareSize, squareSize);

                // Last Move Highlights (muted warm ochre)
                if (lastMove && lastMove.fromRow === r && lastMove.fromCol === c) {
                    ctx.fillStyle = colors.lastFrom;
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                if (lastMove && lastMove.toRow === r && lastMove.toCol === c) {
                    ctx.fillStyle = colors.lastTo;
                    ctx.fillRect(x, y, squareSize, squareSize);
                }

                // Selected Square Highlight + subtle inner inset frame
                if (selectedSquare && selectedSquare.row === r && selectedSquare.col === c) {
                    ctx.fillStyle = colors.selected;
                    ctx.fillRect(x, y, squareSize, squareSize);
                    if (typeof ctx.strokeRect === 'function') {
                        ctx.save();
                        const inset = Math.max(1, squareSize * 0.03);
                        ctx.strokeStyle = 'rgba(212, 163, 89, 0.82)';
                        ctx.lineWidth = Math.max(1.5, squareSize * 0.035);
                        ctx.strokeRect(x + inset, y + inset, squareSize - inset * 2, squareSize - inset * 2);
                        ctx.restore();
                    }
                }

                // Suggested Best Move Highlights (studio sage-emerald)
                if (suggestedMove && suggestedMove.fromRow === r && suggestedMove.fromCol === c) {
                    ctx.fillStyle = colors.hint;
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                if (suggestedMove && suggestedMove.toRow === r && suggestedMove.toCol === c) {
                    ctx.fillStyle = colors.hint;
                    ctx.fillRect(x, y, squareSize, squareSize);
                }

                // Check Highlight (soft radial crimson gradient with fallback)
                const piece = board[r][c];
                const isCurrentTurnKing = (currentTurn === 'w' && piece === 'K') || (currentTurn === 'b' && piece === 'k');
                if (isCurrentTurnKing && isTurnKingInCheck) {
                    if (typeof ctx.createRadialGradient === 'function') {
                        const cx = x + squareSize / 2;
                        const cy = y + squareSize / 2;
                        const grad = ctx.createRadialGradient(cx, cy, squareSize * 0.08, cx, cy, squareSize * 0.56);
                        grad.addColorStop(0, 'rgba(217, 68, 68, 0.65)');
                        grad.addColorStop(0.55, colors.check);
                        grad.addColorStop(1, 'rgba(217, 68, 68, 0)');
                        ctx.fillStyle = grad;
                    } else {
                        ctx.fillStyle = colors.check;
                    }
                    ctx.fillRect(x, y, squareSize, squareSize);
                }

                // Hover square overlay (ultra-subtle)
                if (hoverSquare && hoverSquare.row === r && hoverSquare.col === c && !isWaitingForPC && !isWaitingForStart && !gameEnded && !analysisSnapshot) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
            }
        }

        // 1.5 Draw Legal Moves Dots (matte dots & crisp capture rings)
        if (selectedSquare && typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function') {
            legalDests.forEach(dest => {
                const displayRow = flipped ? 7 - dest.row : dest.row;
                const displayCol = flipped ? 7 - dest.col : dest.col;

                const x = displayCol * squareSize;
                const y = displayRow * squareSize;

                const centerX = x + squareSize / 2;
                const centerY = y + squareSize / 2;

                ctx.save();
                const pieceOnDest = board[dest.row][dest.col];
                if (pieceOnDest) {
                    ctx.strokeStyle = 'rgba(17, 18, 22, 0.28)';
                    ctx.lineWidth = Math.max(2, squareSize * 0.075);
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, squareSize * 0.41, 0, Math.PI * 2);
                    if (typeof ctx.stroke === 'function') ctx.stroke();
                } else {
                    ctx.fillStyle = 'rgba(17, 18, 22, 0.24)';
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, squareSize * 0.135, 0, Math.PI * 2);
                    if (typeof ctx.fill === 'function') ctx.fill();
                }
                ctx.restore();
            });
        }

        // 2. Draw Coordinates & Pieces
        const coordSize = Math.max(9, Math.round(squareSize * 0.165));
        const coordPad = Math.max(3, Math.round(squareSize * 0.065));
        for (let ri = 0; ri < 8; ri++) {
            for (let ci = 0; ci < 8; ci++) {
                const r = flipped ? 7 - ri : ri;
                const c = flipped ? 7 - ci : ci;

                const x = ci * squareSize;
                const y = ri * squareSize;

                // Proportional Crisp Coordinates
                if (ci === 0 || ri === 7) {
                    ctx.save();
                    ctx.globalAlpha = 0.78;
                    ctx.font = `600 ${coordSize}px Inter, sans-serif`;
                    ctx.fillStyle = (r + c) % 2 === 0 ? colors.coordDark : colors.coordLight;

                    if (ci === 0) { // Rank Label (left edge)
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'top';
                        ctx.fillText(8 - r, x + coordPad, y + coordPad);
                    }
                    if (ri === 7) { // File Label (bottom edge)
                        ctx.textAlign = 'right';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(String.fromCharCode(97 + c), x + squareSize - coordPad, y + squareSize - coordPad);
                    }
                    ctx.restore();
                }

                // Piece
                const piece = board[r][c];
                if (piece) {
                    if (animatingMove && animatingMove.toRow === r && animatingMove.toCol === c) {
                        continue;
                    }
                    const isDraggingThis = isDragging && dragStartSquare && dragStartSquare.row === r && dragStartSquare.col === c;
                    const isHovered = hoverSquare && hoverSquare.row === r && hoverSquare.col === c && !isWaitingForPC && !isWaitingForStart && !gameEnded && !analysisSnapshot && !isDragging;

                    ctx.save();
                    if (isDraggingThis) {
                        ctx.globalAlpha = 0.25;
                    }

                    // Restrained grounded shadow (disable blur during dragging to avoid GPU lag)
                    if (!isDragging || isHovered) {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.24)';
                        ctx.shadowBlur = isHovered ? 5 : 3;
                        ctx.shadowOffsetY = isHovered ? 3 : 2;
                    } else {
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetY = 0;
                    }

                    // Centering
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Gentle hover scale and float
                    const scale = isHovered ? 1.06 : 1.0;
                    const floatY = isHovered ? -1 : 0;

                    ctx.translate(x + squareSize / 2, y + squareSize / 2 + floatY);
                    ctx.scale(scale, scale);

                    drawPieceAtOrigin(ctx, piece, squareSize);

                    ctx.restore();
                }
            }
        }

        // 2.5 Draw Suggested Move Directional Arrow
        if (suggestedMove &&
            suggestedMove.fromRow !== undefined && suggestedMove.fromCol !== undefined &&
            suggestedMove.toRow !== undefined && suggestedMove.toCol !== undefined &&
            typeof ctx.beginPath === 'function' &&
            typeof ctx.moveTo === 'function' &&
            typeof ctx.lineTo === 'function') {
            const fR = flipped ? 7 - suggestedMove.fromRow : suggestedMove.fromRow;
            const fC = flipped ? 7 - suggestedMove.fromCol : suggestedMove.fromCol;
            const tR = flipped ? 7 - suggestedMove.toRow : suggestedMove.toRow;
            const tC = flipped ? 7 - suggestedMove.toCol : suggestedMove.toCol;

            const startX = fC * squareSize + squareSize / 2;
            const startY = fR * squareSize + squareSize / 2;
            const endX = tC * squareSize + squareSize / 2;
            const endY = tR * squareSize + squareSize / 2;

            const dx = endX - startX;
            const dy = endY - startY;
            const len = Math.hypot(dx, dy);
            if (len > 1) {
                const angle = Math.atan2(dy, dx);
                const headLen = Math.max(10, squareSize * 0.28);
                const headWidth = Math.max(6, squareSize * 0.16);
                const lineStartX = startX + Math.cos(angle) * (squareSize * 0.12);
                const lineStartY = startY + Math.sin(angle) * (squareSize * 0.12);
                const lineEndX = endX - Math.cos(angle) * (headLen * 0.72);
                const lineEndY = endY - Math.sin(angle) * (headLen * 0.72);

                ctx.save();
                ctx.strokeStyle = 'rgba(64, 156, 112, 0.85)';
                ctx.fillStyle = 'rgba(64, 156, 112, 0.85)';
                ctx.lineWidth = Math.max(3, squareSize * 0.105);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                ctx.beginPath();
                ctx.moveTo(lineStartX, lineStartY);
                ctx.lineTo(lineEndX, lineEndY);
                if (typeof ctx.stroke === 'function') ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(
                    endX - headLen * Math.cos(angle) + headWidth * Math.sin(angle),
                    endY - headLen * Math.sin(angle) - headWidth * Math.cos(angle)
                );
                ctx.lineTo(
                    endX - headLen * Math.cos(angle) - headWidth * Math.sin(angle),
                    endY - headLen * Math.sin(angle) + headWidth * Math.cos(angle)
                );
                if (typeof ctx.closePath === 'function') ctx.closePath();
                if (typeof ctx.fill === 'function') ctx.fill();
                ctx.restore();
            }
        }

        // 3. Draw Dragged Piece
        if (isDragging && draggedPiece) {
            ctx.save();

            // Draw piece shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 5;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.translate(dragCurrentX, dragCurrentY);
            // Natural drag scale for picked up piece
            ctx.scale(1.12, 1.12);

            drawPieceAtOrigin(ctx, draggedPiece, squareSize);

            ctx.restore();
        }
    }

    return {
        PIECE_CODES,
        PIECE_UNICODE,
        initPieceImages,
        getBoardOverlay,
        animateMove,
        drawPieceAtOrigin,
        renderBoard
    };
});
