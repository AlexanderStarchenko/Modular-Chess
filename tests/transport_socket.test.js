/**
 * Mock-based tests for SocketTransport
 */

// Define global mocks first
global.io = jest.fn();
global.RTCPeerConnection = jest.fn();
global.RTCSessionDescription = jest.fn(sdp => sdp);
global.RTCIceCandidate = jest.fn(candidate => candidate);
global.window = {
    location: { protocol: 'http:' }
};

// Mock dependencies
const mockBinaryProtocol = {
    packMove: jest.fn().mockReturnValue(new Uint8Array(15)),
    unpackMove: jest.fn().mockReturnValue({ from: 'e2', to: 'e4', fromRow: 6, fromCol: 4, toRow: 4, toCol: 4 }),
    packState: jest.fn().mockReturnValue(new Uint8Array(81)),
    unpackState: jest.fn().mockReturnValue({ boardState: {} })
};
global.BinaryProtocol = mockBinaryProtocol;

const mockChessNetwork = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    attach: jest.fn(),
    receiveMove: jest.fn(),
    receiveState: jest.fn(),
    receiveColor: jest.fn(),
    receiveJoined: jest.fn(),
    receiveUndoRequest: jest.fn(),
    receiveUndoResponse: jest.fn(),
    receiveResign: jest.fn(),
    receiveDrawOffer: jest.fn(),
    receiveDrawResponse: jest.fn()
};
global.ChessNetwork = mockChessNetwork;

const SocketTransport = require('../js/transport_socket');

