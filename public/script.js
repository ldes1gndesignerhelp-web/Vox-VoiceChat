const socket = io();
const ACCESS_CODE = 'hg-100UIRockaGaY';

// Состояние приложения
let localStream = null;
let screenStream = null;
let currentRoom = null;
let currentUser = null;
let currentUsername = '';
let isMuted = false;
let isDeafened = false;
let isScreenSharing = false;

// WebRTC соединения
let voicePeerConnection = null;
let screenPeerConnection = null;
let remoteAudioElement = null;

// DOM элементы
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const callScreen = document.getElementById('call-screen');
const accessCode = document.getElementById('access-code');
const submitAccess = document.getElementById('submit-access');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');
const lobbyUsername = document.getElementById('lobby-username');
const lobbyAvatar = document.getElementById('lobby-avatar');
const lobbyCreate = document.getElementById('lobby-create');
const lobbyJoin = document.getElementById('lobby-join');
const lobbyRoomCode = document.getElementById('lobby-room-code');
const membersList = document.getElementById('members-list');
const voiceGrid = document.getElementById('voice-grid');
const currentUserAvatar = document.getElementById('current-user-avatar');
const currentUserName = document.getElementById('current-user-name');
const callRoomCode = document.getElementById('call-room-code');
const copyRoomCode = document.getElementById('copy-room-code');
const muteToggle = document.getElementById('mute-toggle');
const deafenToggle = document.getElementById('deafen-toggle');
const screenShareToggle = document.getElementById('screen-share-toggle');
const leaveCall = document.getElementById('leave-call');
const screenShareArea = document.getElementById('screen-share-area');
const screenVideo = document.getElementById('screen-video');
const fullscreenBtn = document.getElementById('fullscreen-screen');
const stopScreenShare = document.getElementById('stop-screen-share');
const connectionStatus = document.getElementById('connection-status');
const volumeContext = document.getElementById('volume-context');
const userVolume = document.getElementById('user-volume');
const volumePercent = document.getElementById('volume-percent');
const notification = document.getElementById('notification');

// Конфигурация STUN
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ========== УТИЛИТЫ ==========
function showNotif(msg, type = 'info') {
    notification.textContent = msg;
    notification.style.borderLeftColor = 
        type === 'success' ? '#23a55a' : 
        type === 'error' ? '#f23f42' : '#5865f2';
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 3000);
}

function getInitials(name) {
    return name ? name.charAt(0).toUpperCase() : 'U';
}

// ========== УПРАВЛЕНИЕ ДОСТУПОМ ==========
if (localStorage.getItem('vox_access') === 'granted') {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
}

submitAccess.addEventListener('click', () => {
    if (accessCode.value === ACCESS_CODE) {
        localStorage.setItem('vox_access', 'granted');
        authScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        showNotif('Доступ разрешен', 'success');
    } else {
        authError.classList.remove('hidden');
    }
});

accessCode.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitAccess.click();
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('vox_access');
    lobbyScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    accessCode.value = '';
});

// ========== ЛОББИ ==========
lobbyUsername.addEventListener('input', () => {
    const val = lobbyUsername.value.trim();
    lobbyAvatar.textContent = getInitials(val);
    lobbyCreate.disabled = !val;
    lobbyJoin.disabled = !val || !lobbyRoomCode.value.trim();
});

lobbyRoomCode.addEventListener('input', () => {
    lobbyRoomCode.value = lobbyRoomCode.value.toUpperCase();
    lobbyJoin.disabled = !lobbyUsername.value.trim() || !lobbyRoomCode.value.trim();
});

lobbyCreate.addEventListener('click', async () => {
    currentUsername = lobbyUsername.value.trim();
    const success = await initMicrophone();
    if (success) {
        socket.emit('create-room', { username: currentUsername });
    }
});

lobbyJoin.addEventListener('click', async () => {
    currentUsername = lobbyUsername.value.trim();
    const roomCode = lobbyRoomCode.value.trim();
    const success = await initMicrophone();
    if (success) {
        socket.emit('join-room', { roomId: roomCode, username: currentUsername });
        updateConnectionStatus('connecting');
    }
});

// ========== МИКРОФОН ==========
async function initMicrophone() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        return true;
    } catch (err) {
        showNotif('Нет доступа к микрофону', 'error');
        return false;
    }
}

// ========== СОЗДАНИЕ ПИТОВ ==========
function createVoicePeer(targetId, isInitiator) {
    if (voicePeerConnection) voicePeerConnection.close();
    
    const pc = new RTCPeerConnection(config);
    voicePeerConnection = pc;
    
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    
    pc.ontrack = (e) => {
        if (remoteAudioElement) remoteAudioElement.remove();
        remoteAudioElement = document.createElement('audio');
        remoteAudioElement.srcObject = e.streams[0];
        remoteAudioElement.autoplay = true;
        remoteAudioElement.volume = userVolume.value / 100;
        document.body.appendChild(remoteAudioElement);
        updateConnectionStatus('connected');
    };
    
    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('ice-candidate', { to: targetId, candidate: e.candidate });
        }
    };
    
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') updateConnectionStatus('connected');
        if (pc.connectionState === 'disconnected') updateConnectionStatus('offline');
    };
    
    if (isInitiator) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit('voice-offer', { to: targetId, offer: pc.localDescription });
            });
    }
    
    return pc;
}

