const request = require('supertest');
const { app, server } = require('../server.js');
const { io: Client } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

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
        server.listen(3005, () => {
            done();
        });
    });

    afterAll(() => {
        server.close();
    });

    beforeEach((done) => {
        clientSocket1 = new Client('http://localhost:3005', { transports: ['websocket'] });
        clientSocket2 = new Client('http://localhost:3005', { transports: ['websocket'] });
        clientSocket3 = new Client('http://localhost:3005', { transports: ['websocket'] });
        
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
        const sockets = [clientSocket1, clientSocket2, clientSocket3];
        const activeSockets = sockets.filter(s => s && s.connected);
        
        if (activeSockets.length === 0) {
            done();
            return;
        }
        
        let disconnected = 0;
        const checkDone = () => {
            disconnected++;
            if (disconnected === activeSockets.length) done();
        };
        
        activeSockets.forEach(s => {
            s.on('disconnect', checkDone);
            s.disconnect();
        });
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

            const tempSocket = new Client('http://localhost:3005', { transports: ['websocket'] });
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

    describe('Multiplayer signaling relays', () => {
        beforeEach((done) => {
            clientSocket1.emit('join-room', 'relay-room');
            clientSocket2.emit('join-room', 'relay-room');
            setTimeout(done, 100);
        });

        test('undo-request is relayed', (done) => {
            clientSocket2.on('undo-request', (levels) => {
                expect(levels).toBe(2);
                done();
            });
            clientSocket1.emit('undo-request', { roomId: 'relay-room', levels: 2 });
        });

        test('undo-response is relayed', (done) => {
            clientSocket2.on('undo-response', (accepted) => {
                expect(accepted).toBe(true);
                done();
            });
            clientSocket1.emit('undo-response', { roomId: 'relay-room', accepted: true });
        });

        test('chess-sync is relayed', (done) => {
            const sampleState = { fen: 'some-fen' };
            clientSocket2.on('chess-sync', (state) => {
                expect(state).toEqual(sampleState);
                done();
            });
            clientSocket1.emit('chess-sync', { roomId: 'relay-room', state: sampleState });
        });

        test('webrtc-signal is relayed', (done) => {
            const sampleSignal = { sdp: 'some-sdp' };
            clientSocket2.on('webrtc-signal', (signal) => {
                expect(signal).toEqual(sampleSignal);
                done();
            });
            clientSocket1.emit('webrtc-signal', { roomId: 'relay-room', signal: sampleSignal });
        });

        test('resign is relayed', (done) => {
            clientSocket2.on('resign', () => {
                done();
            });
            clientSocket1.emit('resign', { roomId: 'relay-room' });
        });

        test('draw-offer is relayed', (done) => {
            clientSocket2.on('draw-offer', () => {
                done();
            });
            clientSocket1.emit('draw-offer', { roomId: 'relay-room' });
        });

        test('draw-response is relayed', (done) => {
            clientSocket2.on('draw-response', (accepted) => {
                expect(accepted).toBe(false);
                done();
            });
            clientSocket1.emit('draw-response', { roomId: 'relay-room', accepted: false });
        });
    });

    test('Room should not be deleted upon player disconnect if another player remains active in the room', (done) => {
        clientSocket1.emit('join-room', 'persist-room');
        clientSocket1.on('color-assigned', (color1) => {
            clientSocket2.emit('join-room', 'persist-room');
            clientSocket2.on('color-assigned', (color2) => {
                // Disconnect clientSocket1
                clientSocket1.disconnect();
                
                setTimeout(() => {
                    // Join clientSocket3. If the room persisted, it should still have clientSocket2,
                    // so clientSocket3 should get spectator or the opposite color, not a fresh random color.
                    clientSocket3.emit('join-room', 'persist-room');
                    clientSocket3.on('color-assigned', (color3) => {
                        expect(['w', 'b', 'spectator']).toContain(color3);
                        if (color3 !== 'spectator') {
                            expect(color3).not.toBe(color2);
                        }
                        done();
                    });
                }, 50);
            });
        });
    });
});

