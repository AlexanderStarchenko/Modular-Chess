(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUIPanelsView = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    function renderHistoryFromMoves(historyListElement, gameHistory, onRefreshMoveCount) {
        let moveCount = 1;
        if (!historyListElement) {
            if (typeof onRefreshMoveCount === 'function') onRefreshMoveCount(moveCount);
            return { moveCount };
        }

        historyListElement.innerHTML = '';
        if (!Array.isArray(gameHistory)) {
            if (typeof onRefreshMoveCount === 'function') onRefreshMoveCount(moveCount);
            return { moveCount };
        }

        gameHistory.forEach((item, idx) => {
            const move = item.move || item;
            const tC = move.toCol !== undefined ? move.toCol : move.tC;
            const tR = move.toRow !== undefined ? move.toRow : move.tR;
            if (tC === undefined || tR === undefined) return;
            const to = `${FILES[tC]}${8 - tR}`;
            if (idx % 2 === 0) {
                const li = document.createElement('li');
                const spanNum = document.createElement('span');
                spanNum.textContent = `${Math.floor(idx / 2) + 1}.`;
                const spanWhite = document.createElement('span');
                spanWhite.textContent = to;
                const spanBlack = document.createElement('span');
                li.appendChild(spanNum);
                li.appendChild(spanWhite);
                li.appendChild(spanBlack);
                historyListElement.appendChild(li);
            } else {
                const lastLi = historyListElement.lastElementChild;
                if (lastLi && lastLi.children && lastLi.children[2]) {
                    lastLi.children[2].textContent = to;
                }
            }
        });

        moveCount = Math.floor(gameHistory.length / 2) + 1;
        historyListElement.scrollTop = historyListElement.scrollHeight;
        if (typeof onRefreshMoveCount === 'function') onRefreshMoveCount(moveCount);
        return { moveCount };
    }

    function setSafeHistoryHtml(historyListElement, html) {
        if (!historyListElement || typeof html !== 'string') return;
        historyListElement.innerHTML = '';
        try {
            if (typeof DOMParser !== 'undefined') {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const items = doc.querySelectorAll('li');
                if (items.length > 0) {
                    items.forEach(item => {
                        const li = document.createElement('li');
                        item.querySelectorAll('span').forEach(span => {
                            const s = document.createElement('span');
                            s.textContent = (span.textContent || '').replace(/[^\w\sа-яА-ЯёЁ.:+#=x-]/gi, '');
                            li.appendChild(s);
                        });
                        historyListElement.appendChild(li);
                    });
                    return;
                }
            }
        } catch (e) {}
        const safeText = html.replace(/<[^>]*>?/gm, '');
        historyListElement.textContent = safeText;
    }

    function removeLastHistoryMove(historyListElement) {
        if (!historyListElement || !historyListElement.lastElementChild) return;
        const lastLi = historyListElement.lastElementChild;
        if (lastLi.children && lastLi.children[2] && lastLi.children[2].textContent) {
            lastLi.children[2].textContent = '';
        } else {
            lastLi.remove();
        }
    }

    function addToHistory(historyListElement, moveCount, fR, fC, tR, tC, turn) {
        if (!historyListElement) return moveCount;
        const to = `${FILES[tC]}${8 - tR}`;

        if (turn === 'w') {
            const lastLi = historyListElement.lastElementChild;
            if (lastLi && lastLi.children && lastLi.children[2]) {
                lastLi.children[2].textContent = to;
            }
            return moveCount;
        }

        const li = document.createElement('li');
        li.innerHTML = `<span>${moveCount}.</span><span>${to}</span><span></span>`;
        historyListElement.appendChild(li);
        historyListElement.scrollTop = historyListElement.scrollHeight;
        return moveCount + 1;
    }

    function appendChatMessage(chatMessagesEl, sender, text) {
        if (!chatMessagesEl) return;
        const msgEl = document.createElement('div');
        msgEl.className = 'p-2 rounded-lg bg-surface-container-low border border-outline-variant text-xs mb-1';

        const senderSpan = document.createElement('strong');
        senderSpan.className = sender === 'Вы' ? 'text-primary' : 'text-on-surface-variant';
        senderSpan.textContent = `${sender}: `;

        const textSpan = document.createElement('span');
        textSpan.textContent = text;

        msgEl.appendChild(senderSpan);
        msgEl.appendChild(textSpan);
        chatMessagesEl.appendChild(msgEl);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }

    function displayAccuracyStats(deps) {
        if (!deps || !deps.stats) return;
        const {
            stats,
            analysisProgress,
            accuracyBarContainer,
            accuracyWhiteBar,
            accuracyBlackBar,
            isFlipped,
            scheduleRender
        } = deps;

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

        const topAcc = deps.topAccuracyEl || (typeof document !== 'undefined' ? document.getElementById('top-accuracy') : null);
        const bottomAcc = deps.bottomAccuracyEl || (typeof document !== 'undefined' ? document.getElementById('bottom-accuracy') : null);

        if (topAcc && bottomAcc) {
            const flipped = typeof isFlipped === 'function' ? isFlipped() : Boolean(isFlipped);
            const isWhiteBottom = !flipped;
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

        if (accuracyBarContainer) {
            accuracyBarContainer.style.display = 'flex';
            if (accuracyBarContainer.classList) {
                accuracyBarContainer.classList.remove('animate-pulse');
            }
        }
        if (accuracyWhiteBar) {
            accuracyWhiteBar.style.height = whitePct + '%';
            accuracyWhiteBar.title = `Точность Белых: ${stats.whiteAccuracy}%`;
        }
        if (accuracyBlackBar) {
            accuracyBlackBar.style.height = blackPct + '%';
            accuracyBlackBar.title = `Точность Черных: ${stats.blackAccuracy}%`;
        }

        if (typeof scheduleRender === 'function') {
            scheduleRender();
        }
    }

    function renderAnalysisList(deps) {
        if (!deps || !deps.analysisList) return;
        const { analysisList, analysisResults, onSelectMove } = deps;
        analysisList.innerHTML = '';
        let activeAnalysisItem = null;
        const fragment = (typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function')
            ? document.createDocumentFragment()
            : null;

        (analysisResults || []).forEach((result, index) => {
            const li = document.createElement('li');
            li.className = 'hover:bg-surface-container-high rounded-lg px-2.5 py-2 transition-colors cursor-pointer';

            const num = Math.floor(index / 2) + 1;
            let qualityHtml = '';
            if (result.quality) {
                qualityHtml = `<span class="quality-badge ${result.qualityClass}" style="margin-left:5px;">${result.quality}</span>`;
            }

            const accuracyHtml = `<span class="text-primary font-mono" style="margin-left: 6px; font-size:0.85em; font-weight: 600;">${result.accuracy}%</span>`;

            li.innerHTML = `
                <div class="flex items-center w-full text-xs">
                    <strong class="w-7 text-on-surface-variant font-mono">${num}.</strong>
                    <span class="flex-1 font-mono">${result.move.uci}</span>
                    ${qualityHtml}
                    ${accuracyHtml}
                </div>
            `;

            li.addEventListener('click', () => {
                if (typeof onSelectMove === 'function') {
                    onSelectMove(index, result, li);
                }
                if (activeAnalysisItem) {
                    activeAnalysisItem.style.backgroundColor = '';
                    if (activeAnalysisItem.classList) activeAnalysisItem.classList.remove('bg-surface-container-high');
                }
                li.style.backgroundColor = 'var(--color-surface-container-high)';
                if (li.classList) li.classList.add('bg-surface-container-high');
                activeAnalysisItem = li;
            });

            if (fragment) {
                fragment.appendChild(li);
            } else {
                analysisList.appendChild(li);
            }
        });

        if (fragment) {
            analysisList.appendChild(fragment);
        }
    }

    function updateSlotsUI(slotsListEl, getSaveSlotFn, handlers = {}) {
        const networkConnected = Boolean(handlers && handlers.networkConnected);

        for (let i = 1; i <= 3; i++) {
            const slotEl = (slotsListEl && typeof slotsListEl.querySelector === 'function')
                ? (slotsListEl.querySelector(`#slot-${i}`) || (typeof document !== 'undefined' ? document.getElementById(`slot-${i}`) : null))
                : (typeof document !== 'undefined' ? document.getElementById(`slot-${i}`) : null);
            if (!slotEl) continue;

            const saveObj = typeof getSaveSlotFn === 'function' ? getSaveSlotFn(i) : null;
            const timeEl = slotEl.querySelector('.slot-time');
            const detailsEl = slotEl.querySelector('.slot-details');
            const modeEl = slotEl.querySelector('.slot-mode');
            const movesEl = slotEl.querySelector('.slot-moves');
            const saveBtn = slotEl.querySelector('.slot-save-btn');
            const loadBtn = slotEl.querySelector('.slot-load-btn');
            const deleteBtn = slotEl.querySelector('.slot-delete-btn');

            if (saveObj) {
                const date = new Date(saveObj.date);
                if (timeEl) {
                    timeEl.textContent = date.toLocaleString('ru-RU', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }

                const isPC = saveObj.settings && saveObj.settings.pcToggle;
                if (modeEl) modeEl.textContent = isPC ? 'Против ИИ' : 'Два игрока';
                if (movesEl) movesEl.textContent = Math.floor((saveObj.moveCount || 1) / 2) + 1;

                if (detailsEl) detailsEl.classList.remove('hidden');

                if (loadBtn) {
                    loadBtn.disabled = networkConnected;
                    loadBtn.classList.remove('text-on-surface-variant');
                    loadBtn.classList.add('text-on-surface', 'hover:border-primary', 'hover:text-primary');
                }
                if (deleteBtn) deleteBtn.classList.remove('hidden');
            } else {
                if (timeEl) timeEl.textContent = 'Пусто';
                if (detailsEl) detailsEl.classList.add('hidden');
                if (loadBtn) {
                    loadBtn.disabled = true;
                    loadBtn.classList.add('text-on-surface-variant');
                    loadBtn.classList.remove('text-on-surface', 'hover:border-primary', 'hover:text-primary');
                }
                if (deleteBtn) deleteBtn.classList.add('hidden');
            }

            if (saveBtn && typeof handlers.onSave === 'function') {
                saveBtn.onclick = () => handlers.onSave(i);
            }
            if (loadBtn && typeof handlers.onLoad === 'function') {
                loadBtn.onclick = () => handlers.onLoad(i);
            }
            if (deleteBtn && typeof handlers.onDelete === 'function') {
                deleteBtn.onclick = () => handlers.onDelete(i);
            }
        }
    }

    return {
        renderHistoryFromMoves,
        setSafeHistoryHtml,
        removeLastHistoryMove,
        addToHistory,
        appendChatMessage,
        displayAccuracyStats,
        renderAnalysisList,
        updateSlotsUI
    };
});
