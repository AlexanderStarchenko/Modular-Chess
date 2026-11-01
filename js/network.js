/**
 * Chess Network Adapter
 * Provides a transport-agnostic contract for online play and event bus.
 */

const ChessNetwork = (() => {
    let transport = null;
    let customChatReceiver = null;

    let state = {
        connected: false,
        roomId: null,
        playerColor: null
    };

    // Словарь без прототипа + Set вместо Array (защита от Prototype Pollution, дублей и O(1) удаление)
    const listeners = Object.assign(Object.create(null), {
        status: new Set(),
        move: new Set(),
        sync: new Set(),
        joined: new Set(),
        undoRequest: new Set(),
        undoResponse: new Set(),
        colorAssigned: new Set(),
        resign: new Set(),
        drawOffer: new Set(),
        drawResponse: new Set(),
        reconnecting: new Set(),
        reconnected: new Set(),
        opponentPresence: new Set(),
        pingUpdate: new Set(),
        chatMessage: new Set()
    });

    function emit(type, payload) {
        const set = listeners[type];
        if (!set || set.size === 0) return;
        // Копия через Array.from защищает итерацию, если подписчик отпишется прямо внутри коллбэка
        const snapshot = Array.from(set);
        for (let i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](payload);
            } catch (err) {
                console.error(`ChessNetwork listener error [${type}]:`, err);
            }
        }
    }

    function on(type, handler) {
        const set = listeners[type];
        if (!set || typeof handler !== 'function') return () => {};
        set.add(handler);
        return () => {
            set.delete(handler);
        };
    }

    function attach(newTransport) {
        if (transport && transport !== newTransport && typeof transport.disconnect === 'function') {
            try { transport.disconnect(); } catch (e) {}
        }
        transport = (newTransport && typeof newTransport === 'object') ? newTransport : null;
    }

    function setConnectionState(nextState) {
        if (!nextState || typeof nextState !== 'object') return;
        let changed = false;

        if ('connected' in nextState && Boolean(nextState.connected) !== state.connected) {
            state.connected = Boolean(nextState.connected);
            changed = true;
        }
        if ('roomId' in nextState && nextState.roomId !== state.roomId) {
            state.roomId = nextState.roomId ?? null;
            changed = true;
        }
        if ('playerColor' in nextState && nextState.playerColor !== state.playerColor) {
            state.playerColor = nextState.playerColor ?? null;
            changed = true;
        }

        // Эмитим статус только если данные реально изменились
        if (changed) {
            emit('status', { ...state });
        }
    }

    function connect(meta) {
        setConnectionState({ ...(meta && typeof meta === 'object' ? meta : {}), connected: true });
        return { ...state };
    }

    function disconnect() {
        const currentTransport = transport;
        transport = null; // Сначала обнуляем ссылку (защита от рекурсии при взаимном disconnect)
        if (currentTransport && typeof currentTransport.disconnect === 'function') {
            try { currentTransport.disconnect(); } catch (e) {}
        }
        setConnectionState({ connected: false, roomId: null, playerColor: null });
    }

    function safeTransportCall(methodName, arg) {
        if (!transport || typeof transport[methodName] !== 'function') return false;
        try {
            return transport[methodName](arg) !== false;
        } catch (err) {
            console.error(`ChessNetwork transport.${methodName} error:`, err);
            return false;
        }
    }

    function sendMove(move) {
        if (!move || !safeTransportCall('sendMove', move)) return false;
        emit('move', move);
        return true;
    }

    function sendState(snapshot) {
        if (!snapshot || !safeTransportCall('sendState', snapshot)) return false;
        emit('sync', snapshot);
        return true;
    }

    function receiveMove(move) {
        emit('move', move);
    }

    function receiveState(snapshot) {
        emit('sync', snapshot);
    }

    function handleChatMessage(msg) {
        if (typeof customChatReceiver === 'function') {
            try {
                customChatReceiver(msg);
            } catch (e) {
                console.error('ChessNetwork customChatReceiver error:', e);
            }
        }
        emit('chatMessage', msg);
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
        sendUndoRequest: (levels) => safeTransportCall('sendUndoRequest', levels),
        sendUndoResponse: (accepted) => safeTransportCall('sendUndoResponse', Boolean(accepted)),
        sendResign: () => safeTransportCall('sendResign'),
        sendDrawOffer: () => safeTransportCall('sendDrawOffer'),
        sendDrawResponse: (accepted) => safeTransportCall('sendDrawResponse', Boolean(accepted)),
        sendChatMessage: (text) => {
            if (typeof text !== 'string' || !text.trim()) return false;
            return safeTransportCall('sendChatMessage', text.slice(0, 500));
        },
        get receiveChatMessage() {
            return handleChatMessage;
        },
        set receiveChatMessage(fn) {
            customChatReceiver = (typeof fn === 'function') ? fn : null;
        },
        receiveUndoRequest: (levels) => emit('undoRequest', levels),
        receiveUndoResponse: (accepted) => emit('undoResponse', accepted),
        receiveResign: () => emit('resign'),
        receiveDrawOffer: () => emit('drawOffer'),
        receiveDrawResponse: (accepted) => emit('drawResponse', accepted),
        receiveReconnecting: () => emit('reconnecting'),
        receiveReconnected: () => emit('reconnected'),
        receiveOpponentStatus: (status) => emit('opponentPresence', status),
        receivePingUpdate: (pingData) => emit('pingUpdate', pingData),
        getState: () => ({ ...state })
    };

    Object.freeze(API);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
