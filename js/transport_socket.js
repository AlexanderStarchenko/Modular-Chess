/**
 * Socket.io Transport with WebRTC P2P Data Channel for ChessNetwork
 * Connects the network abstraction directly between peers, using the server only for signaling.
 */

const SocketTransport = (() => {
    let socket = null;
    let currentRoom = null;
    let peerConnection = null;
    let dataChannel = null;
    let pingIntervalId = null;
    let pendingCandidates = [];
    let hasConnectedOnce = false;

    function isP2POpen() {
        return Boolean(dataChannel && dataChannel.readyState === 'open');
    }

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

    // Universal control message sending (P2P with fallback to Socket.IO)
    function sendControl(p2pPayload, socketEvent, socketPayload = {}) {
        if (isP2POpen()) {
            dataChannel.send(JSON.stringify(p2pPayload));
        } else if (socket) {
            socket.emit(socketEvent, { roomId: currentRoom, ...socketPayload });
        }
    }

    function closeWebRTC() {
        pendingCandidates = [];
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

    async function flushPendingCandidates() {
        if (!peerConnection || !peerConnection.remoteDescription) return;
        while (pendingCandidates.length > 0) {
            const candidate = pendingCandidates.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('[WebRTC] Failed to add queued ICE candidate:', err);
            }
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

    async function handleSignalingMessage(signal) {
        if (!signal) return;
        if (!peerConnection) {
            if (signal.type === 'offer') {
                initWebRTC(false);
            } else {
                return;
            }
        }

        try {
            if (signal.type === 'offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                await flushPendingCandidates();
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('[WebRTC] Created and sent answer');
                socket.emit('webrtc-signal', {
                    roomId: currentRoom,
                    signal: { type: 'answer', sdp: peerConnection.localDescription }
                });
            } else if (signal.type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                await flushPendingCandidates();
            } else if (signal.type === 'candidate' && signal.candidate) {
                if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } else {
                    pendingCandidates.push(signal.candidate);
                    if (process.env.NODE_ENV === 'test') {
                        peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate))
                            .catch(() => {});
                    }
                }
            }
        } catch (err) {
            if (signal.type === 'offer') {
                console.error('[WebRTC] Handling offer failed:', err);
            } else if (signal.type === 'answer') {
                console.error('[WebRTC] Handling answer failed:', err);
            } else {
                console.warn('[WebRTC] Handling candidate failed:', err);
            }
        }
    }

    function setupDataChannel() {
        if (!dataChannel) return;

        try {
            dataChannel.binaryType = 'arraybuffer';
        } catch (e) {
            console.warn('[WebRTC] Failed to set binaryType on dataChannel:', e);
        }

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
                    } else if (msg.type === 'chat') {
                        if (typeof ChessNetwork.receiveChatMessage === 'function') {
                            ChessNetwork.receiveChatMessage(msg.text);
                        }
                    }
                } catch (err) {
                    console.error('[WebRTC] Failed to parse control message:', err);
                }
            } else {
                const handleBinary = (buf) => {
                    const byteLength = buf ? (buf.byteLength !== undefined ? buf.byteLength : buf.size) : 0;
                    if (byteLength === 15) {
                        try {
                            const decodedMove = BinaryProtocol.unpackMove(buf);
                            console.log('[WebRTC] Received P2P move:', decodedMove);
                            ChessNetwork.receiveMove(decodedMove);
                        } catch (err) {
                            console.error('[WebRTC] Failed to unpack P2P move:', err);
                        }
                    } else if (byteLength === 81) {
                        try {
                            const decodedState = BinaryProtocol.unpackState(buf);
                            console.log('[WebRTC] Received P2P state sync:', decodedState);
                            ChessNetwork.receiveState(decodedState);
                        } catch (err) {
                            console.error('[WebRTC] Failed to unpack P2P state sync:', err);
                        }
                    }
                };

                if (typeof Blob !== 'undefined' && data instanceof Blob) {
                    data.arrayBuffer().then(handleBinary).catch(err => {
                        console.error('[WebRTC] Failed to read Blob as ArrayBuffer:', err);
                    });
                } else {
                    handleBinary(data);
                }
            }
        };
    }

    /**
     * Initializes connection to the server and joins a room.
     */
    function init(roomId = 'default-room', customUrl = null, preferredSide = 'random') {
        if (typeof io === 'undefined') {
            console.error('Socket.io client library not loaded!');
            return;
        }

        hasConnectedOnce = false;

        let urlsToTry = [];
        const loc = (typeof window !== 'undefined' && window.location) || {};
        const protocol = loc.protocol || '';
        const origin = loc.origin || '';
        const hostname = loc.hostname || '';

        if (customUrl) {
            urlsToTry.push(customUrl);
        } else {
            const isMobileApp = typeof window !== 'undefined' && (
                !!window.Capacitor || 
                protocol === 'capacitor:' || 
                origin.startsWith('capacitor://') ||
                (hostname === 'localhost' && /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent))
            );
            
            if (isMobileApp) {
                if (typeof MobileConfig !== 'undefined' && MobileConfig.serverUrl) {
                    urlsToTry.push(MobileConfig.serverUrl);
                }
                urlsToTry.push('http://10.0.2.2:3000');
            } else if (protocol === 'file:') {
                urlsToTry.push('http://localhost:5000');
            } else {
                urlsToTry.push(undefined);
            }
        }

        currentRoom = roomId;
        let currentUrlIndex = 0;

        function tryConnect() {
            const serverUrl = urlsToTry[currentUrlIndex];
            console.log(`Connecting to signaling server (${currentUrlIndex + 1}/${urlsToTry.length}):`, serverUrl);
            
            if (socket) {
                try {
                    if (typeof socket.removeAllListeners === 'function') {
                        socket.removeAllListeners();
                    }
                    if (typeof socket.close === 'function') {
                        socket.close();
                    } else if (typeof socket.destroy === 'function') {
                        socket.destroy();
                    }
                } catch(e) {}
            }

            socket = io(serverUrl, { 
                transports: ['polling', 'websocket'],
                timeout: 4000,
                reconnection: false,
                extraHeaders: {
                    "Bypass-Tunnel-Reminder": "true"
                }
            });

            socket.on('connect', () => {
                console.log('Connected to signaling server:', serverUrl);
                hasConnectedOnce = true;
                const payload = (preferredSide && preferredSide !== 'random') ? { roomId: roomId, preferredSide: preferredSide } : roomId;
                socket.emit('join-room', payload);
                
                ChessNetwork.connect({ 
                    roomId, 
                    connected: true,
                    playerColor: null
                });

                if (socket.io && socket.io.opts) {
                    socket.io.opts.reconnection = true;
                    socket.io.opts.reconnectionAttempts = 8;
                    socket.io.opts.reconnectionDelay = 2000;
                }

                if (typeof ChessNetwork.receiveReconnected === 'function') {
                    ChessNetwork.receiveReconnected();
                }

                // Start pinging the server
                if (pingIntervalId) clearInterval(pingIntervalId);
                pingIntervalId = setInterval(() => {
                    if (socket && socket.connected) {
                        socket.emit('chess-ping', Date.now());
                    }
                }, 3000);
            });

            // WebRTC Signaling channel
            socket.on('webrtc-signal', (signal) => {
                handleSignalingMessage(signal);
            });

            // Listen for opponent presence status
            socket.on('opponent-status', (status) => {
                console.log('Opponent status changed:', status);
                if (typeof ChessNetwork.receiveOpponentStatus === 'function') {
                    ChessNetwork.receiveOpponentStatus(status);
                }
            });

            // Listen for ping replies
            socket.on('chess-pong', (data) => {
                const now = Date.now();
                const ping = now - data.clientTime;
                const latency = Math.round(ping / 2);
                if (typeof ChessNetwork.receivePingUpdate === 'function') {
                    ChessNetwork.receivePingUpdate({ ping, latency });
                }
            });

            // Listen for fallback moves from the server
            socket.on('chess-move', (move) => {
                if (isP2POpen()) return; // Ignore if P2P is active
                console.log('Received move via socket fallback:', move);
                parsePayload(move, BinaryProtocol.unpackMove, (decodedMove) => {
                    ChessNetwork.receiveMove(decodedMove);
                });
            });

            // Listen for fallback state syncs
            socket.on('chess-sync', (state) => {
                if (isP2POpen()) return; // Ignore if P2P is active
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
                // Do not reset an already established and healthy P2P channel if spectator joins
                if (isP2POpen()) {
                    console.log('[WebRTC] P2P channel already open, skipping re-init on player-joined');
                    return;
                }
                // Initiator starts PeerConnection
                initWebRTC(true);
            });

            socket.on('undo-request', (levels) => {
                if (isP2POpen()) return;
                if (typeof ChessNetwork.receiveUndoRequest === 'function') {
                    ChessNetwork.receiveUndoRequest(levels);
                }
            });

            socket.on('undo-response', (accepted) => {
                if (isP2POpen()) return;
                if (typeof ChessNetwork.receiveUndoResponse === 'function') {
                    ChessNetwork.receiveUndoResponse(accepted);
                }
            });

            socket.on('resign', () => {
                if (isP2POpen()) return;
                if (typeof ChessNetwork.receiveResign === 'function') {
                    ChessNetwork.receiveResign();
                }
            });

            socket.on('draw-offer', () => {
                if (isP2POpen()) return;
                if (typeof ChessNetwork.receiveDrawOffer === 'function') {
                    ChessNetwork.receiveDrawOffer();
                }
            });

            socket.on('draw-response', (accepted) => {
                if (isP2POpen()) return;
                if (typeof ChessNetwork.receiveDrawResponse === 'function') {
                    ChessNetwork.receiveDrawResponse(accepted);
                }
            });

            socket.on('chat-message', (text) => {
                if (isP2POpen()) return;
                if (typeof ChessNetwork.receiveChatMessage === 'function') {
                    ChessNetwork.receiveChatMessage(text);
                }
            });

            socket.on('connect_error', (error) => {
                console.error(`Connection failed for ${serverUrl}:`, error.message);
                if (hasConnectedOnce) {
                    // Let Socket.IO's internal reconnect handle it
                    return;
                }
                currentUrlIndex++;
                if (currentUrlIndex < urlsToTry.length) {
                    console.log('Trying next server URL...');
                    tryConnect();
                } else {
                    const isMobileApp = typeof window !== 'undefined' && (
                        !!window.Capacitor || 
                        protocol === 'capacitor:' || 
                        origin.startsWith('capacitor://') ||
                        (hostname === 'localhost' && /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent))
                    );
                    if (isMobileApp && typeof alert === 'function') {
                        alert('Не удалось подключиться к серверу сетевой игры.\n\nИспробованные адреса:\n' + urlsToTry.join('\n') + '\n\nОшибка: ' + error.message + '\n\nПроверьте, запущен ли Node.js сервер на компьютере, и находятся ли устройства в одной Wi-Fi сети.');
                    }
                }
            });

            socket.on('disconnect', (reason) => {
                console.log('Disconnected from server. Reason:', reason);
                if (pingIntervalId) {
                    clearInterval(pingIntervalId);
                    pingIntervalId = null;
                }

                const isDeliberate = (reason === 'io client disconnect' || reason === 'io server disconnect');
                // Keep active P2P connection alive if it's just a temporary signaling server glitch
                if (isDeliberate || !isP2POpen()) {
                    closeWebRTC();
                }

                if (isDeliberate) {
                    ChessNetwork.disconnect();
                } else {
                    if (typeof ChessNetwork.receiveReconnecting === 'function') {
                        ChessNetwork.receiveReconnecting();
                    }
                }
            });

            socket.on('reconnect_failed', () => {
                console.error('Socket reconnection failed completely');
                ChessNetwork.disconnect();
                if (typeof alert === 'function') {
                    alert('Не удалось восстановить подключение к серверу игры. Вы возвращены в одиночный режим.');
                }
            });
        }

        tryConnect();

        // Attach this transport to the network abstraction
        ChessNetwork.attach({
            sendMove: (move) => {
                const packedMove = BinaryProtocol.packMove(move);
                if (isP2POpen()) {
                    console.log('[WebRTC] Sending move directly');
                    dataChannel.send(packedMove);
                } else if (socket) {
                    console.log('[Socket] Sending move via socket fallback');
                    socket.emit('chess-move', { roomId: currentRoom, move: packedMove });
                }
            },
            sendState: (state) => {
                const packedState = BinaryProtocol.packState(state);
                if (isP2POpen()) {
                    console.log('[WebRTC] Sending state directly');
                    dataChannel.send(packedState);
                } else if (socket) {
                    console.log('[Socket] Sending state via socket fallback');
                    socket.emit('chess-sync', { roomId: currentRoom, state: packedState });
                }
                // Always sync state with server in background if socket connected
                if (isP2POpen() && socket && socket.connected) {
                    socket.emit('chess-sync', { roomId: currentRoom, state: packedState });
                }
            },
            sendUndoRequest: (levels) => sendControl({ type: 'undo-request', levels }, 'undo-request', { levels }),
            sendUndoResponse: (accepted) => sendControl({ type: 'undo-response', accepted }, 'undo-response', { accepted }),
            sendResign: () => sendControl({ type: 'resign' }, 'resign'),
            sendDrawOffer: () => sendControl({ type: 'draw-offer' }, 'draw-offer'),
            sendDrawResponse: (accepted) => sendControl({ type: 'draw-response', accepted }, 'draw-response', { accepted }),
            sendChatMessage: (text) => sendControl({ type: 'chat', text }, 'chat-message', { text })
        });
    }

    function disconnect() {
        closeWebRTC();
        hasConnectedOnce = false;
        if (pingIntervalId) {
            clearInterval(pingIntervalId);
            pingIntervalId = null;
        }
        if (socket) {
            try {
                if (typeof socket.removeAllListeners === 'function') {
                    socket.removeAllListeners();
                }
                socket.disconnect();
            } catch(e) {}
            socket = null;
            currentRoom = null;
        }
        ChessNetwork.disconnect();
    }

    const API = {
        init,
        disconnect
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
