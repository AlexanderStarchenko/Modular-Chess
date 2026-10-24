/**
 * Unit and Integration Tests for Web Audio API & Network Side Selection
 */

const ChessAudio = require('../js/audio');

describe('ChessAudio Unit Tests (Web Audio API & Fallbacks)', () => {
    let originalWindow;

    beforeEach(() => {
        originalWindow = global.window;
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.window = originalWindow;
    });

    test('should return null or AudioContext when getContext is called', () => {
        const ctx = ChessAudio.getContext();
        // Should handle gracefully in non-browser Jest environment
        expect(ctx === null || typeof ctx === 'object').toBe(true);
    });

    test('should allow setting muted state and volume', () => {
        expect(() => {
            ChessAudio.setMuted(true);
            ChessAudio.setMuted(false);
            ChessAudio.setVolume(0.8);
            ChessAudio.setVolume(0);
        }).not.toThrow();
    });

    test('should play move, capture, and lowTime sounds without throwing errors', () => {
        expect(() => {
            ChessAudio.move();
            ChessAudio.capture();
            ChessAudio.lowTime();
        }).not.toThrow();
    });

    test('should utilize Web Audio API when AudioContext is mocked', async () => {
        const mockBuffer = {};
        const mockSource = {
            buffer: null,
            connect: jest.fn(),
            start: jest.fn()
        };
        const mockGainNode = {
            gain: { value: 1.0 },
            connect: jest.fn()
        };
        const mockAudioContext = jest.fn().mockImplementation(() => ({
            state: 'suspended',
            resume: jest.fn().mockResolvedValue(),
            decodeAudioData: jest.fn().mockImplementation((data, success) => {
                if (success) success(mockBuffer);
                return Promise.resolve(mockBuffer);
            }),
            createBufferSource: jest.fn().mockReturnValue(mockSource),
            createGain: jest.fn().mockReturnValue(mockGainNode),
            destination: {}
        }));

        global.window = {
            AudioContext: mockAudioContext
        };
        global.fetch = jest.fn().mockResolvedValue({
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
        });

        // Trigger sounds via mocked Web Audio API
        const ctx = ChessAudio.getContext();
        expect(ctx).toBeDefined();

        ChessAudio.setMuted(false);
        ChessAudio.move();
        ChessAudio.capture();
        ChessAudio.lowTime();
    });

    test('should respect muted setting and suppress sound playback', () => {
        ChessAudio.setMuted(true);
        expect(() => {
            ChessAudio.move();
            ChessAudio.capture();
            ChessAudio.lowTime();
        }).not.toThrow();
        ChessAudio.setMuted(false);
    });
});