describe('SocketTransport with WebRTC signaling', () => {
    let mockSocket;
    let mockPeerConnection;
    let mockDataChannel;
    let transportCallbacks;

    beforeEach(() => {
        jest.clearAllMocks();
        
        try {
            SocketTransport.disconnect();
        } catch (e) {}

        mockSocket = {
            on: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn()
        };
        global.io.mockReturnValue(mockSocket);

        mockDataChannel = {
            send: jest.fn(),
            close: jest.fn(),
            readyState: 'closed',
            onopen: null,
            onclose: null,
            onmessage: null
        };

        mockPeerConnection = {
            createDataChannel: jest.fn().mockReturnValue(mockDataChannel),
            createOffer: jest.fn().mockResolvedValue({ sdp: 'local-offer' }),
            createAnswer: jest.fn().mockResolvedValue({ sdp: 'local-answer' }),
            setLocalDescription: jest.fn().mockResolvedValue(),
            setRemoteDescription: jest.fn().mockResolvedValue(),
            addIceCandidate: jest.fn().mockResolvedValue(),
            close: jest.fn(),
            onicecandidate: null,
            onconnectionstatechange: null,
            ondatachannel: null,
            localDescription: { sdp: 'local-desc' }
        };
        global.RTCPeerConnection.mockReturnValue(mockPeerConnection);

        // Capture transport implementation when attach is called
        transportCallbacks = null;
        mockChessNetwork.attach.mockImplementation((cbs) => {
            transportCallbacks = cbs;
        });
    });

    test('Should initialize socket connection and attach transport callbacks', () => {
        SocketTransport.init('room-123');
        expect(global.io).toHaveBeenCalled();
        expect(mockChessNetwork.attach).toHaveBeenCalled();
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    test('Should handle socket events when connected', () => {
        SocketTransport.init('room-123');

        // Extract listeners registered on the socket
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        // Trigger connect event
        socketListeners['connect']();
        expect(mockSocket.emit).toHaveBeenCalledWith('join-room', 'room-123');
        expect(mockChessNetwork.connect).toHaveBeenCalledWith({
            roomId: 'room-123',
            connected: true,
            playerColor: null
        });

        // Trigger color-assigned
        socketListeners['color-assigned']('w');
        expect(mockChessNetwork.receiveColor).toHaveBeenCalledWith('w');

        // Trigger player-joined (starts WebRTC initiator)
        socketListeners['player-joined']();
        expect(mockChessNetwork.receiveJoined).toHaveBeenCalled();
        expect(global.RTCPeerConnection).toHaveBeenCalled();
        expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('chess-game-channel', { ordered: true });

        // Trigger connect_error and disconnect
        socketListeners['connect_error']({ message: 'connection refused' });
        socketListeners['disconnect']();
        expect(mockChessNetwork.disconnect).toHaveBeenCalled();
    });

    test('Should handle socket signaling events and fallback signaling', () => {
        SocketTransport.init('room-123');

        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        // Trigger webrtc-signal (offer)
        socketListeners['webrtc-signal']({ type: 'offer', sdp: 'remote-offer' });
        expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();

        // Trigger webrtc-signal (answer)
        SocketTransport.init('room-123'); // reset state
        socketListeners['webrtc-signal']({ type: 'answer', sdp: 'remote-answer' });
        // Under test, answer sets remote description if RTCPeerConnection exists
        
        // Trigger chess-move fallback
        socketListeners['chess-move']({ from: 'e2', to: 'e4' });
        expect(mockChessNetwork.receiveMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });

        // Trigger chess-sync fallback
        socketListeners['chess-sync']({ board: [] });
        expect(mockChessNetwork.receiveState).toHaveBeenCalled();

        // Trigger draw and undo signaling
        socketListeners['undo-request'](1);
        socketListeners['undo-response'](true);
        socketListeners['resign']();
        socketListeners['draw-offer']();
        socketListeners['draw-response'](true);

        expect(mockChessNetwork.receiveUndoRequest).toHaveBeenCalledWith(1);
        expect(mockChessNetwork.receiveUndoResponse).toHaveBeenCalledWith(true);
        expect(mockChessNetwork.receiveResign).toHaveBeenCalled();
        expect(mockChessNetwork.receiveDrawOffer).toHaveBeenCalled();
        expect(mockChessNetwork.receiveDrawResponse).toHaveBeenCalledWith(true);
    });

    test('Should transmit events via WebRTC when data channel is open', () => {
        SocketTransport.init('room-123');

        // Set up WebRTC initiator
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        // Open the data channel
        mockDataChannel.readyState = 'open';

        // Trigger send methods
        transportCallbacks.sendMove({ from: 'e2', to: 'e4' });
        transportCallbacks.sendState({ board: [] });
        transportCallbacks.sendUndoRequest(1);
        transportCallbacks.sendUndoResponse(true);
        transportCallbacks.sendResign();
        transportCallbacks.sendDrawOffer();
        transportCallbacks.sendDrawResponse(true);

        expect(mockDataChannel.send).toHaveBeenCalledTimes(7);
        // None of these should fall back to socket
        expect(mockSocket.emit).not.toHaveBeenCalledWith('chess-move', expect.any(Object));
    });

    test('Should transmit events via Socket fallback when WebRTC data channel is not open', () => {
        SocketTransport.init('room-123');

        // Call send methods directly (P2P closed)
        transportCallbacks.sendMove({ from: 'e2', to: 'e4' });
        transportCallbacks.sendState({ board: [] });
        transportCallbacks.sendUndoRequest(1);
        transportCallbacks.sendUndoResponse(true);
        transportCallbacks.sendResign();
        transportCallbacks.sendDrawOffer();
        transportCallbacks.sendDrawResponse(true);

        expect(mockSocket.emit).toHaveBeenCalledWith('chess-move', expect.any(Object));
        expect(mockSocket.emit).toHaveBeenCalledWith('chess-sync', expect.any(Object));
        expect(mockSocket.emit).toHaveBeenCalledWith('undo-request', expect.any(Object));
        expect(mockSocket.emit).toHaveBeenCalledWith('undo-response', expect.any(Object));
        expect(mockSocket.emit).toHaveBeenCalledWith('resign', expect.any(Object));
        expect(mockSocket.emit).toHaveBeenCalledWith('draw-offer', expect.any(Object));
        expect(mockSocket.emit).toHaveBeenCalledWith('draw-response', expect.any(Object));
    });

    test('Should receive P2P messages on WebRTC data channel', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined'](); // starts data channel

        // Mock WebRTC message handler
        const msgHandler = mockDataChannel.onmessage;
        expect(msgHandler).toBeDefined();

        // 1. JSON String events
        msgHandler({ data: JSON.stringify({ type: 'undo-request', levels: 2 }) });
        expect(mockChessNetwork.receiveUndoRequest).toHaveBeenCalledWith(2);

        msgHandler({ data: JSON.stringify({ type: 'undo-response', accepted: true }) });
        expect(mockChessNetwork.receiveUndoResponse).toHaveBeenCalledWith(true);

        msgHandler({ data: JSON.stringify({ type: 'resign' }) });
        expect(mockChessNetwork.receiveResign).toHaveBeenCalled();

        msgHandler({ data: JSON.stringify({ type: 'draw-offer' }) });
        expect(mockChessNetwork.receiveDrawOffer).toHaveBeenCalled();

        msgHandler({ data: JSON.stringify({ type: 'draw-response', accepted: false }) });
        expect(mockChessNetwork.receiveDrawResponse).toHaveBeenCalledWith(false);

        // 2. Binary Move event (15 bytes)
        const dummyMoveData = new ArrayBuffer(15);
        msgHandler({ data: dummyMoveData });
        expect(mockBinaryProtocol.unpackMove).toHaveBeenCalled();
        expect(mockChessNetwork.receiveMove).toHaveBeenCalled();

        // 3. Binary State event (81 bytes)
        const dummyStateData = new ArrayBuffer(81);
        msgHandler({ data: dummyStateData });
        expect(mockBinaryProtocol.unpackState).toHaveBeenCalled();
        expect(mockChessNetwork.receiveState).toHaveBeenCalled();
    });

    test('Should disconnect socket and close WebRTC peer connection on disconnect', () => {
        SocketTransport.init('room-123');
        // Trigger player joined to create RTCPeerConnection
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        SocketTransport.disconnect();

        expect(mockSocket.disconnect).toHaveBeenCalled();
        expect(mockPeerConnection.close).toHaveBeenCalled();
        expect(mockChessNetwork.disconnect).toHaveBeenCalled();
    });

    test('Should handle fallback to localhost when io is undefined', () => {
        const originalIo = global.io;
        delete global.io;

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        SocketTransport.init('room-123');
        expect(consoleSpy).toHaveBeenCalledWith('Socket.io client library not loaded!');
        consoleSpy.mockRestore();

        global.io = originalIo;
    });

    test('Should handle signaling candidate messages and add ICE candidates', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined'](); // Initialize RTCPeerConnection

        // Trigger signaling with candidate
        socketListeners['webrtc-signal']({ type: 'candidate', candidate: 'fake-candidate' });
        expect(mockPeerConnection.addIceCandidate).toHaveBeenCalled();
    });

    test('Should handle ICE candidate generation and emit it to signaling server', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined'](); // Initialize RTCPeerConnection

        // Trigger ICE candidate generation
        mockPeerConnection.onicecandidate({ candidate: 'fake-generated-candidate' });
        expect(mockSocket.emit).toHaveBeenCalledWith('webrtc-signal', {
            roomId: 'room-123',
            signal: { type: 'candidate', candidate: 'fake-generated-candidate' }
        });
    });

    test('Should log peer connection state changes', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockPeerConnection.onconnectionstatechange();
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Connection state changed:', undefined);
        consoleSpy.mockRestore();
    });

    test('Should handle incoming remote data channel on peer connection', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        // Non-initiator: do not trigger player-joined. Instead, let signaling create non-initiator PC
        socketListeners['webrtc-signal']({ type: 'offer', sdp: 'fake-sdp' });

        expect(mockPeerConnection.ondatachannel).toBeDefined();
        mockPeerConnection.ondatachannel({ channel: mockDataChannel });
        expect(mockDataChannel.onopen).toBeDefined();
        expect(mockDataChannel.onclose).toBeDefined();

        // Trigger onopen and onclose
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockDataChannel.onopen();
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Data Channel is open and ready!');
        mockDataChannel.onclose();
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Data Channel closed');
        consoleSpy.mockRestore();
    });

    test('Should handle signaling messages when peer connection is null and type is not offer', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        // Send non-offer signal when peer connection is null
        socketListeners['webrtc-signal']({ type: 'answer', sdp: 'fake-sdp' });
        expect(global.RTCPeerConnection).not.toHaveBeenCalled();
    });

    test('Should catch and log errors during offer / answer setting', async () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        mockPeerConnection.setRemoteDescription.mockRejectedValue(new Error('setRemoteDescription failed'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Trigger offer signaling
        socketListeners['webrtc-signal']({ type: 'offer', sdp: 'fake-sdp' });
        
        // Wait for promises to reject
        await new Promise(process.nextTick);
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Handling offer failed:', expect.any(Error));

        // Trigger answer signaling (initiator)
        socketListeners['player-joined'](); // creates peerConnection
        socketListeners['webrtc-signal']({ type: 'answer', sdp: 'fake-sdp' });
        await new Promise(process.nextTick);
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Handling answer failed:', expect.any(Error));

        consoleSpy.mockRestore();
    });

    test('Should handle data channel JSON parsing errors', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockDataChannel.onmessage({ data: '{invalid-json' });
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Failed to parse control message:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    test('Should handle data channel binary unpacking errors', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        mockBinaryProtocol.unpackMove.mockImplementation(() => { throw new Error('Unpack move error'); });
        mockBinaryProtocol.unpackState.mockImplementation(() => { throw new Error('Unpack state error'); });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockDataChannel.onmessage({ data: new ArrayBuffer(15) });
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Failed to unpack P2P move:', expect.any(Error));

        mockDataChannel.onmessage({ data: new ArrayBuffer(81) });
        expect(consoleSpy).toHaveBeenCalledWith('[WebRTC] Failed to unpack P2P state sync:', expect.any(Error));

        consoleSpy.mockRestore();
    });

    test('Should parse Blob and JSON Buffer payloads in fallback socket listener', async () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        // 1. JSON Buffer representation payload
        const bufferPayload = { type: 'Buffer', data: [1, 2, 3] };
        socketListeners['chess-move'](bufferPayload);
        expect(mockBinaryProtocol.unpackMove).toHaveBeenCalled();

        // 2. Raw ArrayBuffer payload
        const arrayBuf = new ArrayBuffer(15);
        socketListeners['chess-move'](arrayBuf);
        expect(mockBinaryProtocol.unpackMove).toHaveBeenCalled();

        // 3. Blob payload
        global.Blob = class {
            async arrayBuffer() {
                return new ArrayBuffer(15);
            }
        };
        const blobPayload = new global.Blob();
        socketListeners['chess-move'](blobPayload);
        
        await new Promise(process.nextTick);
        expect(mockBinaryProtocol.unpackMove).toHaveBeenCalled();

        // Blob failure path
        global.Blob = class {
            async arrayBuffer() {
                throw new Error('arrayBuffer failed');
            }
        };
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        socketListeners['chess-move'](new global.Blob());
        await new Promise(process.nextTick);
        expect(consoleSpy).toHaveBeenCalledWith('Failed to read Blob as ArrayBuffer:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    test('Should set dataChannel.binaryType to arraybuffer and ignore player-joined when P2P is open', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        socketListeners['player-joined']();
        expect(mockDataChannel.binaryType).toBe('arraybuffer');

        // Mark channel as open
        mockDataChannel.readyState = 'open';
        const initialPcCount = global.RTCPeerConnection.mock.calls.length;

        // Spectator joins: player-joined should NOT re-init WebRTC
        socketListeners['player-joined']();
        expect(global.RTCPeerConnection.mock.calls.length).toBe(initialPcCount);
    });

    test('Should sync state with server in background when P2P is open and socket is connected', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        mockDataChannel.readyState = 'open';
        mockSocket.connected = true;

        transportCallbacks.sendState({ board: [] });
        expect(mockDataChannel.send).toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('chess-sync', expect.objectContaining({
            roomId: 'room-123'
        }));
    });

    test('Should handle reconnect correctly without resetting color and calling receiveReconnected', () => {
        mockChessNetwork.receiveReconnected = jest.fn();
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });

        // 1st connect
        socketListeners['connect']();
        expect(mockChessNetwork.connect).toHaveBeenCalledTimes(1);
        expect(mockChessNetwork.receiveReconnected).not.toHaveBeenCalled();

        // 2nd connect (reconnection)
        socketListeners['connect']();
        expect(mockChessNetwork.connect).toHaveBeenCalledTimes(1); // not called again
        expect(mockChessNetwork.receiveReconnected).toHaveBeenCalledTimes(1);
    });

    test('Should fall back to socket when dataChannel.send throws in sendP2POrFallback', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        mockDataChannel.readyState = 'open';
        mockDataChannel.send.mockImplementation(() => {
            throw new Error('DataChannel closed unexpectedly');
        });

        // Sending move should not throw and should fall back to socket
        expect(() => {
            transportCallbacks.sendMove({ from: 'e2', to: 'e4' });
        }).not.toThrow();

        expect(mockSocket.emit).toHaveBeenCalledWith('chess-move', expect.objectContaining({
            roomId: 'room-123'
        }));
        expect(mockPeerConnection.close).toHaveBeenCalled();
    });

    test('Should close WebRTC when connectionState becomes failed or closed', () => {
        SocketTransport.init('room-123');
        const socketListeners = {};
        mockSocket.on.mock.calls.forEach(([event, cb]) => {
            socketListeners[event] = cb;
        });
        socketListeners['player-joined']();

        mockPeerConnection.connectionState = 'failed';
        mockPeerConnection.onconnectionstatechange();
        expect(mockPeerConnection.close).toHaveBeenCalled();
    });

    test('Should register reconnect_failed on socket.io manager if present', () => {
        const mockManager = { on: jest.fn(), opts: {} };
        mockSocket.io = mockManager;
        SocketTransport.init('room-123');

        expect(mockManager.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });
});

