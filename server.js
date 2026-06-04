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
    }
});

// Serve static files from the current directory
app.use(express.static(__dirname));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a specific game room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        
        const room = io.sockets.adapter.rooms.get(roomId);
        const numClients = room ? room.size : 0;
        
        let assignedColor = 'w';
        if (numClients === 1) {
            assignedColor = Math.random() < 0.5 ? 'w' : 'b';
            rooms.set(roomId, { firstColor: assignedColor });
        } else if (numClients === 2) {
            const roomData = rooms.get(roomId);
            const firstColor = roomData ? roomData.firstColor : 'w';
            assignedColor = firstColor === 'w' ? 'b' : 'w';
        } else if (numClients > 2) {
            assignedColor = 'spectator';
        }
        
        socket.emit('color-assigned', assignedColor);
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

    socket.on('undo-response', (data) => {
        socket.to(data.roomId).emit('undo-response', data.accepted);
    });

    // Relay full state sync
    socket.on('chess-sync', (data) => {
        socket.to(data.roomId).emit('chess-sync', data.state);
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

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId === socket.id) continue;
            const room = io.sockets.adapter.rooms.get(roomId);
            if (room && room.size <= 1) {
                rooms.delete(roomId);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const os = require('os');

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Start server on port 3000
const PORT = 3000;
const LOCAL_IP = getLocalIp();

server.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------');
    console.log(`Chess server is running!`);
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://${LOCAL_IP}:${PORT}`);
    console.log('-----------------------------------');
});
