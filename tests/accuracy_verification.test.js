const fs = require('fs');
const path = require('path');

// Mock browser globals similar to ui_ux.test.js
global.window = {};
global.document = {
    getElementById: jest.fn(),
    createElement: jest.fn(),
    documentElement: { style: { setProperty: jest.fn() }, classList: { add: jest.fn(), remove: jest.fn() } },
    addEventListener: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn().mockReturnValue([]),
    body: { appendChild: jest.fn(), removeChild: jest.fn() }
};
global.AudioContext = jest.fn().mockImplementation(() => ({
    state: 'running',
    currentTime: 0,
    createOscillator: jest.fn().mockReturnValue({
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }
    }),
    createGain: jest.fn().mockReturnValue({
        connect: jest.fn(),
        gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }
    }),
    destination: {}
}));
global.requestAnimationFrame = jest.fn(cb => cb());

// Mock ChessLogic
const ChessLogic = require('../js/logic');
jest.mock('../js/logic', () => ({
    getBoard: jest.fn().mockReturnValue(Array.from({ length: 8 }, () => new Array(8).fill(null))),
    getTurn: jest.fn().mockReturnValue('w'),
    movePiece: jest.fn().mockReturnValue(true),
    isKingInCheck: jest.fn().mockReturnValue(false),
    getState: jest.fn().mockReturnValue({}),
    subscribe: jest.fn(),
    initBoard: jest.fn(),
    loadState: jest.fn().mockReturnValue(true),
    loadFen: jest.fn(),
    getGameHistory: jest.fn().mockReturnValue([]),
    getFen: jest.fn().mockReturnValue('startpos'),
    getAllLegalMoves: jest.fn().mockReturnValue(['e2e4']),
    isValidMove: jest.fn().mockReturnValue(false)
}));

