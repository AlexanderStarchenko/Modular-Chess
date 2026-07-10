/**
 * Chess Storage Adapter
 * Encapsulates all persistence mechanisms.
 */

const ChessStorage = (() => {
    const SAVE_SLOTS_KEY_PREFIX = 'modular-chess-save-slot-';

    const API = {
        getBoardTheme(defaultVal = 'classic') {
            return localStorage.getItem('board-theme') || defaultVal;
        },
        setBoardTheme(theme) {
            localStorage.setItem('board-theme', theme);
        },
        getUITheme(defaultVal = 'dark') {
            return localStorage.getItem('ui-theme') || defaultVal;
        },
        setUITheme(theme) {
            localStorage.setItem('ui-theme', theme);
        },
        getSoundMuted(defaultVal = false) {
            const saved = localStorage.getItem('sound-muted');
            return saved !== null ? saved === 'true' : defaultVal;
        },
        setSoundMuted(muted) {
            localStorage.setItem('sound-muted', muted);
        },
        getSoundVolume(defaultVal = 1.0) {
            const saved = localStorage.getItem('sound-volume');
            return saved !== null ? parseFloat(saved) : defaultVal;
        },
        setSoundVolume(volume) {
            localStorage.setItem('sound-volume', volume);
        },
        getSaveSlot(slotNum) {
            try {
                const data = localStorage.getItem(SAVE_SLOTS_KEY_PREFIX + slotNum);
                return data ? JSON.parse(data) : null;
            } catch (err) {
                console.error('[Storage] Error loading save slot', slotNum, err);
                return null;
            }
        },
        setSaveSlot(slotNum, data) {
            try {
                localStorage.setItem(SAVE_SLOTS_KEY_PREFIX + slotNum, JSON.stringify(data));
                return true;
            } catch (err) {
                console.error('[Storage] Error saving slot', slotNum, err);
                return false;
            }
        },
        deleteSaveSlot(slotNum) {
            localStorage.removeItem(SAVE_SLOTS_KEY_PREFIX + slotNum);
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
