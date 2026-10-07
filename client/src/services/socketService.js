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

    this.syncSamples = [];

    this.socket.on('pong:sync', ({ clientSendTime, serverReceiveTime, serverSendTime, serverTime }) => {
      const clientReceiveTime = (typeof performance !== 'undefined' && performance.timeOrigin)
        ? (performance.timeOrigin + performance.now())
        : Date.now();

      const sRecv = serverReceiveTime || serverTime || Date.now();
      const sSend = serverSendTime || serverTime || Date.now();

      // True 4-timestamp network round-trip time: total elapsed minus server turnaround
      const totalElapsed = clientReceiveTime - clientSendTime;
      const serverProcessing = Math.max(0, sSend - sRecv);
      const rtt = Math.max(1, totalElapsed - serverProcessing);
      this.lastRtt = rtt;

      // Filter high-jitter outlier samples (> 500ms) once calibrated
      if (rtt > 500 && this.syncSamples.length >= 4) return;

      // Standard NTP clock offset: ((T2 - T1) + (T3 - T4)) / 2
      const measuredOffset = ((sRecv - clientSendTime) + (sSend - clientReceiveTime)) / 2;

      // Collect rolling window of probe samples
      this.syncSamples.push({ rtt, offset: measuredOffset, timestamp: Date.now() });
      if (this.syncSamples.length > 12) {
        this.syncSamples.shift();
      }

      // Sort by lowest RTT (samples with minimal queuing delay give the truest clock symmetry)
      const sorted = [...this.syncSamples].sort((a, b) => a.rtt - b.rtt);
      // Select best 4 lowest-latency samples
      const bestSamples = sorted.slice(0, Math.min(4, sorted.length));

      // Calculate median offset among the lowest-RTT samples to eliminate asymmetric spikes
      const offsets = bestSamples.map((s) => s.offset).sort((a, b) => a - b);
      const mid = Math.floor(offsets.length / 2);
      const medianOffset = offsets.length % 2 !== 0
        ? offsets[mid]
        : (offsets[mid - 1] + offsets[mid]) / 2;

      this.serverClockOffset = medianOffset;
      this.bestRtt = sorted[0].rtt;
    });

    this.socket.on('disconnect', () => {
      console.warn('Disconnected from sync server');
    });
  }

  startClockCalibration() {
    // Rapid burst probes at startup (8 rapid pings 60ms apart to lock clock immediately within 500ms)
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this.calibrate(), i * 60);
    }

    if (this.pingTimer) clearInterval(this.pingTimer);
    // Continuous recalibration every 2.5s to compensate for client crystal oscillator drift
    this.pingTimer = setInterval(() => {
      this.calibrate();
    }, 2500);
  }

  calibrate() {
    if (this.socket && this.socket.connected) {
      const sendTime = (typeof performance !== 'undefined' && performance.timeOrigin)
        ? (performance.timeOrigin + performance.now())
        : Date.now();
      this.socket.emit('ping:sync', { clientSendTime: sendTime });
    }
  }

  getEstimatedServerNow() {
    const clientNow = (typeof performance !== 'undefined' && performance.timeOrigin)
      ? (performance.timeOrigin + performance.now())
      : Date.now();
    return clientNow + this.serverClockOffset;
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

  play(positionSec = null) {
    return new Promise((resolve) => {
      this.socket.emit('playback:play', { positionSec }, (res) => resolve(res));
    });
  }

  pause(positionSec = null) {
    return new Promise((resolve) => {
      this.socket.emit('playback:pause', { positionSec }, (res) => resolve(res));
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
