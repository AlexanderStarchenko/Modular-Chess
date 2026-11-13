/**
 * Chess UI Timers Module
 * Pure timer formatting/parsing helpers and timer controller factory.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUITimers = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    function parseTimeControl(timeControlSelect, customMinsInput, customIncInput) {
        if (timeControlSelect && timeControlSelect.value === 'custom') {
            const mins = parseFloat(customMinsInput && customMinsInput.value) || 10;
            const inc = parseFloat(customIncInput && customIncInput.value) || 0;
            return { time: mins * 60, inc: inc };
        }
        const raw = timeControlSelect && timeControlSelect.value ? timeControlSelect.value : '600,0';
        const parts = raw.split(',');
        return { time: parseFloat(parts[0]), inc: parseFloat(parts[1]) || 0 };
    }

    function formatTime(seconds) {
        if (seconds <= 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function updateTimerDisplays(deps) {
        const state = deps.getState();
        const { whiteTimeLeft, blackTimeLeft, initialTime } = state;
        if (whiteTimeLeft === 0 && blackTimeLeft === 0 && initialTime === 0) return;

        const isWhiteBottom = !deps.isFlipped();
        const bottomColor = isWhiteBottom ? 'w' : 'b';
        const bottomTimeLeft = isWhiteBottom ? whiteTimeLeft : blackTimeLeft;
        const topTimeLeft = isWhiteBottom ? blackTimeLeft : whiteTimeLeft;
        const bottomFormatted = formatTime(bottomTimeLeft);
        const topFormatted = formatTime(topTimeLeft);

        const els = deps.getElements ? deps.getElements() : (deps.elements || {});
        const {
            bottomTimerDisplay,
            topTimerDisplay,
            bottomTimerContainer,
            topTimerContainer
        } = els;

        if (bottomTimerDisplay && bottomTimerDisplay.textContent !== bottomFormatted) {
            bottomTimerDisplay.textContent = bottomFormatted;
        }
        if (topTimerDisplay && topTimerDisplay.textContent !== topFormatted) {
            topTimerDisplay.textContent = topFormatted;
        }

        const turn = deps.getTurn();
        const isBottomTurn = turn === bottomColor;

        const oppCard = els.cachedOppCard || (typeof document !== 'undefined' ? document.getElementById('opponent-card') : null);
        const playerCard = els.cachedPlayerCard || (typeof document !== 'undefined' ? document.getElementById('player-card') : null);

        if (isBottomTurn) {
            if (bottomTimerContainer) bottomTimerContainer.classList.add('active');
            if (topTimerContainer) topTimerContainer.classList.remove('active');
            if (playerCard) playerCard.classList.add('glow-turn');
            if (oppCard) oppCard.classList.remove('glow-turn');
        } else {
            if (topTimerContainer) topTimerContainer.classList.add('active');
            if (bottomTimerContainer) bottomTimerContainer.classList.remove('active');
            if (oppCard) oppCard.classList.add('glow-turn');
            if (playerCard) playerCard.classList.remove('glow-turn');
        }

        if (bottomTimerContainer) {
            if (bottomTimeLeft > 0 && bottomTimeLeft < 60) {
                bottomTimerContainer.classList.add('low-time');
            } else {
                bottomTimerContainer.classList.remove('low-time');
            }
        }

        if (topTimerContainer) {
            if (topTimeLeft > 0 && topTimeLeft < 60) {
                topTimerContainer.classList.add('low-time');
            } else {
                topTimerContainer.classList.remove('low-time');
            }
        }
    }

    function createTimerController(ctx) {
        function stopTimer() {
            ctx.setTimerRunning(false);
            const intervalId = ctx.getTimerInterval();
            if (intervalId) {
                clearInterval(intervalId);
                ctx.setTimerInterval(null);
            }
        }

        function handleTimeout(color) {
            stopTimer();
            if (typeof ctx.onTimeout === 'function') {
                ctx.onTimeout(color);
            }
        }

        function startTimer() {
            const state = ctx.getState();
            if (state.isTimerRunning || state.initialTime === 0 || state.gameEnded) return;
            ctx.setTimerRunning(true);
            ctx.setLastTickTime(Date.now());

            const intervalId = setInterval(() => {
                const now = Date.now();
                const dt = (now - ctx.getLastTickTime()) / 1000;
                ctx.setLastTickTime(now);

                const turn = ctx.getTurn();
                const cur = ctx.getState();
                if (turn === 'w') {
                    const nextWhite = cur.whiteTimeLeft - dt;
                    ctx.setWhiteTimeLeft(nextWhite);
                    if (nextWhite <= 0) {
                        handleTimeout('w');
                    } else if (nextWhite <= 10 && !cur.hasPlayedLowTimeWarning) {
                        ctx.setHasPlayedLowTimeWarning(true);
                        if (typeof ctx.onLowTime === 'function') {
                            ctx.onLowTime();
                        } else if (typeof ChessAudio !== 'undefined') {
                            ChessAudio.lowTime();
                        }
                    }
                } else {
                    const nextBlack = cur.blackTimeLeft - dt;
                    ctx.setBlackTimeLeft(nextBlack);
                    if (nextBlack <= 0) {
                        handleTimeout('b');
                    } else if (nextBlack <= 10 && !cur.hasPlayedLowTimeWarning) {
                        ctx.setHasPlayedLowTimeWarning(true);
                        if (typeof ctx.onLowTime === 'function') {
                            ctx.onLowTime();
                        } else if (typeof ChessAudio !== 'undefined') {
                            ChessAudio.lowTime();
                        }
                    }
                }
                updateTimerDisplays(ctx);
            }, 100);

            ctx.setTimerInterval(intervalId);
        }

        return {
            parseTimeControl: () => {
                const els = ctx.getElements ? ctx.getElements() : (ctx.elements || {});
                return parseTimeControl(els.timeControlSelect, els.customMinsInput, els.customIncInput);
            },
            formatTime,
            updateTimerDisplays: () => updateTimerDisplays(ctx),
            startTimer,
            stopTimer,
            handleTimeout
        };
    }

    return {
        parseTimeControl,
        formatTime,
        updateTimerDisplays,
        createTimerController
    };
});
