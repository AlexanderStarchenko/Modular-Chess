const { app, server } = require('../server.cjs');
const { io: Client } = require('socket.io-client');
const ChessLogic = require('../js/logic');
const ChessAIHard = require('../js/ai_hard');

describe('Full System Integration: UI -> Logic -> Network -> AI', () => {
    let clientWhite, clientBlack;
    let whiteLogic, blackLogic;

    beforeAll((done) => {
        // Start local server
        server.listen(3002, () => {
            done();
        });
    });

    afterAll(() => {
        server.close();
    });

    beforeEach((done) => {
        ChessLogic.initBoard();

        clientWhite = new Client('http://localhost:3002');
        clientBlack = new Client('http://localhost:3002');

        let connections = 0;
        const onConnect = () => {
            connections++;
            if (connections === 2) done();
        };

        clientWhite.on('connect', onConnect);
        clientBlack.on('connect', onConnect);
    });

    afterEach((done) => {
        let disconnected = 0;
        const checkDone = () => {
            disconnected++;
            if (disconnected === 2) done();
        };
        clientWhite.on('disconnect', checkDone);
        clientBlack.on('disconnect', checkDone);
        
        clientWhite.disconnect();
        clientBlack.disconnect();
    });

    test('Full Loop: Player moves -> Network -> AI calculates -> Network -> Board updates', (done) => {
        let whiteSocket, blackSocket;
        
        function runTest() {
            if (!whiteSocket || !blackSocket) return;

            blackSocket.on('chess-move', (move) => {
                try {
                    expect(move).toEqual({ fromR: 6, fromC: 4, toR: 4, toC: 4 });
                    expect(ChessLogic.getTurn()).toBe('b');

                    const aiMove = ChessAIHard.getBestMove('b', 2);
                    expect(aiMove).toBeDefined();

                    ChessLogic.movePiece(aiMove.fromR, aiMove.fromC, aiMove.toR, aiMove.toC);
                    blackSocket.emit('chess-move', { roomId: 'integration-room', move: aiMove });
                } catch (err) {
                    done(err);
                }
            });

            whiteSocket.on('chess-move', (move) => {
                try {
                    expect(move).toBeDefined();
                    expect(ChessLogic.getTurn()).toBe('w');
                    done();
                } catch (err) {
                    done(err);
                }
            });

            // Start white move
            const whiteMove = { fromR: 6, fromC: 4, toR: 4, toC: 4 };
            expect(ChessLogic.isValidMove(whiteMove.fromR, whiteMove.fromC, whiteMove.toR, whiteMove.toC)).toBe(true);
            ChessLogic.movePiece(whiteMove.fromR, whiteMove.fromC, whiteMove.toR, whiteMove.toC);
            whiteSocket.emit('chess-move', { roomId: 'integration-room', move: whiteMove });
        }

        clientWhite.on('color-assigned', (color) => {
            if (color === 'w') {
                whiteSocket = clientWhite;
            } else {
                blackSocket = clientWhite;
            }
            clientBlack.emit('join-room', 'integration-room');
        });

        clientBlack.on('color-assigned', (color) => {
            if (color === 'w') {
                whiteSocket = clientBlack;
            } else {
                blackSocket = clientBlack;
            }
            
            // Give server a tiny bit of time to register the room
            setTimeout(runTest, 50);
        });

        clientWhite.emit('join-room', 'integration-room');
    });
});