function createScreenPeer(targetId, isInitiator) {
    if (!screenStream) return;
    if (screenPeerConnection) screenPeerConnection.close();
    
    const pc = new RTCPeerConnection(config);
    screenPeerConnection = pc;
    
    screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));
    
    pc.ontrack = (e) => {
        screenVideo.srcObject = e.streams[0];
        screenShareArea.classList.remove('hidden');
    };
    
    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('ice-candidate', { to: targetId, candidate: e.candidate });
        }
    };
    
    if (isInitiator) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit('screen-offer', { to: targetId, offer: pc.localDescription });
            });
    }
    
    return pc;
}

// ========== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ==========
function updateMembers(users) {
    membersList.innerHTML = '';
    voiceGrid.innerHTML = '';
    
    users.forEach(user => {
        const isMe = user.id === socket.id;
        
        // В списке участников
        const memberEl = document.createElement('div');
        memberEl.className = 'member-item';
        memberEl.id = `member-${user.id}`;
        memberEl.innerHTML = `
            <div class="member-avatar ${user.isSpeaking ? 'speaking' : ''}">
                ${getInitials(user.username)}
                <div class="voice-state ${user.isDeafened ? 'deafened' : (user.id === socket.id ? (isMuted ? 'muted' : '') : '')}"></div>
            </div>
            <div class="member-info">
                <div class="member-name">
                    ${user.username}
                    ${isMe ? '<span class="member-badge">(вы)</span>' : ''}
                </div>
                <div class="member-status">${user.isSpeaking ? '🎤 Говорит' : 'В сети'}</div>
            </div>
        `;
        
        if (!isMe) {
            memberEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                volumeContext.classList.remove('hidden');
                volumeContext.style.left = e.pageX + 'px';
                volumeContext.style.top = e.pageY + 'px';
            });
        }
        
        membersList.appendChild(memberEl);
        
        // В сетке с аватарками
        const tileEl = document.createElement('div');
        tileEl.className = `voice-tile ${user.isSpeaking ? 'speaking' : ''}`;
        tileEl.id = `tile-${user.id}`;
        tileEl.innerHTML = `
            <div class="tile-avatar">${getInitials(user.username)}</div>
            <div class="tile-name">${user.username}</div>
            <div class="tile-status">${user.isSpeaking ? '🎤' : '🔊'}</div>
            <div class="tile-badge"></div>
        `;
        voiceGrid.appendChild(tileEl);
    });
}

function updateSpeakingStatus(userId, speaking) {
    const member = document.getElementById(`member-${userId}`);
    const tile = document.getElementById(`tile-${userId}`);
    
    if (member) {
        const avatar = member.querySelector('.member-avatar');
        if (speaking) avatar.classList.add('speaking');
        else avatar.classList.remove('speaking');
    }
    
    if (tile) {
        if (speaking) tile.classList.add('speaking');
        else tile.classList.remove('speaking');
    }
}

function updateConnectionStatus(status) {
    const dot = connectionStatus.querySelector('.status-dot');
    dot.className = 'status-dot';
    
    if (status === 'connected') {
        dot.classList.add('online');
        connectionStatus.querySelector('span').textContent = 'Подключено';
    } else if (status === 'connecting') {
        dot.classList.add('connecting');
        connectionStatus.querySelector('span').textContent = 'Подключается...';
    } else {
        dot.classList.add('offline');
        connectionStatus.querySelector('span').textContent = 'Отключено';
    }
}

// ========== СОБЫТИЯ ИНТЕРФЕЙСА ==========
muteToggle.addEventListener('click', () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    
    if (isMuted) {
        muteToggle.classList.add('muted');
        muteToggle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="3" y1="3" x2="21" y2="21"/><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><line x1="3" y1="11" x2="21" y2="11"/></svg>`;
        socket.emit('speaking-status', { isSpeaking: false });
    } else {
        muteToggle.classList.remove('muted');
        muteToggle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><line x1="3" y1="11" x2="21" y2="11"/></svg>`;
    }
});

deafenToggle.addEventListener('click', () => {
    isDeafened = !isDeafened;
    if (remoteAudioElement) {
        remoteAudioElement.muted = isDeafened;
    }
    
    if (isDeafened) {
        deafenToggle.classList.add('deafened');
    } else {
        deafenToggle.classList.remove('deafened');
    }
});

screenShareToggle.addEventListener('click', async () => {
    if (isScreenSharing) {
        stopScreenSharing();
    } else {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });
            
            isScreenSharing = true;
            screenShareToggle.classList.add('screen-sharing');
            
            const remoteId = Object.keys(peerConnections || {})[0];
            if (remoteId) {
                createScreenPeer(remoteId, true);
            }
            
            screenStream.getTracks()[0].onended = stopScreenSharing;
            showNotif('Демонстрация начата', 'success');
            
        } catch (err) {
            showNotif('Не удалось начать демонстрацию', 'error');
        }
    }
});

