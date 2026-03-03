const socket = io();

// Код доступа
const ACCESS_CODE = 'hg-100UIRockaGaY';

let localStream;
let screenStream;
let peerConnections = {};
let screenPeerConnections = {};
let currentRoom = null;
let currentUser = null;
let isAudioEnabled = true;
let isScreenSharing = false;
let audioContext = null;
let analyser = null;
let microphone = null;
let animationFrame = null;
let speakingTimeout = null;
let remoteAudioElements = {};
let remoteVolumes = {};
let remoteConnectionStatus = 'disconnected';
let connectionCheckInterval = null;

// DOM элементы
const accessScreen = document.getElementById('access-screen');
const joinScreen = document.getElementById('join-screen');
const callScreen = document.getElementById('call-screen');
const accessCodeInput = document.getElementById('access-code-input');
const submitAccessBtn = document.getElementById('submit-access-btn');
const accessError = document.getElementById('access-error');
const usernameInput = document.getElementById('username-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id-input');
const roomIdDisplay = document.getElementById('room-id-display');
const copyRoomBtn = document.getElementById('copy-room-btn');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleScreenShareBtn = document.getElementById('toggle-screen-share');
const leaveCallBtn = document.getElementById('leave-call');
const notification = document.getElementById('notification');
const notificationMessage = document.getElementById('notification-message');
const connectionStatus = document.getElementById('connection-status');
const mainArea = document.querySelector('.main-area');

// Элементы для участников
const localTile = document.getElementById('local-participant-tile');
const remoteTile = document.getElementById('remote-participant-tile');
const localAvatarLarge = document.getElementById('local-avatar-large');
const remoteAvatarLarge = document.getElementById('remote-avatar-large');
const localNameDisplay = document.getElementById('local-name-display');
const remoteNameDisplay = document.getElementById('remote-name-display');
const remoteConnectionStatusText = document.getElementById('remote-connection-status');
const localMuteIcon = document.getElementById('local-mute-icon');
const remoteMuteIcon = document.getElementById('remote-mute-icon');
const localScreenIcon = document.getElementById('local-screen-icon');
const remoteScreenIcon = document.getElementById('remote-screen-icon');
const localConnection = document.getElementById('local-connection');
const remoteConnection = document.getElementById('remote-connection');

// Элементы для демонстрации экрана
const screenShareContainer = document.getElementById('screen-share-container');
const remoteScreenVideo = document.getElementById('remote-screen-video');
const stopScreenShareBtn = document.getElementById('stop-screen-share');
const fullscreenBtn = document.getElementById('fullscreen-screen');

// Элементы контекстного меню
const contextMenu = document.getElementById('context-menu');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');

let currentTargetUserId = null;

// Конфигурация STUN серверов
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Проверка сохраненного доступа
document.addEventListener('DOMContentLoaded', () => {
    const hasAccess = localStorage.getItem('vox_access') === 'granted';
    
    if (hasAccess) {
        accessScreen.classList.add('hidden');
        joinScreen.classList.remove('hidden');
    } else {
        accessScreen.classList.remove('hidden');
        joinScreen.classList.add('hidden');
    }
    
    callScreen.classList.add('hidden');
    
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    
    usernameInput.value = '';
    roomIdInput.value = '';
    accessCodeInput.value = '';
    
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.add('hidden');
        }
    });
});

// Ввод кода доступа
accessCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitAccessBtn.click();
    }
});

submitAccessBtn.addEventListener('click', () => {
    const code = accessCodeInput.value.trim();
    
    if (code === ACCESS_CODE) {
        localStorage.setItem('vox_access', 'granted');
        accessScreen.classList.add('hidden');
        joinScreen.classList.remove('hidden');
        accessError.classList.add('hidden');
        accessCodeInput.value = '';
        showNotification('Доступ разрешен', 'success');
    } else {
        accessError.textContent = 'Неверный код доступа';
        accessError.classList.remove('hidden');
        accessCodeInput.value = '';
    }
});

// Валидация ввода
usernameInput.addEventListener('input', () => {
    const username = usernameInput.value.trim();
    const hasUsername = username.length > 0;
    createRoomBtn.disabled = !hasUsername;
    
    const hasRoomId = roomIdInput.value.trim().length > 0;
    joinRoomBtn.disabled = !hasUsername || !hasRoomId;
});

