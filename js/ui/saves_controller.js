/**
 * Chess UI Saves Controller Module
 * Handles save slots in localStorage/ChessStorage, save/load modal, and JSON export/import.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ChessUISaves = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const SAVE_SLOTS_KEY_PREFIX = 'modular-chess-save-slot-';

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

    function createSavesController(deps) {
        const isNetworkConnected = () => !!(deps && typeof deps.isNetworkConnected === 'function' && deps.isNetworkConnected());
        const notifySlotsUI = () => {
            if (deps && typeof deps.updateSlotsUI === 'function') {
                deps.updateSlotsUI();
            } else if (typeof PanelsView !== 'undefined' && typeof PanelsView.updateSlotsUI === 'function') {
                PanelsView.updateSlotsUI({
                    getSaveSlot,
                    isNetworkConnected: isNetworkConnected()
                });
            }
        };

        function getModal() {
            if (deps && typeof deps.getModalElement === 'function') {
                return deps.getModalElement();
            }
            return typeof document !== 'undefined' ? document.getElementById('save-load-modal') : null;
        }

        function saveToSlot(slotNum) {
            try {
                const saveObj = deps.serializeGameState();
                if (typeof ChessStorage !== 'undefined') {
                    const persisted = ChessStorage.setSaveSlot(slotNum, saveObj);
                    if (persisted === false) {
                        alert('Не удалось сохранить игру в постоянное хранилище (нет места или доступ ограничен).');
                    }
                } else {
                    localStorage.setItem(SAVE_SLOTS_KEY_PREFIX + slotNum, JSON.stringify(saveObj));
                }
                notifySlotsUI();
            } catch (e) {
                console.error('Error saving to slot ' + slotNum, e);
                alert('Ошибка при сохранении игры!');
            }
        }

        function closeSaveLoadModal() {
            const modal = getModal();
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function loadFromSlot(slotNum) {
            const saveObj = getSaveSlot(slotNum);
            if (!saveObj) {
                alert('Слот пуст!');
                return;
            }

            if (isNetworkConnected()) {
                alert('Загрузка игр отключена во время сетевого матча.');
                return;
            }

            if (deps.deserializeGameState(saveObj)) {
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
                notifySlotsUI();
            }
        }

        function openSaveLoadModal() {
            const modal = getModal();
            if (!modal) return;

            notifySlotsUI();

            const saveBtns = modal.querySelectorAll('.slot-save-btn');
            const loadBtns = modal.querySelectorAll('.slot-load-btn');
            const networkLocked = isNetworkConnected();

            saveBtns.forEach((btn) => {
                btn.disabled = false;
            });
            loadBtns.forEach((btn, idx) => {
                const saveObj = getSaveSlot(idx + 1);
                btn.disabled = !saveObj || networkLocked;
            });

            modal.style.display = 'flex';
        }

        function exportToJSON() {
            try {
                const saveObj = deps.serializeGameState();
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
            if (isNetworkConnected()) {
                alert('Импорт игр отключен во время сетевого матча.');
                return;
            }

            const file = event && event.target && event.target.files ? event.target.files[0] : null;
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const saveObj = JSON.parse(e.target.result);
                    if (deps.deserializeGameState(saveObj)) {
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
            getSaveSlot,
            saveToSlot,
            loadFromSlot,
            deleteSlot,
            openSaveLoadModal,
            closeSaveLoadModal,
            exportToJSON,
            importFromJSON
        };
    }

    return {
        SAVE_SLOTS_KEY_PREFIX,
        getSaveSlot,
        createSavesController
    };
});
