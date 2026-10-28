/**
 * Chess Storage Adapter
 * Encapsulates all persistence mechanisms.
 */

const ChessStorage = (() => {
    const SAVE_SLOTS_KEY_PREFIX = 'modular-chess-save-slot-';
    const memoryStore = {};

    function safeGet(key, defaultVal) {
        try {
            if (typeof localStorage !== 'undefined') {
                const val = localStorage.getItem(key);
                return val !== null ? val : defaultVal;
            }
        } catch (e) {}
        return key in memoryStore ? memoryStore[key] : defaultVal;
    }

    function safeSet(key, value) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, value);
            }
        } catch (e) {}
        memoryStore[key] = String(value);
    }

    function safeRemove(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            }
        } catch (e) {}
        delete memoryStore[key];
    }

    const API = {
        getBoardTheme(defaultVal = 'classic') {
            return safeGet('board-theme', defaultVal);
        },
        setBoardTheme(theme) {
            safeSet('board-theme', theme);
        },
        getUITheme(defaultVal = 'system') {
            return safeGet('ui-theme', defaultVal);
        },
        setUITheme(theme) {
            safeSet('ui-theme', theme);
        },
        getSoundMuted(defaultVal = false) {
            const saved = safeGet('sound-muted', null);
            return saved !== null ? saved === 'true' : defaultVal;
        },
        setSoundMuted(muted) {
            safeSet('sound-muted', muted);
        },
        getSoundVolume(defaultVal = 1.0) {
            const saved = safeGet('sound-volume', null);
            return saved !== null ? parseFloat(saved) : defaultVal;
        },
        setSoundVolume(volume) {
            safeSet('sound-volume', volume);
        },
        getSaveSlot(slotNum) {
            try {
                const data = safeGet(SAVE_SLOTS_KEY_PREFIX + slotNum, null);
                return data ? JSON.parse(data) : null;
            } catch (err) {
                console.error('[Storage] Error loading save slot', slotNum, err);
                return null;
            }
        },
        setSaveSlot(slotNum, data) {
            try {
                safeSet(SAVE_SLOTS_KEY_PREFIX + slotNum, JSON.stringify(data));
                return true;
            } catch (err) {
                console.error('[Storage] Error saving slot', slotNum, err);
                return false;
            }
        },
        deleteSaveSlot(slotNum) {
            safeRemove(SAVE_SLOTS_KEY_PREFIX + slotNum);
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