roomIdInput.addEventListener('input', () => {
    const username = usernameInput.value.trim();
    const hasRoomId = roomIdInput.value.trim().length > 0;
    const hasUsername = username.length > 0;
    
    joinRoomBtn.disabled = !hasRoomId || !hasUsername;
    roomIdInput.value = roomIdInput.value.toUpperCase();
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !createRoomBtn.disabled) {
        createRoomBtn.click();
    }
});

roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !joinRoomBtn.disabled) {
        joinRoomBtn.click();
    }
});

// Утилиты
function showNotification(message, type = 'info') {
    notificationMessage.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

function getInitials(username) {
    return username ? username.charAt(0).toUpperCase() : '?';
}

// Обновление статуса подключения
function updateRemoteConnectionStatus(status) {
    remoteConnectionStatus = status;
    
    const connectionDot = remoteConnection.querySelector('.connection-dot');
    connectionDot.className = 'connection-dot';
    
    switch(status) {
        case 'connected':
            connectionDot.classList.add('connected');
            remoteConnectionStatusText.textContent = 'В сети';
            break;
        case 'connecting':
            connectionDot.classList.add('connecting');
            remoteConnectionStatusText.textContent = 'Подключение...';
            break;
        case 'disconnected':
            connectionDot.classList.add('disconnected');
            remoteConnectionStatusText.textContent = 'Не в сети';
            break;
    }
}

// Обновление статусов
function updateSpeakingStatus(userId, isSpeaking) {
    if (userId === socket.id) {
        if (isSpeaking && isAudioEnabled) {
            localTile.classList.add('speaking');
        } else {
            localTile.classList.remove('speaking');
        }
    } else {
        if (isSpeaking) {
            remoteTile.classList.add('speaking');
        } else {
            remoteTile.classList.remove('speaking');
        }
    }
}

function updateMuteStatus(userId, isMuted) {
    if (userId === socket.id) {
        if (isMuted) {
            localTile.classList.add('muted');
        } else {
            localTile.classList.remove('muted');
        }
    } else {
        if (isMuted) {
            remoteTile.classList.add('muted');
        } else {
            remoteTile.classList.remove('muted');
        }
    }
}

function updateScreenShareStatus(userId, isSharing) {
    if (userId === socket.id) {
        if (isSharing) {
            localTile.classList.add('screen-sharing');
            toggleScreenShareBtn.classList.add('screen-sharing');
        } else {
            localTile.classList.remove('screen-sharing');
            toggleScreenShareBtn.classList.remove('screen-sharing');
        }
    } else {
        if (isSharing) {
            remoteTile.classList.add('screen-sharing');
            mainArea.classList.add('screen-sharing-active');
        } else {
            remoteTile.classList.remove('screen-sharing');
            if (!isScreenSharing) {
                mainArea.classList.remove('screen-sharing-active');
            }
        }
    }
}

// Анализатор голоса
function setupVoiceActivityDetection(stream) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let isSpeaking = false;
        
        function detectSpeaking() {
            if (!analyser) return;
            
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            const threshold = 20;
            const currentlySpeaking = average > threshold && isAudioEnabled;
            
            if (currentlySpeaking !== isSpeaking) {
                isSpeaking = currentlySpeaking;
                
                if (isSpeaking) {
                    socket.emit('speaking-status', { isSpeaking: true });
                    updateSpeakingStatus(socket.id, true);
                    
                    if (speakingTimeout) {
                        clearTimeout(speakingTimeout);
                        speakingTimeout = null;
                    }
                } else {
                    if (speakingTimeout) {
                        clearTimeout(speakingTimeout);
                    }
                    
                    speakingTimeout = setTimeout(() => {
                        socket.emit('speaking-status', { isSpeaking: false });
                        updateSpeakingStatus(socket.id, false);
                        speakingTimeout = null;
                    }, 200);
                }
            }
            
            animationFrame = requestAnimationFrame(detectSpeaking);
        }
        
        detectSpeaking();
        return true;
    } catch (error) {
        console.error('Ошибка настройки аудио анализатора:', error);
        return false;
    }
}

// Получение доступа к микрофону
async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        
        console.log('✅ Микрофон получен');
        showNotification('Микрофон работает', 'success');
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка доступа к микрофону:', error);
        showNotification('Не удалось получить доступ к микрофону', 'error');
        return false;
    }
}

