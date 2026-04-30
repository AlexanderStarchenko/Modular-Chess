const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a specific game room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        
        const room = io.sockets.adapter.rooms.get(roomId);
        const numClients = room ? room.size : 0;
        
        let assignedColor = 'w';
        if (numClients === 2) {
            assignedColor = 'b';
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

    socket.on('resign', (roomId) => {
        socket.to(roomId).emit('resign');
    });

    socket.on('draw-offer', (roomId) => {
        socket.to(roomId).emit('draw-offer');
    });

    socket.on('draw-response', (data) => {
        socket.to(data.roomId).emit('draw-response', data.accepted);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start server on port 3000
const PORT = 3000;
// Listen on 0.0.0.0 to be accessible from other devices on the network
server.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------');
    console.log(`Chess server is running!`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://192.168.0.103:${PORT}`);
    console.log('-----------------------------------');
});
