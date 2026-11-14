describe('ChessStorage Adapter', () => {
    const originalLocalStorage = global.localStorage;

    function loadFreshStorage(mockLS) {
        global.localStorage = mockLS;
        let mod;
        jest.isolateModules(() => {
            mod = require('../js/storage.js');
        });
        return mod;
    }

    afterEach(() => {
        global.localStorage = originalLocalStorage;
    });

    test('falls back to memoryStore when localStorage throws on setItem (QuotaExceededError) and returns null on getItem', () => {
        const mockLS = {
            getItem: jest.fn(() => null),
            setItem: jest.fn(() => {
                throw new Error('QuotaExceededError');
            }),
            removeItem: jest.fn()
        };
        const storage = loadFreshStorage(mockLS);

        expect(storage.setSaveSlot(1, { fen: '8/8/8/8/8/8/8/8 w - - 0 1' })).toBe(false);
        expect(storage.getSaveSlot(1)).toEqual({ fen: '8/8/8/8/8/8/8/8 w - - 0 1' });
    });

    test('setSaveSlot rejects undefined / unserializable data and returns true when localStorage persists', () => {
        const backing = new Map();
        const mockLS = {
            getItem: jest.fn((k) => (backing.has(k) ? backing.get(k) : null)),
            setItem: jest.fn((k, v) => backing.set(k, String(v))),
            removeItem: jest.fn((k) => backing.delete(k))
        };
        const storage = loadFreshStorage(mockLS);

        expect(storage.setSaveSlot(1, undefined)).toBe(false);
        expect(storage.setSaveSlot(1, () => {})).toBe(false);
        expect(storage.setSaveSlot(2, { moveCount: 12 })).toBe(true);
        expect(storage.getSaveSlot(2)).toEqual({ moveCount: 12 });
    });

    test('clamps sound volume to [0, 1] and protects against NaN / corrupt strings', () => {
        const backing = new Map([['sound-volume', 'undefined']]);
        const mockLS = {
            getItem: jest.fn((k) => (backing.has(k) ? backing.get(k) : null)),
            setItem: jest.fn((k, v) => backing.set(k, String(v))),
            removeItem: jest.fn((k) => backing.delete(k))
        };
        const storage = loadFreshStorage(mockLS);

        expect(storage.getSoundVolume(0.75)).toBe(0.75);
        expect(storage.getSoundVolume(null)).toBeNull();

        expect(storage.setSoundVolume(undefined)).toBe(false);
        expect(storage.setSoundVolume(NaN)).toBe(false);

        expect(storage.setSoundVolume(2.5)).toBe(true);
        expect(storage.getSoundVolume()).toBe(1);

        expect(storage.setSoundVolume(-0.4)).toBe(true);
        expect(storage.getSoundVolume()).toBe(0);
    });

    test('coerces truthy/falsy values to boolean in setSoundMuted', () => {
        const backing = new Map();
        const mockLS = {
            getItem: jest.fn((k) => (backing.has(k) ? backing.get(k) : null)),
            setItem: jest.fn((k, v) => backing.set(k, String(v))),
            removeItem: jest.fn((k) => backing.delete(k))
        };
        const storage = loadFreshStorage(mockLS);

        storage.setSoundMuted(1);
        expect(storage.getSoundMuted(false)).toBe(true);

        storage.setSoundMuted(0);
        expect(storage.getSoundMuted(true)).toBe(false);
    });

    test('is immune to Object.prototype keys like toString or constructor in memoryStore', () => {
        const mockLS = {
            getItem: jest.fn(() => null),
            setItem: jest.fn(() => {
                throw new Error('Blocked');
            }),
            removeItem: jest.fn()
        };
        const storage = loadFreshStorage(mockLS);

        expect(storage.getBoardTheme('classic')).toBe('classic');
        expect(storage.getSaveSlot('toString')).toBeNull();
        expect(storage.getSaveSlot('constructor')).toBeNull();
    });

    test('returns true in Node environment when localStorage is undefined', () => {
        const storage = loadFreshStorage(undefined);
        expect(storage.setSaveSlot(1, { moveCount: 5 })).toBe(true);
        expect(storage.getSaveSlot(1)).toEqual({ moveCount: 5 });
    });

    test('returns latest value from memoryStore when overwriting existing slot fails with QuotaExceededError', () => {
        const backing = new Map([['modular-chess-save-slot-1', JSON.stringify({ version: 'old' })]]);
        const mockLS = {
            getItem: jest.fn((k) => (backing.has(k) ? backing.get(k) : null)),
            setItem: jest.fn(() => {
                throw new Error('QuotaExceededError');
            }),
            removeItem: jest.fn((k) => backing.delete(k))
        };
        const storage = loadFreshStorage(mockLS);

        expect(storage.setSaveSlot(1, { version: 'new' })).toBe(false);
        expect(storage.getSaveSlot(1)).toEqual({ version: 'new' });
    });
});
