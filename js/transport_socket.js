/**
 * Socket.io Transport for ChessNetwork
 * Connects the network abstraction to the real WebSocket server.
 */

const SocketTransport = (() => {
    let socket = null;
    let currentRoom = null;

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
            ChessNetwork.receiveMove(move);
        });

        // Listen for state syncs
        socket.on('chess-sync', (state) => {
            console.log('Received state sync via network');
            ChessNetwork.receiveState(state);
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

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            ChessNetwork.disconnect();
        });

        // Attach this transport to the network abstraction
        ChessNetwork.attach({
            sendMove: (move) => {
                socket.emit('chess-move', { roomId: currentRoom, move });
            },
            sendState: (state) => {
                socket.emit('chess-sync', { roomId: currentRoom, state });
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

    return {
        init
    };
})();