describe('Server Utility Functions', () => {
    test('getLocalIp should return a string representing IP or localhost', () => {
        const { getLocalIp } = require('../server.js');
        const ip = getLocalIp();
        expect(typeof ip).toBe('string');
        expect(ip.length).toBeGreaterThan(0);
    });

    test('getLocalIp should fallback to localhost when networkInterfaces returns empty or local only', () => {
        const os = require('os');
        const originalNetworkInterfaces = os.networkInterfaces;
        os.networkInterfaces = () => ({
            'lo': [{ family: 'IPv4', address: '127.0.0.1', internal: true }]
        });
        
        const { getLocalIp } = require('../server.js');
        const ip = getLocalIp();
        expect(ip).toBe('localhost');
        
        os.networkInterfaces = originalNetworkInterfaces;
    });
});

describe('Telemetry API Endpoint', () => {
    const logFilePath = path.join(__dirname, '../telemetry_logs.jsonl');

    beforeEach(() => {
        try {
            if (fs.existsSync(logFilePath)) {
                fs.unlinkSync(logFilePath);
            }
        } catch (e) {}
    });

    afterEach(() => {
        // Clean up the generated telemetry file
        try {
            if (fs.existsSync(logFilePath)) {
                fs.unlinkSync(logFilePath);
            }
        } catch (e) {}
    });

    test('POST /api/telemetry with valid payload should return 200 and write to log', async () => {
        const payload = {
            type: 'error',
            message: 'Test crash message',
            source: 'test.js',
            line: 42,
            col: 10,
            stack: 'Error: Test crash\n  at Object.<anonymous> (test.js:42:10)'
        };
        const response = await request(app)
            .post('/api/telemetry')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });

        // Verify the file was created and contains correct data
        expect(fs.existsSync(logFilePath)).toBe(true);
        const fileContent = fs.readFileSync(logFilePath, 'utf8');
        const lines = fileContent.trim().split('\n');
        const loggedData = JSON.parse(lines[lines.length - 1]);
        expect(loggedData.type).toBe('error');
        expect(loggedData.message).toBe('Test crash message');
        expect(loggedData.line).toBe(42);
        expect(loggedData.ip).toBeDefined();
        expect(loggedData.timestamp).toBeDefined();
    });

    test('POST /api/telemetry with missing type should return 400', async () => {
        const payload = {
            message: 'Missing type'
        };
        const response = await request(app)
            .post('/api/telemetry')
            .send(payload);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid telemetry payload' });
    });
});

describe('Neural Move API Endpoint', () => {
    test('POST /api/neural-move with missing fen should return 400', async () => {
        const response = await request(app)
            .post('/api/neural-move')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Valid FEN string required' });
    });

    test('POST /api/neural-move with opening FEN and modelVer v1_5 should return book or search move', async () => {
        const response = await request(app)
            .post('/api/neural-move')
            .send({
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                modelVer: 'v1_5'
            });

        expect(response.status).toBe(200);
        expect(response.body.topMoves).toBeDefined();
        expect(Array.isArray(response.body.topMoves)).toBe(true);
        expect(response.body.topMoves.length).toBeGreaterThan(0);
        expect(response.body.topMoves[0].uci).toBeDefined();
    }, 10000);

    test('POST /api/neural-move with searchType mcts should return MCTS evaluation', async () => {
        const response = await request(app)
            .post('/api/neural-move')
            .send({
                fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5',
                modelVer: 'v1_5',
                searchType: 'mcts'
            });

        expect(response.status).toBe(200);
        expect(response.body.searchType).toBe('mcts');
        expect(response.body.topMoves).toBeDefined();
        expect(response.body.topMoves.length).toBeGreaterThan(0);
        expect(response.body.topMoves[0].visits).toBeDefined();
    }, 15000);
});