// Демонстрация экрана
async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: {
                cursor: "always",
                displaySurface: "monitor"
            },
            audio: false
        });
        
        isScreenSharing = true;
        socket.emit('screen-sharing-status', { isSharing: true });
        updateScreenShareStatus(socket.id, true);
        
        // Создаем отдельное peer connection для экрана
        const remoteUserId = Object.keys(peerConnections)[0];
        if (remoteUserId) {
            updateRemoteConnectionStatus('connecting');
            createScreenPeerConnection(remoteUserId, true);
        }
        
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };
        
        showNotification('Демонстрация экрана начата', 'success');
    } catch (error) {
        console.error('Ошибка демонстрации экрана:', error);
        showNotification('Не удалось начать демонстрацию экрана', 'error');
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    isScreenSharing = false;
    socket.emit('screen-sharing-status', { isSharing: false });
    updateScreenShareStatus(socket.id, false);
    
    // Закрываем screen peer connections
    Object.values(screenPeerConnections).forEach(pc => pc.close());
    screenPeerConnections = {};
    
    if (!remoteTile.classList.contains('screen-sharing')) {
        mainArea.classList.remove('screen-sharing-active');
    }
    
    showNotification('Демонстрация экрана остановлена', 'info');
}

function createScreenPeerConnection(targetUserId, isInitiator) {
    if (screenPeerConnections[targetUserId]) return;
    
    const peerConnection = new RTCPeerConnection(configuration);
    screenPeerConnections[targetUserId] = peerConnection;
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, screenStream);
        });
    }
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                to: targetUserId,
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.ontrack = (event) => {
        console.log('✅ Получен удаленный экран');
        remoteScreenVideo.srcObject = event.streams[0];
        screenShareContainer.classList.remove('hidden');
        updateRemoteConnectionStatus('connected');
        
        remoteScreenVideo.onclick = () => {
            if (screenShareContainer.requestFullscreen) {
                screenShareContainer.requestFullscreen();
            }
        };
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('Screen connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            updateRemoteConnectionStatus('connected');
        } else if (peerConnection.connectionState === 'connecting') {
            updateRemoteConnectionStatus('connecting');
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            updateRemoteConnectionStatus('disconnected');
        }
    };
    
    if (isInitiator) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                socket.emit('screen-offer', {
                    to: targetUserId,
                    offer: peerConnection.localDescription
                });
            })
            .catch(error => console.error('Ошибка создания screen offer:', error));
    }
    
    return peerConnection;
}

// Аудио элементы
function createRemoteAudioElement(userId) {
    if (remoteAudioElements[userId]) {
        remoteAudioElements[userId].remove();
    }
    
    const audio = document.createElement('audio');
    audio.id = `remote-audio-${userId}`;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.style.display = 'none';
    audio.volume = remoteVolumes[userId] || 1;
    
    document.body.appendChild(audio);
    remoteAudioElements[userId] = audio;
    
    return audio;
}

function setRemoteVolume(userId, volume) {
    remoteVolumes[userId] = volume;
    if (remoteAudioElements[userId]) {
        remoteAudioElements[userId].volume = volume;
    }
}

// Peer connection для аудио
function createPeerConnection(targetUserId, isInitiator) {
    if (peerConnections[targetUserId]) return peerConnections[targetUserId];

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections[targetUserId] = peerConnection;

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                to: targetUserId,
                candidate: event.candidate
            });
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('✅ Получен удаленный аудио поток');
        const audioElement = createRemoteAudioElement(targetUserId);
        
        if (audioElement) {
            audioElement.srcObject = event.streams[0];
            audioElement.play().catch(e => console.log('Автовоспроизведение заблокировано:', e));
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('Audio connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            updateRemoteConnectionStatus('connected');
        } else if (peerConnection.connectionState === 'connecting') {
            updateRemoteConnectionStatus('connecting');
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            updateRemoteConnectionStatus('disconnected');
        }
    };

    if (isInitiator) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                socket.emit('offer', {
                    to: targetUserId,
                    offer: peerConnection.localDescription
                });
            })
            .catch(error => console.error('Ошибка создания offer:', error));
    }

    return peerConnection;
}

// Обработчики событий
createRoomBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        showNotification('Введите ваше имя', 'error');
        return;
    }
    
    const hasAudio = await getLocalStream();
    if (hasAudio) {
        socket.emit('create-room', { username });
        showNotification('Создание комнаты...', 'info');
    }
});

joinRoomBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim().toUpperCase();
    
    if (!username) {
        showNotification('Введите ваше имя', 'error');
        return;
    }
    
    if (!roomId) {
        showNotification('Введите код комнаты', 'error');
        return;
    }
    
    const hasAudio = await getLocalStream();
    if (hasAudio) {
        socket.emit('join-room', { roomId, username });
        showNotification('Подключение к комнате...', 'info');
        updateRemoteConnectionStatus('connecting');
    }
});

toggleAudioBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            
            if (isAudioEnabled) {
                toggleAudioBtn.classList.remove('audio-off');
                toggleAudioBtn.classList.add('audio-on');
                toggleAudioBtn.title = 'Отключить микрофон';
                updateMuteStatus(socket.id, false);
            } else {
                toggleAudioBtn.classList.remove('audio-on');
                toggleAudioBtn.classList.add('audio-off');
                toggleAudioBtn.title = 'Включить микрофон';
                updateMuteStatus(socket.id, true);
                
                socket.emit('speaking-status', { isSpeaking: false });
                updateSpeakingStatus(socket.id, false);
            }
            
            showNotification(
                isAudioEnabled ? 'Микрофон включен' : 'Микрофон отключен',
                'info'
            );
        }
    }
});

toggleScreenShareBtn.addEventListener('click', () => {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
});

stopScreenShareBtn.addEventListener('click', stopScreenShare);

fullscreenBtn.addEventListener('click', () => {
    if (screenShareContainer.requestFullscreen) {
        screenShareContainer.requestFullscreen();
        screenShareContainer.classList.add('fullscreen');
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        screenShareContainer.classList.remove('fullscreen');
    }
});

copyRoomBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom);
    copyRoomBtn.classList.add('copied');
    showNotification('Код скопирован', 'success');
    setTimeout(() => {
        copyRoomBtn.classList.remove('copied');
    }, 1000);
});

leaveCallBtn.addEventListener('click', () => {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    
    if (speakingTimeout) {
        clearTimeout(speakingTimeout);
        speakingTimeout = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    Object.values(peerConnections).forEach(pc => pc.close());
    Object.values(screenPeerConnections).forEach(pc => pc.close());
    peerConnections = {};
    screenPeerConnections = {};
    
    Object.values(remoteAudioElements).forEach(audio => {
        if (audio) audio.remove();
    });
    remoteAudioElements = {};
    remoteVolumes = {};
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    remoteNameDisplay.textContent = 'Ожидание...';
    remoteAvatarLarge.textContent = '?';
    remoteTile.classList.remove('speaking', 'waiting', 'screen-sharing', 'muted');
    remoteTile.classList.add('waiting');
    localTile.classList.remove('speaking', 'muted', 'screen-sharing');
    
    mainArea.classList.remove('screen-sharing-active');
    screenShareContainer.classList.add('hidden');
    remoteScreenVideo.srcObject = null;
    
    toggleAudioBtn.classList.remove('audio-off');
    toggleAudioBtn.classList.add('audio-on');
    toggleScreenShareBtn.classList.remove('screen-sharing');
    
    updateRemoteConnectionStatus('disconnected');
    
    callScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
    
    showNotification('Звонок завершен', 'info');
    roomIdInput.value = '';
});

// Контекстное меню
remoteTile.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    if (remoteNameDisplay.textContent === 'Ожидание...') {
        return;
    }
    
    const remoteUserId = Object.keys(peerConnections)[0];
    if (!remoteUserId) return;
    
    currentTargetUserId = remoteUserId;
    
    const currentVolume = remoteVolumes[remoteUserId] || 1;
    volumeSlider.value = currentVolume * 100;
    volumeValue.textContent = Math.round(currentVolume * 100) + '%';
    
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
    contextMenu.classList.remove('hidden');
});

volumeSlider.addEventListener('input', (e) => {
    const volume = e.target.value / 100;
    volumeValue.textContent = e.target.value + '%';
    
    if (currentTargetUserId) {
        setRemoteVolume(currentTargetUserId, volume);
    }
});

// Socket events
socket.on('room-created', ({ roomId, user }) => {
    currentRoom = roomId;
    currentUser = user;
    
    roomIdDisplay.textContent = roomId;
    localNameDisplay.textContent = user.username;
    localAvatarLarge.textContent = getInitials(user.username);
    
    joinScreen.classList.add('hidden');
    callScreen.classList.remove('hidden');
    
    remoteNameDisplay.textContent = 'Ожидание...';
    remoteAvatarLarge.textContent = '?';
    remoteTile.classList.add('waiting');
    
    showNotification('Комната создана', 'success');
    
    if (localStream) {
        setupVoiceActivityDetection(localStream);
    }
});

