/**
 * Chess UI Orchestrator Module
 * Wires modular UI controllers, renderers, and DOM/event bindings.
 */
const isCommonJS = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
const UITheme = isCommonJS ? require('./design/theme') : window.ChessUITheme;
const BoardRenderer = isCommonJS ? require('./design/board_renderer') : window.ChessUIBoardRenderer;
const PanelsView = isCommonJS ? require('./design/panels_view') : window.ChessUIPanelsView;
const UITimers = isCommonJS ? require('./ui/timers') : window.ChessUITimers;
const UIAnalysis = isCommonJS ? require('./ui/analysis_controller') : window.ChessUIAnalysis;
const UISaves = isCommonJS ? require('./ui/saves_controller') : window.ChessUISaves;
const UIBoardInteraction = isCommonJS ? require('./ui/board_interaction') : window.ChessUIBoardInteraction;
const UIGameFlow = isCommonJS ? require('./ui/game_flow') : window.ChessUIGameFlow;
const UIDomEvents = isCommonJS ? require('./ui/dom_events') : window.ChessUIDomEvents;

const ChessUI = (() => {
    const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes(' electron/');
    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:' && !isElectron;

    const S = {
        dom: {},
        canvas: null,
        ctx: null,
        switchTab: null,
        logicUnsubscribe: null,
        cachedCanvasRect: null,
        renderScheduled: false,
        animatingMove: null,
        cachedThemeColors: null,
        cachedLegalDests: null,
        cachedLegalDestsSquare: null,
        cachedLegalDestsFen: null,
        selectedSquare: null,
        lastMove: null,
        hoverSquare: null,
        moveCount: 1,
        isWaitingForPC: false,
        pcMoveTimeoutId: null,
        pendingTimeouts: new Set(),
        playerColor: 'w',
        pcColor: 'b',
        stateHistory: [],
        isSoundMuted: false,
        soundVolume: 1.0,
        isManualFlip: false,
        isRemoteAction: false,
        isDragging: false,
        dragStartSquare: null,
        draggedPiece: null,
        dragCurrentX: 0,
        dragCurrentY: 0,
        lastMousedownSquare: null,
        draggedOccurred: false,
        isWaitingForStart: false,
        isCalculatingHint: false,
        analysisResults: [],
        selectedAnalysisIndex: null,
        suggestedMove: null,
        analysisSnapshot: null,
        currentAnalysisSessionId: 0,
        timerInterval: null,
        whiteTimeLeft: 600,
        blackTimeLeft: 600,
        increment: 0,
        initialTime: 600,
        initialInc: 0,
        isTimerRunning: false,
        gameEnded: false,
        lastTickTime: null,
        hasPlayedLowTimeWarning: false,
        capturedByWhite: [],
        capturedByBlack: [],
        networkState: (typeof ChessNetwork !== 'undefined') ? ChessNetwork.getState() : { connected: false }
    };

    function safeSetTimeout(fn, delay) {
        const id = setTimeout(() => {
            S.pendingTimeouts.delete(id);
            fn();
        }, delay);
        S.pendingTimeouts.add(id);
        return id;
    }

    function safeClearTimeout(id) {
        if (id) {
            clearTimeout(id);
            S.pendingTimeouts.delete(id);
        }
    }

    function cancelPendingMove() {
        if (S.pcMoveTimeoutId) {
            safeClearTimeout(S.pcMoveTimeoutId);
            S.pcMoveTimeoutId = null;
        }
        S.isWaitingForPC = false;
    }

    function clearPendingTimers() {
        cancelPendingMove();
        if (S.timerInterval) {
            clearInterval(S.timerInterval);
            S.timerInterval = null;
        }
        for (const id of S.pendingTimeouts) {
            clearTimeout(id);
        }
        S.pendingTimeouts.clear();
    }

    function safeRaf(cb) {
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') return window.requestAnimationFrame(cb);
        return setTimeout(cb, 0);
    }

    function scheduleRender() {
        if (S.renderScheduled) return;
        S.renderScheduled = true;
        safeRaf(() => {
            S.renderScheduled = false;
            renderBoard();
        });
    }

    function refreshThemeColors() {
        S.cachedThemeColors = UITheme.refreshThemeColors();
    }

    function renderBoard() {
        if (!S.ctx) return;
        if (!S.cachedThemeColors) refreshThemeColors();
        const currentTurn = S.analysisSnapshot ? S.analysisSnapshot.turn : ChessLogic.getTurn();
        BoardRenderer.renderBoard({
            ctx: S.ctx,
            canvas: S.canvas,
            boardElement: S.dom.boardElement,
            board: ChessLogic.getBoard(),
            flipped: gameFlow.isFlipped(),
            themeColors: S.cachedThemeColors,
            currentTurn,
            isTurnKingInCheck: ChessLogic.isKingInCheck(currentTurn),
            selectedSquare: S.selectedSquare,
            lastMove: S.lastMove,
            suggestedMove: S.suggestedMove,
            hoverSquare: S.hoverSquare,
            isWaitingForPC: S.isWaitingForPC,
            isWaitingForStart: S.isWaitingForStart,
            gameEnded: S.gameEnded,
            analysisSnapshot: S.analysisSnapshot,
            legalDests: S.selectedSquare ? boardInteraction.getLegalDestsForSelectedSquare() : [],
            animatingMove: S.animatingMove,
            isDragging: S.isDragging,
            dragStartSquare: S.dragStartSquare,
            draggedPiece: S.draggedPiece,
            dragCurrentX: S.dragCurrentX,
            dragCurrentY: S.dragCurrentY
        });
    }

    function animateMove(fromRow, fromCol, toRow, toCol, piece) {
        if (!S.dom.boardElement || !S.dom.boardContainer || !piece) return;
        S.animatingMove = { toRow, toCol };
        BoardRenderer.animateMove({
            fromRow,
            fromCol,
            toRow,
            toCol,
            piece,
            boardElement: S.dom.boardElement,
            boardContainer: S.dom.boardContainer,
            flipped: gameFlow.isFlipped(),
            safeRaf,
            safeSetTimeout,
            onComplete: () => {
                if (S.animatingMove && S.animatingMove.toRow === toRow && S.animatingMove.toCol === toCol) {
                    S.animatingMove = null;
                    scheduleRender();
                }
            }
        });
    }

    const timerController = UITimers.createTimerController({
        getState: () => ({
            whiteTimeLeft: S.whiteTimeLeft,
            blackTimeLeft: S.blackTimeLeft,
            initialTime: S.initialTime,
            isTimerRunning: S.isTimerRunning,
            gameEnded: S.gameEnded,
            hasPlayedLowTimeWarning: S.hasPlayedLowTimeWarning
        }),
        isFlipped: () => gameFlow.isFlipped(),
        getTurn: () => ChessLogic.getTurn(),
        getElements: () => ({
            bottomTimerDisplay: S.dom.bottomTimerDisplay,
            topTimerDisplay: S.dom.topTimerDisplay,
            bottomTimerContainer: S.dom.bottomTimerContainer,
            topTimerContainer: S.dom.topTimerContainer,
            cachedOppCard: S.dom.cachedOppCard,
            cachedPlayerCard: S.dom.cachedPlayerCard,
            timeControlSelect: S.dom.timeControlSelect,
            customMinsInput: S.dom.customMinsInput,
            customIncInput: S.dom.customIncInput
        }),
        setTimerRunning: (val) => { S.isTimerRunning = val; },
        getTimerInterval: () => S.timerInterval,
        setTimerInterval: (id) => { S.timerInterval = id; },
        getLastTickTime: () => S.lastTickTime,
        setLastTickTime: (t) => { S.lastTickTime = t; },
        setWhiteTimeLeft: (val) => { S.whiteTimeLeft = val; },
        setBlackTimeLeft: (val) => { S.blackTimeLeft = val; },
        setHasPlayedLowTimeWarning: (val) => { S.hasPlayedLowTimeWarning = val; },
        onLowTime: () => {
            if (typeof ChessAudio !== 'undefined') ChessAudio.lowTime();
        },
        onTimeout: (color) => gameFlow.finishGame('timeout', color)
    });

    const analysisController = UIAnalysis.createAnalysisController({
        isFileProtocol,
        isGameEnded: () => S.gameEnded,
        switchTab: (tab) => {
            if (typeof S.switchTab === 'function') S.switchTab(tab);
        },
        getElements: () => ({
            analysisBtn: S.dom.analysisBtn,
            analysisPanel: S.dom.analysisPanel,
            analysisList: S.dom.analysisList,
            analysisProgress: S.dom.analysisProgress,
            stockfishTip: S.dom.stockfishTip,
            accuracyBarContainer: S.dom.accuracyBarContainer,
            accuracyWhiteBar: S.dom.accuracyWhiteBar,
            accuracyBlackBar: S.dom.accuracyBlackBar
        }),
        setAnalysisSnapshot: (val) => { S.analysisSnapshot = val; },
        setSuggestedMove: (val) => { S.suggestedMove = val; },
        getGameHistory: () => ChessLogic.getGameHistory(),
        getAnalysisSessionId: () => S.currentAnalysisSessionId,
        setAnalysisResults: (val) => { S.analysisResults = val; },
        getAnalysisResults: () => S.analysisResults,
        setSelectedAnalysisIndex: (val) => { S.selectedAnalysisIndex = val; },
        loadFen: (fen, opts) => ChessLogic.loadFen(fen, opts),
        getTurn: () => ChessLogic.getTurn(),
        convertToUiMove: UIGameFlow.convertToUiMove,
        setLastMove: (val) => { S.lastMove = val; },
        setSelectedSquare: (val) => { S.selectedSquare = val; },
        updateStatus: (...args) => gameFlow.updateStatus(...args),
        renderBoard,
        scheduleRender,
        renderAnalysisList: () => PanelsView.renderAnalysisList({
            analysisList: S.dom.analysisList,
            analysisResults: S.analysisResults,
            onSelectMove: (index) => analysisController.selectAnalysisMove(index)
        }),
        displayAccuracyStats: (stats) => PanelsView.displayAccuracyStats({
            stats,
            analysisProgress: S.dom.analysisProgress,
            accuracyBarContainer: S.dom.accuracyBarContainer,
            accuracyWhiteBar: S.dom.accuracyWhiteBar,
            accuracyBlackBar: S.dom.accuracyBlackBar,
            isFlipped: () => gameFlow.isFlipped(),
            scheduleRender
        })
    });

    const updateAvatars = () => UITheme.updateAvatars({
        pcToggle: S.dom.pcToggle,
        difficultySelect: S.dom.difficultySelect,
        networkState: S.networkState,
        isManualFlip: S.isManualFlip
    });

    const updateCapturesDisplay = () => UITheme.renderCapturesDisplay({
        capturedByWhite: S.capturedByWhite,
        capturedByBlack: S.capturedByBlack,
        flipped: gameFlow.isFlipped(),
        bottomCapturedEl: S.dom.bottomCapturedEl,
        topCapturedEl: S.dom.topCapturedEl,
        topAdvantageEl: S.dom.topAdvantageEl,
        bottomAdvantageEl: S.dom.bottomAdvantageEl
    });

    const parseTimeControl = () => UITimers.parseTimeControl(
        S.dom.timeControlSelect,
        S.dom.customMinsInput,
        S.dom.customIncInput
    );

    const updateGameFormatBadge = () => UITheme.updateGameFormatBadge(
        S.dom.gameConditionBadge,
        S.dom.timeControlSelect ? S.dom.timeControlSelect.value : '600,0',
        S.dom.customMinsInput ? S.dom.customMinsInput.value : 10,
        S.dom.customIncInput ? S.dom.customIncInput.value : 0
    );

    const renderHistoryFromMoves = (gameHistory) => PanelsView.renderHistoryFromMoves(
        S.dom.historyListElement,
        gameHistory,
        (nextMoveCount) => { S.moveCount = nextMoveCount; }
    );

    const setSafeHistoryHtml = (html) => PanelsView.setSafeHistoryHtml(S.dom.historyListElement, html);

    const gameFlow = UIGameFlow.createGameFlow(S, {
        getStockfishName: () => UITheme.getStockfishName(S.dom.difficultySelect),
        updateAvatars,
        updateOpponentAvatar: updateAvatars,
        updateTimerDisplays: timerController.updateTimerDisplays,
        updateCapturesDisplay,
        renderBoard,
        scheduleRender,
        clearPendingTimers,
        cancelPendingMove,
        safeSetTimeout,
        hideAnalysis: analysisController.hideAnalysis,
        updateAnalysisTabVisibility: analysisController.updateAnalysisTabVisibility,
        startAutomaticBackgroundAnalysis: analysisController.startAutomaticBackgroundAnalysis,
        switchTab: (tab) => {
            if (typeof S.switchTab === 'function') S.switchTab(tab);
        },
        parseTimeControl,
        updateGameFormatBadge,
        startTimer: timerController.startTimer,
        stopTimer: timerController.stopTimer,
        showGameOverModal: UITheme.showGameOverModal,
        makePCMove: () => boardInteraction.makePCMove(),
        setSafeHistoryHtml,
        renderHistoryFromMoves
    });

    const boardInteraction = UIBoardInteraction.createBoardInteraction(S, {
        isFlipped: gameFlow.isFlipped,
        safeRaf,
        scheduleRender,
        renderBoard,
        animateMove,
        tryAutoStartOnInteraction: gameFlow.tryAutoStartOnInteraction,
        updateLastMove: (move) => { S.lastMove = move ? { ...move } : null; },
        updateCapturesDisplay,
        startTimer: timerController.startTimer,
        stopTimer: timerController.stopTimer,
        handleTurnEnd: gameFlow.handleTurnEnd,
        addToHistory: (fR, fC, tR, tC) => {
            S.moveCount = PanelsView.addToHistory(S.dom.historyListElement, S.moveCount, fR, fC, tR, tC, ChessLogic.getTurn());
        },
        removeLastHistoryMove: () => PanelsView.removeLastHistoryMove(S.dom.historyListElement),
        updateResignButtonState: gameFlow.updateResignButtonState,
        updatePlayerNames: gameFlow.updatePlayerNames,
        updateAvatars,
        updateHintButtonState: gameFlow.updateHintButtonState,
        cancelPendingMove,
        parseTimeControl,
        convertToUiMove: UIGameFlow.convertToUiMove,
        updateStatus: gameFlow.updateStatus,
        updateTimerDisplays: timerController.updateTimerDisplays
    });

    const savesController = UISaves.createSavesController({
        isNetworkConnected: () => !!(S.networkState && S.networkState.connected),
        serializeGameState: gameFlow.serializeGameState,
        deserializeGameState: gameFlow.deserializeGameState,
        updateSlotsUI: () => {
            const modal = typeof document !== 'undefined' ? document.getElementById('save-load-modal') : null;
            PanelsView.updateSlotsUI(modal, UISaves.getSaveSlot, {
                networkConnected: !!(S.networkState && S.networkState.connected)
            });
        }
    });

    function init() {
        UIDomEvents.initDomAndEvents(S, {
            clearPendingTimers,
            initPieceImages: () => BoardRenderer.initPieceImages(scheduleRender),
            updateCanvasRect: boardInteraction.updateCanvasRect,
            scheduleRender,
            renderBoard,
            tryAutoStartOnInteraction: gameFlow.tryAutoStartOnInteraction,
            getSquareFromCoords: boardInteraction.getSquareFromCoords,
            handleSquareClick: boardInteraction.handleSquareClick,
            handleMousedown: boardInteraction.handleMousedown,
            handleMousemove: boardInteraction.handleMousemove,
            handleMouseup: boardInteraction.handleMouseup,
            isDraggingPiece: boardInteraction.isDraggingPiece,
            startNewGame: gameFlow.startNewGame,
            updateGameModeControlState: gameFlow.updateGameModeControlState,
            updateOpponentAvatar: updateAvatars,
            updateNetworkUiAndTelemetry: gameFlow.updateNetworkUiAndTelemetry,
            updateResignButtonState: gameFlow.updateResignButtonState,
            executeMove: boardInteraction.executeMove,
            startTimer: timerController.startTimer,
            stopTimer: timerController.stopTimer,
            updateTimerDisplays: timerController.updateTimerDisplays,
            convertToUiMove: UIGameFlow.convertToUiMove,
            renderHistoryFromMoves,
            setSafeHistoryHtml,
            updateCapturesDisplay,
            updateGameFormatBadge,
            syncNetworkState: gameFlow.syncNetworkState,
            updatePlayerNames: gameFlow.updatePlayerNames,
            updateAvatars,
            performUndo: boardInteraction.performUndo,
            finishGame: gameFlow.finishGame,
            resetDrawButton: gameFlow.resetDrawButton,
            updateStatus: gameFlow.updateStatus,
            startAnalysis: analysisController.startAnalysis,
            getHint: boardInteraction.getHint,
            flipBoard: gameFlow.flipBoard,
            updateTheme: () => UITheme.updateTheme({
                themeSelect: S.dom.themeSelect,
                boardElement: S.dom.boardElement,
                onColorsUpdated: (colors) => { S.cachedThemeColors = colors; },
                renderBoard
            }),
            applyUITheme: (themeChoice) => UITheme.applyUITheme({
                themeChoice,
                onColorsUpdated: (colors) => { S.cachedThemeColors = colors; },
                scheduleRender,
                hasCanvas: !!S.ctx
            }),
            initDraggableSwitches: () => {
                UITheme.initDraggableSwitches();
                analysisController.updateAnalysisTabVisibility();
            },
            safeSetTimeout,
            cancelPendingMove,
            makePCMove: boardInteraction.makePCMove,
            appendChatMessage: (sender, text) => {
                const chatMessages = typeof document !== 'undefined' ? document.getElementById('chat-messages') : null;
                PanelsView.appendChatMessage(chatMessages, sender, text);
            },
            openSaveLoadModal: savesController.openSaveLoadModal,
            closeSaveLoadModal: savesController.closeSaveLoadModal,
            exportToJSON: savesController.exportToJSON,
            importFromJSON: savesController.importFromJSON,
            saveToSlot: savesController.saveToSlot,
            loadFromSlot: savesController.loadFromSlot,
            deleteSlot: savesController.deleteSlot
        });
    }

    return {
        init,
        flipBoard: gameFlow.flipBoard,
        clearPendingTimers,
        cancelPendingMove,
        applyRemoteMove(move) {
            if (move.timers) {
                S.whiteTimeLeft = move.timers.white;
                S.blackTimeLeft = move.timers.black;
                S.increment = move.timers.inc;
                if (!S.isTimerRunning && move.timers.running) timerController.startTimer();
                timerController.updateTimerDisplays();
            }
            const ok = boardInteraction.executeMove(move.fromRow, move.fromCol, move.toRow, move.toCol, true);
            if (ok) renderBoard();
            return ok;
        },
        syncState(state) {
            S.isRemoteAction = true;
            const ok = ChessLogic.loadState(state);
            S.isRemoteAction = false;
            if (ok) {
                const history = state && state.gameHistory ? state.gameHistory : [];
                S.lastMove = history.length ? UIGameFlow.convertToUiMove(history[history.length - 1].move) : null;
                renderBoard();
            }
            return ok;
        }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChessUI;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        ChessUI.init();
    });
}
