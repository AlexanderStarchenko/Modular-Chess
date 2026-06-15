/**
 * Chess Network Adapter
 * Provides a transport-agnostic contract for future online play.
 */

const ChessNetwork = (() => {
    let transport = null;
    let state = {
        connected: false,
        roomId: null,
        playerColor: null
    };

    const listeners = {
        status: [],
        move: [],
        sync: [],
        joined: [],
        undoRequest: [],
        undoResponse: [],
        colorAssigned: [],
        resign: [],
        drawOffer: [],
        drawResponse: []
    };

    function emit(type, payload) {
        (listeners[type] || []).forEach(fn => {
            try {
                fn(payload);
            } catch (err) {
                console.error('ChessNetwork listener error:', err);
            }
        });
    }

    function on(type, handler) {
        if (!listeners[type] || typeof handler !== 'function') return () => {};
        listeners[type].push(handler);
        return () => {
            listeners[type] = listeners[type].filter(fn => fn !== handler);
        };
    }

    function attach(newTransport) {
        transport = newTransport;
    }

    function setConnectionState(nextState) {
        state = { ...state, ...nextState };
        emit('status', { ...state });
    }

    function connect(meta = {}) {
        setConnectionState({ connected: true, ...meta });
        return state;
    }

    function disconnect() {
        setConnectionState({ connected: false, roomId: null, playerColor: null });
        transport = null;
    }

    function sendMove(move) {
        if (!transport || typeof transport.sendMove !== 'function') return false;
        transport.sendMove(move);
        emit('move', move);
        return true;
    }

    function sendState(snapshot) {
        if (!transport || typeof transport.sendState !== 'function') return false;
        transport.sendState(snapshot);
        emit('sync', snapshot);
        return true;
    }

    function receiveMove(move) {
        emit('move', move);
    }

    function receiveState(snapshot) {
        emit('sync', snapshot);
    }

    const API = {
        attach,
        connect,
        disconnect,
        on,
        sendMove,
        sendState,
        receiveMove,
        receiveState,
        receiveJoined: () => emit('joined'),
        receiveColor: (color) => emit('colorAssigned', color),
        sendUndoRequest: (levels) => {
            if (transport && typeof transport.sendUndoRequest === 'function') transport.sendUndoRequest(levels);
        },
        sendUndoResponse: (accepted) => {
            if (transport && typeof transport.sendUndoResponse === 'function') transport.sendUndoResponse(accepted);
        },
        sendResign: () => {
            if (transport && typeof transport.sendResign === 'function') transport.sendResign();
        },
        sendDrawOffer: () => {
            if (transport && typeof transport.sendDrawOffer === 'function') transport.sendDrawOffer();
        },
        sendDrawResponse: (accepted) => {
            if (transport && typeof transport.sendDrawResponse === 'function') transport.sendDrawResponse(accepted);
        },
        receiveUndoRequest: (levels) => emit('undoRequest', levels),
        receiveUndoResponse: (accepted) => emit('undoResponse', accepted),
        receiveResign: () => emit('resign'),
        receiveDrawOffer: () => emit('drawOffer'),
        receiveDrawResponse: (accepted) => emit('drawResponse', accepted),
        getState: () => ({ ...state })
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
