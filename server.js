const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    perMessageDeflate: false,
    httpCompression: false,
    pingInterval: 5000,
    pingTimeout: 2000,
    cookie: false
});

// Security headers for SharedArrayBuffer and Service Worker
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// JSON parser for telemetry POSTs
app.use(express.json());

// Explicitly set MIME type for WASM files
express.static.mime.define({'application/wasm': ['wasm']});

// Serve static files from current directory with optimized caching headers
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm') || filePath.endsWith('.mp3') || filePath.endsWith('.svg')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Telemetry endpoint
app.post('/api/telemetry', (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.type) {
            return res.status(400).json({ error: 'Invalid telemetry payload' });
        }
        
        // Prepare log entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            ip: req.ip || req.headers['x-forwarded-for'] || '',
            ...payload
        };
        
        // Write to telemetry_logs.jsonl
        const logFilePath = path.join(__dirname, 'telemetry_logs.jsonl');
        fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n', (err) => {
            if (err) {
                console.error('[Telemetry] Failed to write to log file:', err);
            }
        });

        // Also output to console in development
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[Telemetry:${payload.type.toUpperCase()}]`, JSON.stringify(payload));
        }

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('[Telemetry] Error processing request:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Neural Engine API endpoint
app.post('/api/neural-move', (req, res) => {
    try {
        const { fen, modelVer, searchType, history } = req.body;
        if (!fen || typeof fen !== 'string') {
            return res.status(400).json({ error: 'Valid FEN string required' });
        }

        const version = typeof modelVer === 'string' && modelVer.trim() ? modelVer.trim() : 'v1';
        const search = typeof searchType === 'string' && searchType.trim() ? searchType.trim() : 'alphabeta';
        const historyJson = JSON.stringify(Array.isArray(history) ? history : []);
        const scriptPath = path.join(__dirname, 'scripts', 'neural_engine.py');
        execFile('python', [scriptPath, fen, version, search, historyJson], { timeout: 12000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Neural API] Execution error:', error);
                return res.status(500).json({ error: 'Neural engine inference failed' });
            }
            try {
                const parsed = JSON.parse(stdout.trim());
                res.json(parsed);
            } catch (parseErr) {
                console.error('[Neural API] JSON parse error:', parseErr, stdout);
                res.status(500).json({ error: 'Invalid engine output' });
            }
        });
    } catch (e) {
        console.error('[Neural API] Unexpected error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const rooms = new Map();

io.on('connection', (socket) => {
    if (process.env.NODE_ENV !== 'test') {
        console.log('A user connected:', socket.id);
    }

    // Join a specific game room
    socket.on('join-room', (payload) => {
        const roomId = (typeof payload === 'object' && payload && payload.roomId) ? payload.roomId : (typeof payload === 'string' ? payload : 'default-room');
        const preferredSide = (typeof payload === 'object' && payload && payload.preferredSide) ? payload.preferredSide : 'random';

        socket.join(roomId);
        if (process.env.NODE_ENV !== 'test') {
            console.log(`User ${socket.id} joined room: ${roomId} with preferredSide: ${preferredSide}`);
        }
        
        let roomData = rooms.get(roomId);
        if (roomData && roomData.deleteTimeout) {
            clearTimeout(roomData.deleteTimeout);
            roomData.deleteTimeout = null;
            if (process.env.NODE_ENV !== 'test') {
                console.log(`Reconnection detected for room: ${roomId}`);
            }
        }
        
        let assignedColor = 'w';
        if (!roomData) {
            if (preferredSide === 'w') {
                assignedColor = 'w';
            } else if (preferredSide === 'b') {
                assignedColor = 'b';
            } else {
                assignedColor = Math.random() < 0.5 ? 'w' : 'b';
            }
            roomData = {
                firstColor: assignedColor,
                players: {
                    [assignedColor]: socket.id
                },
                gameState: null,
                deleteTimeout: null
            };
            rooms.set(roomId, roomData);
        } else {
            const players = roomData.players || {};
            const wActive = players.w && io.sockets.sockets.has(players.w);
            const bActive = players.b && io.sockets.sockets.has(players.b);

            if (players.w === socket.id) {
                assignedColor = 'w';
            } else if (players.b === socket.id) {
                assignedColor = 'b';
            } else if (!wActive) {
                assignedColor = 'w';
                players.w = socket.id;
            } else if (!bActive) {
                assignedColor = 'b';
                players.b = socket.id;
            } else {
                assignedColor = 'spectator';
            }
            roomData.players = players;
        }
        
        socket.emit('color-assigned', assignedColor);
        if (roomData.gameState) {
            socket.emit('chess-sync', roomData.gameState);
        }
        socket.to(roomId).emit('player-joined');
        
        const clients = io.sockets.adapter.rooms.get(roomId);
        const otherClientsCount = clients ? clients.size - 1 : 0;
        socket.emit('opponent-status', { online: otherClientsCount > 0 });
        socket.to(roomId).emit('opponent-status', { online: true });
    });

    // Relay move to others in the same room
    socket.on('chess-move', (data) => {
        socket.to(data.roomId).emit('chess-move', data.move);
    });

    // Undo requests
    socket.on('undo-request', (data) => {
        socket.to(data.roomId).emit('undo-request', data.levels);
    });

    // Undo response
    socket.on('undo-response', (data) => {
        socket.to(data.roomId).emit('undo-response', data.accepted);
    });

    // Relay full state sync
    socket.on('chess-sync', (data) => {
        const roomData = rooms.get(data.roomId);
        if (roomData) {
            roomData.gameState = data.state;
        }
        socket.to(data.roomId).emit('chess-sync', data.state);
    });

    // WebRTC signaling relay
    socket.on('webrtc-signal', (data) => {
        socket.to(data.roomId).emit('webrtc-signal', data.signal);
    });

    socket.on('resign', (data) => {
        socket.to(data.roomId).emit('resign');
    });

    socket.on('draw-offer', (data) => {
        socket.to(data.roomId).emit('draw-offer');
    });

    socket.on('draw-response', (data) => {
        socket.to(data.roomId).emit('draw-response', data.accepted);
    });

    socket.on('chat-message', (data) => {
        socket.to(data.roomId).emit('chat-message', data.text);
    });

    // NTP-like time sync
    socket.on('chess-ping', (clientTime) => {
        socket.emit('chess-pong', {
            clientTime: clientTime,
            serverTime: Date.now()
        });
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId === socket.id) continue;
            socket.to(roomId).emit('opponent-status', { online: false });
            socket.to(roomId).emit('player-left');
            const roomData = rooms.get(roomId);
            if (roomData) {
                // If there are other active users in this room, do not delete it!
                const clients = io.sockets.adapter.rooms.get(roomId);
                const otherClientsCount = clients ? (clients.has(socket.id) ? clients.size - 1 : clients.size) : 0;
                
                if (otherClientsCount > 0) {
                    continue;
                }

                if (roomData.deleteTimeout) {
                    clearTimeout(roomData.deleteTimeout);
                }
                const delay = process.env.NODE_ENV === 'test' ? 0 : 45000;
                if (delay === 0) {
                    rooms.delete(roomId);
                } else {
                    roomData.deleteTimeout = setTimeout(() => {
                        rooms.delete(roomId);
                    }, delay);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (process.env.NODE_ENV !== 'test') {
            console.log('User disconnected');
        }
    });
});

const os = require('os');

function getLocalIps() {
    const ips = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips.length > 0 ? ips : ['localhost'];
}

// Start server on port 5000 (or PORT env)
const PORT = process.env.PORT || 5000;
const LOCAL_IPS = getLocalIps();

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log('-----------------------------------');
        console.log(`Chess server is running!`);
        console.log(`Local:   http://localhost:${PORT}`);
        LOCAL_IPS.forEach(ip => {
            console.log(`Network: http://${ip}:${PORT}`);
        });
        console.log('-----------------------------------');
    });
}

function getLocalIp() {
    return getLocalIps()[0];
}

module.exports = { app, server, getLocalIp, getLocalIps };
