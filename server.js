const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Хранилище активных комнат и пользователей
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('✅ Новый пользователь:', socket.id);

    socket.on('create-room', ({ username }) => {
        const roomId = uuidv4().substring(0, 6).toUpperCase();
        
        rooms.set(roomId, { 
            users: new Map(),
            createdAt: Date.now()
        });
        
        const userData = {
            id: socket.id,
            username: username,
            isSpeaking: false,
            isDeafened: false,
            isScreenSharing: false
        };
        
        rooms.get(roomId).users.set(socket.id, userData);
        socket.join(roomId);
        
        socket.emit('room-created', { roomId, user: userData });
        console.log(`✅ Комната ${roomId} создана`);
    });

    socket.on('join-room', ({ roomId, username }) => {
        const normalizedRoomId = roomId.toUpperCase().trim();
        
        if (rooms.has(normalizedRoomId)) {
            const room = rooms.get(normalizedRoomId);
            
            if (room.users.size >= 2) {
                socket.emit('room-full');
                return;
            }
            
            const userData = {
                id: socket.id,
                username: username,
                isSpeaking: false,
                isDeafened: false,
                isScreenSharing: false
            };
            
            room.users.set(socket.id, userData);
            socket.join(normalizedRoomId);
            
            const users = Array.from(room.users.values());
            socket.emit('room-joined', { roomId: normalizedRoomId, users, user: userData });
            socket.to(normalizedRoomId).emit('user-connected', { user: userData });
            
            console.log(`✅ ${username} присоединился к ${normalizedRoomId}`);
        } else {
            socket.emit('room-not-found');
        }
    });

    socket.on('speaking-status', ({ isSpeaking }) => {
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                io.to(roomId).emit('user-speaking', {
                    userId: socket.id,
                    isSpeaking: isSpeaking
                });
            }
        });
    });

    socket.on('voice-offer', ({ to, offer }) => {
        io.to(to).emit('voice-offer', { from: socket.id, offer });
    });

    socket.on('voice-answer', ({ to, answer }) => {
        io.to(to).emit('voice-answer', { from: socket.id, answer });
    });

    socket.on('screen-offer', ({ to, offer }) => {
        io.to(to).emit('screen-offer', { from: socket.id, offer });
    });

    socket.on('screen-answer', ({ to, answer }) => {
        io.to(to).emit('screen-answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                const userData = room.users.get(socket.id);
                room.users.delete(socket.id);
                
                io.to(roomId).emit('user-disconnected', { 
                    userId: socket.id,
                    username: userData.username 
                });
                
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
});