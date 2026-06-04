/**
 * Socket.io Transport for ChessNetwork
 * Connects the network abstraction to the real WebSocket server.
 */

const SocketTransport = (() => {
    let socket = null;
    let currentRoom = null;

    /**
     * Safely parse binary, JSON, or Blob network payloads.
     * Keeps server relays fast while resolving platform-specific variations.
     */
    function parsePayload(data, unpackFn, callback) {
        if (!data) return;

        // 1. If it's already an unpacked object (fallback or JSON mode)
        if ((data.from && data.to) || (data.board && data.turn)) {
            callback(data);
            return;
        }

        // 2. If it's a Blob (commonly received in mobile browsers via websockets)
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
            data.arrayBuffer().then(buf => {
                try {
                    callback(unpackFn(buf));
                } catch (err) {
                    console.error('Failed to unpack Blob payload:', err);
                }
            }).catch(err => {
                console.error('Failed to read Blob as ArrayBuffer:', err);
            });
            return;
        }

        // 3. Node.js Buffer JSON representation { type: 'Buffer', data: [...] }
        if (data.type === 'Buffer' && Array.isArray(data.data)) {
            try {
                const uint8 = new Uint8Array(data.data);
                callback(unpackFn(uint8.buffer));
            } catch (err) {
                console.error('Failed to unpack JSON Buffer payload:', err);
            }
            return;
        }

        // 4. Raw ArrayBuffer, TypedArray view, or Node.js Buffer
        if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))) {
            try {
                callback(unpackFn(data));
            } catch (err) {
                console.error('Failed to unpack binary payload:', err);
            }
            return;
        }

        // Fallback: pass-through
        callback(data);
    }

    /**
     * Initializes connection to the server and joins a room.
     * @param {string} roomId 
     */
    function init(roomId = 'default-room', customUrl = null) {
        // io() is provided by the socket.io client library
        if (typeof io === 'undefined') {
            console.error('Socket.io client library not loaded!');
            return;
        }

        // Use customUrl if provided (from prompt), otherwise fallback to local/auto
        const serverUrl = customUrl || (window.location.protocol === 'file:' ? 'http://192.168.0.105:3000' : undefined);
        console.log('Connecting to:', serverUrl);
        socket = io(serverUrl);
        currentRoom = roomId;

        socket.on('connect', () => {
            console.log('Connected to server');
            socket.emit('join-room', roomId);
            
            // Tell the network abstraction we are connected
            ChessNetwork.connect({ 
                roomId, 
                connected: true,
                playerColor: null // Could be negotiated later
            });
        });

        // Listen for moves from the server
        socket.on('chess-move', (move) => {
            console.log('Received move via network:', move);
            parsePayload(move, BinaryProtocol.unpackMove, (decodedMove) => {
                ChessNetwork.receiveMove(decodedMove);
            });
        });

        // Listen for state syncs
        socket.on('chess-sync', (state) => {
            console.log('Received state sync via network');
            parsePayload(state, BinaryProtocol.unpackState, (decodedState) => {
                ChessNetwork.receiveState(decodedState);
            });
        });

        socket.on('color-assigned', (color) => {
            if (typeof ChessNetwork.receiveColor === 'function') {
                ChessNetwork.receiveColor(color);
            }
        });

        socket.on('player-joined', () => {
            console.log('Another player joined the room');
            if (typeof ChessNetwork.receiveJoined === 'function') {
                ChessNetwork.receiveJoined();
            }
        });

        socket.on('undo-request', (levels) => {
            if (typeof ChessNetwork.receiveUndoRequest === 'function') {
                ChessNetwork.receiveUndoRequest(levels);
            }
        });

        socket.on('undo-response', (accepted) => {
            if (typeof ChessNetwork.receiveUndoResponse === 'function') {
                ChessNetwork.receiveUndoResponse(accepted);
            }
        });

        socket.on('resign', () => {
            if (typeof ChessNetwork.receiveResign === 'function') {
                ChessNetwork.receiveResign();
            }
        });

        socket.on('draw-offer', () => {
            if (typeof ChessNetwork.receiveDrawOffer === 'function') {
                ChessNetwork.receiveDrawOffer();
            }
        });

        socket.on('draw-response', (accepted) => {
            if (typeof ChessNetwork.receiveDrawResponse === 'function') {
                ChessNetwork.receiveDrawResponse(accepted);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Connection Error:', error.message);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            ChessNetwork.disconnect();
        });

        // Attach this transport to the network abstraction
        ChessNetwork.attach({
            sendMove: (move) => {
                const packedMove = BinaryProtocol.packMove(move);
                socket.emit('chess-move', { roomId: currentRoom, move: packedMove });
            },
            sendState: (state) => {
                const packedState = BinaryProtocol.packState(state);
                socket.emit('chess-sync', { roomId: currentRoom, state: packedState });
            },
            sendUndoRequest: (levels) => {
                socket.emit('undo-request', { roomId: currentRoom, levels });
            },
            sendUndoResponse: (accepted) => {
                socket.emit('undo-response', { roomId: currentRoom, accepted });
            },
            sendResign: () => {
                socket.emit('resign', { roomId: currentRoom });
            },
            sendDrawOffer: () => {
                socket.emit('draw-offer', { roomId: currentRoom });
            },
            sendDrawResponse: (accepted) => {
                socket.emit('draw-response', { roomId: currentRoom, accepted });
            }
        });
    }

    function disconnect() {
        if (socket) {
            socket.disconnect();
            socket = null;
            currentRoom = null;
        }
        ChessNetwork.disconnect();
    }

    return {
        init,
        disconnect
    };
})();
