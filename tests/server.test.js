const request = require('supertest');
const { app, server } = require('../server.js');
const { io: Client } = require('socket.io-client');

describe('Server Headers and Static Files', () => {
    test('Should have COOP and COEP headers for SharedArrayBuffer', async () => {
        const response = await request(app).get('/');
        expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
    });

    test('Should serve index.html', async () => {
        const response = await request(app).get('/');
        expect(response.status).toBe(200);
        expect(response.text).toContain('<!DOCTYPE html>');
    });

    test('Should have correct security headers on JS files', async () => {
        const response = await request(app).get('/js/logic.js');
        expect(response.status).toBe(200);
        expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    });
});

describe('Socket.IO Multiplayer Logic', () => {
    let clientSocket1, clientSocket2, clientSocket3;

    beforeAll((done) => {
        server.listen(3001, () => {
            done();
        });
    });

    afterAll(() => {
        server.close();
    });

    beforeEach((done) => {
        clientSocket1 = new Client('http://localhost:3001');
        clientSocket2 = new Client('http://localhost:3001');
        clientSocket3 = new Client('http://localhost:3001');
        
        let connections = 0;
        const onConnect = () => {
            connections++;
            if (connections === 3) done();
        };
        clientSocket1.on('connect', onConnect);
        clientSocket2.on('connect', onConnect);
        clientSocket3.on('connect', onConnect);
    });

    afterEach((done) => {
        let disconnected = 0;
        const checkDone = () => {
            disconnected++;
            if (disconnected === 3) done();
        };
        clientSocket1.on('disconnect', checkDone);
        clientSocket2.on('disconnect', checkDone);
        clientSocket3.on('disconnect', checkDone);
        
        clientSocket1.disconnect();
        clientSocket2.disconnect();
        clientSocket3.disconnect();
    });

    test('First user in room gets "w" or "b" color', (done) => {
        clientSocket1.emit('join-room', 'room1');
        clientSocket1.on('color-assigned', (color) => {
            expect(['w', 'b']).toContain(color);
            done();
        });
    });

    test('Second user in room gets opposite color and first gets player-joined', (done) => {
        let p1ReceivedJoined = false;
        let firstUserColor = null;
        clientSocket1.on('player-joined', () => {
            p1ReceivedJoined = true;
        });

        clientSocket1.emit('join-room', 'room2');
        clientSocket1.on('color-assigned', (color) => {
            firstUserColor = color;
            expect(['w', 'b']).toContain(color);
            clientSocket2.emit('join-room', 'room2');
        });

        clientSocket2.on('color-assigned', (color) => {
            const expectedOpposite = firstUserColor === 'w' ? 'b' : 'w';
            expect(color).toBe(expectedOpposite);
            setTimeout(() => {
                expect(p1ReceivedJoined).toBe(true);
                done();
            }, 50);
        });
    });

    test('Third user gets "spectator" color', (done) => {
        clientSocket1.emit('join-room', 'room3');
        setTimeout(() => {
            clientSocket2.emit('join-room', 'room3');
            setTimeout(() => {
                clientSocket3.emit('join-room', 'room3');
                clientSocket3.on('color-assigned', (color) => {
                    expect(color).toBe('spectator');
                    done();
                });
            }, 50);
        }, 50);
    });

    test('chess-move is relayed to other players in room', (done) => {
        clientSocket1.emit('join-room', 'room4');
        clientSocket2.emit('join-room', 'room4');

        const testMove = { fromR: 6, fromC: 4, toR: 4, toC: 4 };
        
        clientSocket2.on('chess-move', (move) => {
            expect(move).toEqual(testMove);
            done();
        });

        setTimeout(() => {
            clientSocket1.emit('chess-move', { roomId: 'room4', move: testMove });
        }, 100);
    });
    
    test('NTP time sync responds with serverTime', (done) => {
        const clientTime = 12345;
        clientSocket1.emit('chess-ping', clientTime);
        clientSocket1.on('chess-pong', (data) => {
            expect(data.clientTime).toBe(clientTime);
            expect(data.serverTime).toBeGreaterThan(0);
            done();
        });
    });

    test('First user color assignment is randomized across multiple runs and room state is cleaned up', (done) => {
        const numRuns = 15;
        let runsCompleted = 0;
        const colorsReceived = new Set();

        function runNext() {
            if (runsCompleted >= numRuns) {
                expect(colorsReceived.has('w')).toBe(true);
                expect(colorsReceived.has('b')).toBe(true);
                done();
                return;
            }

            const tempSocket = new Client('http://localhost:3001');
            tempSocket.on('connect', () => {
                tempSocket.emit('join-room', 'cleanup-room');
            });
            tempSocket.on('color-assigned', (color) => {
                colorsReceived.add(color);
                tempSocket.disconnect();
            });
            tempSocket.on('disconnect', () => {
                runsCompleted++;
                setTimeout(runNext, 30);
            });
        }

        runNext();
    });
});
