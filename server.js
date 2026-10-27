const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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

// Limit JSON body size to 16kb for protection against payload floods
app.use(express.json({ limit: '16kb' }));

// Block direct access to server-side code, logs, weights and sensitive files
const FORBIDDEN_FILE_REGEX = /\.(py|pt|jsonl|env|git|log)$|^(\/|\\)?(server\.js|package\.json|package-lock\.json|asconfig\.json|capacitor\.config\.ts|tailwind\.config\.js|build-mobile\.js)$/i;

app.use((req, res, next) => {
    const cleanPath = req.path.replace(/^\/+/, '');
    if (
        cleanPath.startsWith('scripts/') ||
        cleanPath.startsWith('training/') ||
        cleanPath.startsWith('node_modules/') ||
        cleanPath.startsWith('.git/') ||
        FORBIDDEN_FILE_REGEX.test(cleanPath)
    ) {
        return res.status(403).send('Forbidden');
    }
    next();
});

// Explicitly set MIME type for WASM files
express.static.mime.define({'application/wasm': ['wasm']});

// Serve static files from current directory with optimized caching headers
app.use(express.static(__dirname, {
    maxAge: '1d',
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm') || filePath.endsWith('.mp3') || filePath.endsWith('.svg')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Persistent telemetry write stream (eliminates OS file descriptor churn)
const telemetryLogPath = path.join(__dirname, 'telemetry_logs.jsonl');
let telemetryStream = null;

function getTelemetryStream() {
    if (!telemetryStream || telemetryStream.destroyed) {
        telemetryStream = fs.createWriteStream(telemetryLogPath, { flags: 'a' });
        telemetryStream.on('error', (err) => {
            console.error('[Telemetry] WriteStream error:', err);
        });
    }
    return telemetryStream;
}

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
        
        const line = JSON.stringify(logEntry) + '\n';
        const stream = getTelemetryStream();
        stream.write(line, () => {
            // Also output to console in development
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[Telemetry:${payload.type.toUpperCase()}]`, JSON.stringify(payload));
            }
            res.status(200).json({ success: true });
        });
    } catch (e) {
        console.error('[Telemetry] Error processing request:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==========================================
// Persistent Python Neural Daemon (Warm Pool)
// ==========================================
let pythonDaemon = null;
let daemonRequestId = 0;
const pendingRequests = new Map();
let daemonBuffer = '';

function startPythonDaemon() {
    if (pythonDaemon) return;

    const daemonScript = path.join(__dirname, 'scripts', 'neural_daemon.py');
    pythonDaemon = spawn('python', [daemonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });
    pythonDaemon.unref();

    pythonDaemon.stdout.on('data', (chunk) => {
        daemonBuffer += chunk.toString('utf8');
        let newlineIndex;
        while ((newlineIndex = daemonBuffer.indexOf('\n')) !== -1) {
            const line = daemonBuffer.slice(0, newlineIndex).trim();
            daemonBuffer = daemonBuffer.slice(newlineIndex + 1);
            if (!line) continue;

            try {
                const message = JSON.parse(line);
                if (message.status === 'ready') {
                    if (process.env.NODE_ENV !== 'test') {
                        console.log('[Neural Daemon] Warm engine initialized and ready');
                    }
                    continue;
                }
                const reqId = message.id;
                if (reqId !== undefined && pendingRequests.has(reqId)) {
                    const { resolve, timer } = pendingRequests.get(reqId);
                    clearTimeout(timer);
                    pendingRequests.delete(reqId);
                    resolve(message);
                }
            } catch (err) {
                console.error('[Neural Daemon] JSON parse error from daemon output:', err, line);
            }
        }
    });

    pythonDaemon.stderr.on('data', (data) => {
        const errStr = data.toString('utf8');
        if (process.env.NODE_ENV !== 'test') {
            console.error('[Neural Daemon stderr]', errStr);
        }
    });

    pythonDaemon.on('exit', (code, signal) => {
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`[Neural Daemon] Exited with code ${code}, signal ${signal}. Restarting...`);
        }
        pythonDaemon = null;
        for (const [id, req] of pendingRequests.entries()) {
            clearTimeout(req.timer);
            req.reject(new Error('Neural daemon process terminated'));
        }
        pendingRequests.clear();
    });
}

function sendToNeuralDaemon(payload, timeoutMs = 15000) {
    if (!pythonDaemon || pythonDaemon.killed) {
        startPythonDaemon();
    }

    return new Promise((resolve, reject) => {
        const id = ++daemonRequestId;
        const timer = setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('Neural daemon request timed out'));
            }
        }, timeoutMs);

        pendingRequests.set(id, { resolve, reject, timer });

        const reqLine = JSON.stringify({ id, ...payload }) + '\n';
        pythonDaemon.stdin.write(reqLine, 'utf8', (err) => {
            if (err) {
                clearTimeout(timer);
                pendingRequests.delete(id);
                reject(err);
            }
        });
    });
}

// Start warm daemon on startup
startPythonDaemon();

// Neural Engine API endpoint
app.post('/api/neural-move', async (req, res) => {
    try {
        const { fen, modelVer, searchType, history } = req.body;
        if (!fen || typeof fen !== 'string') {
            return res.status(400).json({ error: 'Valid FEN string required' });
        }

        const version = typeof modelVer === 'string' && modelVer.trim() ? modelVer.trim() : 'v1';
        const search = typeof searchType === 'string' && searchType.trim() ? searchType.trim() : 'alphabeta';
        const hist = Array.isArray(history) ? history : [];

        try {
            const engineOutput = await sendToNeuralDaemon({
                fen,
                modelVer: version,
                searchType: search,
                history: hist
            }, 14000);

            if (engineOutput.error) {
                console.error('[Neural API] Daemon reported error:', engineOutput.error);
                return res.status(500).json({ error: 'Neural engine inference failed' });
            }

            delete engineOutput.id;
            return res.json(engineOutput);
        } catch (daemonErr) {
            console.error('[Neural API] Daemon call failed:', daemonErr);
            return res.status(500).json({ error: 'Neural engine inference failed' });
        }
    } catch (e) {
        console.error('[Neural API] Unexpected error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==========================================
// Rooms & Multiplayer Logic (Socket.IO)
// ==========================================
const rooms = new Map();

io.on('connection', (socket) => {
    if (process.env.NODE_ENV !== 'test') {
        console.log('A user connected:', socket.id);
    }

    // Join a specific game room
    socket.on('join-room', (payload) => {
        const roomId = (typeof payload === 'object' && payload?.roomId)
            ? String(payload.roomId)
            : (typeof payload === 'string' ? payload : 'default-room');
        const preferredSide = (typeof payload === 'object' && payload?.preferredSide)
            ? payload.preferredSide
            : 'random';

        // Leave previous game rooms if socket is switching
        for (const prevRoom of socket.rooms) {
            if (prevRoom !== socket.id && prevRoom !== roomId) {
                socket.leave(prevRoom);
            }
        }

        socket.join(roomId);
        socket.data.roomId = roomId;

        if (process.env.NODE_ENV !== 'test') {
            console.log(`User ${socket.id} joined room: ${roomId} with preferredSide: ${preferredSide}`);
        }

        let roomData = rooms.get(roomId);
        if (roomData?.deleteTimeout) {
            clearTimeout(roomData.deleteTimeout);
            roomData.deleteTimeout = null;
            if (process.env.NODE_ENV !== 'test') {
                console.log(`Reconnection detected for room: ${roomId}`);
            }
        }

        let assignedColor = 'spectator';
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
                players: { [assignedColor]: socket.id },
                gameState: null,
                deleteTimeout: null
            };
            rooms.set(roomId, roomData);
        } else {
            const { players } = roomData;
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
        }

        socket.data.color = assignedColor;
        socket.emit('color-assigned', assignedColor);

        if (roomData.gameState) {
            socket.emit('chess-sync', roomData.gameState);
        }

        const isBothPlayersOnline = Boolean(
            roomData.players.w && io.sockets.sockets.has(roomData.players.w) &&
            roomData.players.b && io.sockets.sockets.has(roomData.players.b)
        );

        if (assignedColor !== 'spectator') {
            socket.to(roomId).emit('player-joined');
        }
        io.to(roomId).emit('opponent-status', { online: isBothPlayersOnline });
    });

    // Helper: action is allowed only for active players (w or b) in the room
    const isActivePlayer = (roomId) => {
        const roomData = rooms.get(roomId);
        if (!roomData || !roomData.players) return false;
        return roomData.players.w === socket.id || roomData.players.b === socket.id;
    };

    // Relay move to others in the same room (Active players only)
    socket.on('chess-move', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        socket.to(roomId).emit('chess-move', data?.move);
    });

    // Undo requests (Active players only)
    socket.on('undo-request', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        socket.to(roomId).emit('undo-request', data?.levels);
    });

    // Undo response (Active players only)
    socket.on('undo-response', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        socket.to(roomId).emit('undo-response', data?.accepted);
    });

    // Relay full state sync (Active players only)
    socket.on('chess-sync', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        const roomData = rooms.get(roomId);
        if (roomData) {
            roomData.gameState = data?.state;
        }
        socket.to(roomId).emit('chess-sync', data?.state);
    });

    // WebRTC signaling relay (Safe room extraction)
    socket.on('webrtc-signal', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId) return;
        socket.to(roomId).emit('webrtc-signal', data?.signal);
    });

    // Resign (Active players only)
    socket.on('resign', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        socket.to(roomId).emit('resign');
    });

    // Draw offer (Active players only)
    socket.on('draw-offer', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        socket.to(roomId).emit('draw-offer');
    });

    // Draw response (Active players only)
    socket.on('draw-response', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || !isActivePlayer(roomId)) return;
        socket.to(roomId).emit('draw-response', data?.accepted);
    });

    // Chat message relay
    socket.on('chat-message', (data) => {
        const roomId = data?.roomId || socket.data.roomId;
        if (!roomId || typeof data?.text !== 'string') return;
        socket.to(roomId).emit('chat-message', data.text);
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
            const roomData = rooms.get(roomId);
            if (!roomData) continue;

            const wasPlayer = roomData.players?.w === socket.id || roomData.players?.b === socket.id;
            if (wasPlayer) {
                if (roomData.players?.w === socket.id) delete roomData.players.w;
                if (roomData.players?.b === socket.id) delete roomData.players.b;

                socket.to(roomId).emit('opponent-status', { online: false });
                socket.to(roomId).emit('player-left');
            }

            const clients = io.sockets.adapter.rooms.get(roomId);
            const otherClientsCount = clients ? (clients.has(socket.id) ? clients.size - 1 : clients.size) : 0;
            if (otherClientsCount > 0) continue;

            if (roomData.deleteTimeout) clearTimeout(roomData.deleteTimeout);
            const delay = process.env.NODE_ENV === 'test' ? 0 : 45000;
            if (delay === 0) {
                rooms.delete(roomId);
            } else {
                roomData.deleteTimeout = setTimeout(() => {
                    rooms.delete(roomId);
                }, delay);
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

function stopPythonDaemon() {
    if (pythonDaemon) {
        try {
            pythonDaemon.stdin.end();
            pythonDaemon.kill();
        } catch (e) {}
        pythonDaemon = null;
    }
}

function closeTelemetryStream() {
    if (telemetryStream && !telemetryStream.destroyed) {
        telemetryStream.end();
        telemetryStream = null;
    }
}

module.exports = { app, server, getLocalIp, getLocalIps, pythonDaemon, startPythonDaemon, stopPythonDaemon, closeTelemetryStream };