function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    
    if (screenPeerConnection) {
        screenPeerConnection.close();
        screenPeerConnection = null;
    }
    
    isScreenSharing = false;
    screenShareToggle.classList.remove('screen-sharing');
    screenShareArea.classList.add('hidden');
    socket.emit('screen-sharing-status', { isSharing: false });
}

fullscreenBtn.addEventListener('click', () => {
    if (screenShareArea.requestFullscreen) {
        screenShareArea.requestFullscreen();
    }
});

stopScreenShare.addEventListener('click', stopScreenSharing);

copyRoomCode.addEventListener('click', () => {
    navigator.clipboard.writeText(callRoomCode.textContent);
    showNotif('Код скопирован', 'success');
});

leaveCall.addEventListener('click', () => {
    // Очистка соединений
    if (voicePeerConnection) voicePeerConnection.close();
    if (screenPeerConnection) screenPeerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    if (remoteAudioElement) remoteAudioElement.remove();
    
    voicePeerConnection = null;
    screenPeerConnection = null;
    localStream = null;
    screenStream = null;
    remoteAudioElement = null;
    
    callScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    screenShareArea.classList.add('hidden');
});

userVolume.addEventListener('input', (e) => {
    volumePercent.textContent = e.target.value + '%';
    if (remoteAudioElement) {
        remoteAudioElement.volume = e.target.value / 100;
    }
});

document.addEventListener('click', () => {
    volumeContext.classList.add('hidden');
});

// ========== СОКЕТ СОБЫТИЯ ==========
socket.on('room-created', ({ roomId, user }) => {
    currentRoom = roomId;
    currentUser = user;
    
    callRoomCode.textContent = roomId;
    currentUserAvatar.textContent = getInitials(user.username);
    currentUserName.textContent = user.username;
    
    updateMembers([user]);
    
    lobbyScreen.classList.add('hidden');
    callScreen.classList.remove('hidden');
    updateConnectionStatus('connected');
    
    showNotif(`Комната ${roomId} создана`, 'success');
});

socket.on('room-joined', ({ roomId, users, user }) => {
    currentRoom = roomId;
    currentUser = user;
    
    callRoomCode.textContent = roomId;
    currentUserAvatar.textContent = getInitials(user.username);
    currentUserName.textContent = user.username;
    
    updateMembers(users);
    
    const remoteUser = users.find(u => u.id !== socket.id);
    if (remoteUser) {
        createVoicePeer(remoteUser.id, true);
    }
    
    lobbyScreen.classList.add('hidden');
    callScreen.classList.remove('hidden');
    
    showNotif('Подключено к комнате', 'success');
});

socket.on('user-connected', ({ user }) => {
    const members = [];
    document.querySelectorAll('.member-item').forEach(el => {
        const id = el.id.replace('member-', '');
        members.push({ id, username: 'temp' });
    });
    members.push(user);
    updateMembers(members);
    
    createVoicePeer(user.id, false);
    showNotif(`${user.username} подключился`, 'success');
});

socket.on('user-speaking', ({ userId, isSpeaking }) => {
    updateSpeakingStatus(userId, isSpeaking);
});

socket.on('voice-offer', async ({ from, offer }) => {
    const pc = createVoicePeer(from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('voice-answer', { to: from, answer: pc.localDescription });
});

socket.on('voice-answer', ({ from, answer }) => {
    if (voicePeerConnection) {
        voicePeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('screen-offer', async ({ from, offer }) => {
    const pc = createScreenPeer(from, false);
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('screen-answer', { to: from, answer: pc.localDescription });
    }
});

socket.on('screen-answer', ({ from, answer }) => {
    if (screenPeerConnection) {
        screenPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice-candidate', ({ from, candidate }) => {
    if (voicePeerConnection) {
        voicePeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
    if (screenPeerConnection) {
        screenPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('user-disconnected', ({ userId, username }) => {
    const member = document.getElementById(`member-${userId}`);
    if (member) member.remove();
    
    const tile = document.getElementById(`tile-${userId}`);
    if (tile) tile.remove();
    
    if (voicePeerConnection) voicePeerConnection.close();
    if (screenPeerConnection) screenPeerConnection.close();
    if (remoteAudioElement) remoteAudioElement.remove();
    
    voicePeerConnection = null;
    screenPeerConnection = null;
    remoteAudioElement = null;
    
    showNotif(`${username} покинул комнату`, 'info');
});

socket.on('room-not-found', () => {
    showNotif('Комната не найдена', 'error');
});

socket.on('room-full', () => {
    showNotif('Комната заполнена', 'error');
});

socket.on('disconnect', () => {
    updateConnectionStatus('offline');
    showNotif('Потеряно соединение', 'error');
});

socket.on('reconnect', () => {
    updateConnectionStatus('connected');
    showNotif('Соединение восстановлено', 'success');
});

console.log('✅ Приложение готово');