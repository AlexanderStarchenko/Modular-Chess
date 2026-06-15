/**
 * Tests for ChessNetwork Adapter
 */

const ChessNetwork = require('../js/network');

describe('ChessNetwork Adapter', () => {
    let mockTransport;

    beforeEach(() => {
        // Reset connection state
        ChessNetwork.disconnect();
        mockTransport = {
            sendMove: jest.fn(),
            sendState: jest.fn(),
            sendUndoRequest: jest.fn(),
            sendUndoResponse: jest.fn(),
            sendResign: jest.fn(),
            sendDrawOffer: jest.fn(),
            sendDrawResponse: jest.fn()
        };
        ChessNetwork.attach(mockTransport);
    });

    test('Should handle connection and disconnection state updates', () => {
        expect(ChessNetwork.getState()).toEqual({
            connected: false,
            roomId: null,
            playerColor: null
        });

        const meta = { roomId: 'test-room', playerColor: 'w' };
        const state = ChessNetwork.connect(meta);

        expect(state.connected).toBe(true);
        expect(state.roomId).toBe('test-room');
        expect(state.playerColor).toBe('w');

        expect(ChessNetwork.getState()).toEqual({
            connected: true,
            roomId: 'test-room',
            playerColor: 'w'
        });

        ChessNetwork.disconnect();
        expect(ChessNetwork.getState().connected).toBe(false);
        expect(ChessNetwork.getState().roomId).toBeNull();
    });

    test('Should register and trigger event listeners correctly', () => {
        const moveListener = jest.fn();
        const unsubscribe = ChessNetwork.on('move', moveListener);

        const sampleMove = { from: 'e2', to: 'e4' };
        ChessNetwork.sendMove(sampleMove);

        expect(moveListener).toHaveBeenCalledWith(sampleMove);
        expect(mockTransport.sendMove).toHaveBeenCalledWith(sampleMove);

        // Unsubscribe and verify it's no longer called
        unsubscribe();
        ChessNetwork.sendMove(sampleMove);
        expect(moveListener).toHaveBeenCalledTimes(1);
    });

    test('Should handle invalid event type registrations gracefully', () => {
        const dummyHandler = jest.fn();
        const unsubscribe = ChessNetwork.on('invalid-event-type', dummyHandler);
        // Should return a no-op function and not throw
        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
    });

    test('Should catch listener errors and proceed with other listeners', () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        const badListener = jest.fn().mockImplementation(() => {
            throw new Error('Listener failed');
        });
        const goodListener = jest.fn();

        ChessNetwork.on('joined', badListener);
        ChessNetwork.on('joined', goodListener);

        ChessNetwork.receiveJoined();

        expect(badListener).toHaveBeenCalled();
        expect(goodListener).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });

    test('Should relay incoming/outgoing signaling events', () => {
        const statusListener = jest.fn();
        const syncListener = jest.fn();
        const joinedListener = jest.fn();
        const colorListener = jest.fn();
        const undoReqListener = jest.fn();
        const undoResListener = jest.fn();
        const resignListener = jest.fn();
        const drawOfferListener = jest.fn();
        const drawResponseListener = jest.fn();

        ChessNetwork.on('status', statusListener);
        ChessNetwork.on('sync', syncListener);
        ChessNetwork.on('joined', joinedListener);
        ChessNetwork.on('colorAssigned', colorListener);
        ChessNetwork.on('undoRequest', undoReqListener);
        ChessNetwork.on('undoResponse', undoResListener);
        ChessNetwork.on('resign', resignListener);
        ChessNetwork.on('drawOffer', drawOfferListener);
        ChessNetwork.on('drawResponse', drawResponseListener);

        // Connect
        ChessNetwork.connect({ roomId: 'room' });
        expect(statusListener).toHaveBeenCalled();

        // sendState
        ChessNetwork.sendState('state');
        expect(mockTransport.sendState).toHaveBeenCalledWith('state');
        expect(syncListener).toHaveBeenCalledWith('state');

        // receiveMove & receiveState
        ChessNetwork.receiveMove('move');
        ChessNetwork.receiveState('state-sync');
        expect(syncListener).toHaveBeenCalledWith('state-sync');

        // receiveJoined & receiveColor
        ChessNetwork.receiveJoined();
        ChessNetwork.receiveColor('b');
        expect(joinedListener).toHaveBeenCalled();
        expect(colorListener).toHaveBeenCalledWith('b');

        // undo requests
        ChessNetwork.sendUndoRequest(2);
        expect(mockTransport.sendUndoRequest).toHaveBeenCalledWith(2);
        ChessNetwork.receiveUndoRequest(2);
        expect(undoReqListener).toHaveBeenCalledWith(2);

        // undo responses
        ChessNetwork.sendUndoResponse(true);
        expect(mockTransport.sendUndoResponse).toHaveBeenCalledWith(true);
        ChessNetwork.receiveUndoResponse(true);
        expect(undoResListener).toHaveBeenCalledWith(true);

        // resign
        ChessNetwork.sendResign();
        expect(mockTransport.sendResign).toHaveBeenCalled();
        ChessNetwork.receiveResign();
        expect(resignListener).toHaveBeenCalled();

        // draw offer
        ChessNetwork.sendDrawOffer();
        expect(mockTransport.sendDrawOffer).toHaveBeenCalled();
        ChessNetwork.receiveDrawOffer();
        expect(drawOfferListener).toHaveBeenCalled();

        // draw response
        ChessNetwork.sendDrawResponse(false);
        expect(mockTransport.sendDrawResponse).toHaveBeenCalledWith(false);
        ChessNetwork.receiveDrawResponse(false);
        expect(drawResponseListener).toHaveBeenCalledWith(false);
    });
});
