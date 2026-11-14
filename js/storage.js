/**
 * Chess Storage Adapter
 * Encapsulates all persistence mechanisms.
 */

const ChessStorage = (() => {
    const SAVE_SLOTS_KEY_PREFIX = 'modular-chess-save-slot-';
    const memoryStore = new Map();

    function safeGet(key, defaultVal) {
        if (memoryStore.has(key)) {
            return memoryStore.get(key);
        }
        try {
            if (typeof localStorage !== 'undefined') {
                const val = localStorage.getItem(key);
                if (val !== null) {
                    return val;
                }
            }
        } catch (e) {}
        return defaultVal;
    }

    function safeSet(key, value) {
        const strVal = String(value);
        memoryStore.set(key, strVal);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, strVal);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function safeRemove(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            }
        } catch (e) {}
        memoryStore.delete(key);
    }

    const API = {
        getBoardTheme(defaultVal = 'classic') {
            return safeGet('board-theme', defaultVal);
        },
        setBoardTheme(theme) {
            return safeSet('board-theme', theme);
        },
        getUITheme(defaultVal = 'system') {
            return safeGet('ui-theme', defaultVal);
        },
        setUITheme(theme) {
            return safeSet('ui-theme', theme);
        },
        getSoundMuted(defaultVal = false) {
            const saved = safeGet('sound-muted', null);
            return saved !== null ? saved === 'true' : defaultVal;
        },
        setSoundMuted(muted) {
            return safeSet('sound-muted', Boolean(muted));
        },
        getSoundVolume(defaultVal = 1.0) {
            const saved = safeGet('sound-volume', null);
            if (saved === null) return defaultVal;
            const num = parseFloat(saved);
            return Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : defaultVal;
        },
        setSoundVolume(volume) {
            const num = typeof volume === 'number' ? volume : parseFloat(volume);
            if (!Number.isFinite(num)) return false;
            return safeSet('sound-volume', Math.min(1, Math.max(0, num)));
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
                if (data === undefined) return false;
                const serialized = JSON.stringify(data);
                if (typeof serialized !== 'string') return false;
                return safeSet(SAVE_SLOTS_KEY_PREFIX + slotNum, serialized);
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
