/**
 * Chess UI Theme & Visual Styling Module
 * Extracted visual styling, theme tokens, avatars, badges, and captures display.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUITheme = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const PIECE_VALUES = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };

    function initDraggableSwitches() {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
        const switches = document.querySelectorAll('.switch');
        switches.forEach(switchEl => {
            const checkbox = switchEl.querySelector('input[type="checkbox"]');
            const slider = switchEl.querySelector('.slider');
            if (!checkbox || !slider) return;

            let isDragging = false;
            let startX = 0;
            let startChecked = false;
            const maxDrag = 24; // Slider width (48) - thumb width (18) - left/right gap (3*2) = 24

            const thumb = slider.querySelector('.thumb');
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
                const delta = clientX - startX;

                const currentTranslation = startChecked ? maxDrag : 0;
                let targetTranslation = currentTranslation + delta;
                targetTranslation = Math.max(0, Math.min(maxDrag, targetTranslation));

                thumb.style.transform = `translateX(${targetTranslation}px)`;

                const ratio = targetTranslation / maxDrag;
                slider.style.backgroundColor = `color-mix(in srgb, var(--color-primary) ${ratio * 100}%, var(--slider-track-bg))`;
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
    }

    function refreshThemeColors() {
        try {
            const style = getComputedStyle(document.documentElement);
            return {
                light: style.getPropertyValue('--board-light').trim() || '#EFE6D5',
                dark: style.getPropertyValue('--board-dark').trim() || '#AE845C',
                coordLight: style.getPropertyValue('--board-coord-light').trim() || '#EFE6D5',
                coordDark: style.getPropertyValue('--board-coord-dark').trim() || '#7A5838',
                selected: style.getPropertyValue('--board-selected').trim() || 'rgba(212, 163, 89, 0.42)',
                lastFrom: style.getPropertyValue('--board-last-from').trim() || 'rgba(216, 184, 62, 0.34)',
                lastTo: style.getPropertyValue('--board-last-to').trim() || 'rgba(216, 184, 62, 0.48)',
                hint: style.getPropertyValue('--board-hint').trim() || 'rgba(64, 156, 112, 0.32)',
                check: style.getPropertyValue('--board-check').trim() || 'rgba(217, 68, 68, 0.40)'
            };
        } catch (e) {
            return {
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
        }
    }

    function updateTheme(deps = {}) {
        const { themeSelect, boardElement, onColorsUpdated, renderBoard, scheduleRender } = deps;
        const theme = themeSelect ? themeSelect.value : 'classic';
        const root = document.documentElement;
        root.style.setProperty('--board-light', `var(--${theme}-light)`);
        root.style.setProperty('--board-dark', `var(--${theme}-dark)`);
        root.style.setProperty('--board-coord-light', `var(--${theme}-coord-light)`);
        root.style.setProperty('--board-coord-dark', `var(--${theme}-coord-dark)`);
        if (boardElement && boardElement.dataset) {
            boardElement.dataset.theme = theme;
        }
        if (typeof ChessStorage !== 'undefined') ChessStorage.setBoardTheme(theme);
        const colors = refreshThemeColors();
        if (typeof onColorsUpdated === 'function') onColorsUpdated(colors);
        if (typeof renderBoard === 'function') renderBoard();
        else if (typeof scheduleRender === 'function') scheduleRender();
        return colors;
    }

    function applyUITheme(deps = {}) {
        const themeChoice = typeof deps === 'string' ? deps : (deps.themeChoice || 'system');
        const { onColorsUpdated, scheduleRender, hasCanvas } = typeof deps === 'object' ? deps : {};

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

        const colors = refreshThemeColors();
        if (typeof onColorsUpdated === 'function') onColorsUpdated(colors);
        if (hasCanvas && typeof scheduleRender === 'function') scheduleRender();
        return effectiveTheme;
    }

    function getStockfishName(difficultyValueOrSelect, selectedOptionText = '') {
        let val = '2';
        let fallbackText = selectedOptionText;

        if (typeof difficultyValueOrSelect === 'string') {
            val = difficultyValueOrSelect || '2';
        } else if (difficultyValueOrSelect && typeof difficultyValueOrSelect === 'object') {
            val = difficultyValueOrSelect.value || '2';
            if (!fallbackText && difficultyValueOrSelect.options && difficultyValueOrSelect.selectedIndex >= 0) {
                fallbackText = difficultyValueOrSelect.options[difficultyValueOrSelect.selectedIndex].text;
            }
        } else {
            return 'Stockfish 19';
        }

        if (val === 'neural-v1-7-alphabeta' || val === 'neural-v1-7') return 'Нейросеть V1.7 (Alpha-Beta 12-SE)';
        if (val === 'neural-v1-6-alphabeta') return 'Нейросеть V1.6 (Alpha-Beta)';
        if (val === 'neural-v1-6-mcts') return 'Нейросеть V1.6 (MCTS 4672)';
        if (val === 'neural-v1-6') return 'Нейросеть V1.6 (5-Ply Minimax)';
        if (val === 'neural-v1-5-mcts') return 'Нейросеть V1.5 (MCTS)';
        if (val === 'neural-v1-5') return 'Нейросеть V1.5 (5-Ply Minimax)';
        if (val === 'neural') return 'Нейросеть V1 (ModularNet)';

        const labels = {
            '1': 'Легкий',
            '2': 'Средний',
            '3': 'Сложный',
            '4': 'Экстра-сложный',
            '5': 'Нереальный'
        };
        const levelName = labels[val] || fallbackText || '';
        return levelName ? `Stockfish 19 (${levelName})` : 'Stockfish 19';
    }

    function updateGameFormatBadge(badgeEl, timeControlValue, customMins = 10, customInc = 0) {
        if (!badgeEl) return;

        let time = 600;
        let inc = 0;
        if (timeControlValue === 'custom') {
            time = (parseFloat(customMins) || 10) * 60;
            inc = parseFloat(customInc) || 0;
        } else if (typeof timeControlValue === 'string') {
            const parts = timeControlValue.split(',');
            time = parseFloat(parts[0]);
            inc = parseFloat(parts[1]) || 0;
        }

        if (time === 0) {
            badgeEl.textContent = 'Unlimited';
            return;
        }

        const estimatedDuration = time + 40 * inc;
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

        badgeEl.textContent = formatText;
    }

    function renderAvatar(container, imgEl, iconEl, type) {
        if (!container) return;
        if (type === 'player') {
            if (imgEl && imgEl.style) imgEl.style.display = 'none';
            if (iconEl) {
                if (iconEl.style) iconEl.style.display = 'block';
                iconEl.textContent = 'person';
            }
            if (container.classList && typeof container.classList.add === 'function') {
                container.classList.remove('bg-surface-container-highest', 'border-outline-variant/20');
                container.classList.add('bg-primary-container/20', 'border-primary/25');
            }
        } else if (type === 'stockfish') {
            if (!imgEl && typeof document !== 'undefined') {
                imgEl = document.createElement('img');
                imgEl.className = 'w-full h-full object-contain rounded-lg';
                imgEl.src = 'images/stockfish.png?v=62';
                imgEl.alt = 'Stockfish';
                container.appendChild(imgEl);
            } else if (imgEl) {
                if (imgEl.style) imgEl.style.display = 'block';
                imgEl.src = 'images/stockfish.png?v=62';
            }
            if (iconEl && iconEl.style) iconEl.style.display = 'none';
            if (container.classList && typeof container.classList.add === 'function') {
                container.classList.remove('bg-primary-container/20', 'border-primary/25');
                container.classList.add('bg-surface-container-highest', 'border-outline-variant/20');
            }
        } else if (type === 'neural') {
            if (imgEl && imgEl.style) imgEl.style.display = 'none';
            if (iconEl) {
                if (iconEl.style) iconEl.style.display = 'block';
                iconEl.textContent = 'psychology';
            }
            if (container.classList && typeof container.classList.add === 'function') {
                container.classList.remove('bg-primary-container/20', 'border-primary/25');
                container.classList.add('bg-surface-container-highest', 'border-outline-variant/20');
            }
        }
    }

    function updateAvatars(deps = {}) {
        const { pcToggle, difficultySelect, networkState, isManualFlip } = deps;
        const opponentAvatarContainer = document.getElementById('opponent-avatar-container');
        const opponentAvatarImg = document.getElementById('opponent-avatar-img');
        const opponentAvatarIcon = document.getElementById('opponent-avatar-icon');
        const playerAvatarContainer = document.getElementById('player-avatar-container');
        const playerAvatarImg = document.getElementById('player-avatar-img');
        const playerAvatarIcon = document.getElementById('player-avatar-icon');

        const isPC = !!(pcToggle && pcToggle.checked);
        const isNeural = difficultySelect && (difficultySelect.value || '').startsWith('neural');
        const aiType = isNeural ? 'neural' : 'stockfish';

        const isPlayerBottom = (isPC || (networkState && networkState.connected))
            ? !isManualFlip
            : true;

        const bottomType = isPC ? (isPlayerBottom ? 'player' : aiType) : 'player';
        const topType = isPC ? (isPlayerBottom ? aiType : 'player') : 'player';

        if (playerAvatarContainer) {
            renderAvatar(playerAvatarContainer, playerAvatarImg, playerAvatarIcon, bottomType);
        }
        if (opponentAvatarContainer) {
            renderAvatar(opponentAvatarContainer, opponentAvatarImg, opponentAvatarIcon, topType);
        }
    }

    function updateOpponentAvatar(deps = {}) {
        updateAvatars(deps);
    }

    function showGameOverModal(title, reason, icon = 'workspace_premium') {
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

    function renderCapturesDisplay(deps = {}) {
        const {
            capturedByWhite = [],
            capturedByBlack = [],
            flipped = false,
            bottomCapturedEl,
            topCapturedEl,
            topAdvantageEl,
            bottomAdvantageEl
        } = deps;

        const whiteScore = capturedByWhite.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
        const blackScore = capturedByBlack.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);

        const sortByValue = arr => [...arr].sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));

        const BLACK_UNICODE = {
            'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };
        const WHITE_UNICODE = {
            'q': '♕', 'r': '♖', 'b': '♗', 'n': '♘', 'p': '♙'
        };

        const isBottomWhite = !flipped;
        const bottomCaptured = isBottomWhite ? sortByValue(capturedByWhite) : sortByValue(capturedByBlack);
        const topCaptured = isBottomWhite ? sortByValue(capturedByBlack) : sortByValue(capturedByWhite);
        const bottomScore = isBottomWhite ? whiteScore : blackScore;
        const topScore = isBottomWhite ? blackScore : whiteScore;

        if (bottomCapturedEl) {
            bottomCapturedEl.textContent = bottomCaptured.map(p => (isBottomWhite ? BLACK_UNICODE[p] : WHITE_UNICODE[p]) || '').join('');
        }
        if (topCapturedEl) {
            topCapturedEl.textContent = topCaptured.map(p => (isBottomWhite ? WHITE_UNICODE[p] : BLACK_UNICODE[p]) || '').join('');
        }

        const topAdv = topScore - bottomScore;
        if (topAdvantageEl) topAdvantageEl.textContent = topAdv > 0 ? `+${topAdv}` : '';
        if (bottomAdvantageEl) bottomAdvantageEl.textContent = topAdv < 0 ? `+${-topAdv}` : '';
    }

    return {
        initDraggableSwitches,
        refreshThemeColors,
        updateTheme,
        applyUITheme,
        getStockfishName,
        updateGameFormatBadge,
        renderAvatar,
        updateAvatars,
        updateOpponentAvatar,
        showGameOverModal,
        renderCapturesDisplay
    };
});