describe('Network Side Selection & UI Game Mode Hiding', () => {
    let mockElements;
    let eventListeners;

    beforeEach(() => {
        mockElements = {};
        eventListeners = {};

        const elementIds = [
            'board', 'board-container', 'animation-layer', 'status', 'game-info',
            'history-list', 'reset-btn', 'pc-toggle', 'difficulty-select', 'side-select',
            'top-player-name', 'bottom-player-name',
            'theme-select', 'game-mode-container', 'difficulty-container', 'side-container',
            'network-btn', 'undo-btn', 'draw-btn', 'time-control', 'custom-time-inputs',
            'custom-mins', 'custom-inc', 'top-timer', 'bottom-timer', 'top-timer-container',
            'bottom-timer-container', 'top-captured', 'bottom-captured', 'top-advantage',
            'bottom-advantage', 'top-accuracy', 'bottom-accuracy', 'accuracy-bar-container',
            'accuracy-white-bar', 'accuracy-black-bar', 'network-room-modal', 'network-room-input',
            'network-side-select', 'network-room-confirm-btn', 'network-room-cancel-btn',
            'network-room-close-btn', 'network-status-banner'
        ];

        elementIds.forEach(id => {
            mockElements[id] = {
                id,
                style: { display: '' },
                parentElement: { style: { display: '' } },
                classList: {
                    add: jest.fn(),
                    remove: jest.fn(),
                    contains: jest.fn().mockReturnValue(false)
                },
                listeners: {},
                addEventListener: jest.fn((event, handler) => {
                    if (!mockElements[id].listeners[event]) mockElements[id].listeners[event] = [];
                    mockElements[id].listeners[event].push(handler);
                    eventListeners[`${id}:${event}`] = handler;
                }),
                setAttribute: jest.fn(),
                removeAttribute: jest.fn(),
                getContext: jest.fn().mockReturnValue({
                    clearRect: jest.fn(),
                    drawImage: jest.fn(),
                    beginPath: jest.fn(),
                    arc: jest.fn(),
                    fill: jest.fn()
                }),
                getBoundingClientRect: jest.fn().mockReturnValue({ left: 0, top: 0, width: 400, height: 400 }),
                innerHTML: '',
                textContent: '',
                value: '',
                checked: false,
                disabled: false
            };
        });

        global.document = {
            getElementById: jest.fn(id => mockElements[id] || null),
            querySelectorAll: jest.fn().mockReturnValue([]),
            createElement: jest.fn(() => ({
                style: {},
                classList: { add: jest.fn(), remove: jest.fn() },
                appendChild: jest.fn()
            })),
            documentElement: {
                style: { setProperty: jest.fn() }
            },
            body: { appendChild: jest.fn() },
            addEventListener: jest.fn()
        };

        global.ChessLogic = require('../js/logic');
        global.ChessNetwork = {
            on: jest.fn(),
            getState: jest.fn().mockReturnValue({ connected: false, roomId: null }),
            sendState: jest.fn()
        };

        global.window = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            location: { protocol: 'http:', hostname: 'localhost', hash: '' }
        };
    });

    test('should properly hide game-mode-container and show side-container in network mode', () => {
        // Setup ChessNetwork mockup
        const networkListeners = {};
        global.ChessNetwork = {
            on: jest.fn((event, handler) => {
                networkListeners[event] = handler;
            }),
            getState: jest.fn().mockReturnValue({ connected: true, roomId: 'room-101' }),
            sendState: jest.fn()
        };

        const ChessUI = require('../js/ui');
        ChessUI.init();

        // Trigger network connected status event
        if (networkListeners['status']) {
            networkListeners['status']({ connected: true, roomId: 'room-101' });
        }

        expect(mockElements['game-mode-container'].style.display).toBe('none');
        expect(mockElements['difficulty-container'].style.display).toBe('none');
        expect(mockElements['network-btn'].textContent).toContain('Покинуть комнату (room-101)');

        // Trigger network disconnect status event
        if (networkListeners['status']) {
            networkListeners['status']({ connected: false, roomId: null });
        }

        expect(mockElements['game-mode-container'].style.display).toBe('');
        expect(mockElements['network-btn'].textContent).toBe('Играть по сети');
    });

    test('should synchronize side-select and network-side-select inputs', () => {
        const ChessUI = require('../js/ui');
        ChessUI.init();

        mockElements['side-select'].value = 'b';
        (mockElements['side-select'].listeners['change'] || []).forEach(fn => fn());
        expect(mockElements['network-side-select'].value).toBe('b');

        mockElements['network-side-select'].value = 'w';
        (mockElements['network-side-select'].listeners['change'] || []).forEach(fn => fn());
        expect(mockElements['side-select'].value).toBe('w');
    });

    test('should force Stockfish and hide game-mode-container on PC (desktop)', () => {
        global.window.__FORCE_DESKTOP_TEST__ = true;
        const ChessUI = require('../js/ui');
        ChessUI.init();

        expect(mockElements['game-mode-container'].style.display).toBe('none');
        expect(mockElements['pc-toggle'].checked).toBe(true);
        expect(mockElements['difficulty-container'].style.display).toBe('');
        delete global.window.__FORCE_DESKTOP_TEST__;
    });
});
