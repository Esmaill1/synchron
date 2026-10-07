import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.serverClockOffset = 0;
    this.lastRtt = 0;
    this.pingTimer = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket && this.socket.connected) return;

    // Use configured backend URL, fallback to port 3001 in dev or window.location.origin
    const socketUrl = import.meta.env.VITE_BACKEND_URL || (window.location.port === '5173' ? 'http://localhost:3001' : window.location.origin);

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('⚡ Connected to sync server. Socket ID:', this.socket.id);
      this.startClockCalibration();
    });

    this.socket.on('pong:sync', ({ clientSendTime, serverTime }) => {
      const receiveTime = Date.now();
      const rtt = receiveTime - clientSendTime;
      this.lastRtt = rtt;
      // Offset = ServerTime - (ClientSendTime + RTT / 2)
      this.serverClockOffset = serverTime - (clientSendTime + rtt / 2);
    });

    this.socket.on('disconnect', () => {
      console.warn('Disconnected from sync server');
    });
  }

  startClockCalibration() {
    this.calibrate();
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.calibrate();
    }, 10000);
  }

  calibrate() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('ping:sync', { clientSendTime: Date.now() });
    }
  }

  getEstimatedServerNow() {
    return Date.now() + this.serverClockOffset;
  }

  getLatency() {
    return Math.round(this.lastRtt / 2);
  }

  // Room Actions
  createRoom(roomName, userName, mode = 'collaborative') {
    return new Promise((resolve) => {
      this.socket.emit('room:create', { roomName, userName, mode }, (res) => resolve(res));
    });
  }

  joinRoom(roomId, userName) {
    return new Promise((resolve) => {
      this.socket.emit('room:join', { roomId, userName }, (res) => resolve(res));
    });
  }

  play() {
    return new Promise((resolve) => {
      this.socket.emit('playback:play', (res) => resolve(res));
    });
  }

  pause() {
    return new Promise((resolve) => {
      this.socket.emit('playback:pause', (res) => resolve(res));
    });
  }

  seek(positionSec) {
    return new Promise((resolve) => {
      this.socket.emit('playback:seek', { positionSec }, (res) => resolve(res));
    });
  }

  setDuration(durationSec) {
    this.socket.emit('playback:setDuration', { durationSec });
  }

  nextTrack() {
    return new Promise((resolve) => {
      this.socket.emit('playback:next', (res) => resolve(res));
    });
  }

  trackEnded(trackId) {
    this.socket.emit('playback:trackEnd', { trackId });
  }

  addTrack(track) {
    return new Promise((resolve) => {
      this.socket.emit('queue:add', track, (res) => resolve(res));
    });
  }

  removeTrack(trackId) {
    return new Promise((resolve) => {
      this.socket.emit('queue:remove', { trackId }, (res) => resolve(res));
    });
  }

  setMode(mode) {
    return new Promise((resolve) => {
      this.socket.emit('room:setMode', { mode }, (res) => resolve(res));
    });
  }

  sendChat(text) {
    this.socket.emit('chat:send', { text });
  }

  sendReaction(emoji) {
    this.socket.emit('reaction:send', { emoji });
  }

  requestSync() {
    return new Promise((resolve) => {
      this.socket.emit('room:requestSync', (res) => resolve(res));
    });
  }

  on(event, callback) {
    if (!this.socket) this.connect();
    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  getSocketId() {
    return this.socket?.id;
  }
}

export const socketService = new SocketService();
