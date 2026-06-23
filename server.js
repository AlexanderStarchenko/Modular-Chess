const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket'],
    allowUpgrades: false,
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
    next();
});

// Explicitly set MIME type for WASM files
express.static.mime.define({'application/wasm': ['wasm']});

// Serve static files from the current directory
app.use(express.static(__dirname));

const rooms = new Map();

io.on('connection', (socket) => {
    if (process.env.NODE_ENV !== 'test') {
        console.log('A user connected:', socket.id);
    }

    // Join a specific game room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        if (process.env.NODE_ENV !== 'test') {
            console.log(`User ${socket.id} joined room: ${roomId}`);
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
            assignedColor = Math.random() < 0.5 ? 'w' : 'b';
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

// Start server on port 3000
const PORT = 3000;
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
