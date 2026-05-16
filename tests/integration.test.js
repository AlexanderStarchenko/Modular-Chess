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
        let loopStep = 0;
        
        clientBlack.on('chess-move', (move) => {
            try {
                loopStep = 3;
                expect(move).toEqual({ fromR: 6, fromC: 4, toR: 4, toC: 4 });
                expect(ChessLogic.getTurn()).toBe('b');

                const aiMove = ChessAIHard.getBestMove('b', 2);
                expect(aiMove).toBeDefined();

                ChessLogic.movePiece(aiMove.fromR, aiMove.fromC, aiMove.toR, aiMove.toC);
                clientBlack.emit('chess-move', { roomId: 'integration-room', move: aiMove });
            } catch (err) {
                done(err);
            }
        });

        clientWhite.on('chess-move', (move) => {
            try {
                loopStep = 4;
                expect(move).toBeDefined();
                expect(ChessLogic.getTurn()).toBe('w');
                done();
            } catch (err) {
                done(err);
            }
        });

        clientWhite.on('color-assigned', (color) => {
            loopStep = 1;
            expect(color).toBe('w');
            clientBlack.emit('join-room', 'integration-room');
        });

        clientBlack.on('color-assigned', (color) => {
            loopStep = 2;
            expect(color).toBe('b');
            
            // Give server a tiny bit of time to register the room
            setTimeout(() => {
                try {
                    const whiteMove = { fromR: 6, fromC: 4, toR: 4, toC: 4 };
                    expect(ChessLogic.isValidMove(whiteMove.fromR, whiteMove.fromC, whiteMove.toR, whiteMove.toC)).toBe(true);
                    ChessLogic.movePiece(whiteMove.fromR, whiteMove.fromC, whiteMove.toR, whiteMove.toC);
                    clientWhite.emit('chess-move', { roomId: 'integration-room', move: whiteMove });
                } catch (err) {
                    done(err);
                }
            }, 50);
        });

        clientWhite.emit('join-room', 'integration-room');
    });
});
