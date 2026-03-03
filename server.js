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
const rooms = new Map(); // roomId -> { users: Map(userId -> userData) }

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('✅ Новый пользователь подключился:', socket.id);
    console.log('Всего комнат:', rooms.size);

    // Создание новой комнаты
    socket.on('create-room', ({ username }) => {
        const roomId = uuidv4().substring(0, 6).toUpperCase();
        console.log('📝 Создание комнаты:', roomId, 'пользователем:', username);
        
        rooms.set(roomId, { 
            users: new Map(),
            createdAt: Date.now()
        });
        
        const userData = {
            id: socket.id,
            username: username,
            joinedAt: Date.now(),
            isSpeaking: false
        };
        
        rooms.get(roomId).users.set(socket.id, userData);
        socket.join(roomId);
        
        socket.emit('room-created', { 
            roomId, 
            user: userData 
        });
        
        console.log(`✅ Комната ${roomId} создана пользователем ${username}`);
        console.log('Текущие комнаты:', Array.from(rooms.keys()));
    });

    // Подключение к существующей комнате
    socket.on('join-room', ({ roomId, username }) => {
        // Приводим к верхнему регистру для поиска
        const normalizedRoomId = roomId.toUpperCase().trim();
        console.log('🔍 Попытка подключения к комнате:', normalizedRoomId);
        console.log('Пользователь:', username);
        console.log('Доступные комнаты:', Array.from(rooms.keys()));
        
        if (rooms.has(normalizedRoomId)) {
            const room = rooms.get(normalizedRoomId);
            console.log('✅ Комната найдена! Участников:', room.users.size);
            
            // Проверяем, не заполнена ли комната (максимум 2 человека)
            if (room.users.size >= 2) {
                console.log('❌ Комната заполнена');
                socket.emit('room-full');
                return;
            }
            
            const userData = {
                id: socket.id,
                username: username,
                joinedAt: Date.now(),
                isSpeaking: false
            };
            
            room.users.set(socket.id, userData);
            socket.join(normalizedRoomId);
            
            // Отправляем новому пользователю список всех участников
            const users = Array.from(room.users.values());
            socket.emit('room-joined', { 
                roomId: normalizedRoomId, 
                users,
                user: userData
            });
            
            // Уведомляем всех остальных о новом пользователе
            socket.to(normalizedRoomId).emit('user-connected', { 
                user: userData 
            });
            
            console.log(`✅ Пользователь ${username} присоединился к комнате ${normalizedRoomId}`);
        } else {
            console.log('❌ Комната не найдена:', normalizedRoomId);
            socket.emit('room-not-found');
        }
    });

    // Обработка статуса разговора
    socket.on('speaking-status', ({ isSpeaking }) => {
        // Обновляем статус пользователя во всех комнатах
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                const userData = room.users.get(socket.id);
                userData.isSpeaking = isSpeaking;
                
                // Отправляем обновленный статус всем в комнате
                io.to(roomId).emit('user-speaking', {
                    userId: socket.id,
                    isSpeaking: isSpeaking
                });
            }
        });
    });

    // Обработка WebRTC сигналов
    socket.on('offer', ({ to, offer }) => {
        console.log('📞 Offer от', socket.id, 'для', to);
        io.to(to).emit('offer', { 
            from: socket.id, 
            offer,
            fromUsername: getUsername(socket.id)
        });
    });

    socket.on('answer', ({ to, answer }) => {
        console.log('📞 Answer от', socket.id, 'для', to);
        io.to(to).emit('answer', { 
            from: socket.id, 
            answer,
            fromUsername: getUsername(socket.id)
        });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        console.log('❄️ ICE candidate от', socket.id, 'для', to);
        io.to(to).emit('ice-candidate', { 
            from: socket.id, 
            candidate,
            fromUsername: getUsername(socket.id)
        });
    });

    // Отключение пользователя
    socket.on('disconnect', () => {
        console.log('❌ Пользователь отключился:', socket.id);
        
        // Удаляем пользователя из всех комнат
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                const userData = room.users.get(socket.id);
                room.users.delete(socket.id);
                
                console.log(`👋 ${userData.username} покинул комнату ${roomId}`);
                
                // Уведомляем остальных
                io.to(roomId).emit('user-disconnected', { 
                    userId: socket.id,
                    username: userData.username 
                });
                
                // Удаляем комнату, если в ней никого нет
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                    console.log(`🗑️ Комната ${roomId} удалена (пуста)`);
                } else {
                    console.log(`👥 В комнате ${roomId} осталось ${room.users.size} участников`);
                }
            }
        });
        
        console.log('Текущие комнаты после отключения:', Array.from(rooms.keys()));
    });

    // Получение имени пользователя по ID
    function getUsername(socketId) {
        for (const room of rooms.values()) {
            if (room.users.has(socketId)) {
                return room.users.get(socketId).username;
            }
        }
        return 'Unknown';
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Локальный доступ: http://localhost:${PORT}`);
    
    // Получаем локальный IP для доступа по сети
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`🌐 Сетевой доступ: http://${net.address}:${PORT}`);
            }
        }
    }
});