describe('EmpiricalChessVerification', () => {
    let mockElements;
    let clickHandlers;
    let changeHandlers;
    let originalSetTimeout;
    let originalClearTimeout;
    let originalSetInterval;
    let originalClearInterval;

    afterEach(() => {
        if (typeof ChessUI !== 'undefined' && ChessUI && ChessUI.clearPendingTimers) {
            ChessUI.clearPendingTimers();
        }
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
    });

    beforeEach(() => {
        originalSetTimeout = global.setTimeout;
        originalClearTimeout = global.clearTimeout;
        originalSetInterval = global.setInterval;
        originalClearInterval = global.clearInterval;

        global.setTimeout = jest.fn();
        global.clearTimeout = jest.fn();
        global.setInterval = jest.fn();
        global.clearInterval = jest.fn();

        clickHandlers = {};
        changeHandlers = {};
        mockElements = {};

        const elementIds = [
            'board-container', 'chessboard', 'status', 'game-info', 'history-list',
            'reset-btn', 'pc-toggle', 'difficulty-select', 'side-select', 'time-control',
            'custom-time-inputs', 'custom-mins', 'custom-inc', 'theme-select',
            'network-btn', 'analyze-btn', 'analysis-panel', 'analysis-list',
            'analysis-progress', 'analysis-advice', 'difficulty-container', 'side-container',
            'top-player-name', 'bottom-player-name', 'top-timer', 'bottom-timer',
            'top-timer-container', 'bottom-timer-container', 'top-captured',
            'bottom-captured', 'top-advantage', 'bottom-advantage', 'draw-btn',
            'hint-btn', 'game-over-modal', 'game-over-close-btn', 'game-over-reset-btn',
            'undo-btn', 'resign-btn', 'ui-theme-select', 'sidebar-drawer',
            'sidebar-backdrop', 'menu-btn', 'floating-menu-btn', 'close-sidebar-btn',
            'tab-btn-notation', 'tab-btn-analysis',
            'tab-content-notation', 'tab-content-analysis',
            'accuracy-bar-container', 'accuracy-white-bar', 'accuracy-black-bar',
            'game-over-title', 'game-over-reason', 'game-over-icon-container', 'opponent-avatar-container',
            'chess-canvas', 'game-condition-badge',
            'save-game-btn', 'load-game-btn', 'save-load-close-btn', 'save-load-modal',
            'export-json-btn', 'import-json-btn', 'import-file-input',
            'slot-1', 'slot-2', 'slot-3', 'top-accuracy', 'bottom-accuracy',
            'chat-input', 'chat-messages', 'chat-send-btn', 'tab-btn-chat', 'tab-content-chat',
            'settings-modal', 'settings-btn', 'settings-close-btn', 'settings-save-btn',
            'network-status-banner', 'opponent-status-dot', 'settings-network-telemetry',
            'settings-ping-val', 'settings-latency-val'
        ];

        const mockCtx = {
            scale: jest.fn(),
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            fillText: jest.fn(),
            strokeText: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            translate: jest.fn(),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: '',
            textBaseline: '',
            shadowColor: '',
            shadowBlur: 0,
            shadowOffsetY: 0
        };

        const createMockElement = (id) => {
            const isCanvas = id === 'chess-canvas' || id === 'canvas';
            const el = {
                id,
                appendChild: jest.fn(),
                click: jest.fn(),
                style: {},
                dataset: {},
                getBoundingClientRect: jest.fn().mockReturnValue({ top: 0, left: 0, width: isCanvas ? 400 : 50, height: isCanvas ? 400 : 50 }),
                addEventListener: jest.fn((event, handler) => {
                    if (event === 'click') clickHandlers[id] = handler;
                    else if (event === 'change') changeHandlers[id] = handler;
                }),
                classList: {
                    add: jest.fn(),
                    remove: jest.fn(),
                    toggle: jest.fn(),
                    contains: jest.fn().mockReturnValue(false)
                },
                querySelector: jest.fn().mockImplementation((selector) => {
                    return createMockElement(`${id}_${selector}`);
                }),
                querySelectorAll: jest.fn().mockReturnValue([]),
                parentElement: null
            };
            if (isCanvas) {
                el.getContext = jest.fn().mockReturnValue(mockCtx);
                el.width = 400;
                el.height = 400;
                el.clientWidth = 400;
                el.clientHeight = 400;
            }
            el.parentElement = el;
            return el;
        };

        elementIds.forEach(id => {
            mockElements[id] = createMockElement(id);
        });

        // Set specific default properties
        mockElements['pc-toggle'].checked = true;
        mockElements['difficulty-select'].value = '3';
        mockElements['side-select'].value = 'random';
        mockElements['theme-select'].value = 'classic';
        mockElements['ui-theme-select'].value = 'dark';
        mockElements['time-control'].value = '600,0';
        mockElements['custom-mins'].value = '10';
        mockElements['custom-inc'].value = '5';

        global.document.getElementById = jest.fn((id) => mockElements[id] || createMockElement(id));
        global.document.querySelector = jest.fn((selector) => {
            const cleanId = selector.replace(/[#.]/g, '').split('[')[0];
            return mockElements[cleanId] || createMockElement(cleanId);
        });
        global.document.querySelectorAll = jest.fn().mockReturnValue([]);
        global.document.createElement = jest.fn().mockImplementation((tag) => createMockElement(tag));

        global.window = {
            location: { protocol: 'http:', hash: '' },
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            setTimeout: jest.fn(),
            clearTimeout: jest.fn(),
            setInterval: jest.fn(),
            clearInterval: jest.fn()
        };

        global.navigator = { userAgent: 'node' };
        global.localStorage = {
            getItem: jest.fn().mockReturnValue(null),
            setItem: jest.fn(),
            removeItem: jest.fn()
        };

        global.confirm = jest.fn().mockReturnValue(true);
        global.alert = jest.fn();
        global.getComputedStyle = jest.fn().mockReturnValue({
            getPropertyValue: jest.fn().mockReturnValue('')
        });

        global.ChessLogic = ChessLogic;
        global.ChessNetwork = {
            getState: jest.fn().mockReturnValue({ connected: false }),
            on: jest.fn(),
            sendState: jest.fn(),
            disconnect: jest.fn()
        };

        global.ChessStorage = require('../js/storage');
        global.ChessAudio = require('../js/audio');
        global.ChessAIManager = require('../js/ai_manager');
    });

    test('1. Verify that the stats tab does not exist in index.html', () => {
        const htmlPath = path.join(__dirname, '../index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Verify there is no tab-btn-stats or stats tab references in index.html
        expect(htmlContent).not.toContain('tab-btn-stats');
        expect(htmlContent).not.toContain('tab-content-stats');
        expect(htmlContent).not.toContain('Статистика');
    });

    test('2. Verify accuracy bar DOM structure in index.html starts hidden and with 50% heights', () => {
        const htmlPath = path.join(__dirname, '../index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Check for presence of accuracy-bar-container
        expect(htmlContent).toContain('id="accuracy-bar-container"');
        expect(htmlContent).toContain('id="accuracy-white-bar"');
        expect(htmlContent).toContain('id="accuracy-black-bar"');

        // Verify container has style="display: none;" by default
        const containerMatch = htmlContent.match(/id="accuracy-bar-container"[^>]*style="display:\s*none;"/);
        expect(containerMatch).not.toBeNull();

        // Verify white and black bars have style="height: 50%;" by default
        const whiteBarMatch = htmlContent.match(/id="accuracy-white-bar"[^>]*style="height:\s*50%;"/);
        expect(whiteBarMatch).not.toBeNull();

        const blackBarMatch = htmlContent.match(/id="accuracy-black-bar"[^>]*style="height:\s*50%;"/);
        expect(blackBarMatch).not.toBeNull();
    });

    test('3. Verify accuracy bar runtime state transitions (hidden -> visible with correct values -> hidden on new game)', () => {
        let ChessUI;
        jest.isolateModules(() => {
            ChessUI = require('../js/ui');
        });

        // Initialize UI
        ChessUI.init();

        // Verify accuracy bar style is initially reset (hidden by default)
        expect(mockElements['accuracy-bar-container'].style.display).toBe('none');
        expect(mockElements['accuracy-white-bar'].style.height).toBe('50%');
        expect(mockElements['accuracy-black-bar'].style.height).toBe('50%');

        // Setup mock analysis stats and triggers
        const mockStats = {
            whiteAccuracy: 88,
            blackAccuracy: 92,
            moves: [],
            summary: {
                white: { brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
                black: { brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
            }
        };

        global.AnalysisManager = {
            analyzeGame: jest.fn().mockImplementation((history, onProgress, onComplete) => {
                onComplete(mockStats);
            })
        };

        // Trigger Analysis
        expect(clickHandlers['analyze-btn']).toBeDefined();
        clickHandlers['analyze-btn']();

        // Verify accuracy bar becomes visible with correct values
        expect(mockElements['accuracy-bar-container'].style.display).toBe('flex');
        expect(parseFloat(mockElements['accuracy-white-bar'].style.height)).toBeCloseTo(88 / 180 * 100, 5);
        expect(parseFloat(mockElements['accuracy-black-bar'].style.height)).toBeCloseTo(92 / 180 * 100, 5);

        // Trigger new game start via reset button click
        expect(clickHandlers['reset-btn']).toBeDefined();
        clickHandlers['reset-btn']();

        // Verify accuracy bar is hidden and reset to 50% heights
        expect(mockElements['accuracy-bar-container'].style.display).toBe('none');
        expect(mockElements['accuracy-white-bar'].style.height).toBe('50%');
        expect(mockElements['accuracy-black-bar'].style.height).toBe('50%');
    });
});