socket.on('room-joined', ({ roomId, users, user }) => {
    currentRoom = roomId;
    currentUser = user;
    
    roomIdDisplay.textContent = roomId;
    localNameDisplay.textContent = user.username;
    localAvatarLarge.textContent = getInitials(user.username);
    
    joinScreen.classList.add('hidden');
    callScreen.classList.remove('hidden');
    
    const remoteUser = users.find(u => u.id !== socket.id);
    if (remoteUser) {
        remoteNameDisplay.textContent = remoteUser.username;
        remoteAvatarLarge.textContent = getInitials(remoteUser.username);
        remoteTile.classList.remove('waiting');
        updateRemoteConnectionStatus('connecting');
    }
    
    showNotification('Подключено к комнате', 'success');
    
    if (localStream) {
        setupVoiceActivityDetection(localStream);
    }
    
    users.forEach(remoteUser => {
        if (remoteUser.id !== socket.id) {
            createPeerConnection(remoteUser.id, true);
        }
    });
});

socket.on('user-connected', ({ user }) => {
    remoteNameDisplay.textContent = user.username;
    remoteAvatarLarge.textContent = getInitials(user.username);
    remoteTile.classList.remove('waiting');
    updateRemoteConnectionStatus('connecting');
    
    createPeerConnection(user.id, false);
    showNotification(`${user.username} подключился`, 'success');
});

socket.on('user-speaking', ({ userId, isSpeaking }) => {
    updateSpeakingStatus(userId, isSpeaking);
});

socket.on('user-screen-sharing', ({ userId, isSharing }) => {
    updateScreenShareStatus(userId, isSharing);
});

socket.on('offer', async ({ from, offer }) => {
    const peerConnection = createPeerConnection(from, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('answer', {
        to: from,
        answer: peerConnection.localDescription
    });
});

socket.on('answer', ({ from, answer }) => {
    const peerConnection = peerConnections[from];
    if (peerConnection) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('screen-offer', async ({ from, offer }) => {
    const peerConnection = createScreenPeerConnection(from, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('screen-answer', {
        to: from,
        answer: peerConnection.localDescription
    });
});

socket.on('screen-answer', ({ from, answer }) => {
    const peerConnection = screenPeerConnections[from];
    if (peerConnection) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice-candidate', ({ from, candidate }) => {
    if (peerConnections[from]) {
        peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
    }
    if (screenPeerConnections[from]) {
        screenPeerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('room-full', () => {
    showNotification('Комната уже заполнена (максимум 2 человека)', 'error');
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});

socket.on('user-disconnected', ({ userId, username }) => {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    
    if (screenPeerConnections[userId]) {
        screenPeerConnections[userId].close();
        delete screenPeerConnections[userId];
    }
    
    if (remoteAudioElements[userId]) {
        remoteAudioElements[userId].remove();
        delete remoteAudioElements[userId];
    }
    
    remoteNameDisplay.textContent = 'Ожидание...';
    remoteAvatarLarge.textContent = '?';
    remoteTile.classList.remove('speaking', 'screen-sharing', 'muted');
    remoteTile.classList.add('waiting');
    
    updateRemoteConnectionStatus('disconnected');
    
    if (!isScreenSharing) {
        mainArea.classList.remove('screen-sharing-active');
    }
    screenShareContainer.classList.add('hidden');
    remoteScreenVideo.srcObject = null;
    
    showNotification(`${username} покинул комнату`, 'info');
});

socket.on('room-not-found', () => {
    showNotification('Комната не найдена', 'error');
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});

socket.on('connect_error', () => {
    showNotification('Ошибка подключения к серверу', 'error');
    connectionStatus.innerHTML = `
        <div class="status-dot disconnected"></div>
        <span>Отключено</span>
    `;
});

socket.on('disconnect', () => {
    connectionStatus.innerHTML = `
        <div class="status-dot disconnected"></div>
        <span>Отключено</span>
    `;
    showNotification('Потеряно соединение с сервером', 'error');
    updateRemoteConnectionStatus('disconnected');
});

socket.on('reconnect', () => {
    connectionStatus.innerHTML = `
        <div class="status-dot connected"></div>
        <span>Подключено</span>
    `;
    showNotification('Соединение восстановлено', 'success');
});

console.log('Приложение загружено, код доступа:', ACCESS_CODE);