/**
 * Socket.io Transport with WebRTC P2P Data Channel for ChessNetwork
 * Connects the network abstraction directly between peers, using the server only for signaling.
 */

const SocketTransport = (() => {
    let socket = null;
    let currentRoom = null;
    let peerConnection = null;
    let dataChannel = null;

    /**
     * Safely parse binary, JSON, or Blob network payloads.
     */
    function parsePayload(data, unpackFn, callback) {
        if (!data) return;

        // 1. If it's already an unpacked object (fallback or JSON mode)
        if ((data.from && data.to) || (data.board && data.turn)) {
            callback(data);
            return;
        }

        // 2. If it's a Blob
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

        // 3. Node.js Buffer JSON representation
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

    function closeWebRTC() {
        if (dataChannel) {
            console.log('[WebRTC] Closing data channel');
            try { dataChannel.close(); } catch(e) {}
            dataChannel = null;
        }
        if (peerConnection) {
            console.log('[WebRTC] Closing peer connection');
            try { peerConnection.close(); } catch(e) {}
            peerConnection = null;
        }
    }

    function initWebRTC(isInitiator) {
        console.log('[WebRTC] Initializing connection, initiator:', isInitiator);
        closeWebRTC();

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        peerConnection = new RTCPeerConnection(configuration);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                console.log('[WebRTC] Generated ICE candidate');
                socket.emit('webrtc-signal', {
                    roomId: currentRoom,
                    signal: { type: 'candidate', candidate: event.candidate }
                });
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection state changed:', peerConnection.connectionState);
        };

        if (isInitiator) {
            dataChannel = peerConnection.createDataChannel('chess-game-channel', {
                ordered: true
            });
            setupDataChannel();

            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    console.log('[WebRTC] Created and sent offer');
                    socket.emit('webrtc-signal', {
                        roomId: currentRoom,
                        signal: { type: 'offer', sdp: peerConnection.localDescription }
                    });
                })
                .catch(err => console.error('[WebRTC] Offer creation failed:', err));
        } else {
            peerConnection.ondatachannel = (event) => {
                console.log('[WebRTC] Received remote data channel');
                dataChannel = event.channel;
                setupDataChannel();
            };
        }
    }

    function handleSignalingMessage(signal) {
        if (!peerConnection) {
            if (signal.type === 'offer') {
                initWebRTC(false);
            } else {
                return;
            }
        }

        if (signal.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => peerConnection.createAnswer())
                .then(answer => peerConnection.setLocalDescription(answer))
                .then(() => {
                    console.log('[WebRTC] Created and sent answer');
                    socket.emit('webrtc-signal', {
                        roomId: currentRoom,
                        signal: { type: 'answer', sdp: peerConnection.localDescription }
                    });
                })
                .catch(err => console.error('[WebRTC] Handling offer failed:', err));
        } else if (signal.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .catch(err => console.error('[WebRTC] Handling answer failed:', err));
        } else if (signal.type === 'candidate') {
            peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate))
                .catch(err => console.warn('[WebRTC] Failed to add ICE candidate:', err));
        }
    }

    function setupDataChannel() {
        if (!dataChannel) return;

        dataChannel.onopen = () => {
            console.log('[WebRTC] Data Channel is open and ready!');
        };

        dataChannel.onclose = () => {
            console.log('[WebRTC] Data Channel closed');
        };

        dataChannel.onmessage = (event) => {
            const data = event.data;
            if (typeof data === 'string') {
                try {
                    const msg = JSON.parse(data);
                    console.log('[WebRTC] Received P2P control message:', msg.type);
                    if (msg.type === 'undo-request') {
                        if (typeof ChessNetwork.receiveUndoRequest === 'function') {
                            ChessNetwork.receiveUndoRequest(msg.levels);
                        }
                    } else if (msg.type === 'undo-response') {
                        if (typeof ChessNetwork.receiveUndoResponse === 'function') {
                            ChessNetwork.receiveUndoResponse(msg.accepted);
                        }
                    } else if (msg.type === 'resign') {
                        if (typeof ChessNetwork.receiveResign === 'function') {
                            ChessNetwork.receiveResign();
                        }
                    } else if (msg.type === 'draw-offer') {
                        if (typeof ChessNetwork.receiveDrawOffer === 'function') {
                            ChessNetwork.receiveDrawOffer();
                        }
                    } else if (msg.type === 'draw-response') {
                        if (typeof ChessNetwork.receiveDrawResponse === 'function') {
                            ChessNetwork.receiveDrawResponse(msg.accepted);
                        }
                    }
                } catch (err) {
                    console.error('[WebRTC] Failed to parse control message:', err);
                }
            } else {
                const byteLength = data.byteLength;
                if (byteLength === 15) {
                    try {
                        const decodedMove = BinaryProtocol.unpackMove(data);
                        console.log('[WebRTC] Received P2P move:', decodedMove);
                        ChessNetwork.receiveMove(decodedMove);
                    } catch (err) {
                        console.error('[WebRTC] Failed to unpack P2P move:', err);
                    }
                } else if (byteLength === 81) {
                    try {
                        const decodedState = BinaryProtocol.unpackState(data);
                        console.log('[WebRTC] Received P2P state sync:', decodedState);
                        ChessNetwork.receiveState(decodedState);
                    } catch (err) {
                        console.error('[WebRTC] Failed to unpack P2P state sync:', err);
                    }
                }
            }
        };
    }

    /**
     * Initializes connection to the server and joins a room.
     */
    function init(roomId = 'default-room', customUrl = null) {
        if (typeof io === 'undefined') {
            console.error('Socket.io client library not loaded!');
            return;
        }

        const serverUrl = customUrl || (window.location.protocol === 'file:' ? 'http://192.168.0.105:3000' : undefined);
        console.log('Connecting to:', serverUrl);
        socket = io(serverUrl);
        currentRoom = roomId;

        socket.on('connect', () => {
            console.log('Connected to signaling server');
            socket.emit('join-room', roomId);
            
            ChessNetwork.connect({ 
                roomId, 
                connected: true,
                playerColor: null
            });
        });

        // WebRTC Signaling channel
        socket.on('webrtc-signal', (signal) => {
            handleSignalingMessage(signal);
        });

        // Listen for fallback moves from the server
        socket.on('chess-move', (move) => {
            if (dataChannel && dataChannel.readyState === 'open') return; // Ignore if P2P is active
            console.log('Received move via socket fallback:', move);
            parsePayload(move, BinaryProtocol.unpackMove, (decodedMove) => {
                ChessNetwork.receiveMove(decodedMove);
            });
        });

        // Listen for fallback state syncs
        socket.on('chess-sync', (state) => {
            if (dataChannel && dataChannel.readyState === 'open') return; // Ignore if P2P is active
            console.log('Received state sync via socket fallback');
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
            // Initiator starts PeerConnection
            initWebRTC(true);
        });

        socket.on('undo-request', (levels) => {
            if (dataChannel && dataChannel.readyState === 'open') return;
            if (typeof ChessNetwork.receiveUndoRequest === 'function') {
                ChessNetwork.receiveUndoRequest(levels);
            }
        });

        socket.on('undo-response', (accepted) => {
            if (dataChannel && dataChannel.readyState === 'open') return;
            if (typeof ChessNetwork.receiveUndoResponse === 'function') {
                ChessNetwork.receiveUndoResponse(accepted);
            }
        });

        socket.on('resign', () => {
            if (dataChannel && dataChannel.readyState === 'open') return;
            if (typeof ChessNetwork.receiveResign === 'function') {
                ChessNetwork.receiveResign();
            }
        });

        socket.on('draw-offer', () => {
            if (dataChannel && dataChannel.readyState === 'open') return;
            if (typeof ChessNetwork.receiveDrawOffer === 'function') {
                ChessNetwork.receiveDrawOffer();
            }
        });

        socket.on('draw-response', (accepted) => {
            if (dataChannel && dataChannel.readyState === 'open') return;
            if (typeof ChessNetwork.receiveDrawResponse === 'function') {
                ChessNetwork.receiveDrawResponse(accepted);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Connection Error:', error.message);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            closeWebRTC();
            ChessNetwork.disconnect();
        });

        // Attach this transport to the network abstraction
        ChessNetwork.attach({
            sendMove: (move) => {
                const packedMove = BinaryProtocol.packMove(move);
                if (dataChannel && dataChannel.readyState === 'open') {
                    console.log('[WebRTC] Sending move directly');
                    dataChannel.send(packedMove);
                } else {
                    console.log('[Socket] Sending move via socket fallback');
                    socket.emit('chess-move', { roomId: currentRoom, move: packedMove });
                }
            },
            sendState: (state) => {
                const packedState = BinaryProtocol.packState(state);
                if (dataChannel && dataChannel.readyState === 'open') {
                    console.log('[WebRTC] Sending state directly');
                    dataChannel.send(packedState);
                } else {
                    console.log('[Socket] Sending state via socket fallback');
                    socket.emit('chess-sync', { roomId: currentRoom, state: packedState });
                }
            },
            sendUndoRequest: (levels) => {
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({ type: 'undo-request', levels }));
                } else {
                    socket.emit('undo-request', { roomId: currentRoom, levels });
                }
            },
            sendUndoResponse: (accepted) => {
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({ type: 'undo-response', accepted }));
                } else {
                    socket.emit('undo-response', { roomId: currentRoom, accepted });
                }
            },
            sendResign: () => {
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({ type: 'resign' }));
                } else {
                    socket.emit('resign', { roomId: currentRoom });
                }
            },
            sendDrawOffer: () => {
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({ type: 'draw-offer' }));
                } else {
                    socket.emit('draw-offer', { roomId: currentRoom });
                }
            },
            sendDrawResponse: (accepted) => {
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({ type: 'draw-response', accepted }));
                } else {
                    socket.emit('draw-response', { roomId: currentRoom, accepted });
                }
            }
        });
    }

    function disconnect() {
        closeWebRTC();
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
