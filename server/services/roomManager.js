export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.cleanupTimeouts = new Map();
  }

  generateRoomId() {
    const adjectives = ['vibe', 'beat', 'wave', 'sonic', 'pulse', 'echo', 'groove', 'flow'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${adj}-${num}`;
  }

  createRoom(name, hostSocketId, hostName, mode = 'collaborative') {
    const id = this.generateRoomId();
    const avatarColors = ['#00f2fe', '#9d4edd', '#ff007f', '#00ff88', '#ffb703', '#3a86ff'];
    const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const room = {
      id,
      name: name?.trim() || `Vibe Lounge #${id.slice(-4)}`,
      hostId: hostSocketId,
      mode: mode === 'host-only' ? 'host-only' : 'collaborative',
      createdAt: Date.now(),
      users: new Map(),
      playback: {
        currentTrack: null,
        isPlaying: false,
        positionSec: 0,
        lastUpdatedTimestamp: Date.now(),
        duration: 0
      },
      queue: [],
      chat: []
    };

    const hostUser = {
      id: hostSocketId,
      name: hostName?.trim() || 'Room Host',
      avatarColor: randomColor,
      isHost: true,
      joinedAt: Date.now()
    };
    room.users.set(hostSocketId, hostUser);

    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, socketId, userName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Clear any cleanup timeout if users rejoin
    if (this.cleanupTimeouts.has(roomId)) {
      clearTimeout(this.cleanupTimeouts.get(roomId));
      this.cleanupTimeouts.delete(roomId);
    }

    const avatarColors = ['#00f2fe', '#9d4edd', '#ff007f', '#00ff88', '#ffb703', '#3a86ff'];
    const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const isHost = room.users.size === 0 || room.hostId === socketId;
    if (isHost) {
      room.hostId = socketId;
    }

    const user = {
      id: socketId,
      name: userName?.trim() || `Listener #${Math.floor(100 + Math.random() * 900)}`,
      avatarColor: randomColor,
      isHost,
      joinedAt: Date.now()
    };

    room.users.set(socketId, user);
    return { room, user };
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const user = room.users.get(socketId);
    room.users.delete(socketId);

    let newHost = null;
    if (room.hostId === socketId && room.users.size > 0) {
      // Migrate host to the earliest remaining user
      const nextUser = room.users.values().next().value;
      if (nextUser) {
        nextUser.isHost = true;
        room.hostId = nextUser.id;
        newHost = nextUser;
      }
    }

    // If empty room, schedule cleanup in 5 minutes
    if (room.users.size === 0) {
      const timeout = setTimeout(() => {
        this.rooms.delete(roomId);
        this.cleanupTimeouts.delete(roomId);
      }, 5 * 60 * 1000);
      this.cleanupTimeouts.set(roomId, timeout);
    }

    return { user, newHost, remainingCount: room.users.size };
  }

  getCurrentPosition(room) {
    if (!room || !room.playback) return 0;
    const { isPlaying, positionSec, lastUpdatedTimestamp, duration } = room.playback;
    if (!isPlaying) {
      return positionSec;
    }
    const elapsed = (Date.now() - lastUpdatedTimestamp) / 1000;
    let current = positionSec + elapsed;
    if (duration > 0 && current > duration) {
      current = duration;
    }
    return Math.max(0, current);
  }

  canControl(room, socketId) {
    if (!room) return false;
    if (room.mode === 'collaborative') return true;
    return room.hostId === socketId;
  }

  setMode(roomId, mode, socketId) {
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== socketId) return false;
    room.mode = mode === 'host-only' ? 'host-only' : 'collaborative';
    return true;
  }

  play(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room || !this.canControl(room, socketId)) return false;
    if (!room.playback.currentTrack && room.queue.length > 0) {
      return this.nextTrack(roomId, socketId);
    }
    if (!room.playback.currentTrack) return false;

    if (!room.playback.isPlaying) {
      room.playback.isPlaying = true;
      room.playback.lastUpdatedTimestamp = Date.now();
    }
    return true;
  }

  pause(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room || !this.canControl(room, socketId)) return false;

    if (room.playback.isPlaying) {
      room.playback.positionSec = this.getCurrentPosition(room);
      room.playback.isPlaying = false;
      room.playback.lastUpdatedTimestamp = Date.now();
    }
    return true;
  }

  seek(roomId, positionSec, socketId) {
    const room = this.rooms.get(roomId);
    if (!room || !this.canControl(room, socketId)) return false;

    room.playback.positionSec = Math.max(0, positionSec);
    room.playback.lastUpdatedTimestamp = Date.now();
    return true;
  }

  setDuration(roomId, durationSec) {
    const room = this.rooms.get(roomId);
    if (!room || !room.playback.currentTrack) return false;
    if (durationSec > 0) {
      room.playback.duration = durationSec;
      room.playback.currentTrack.durationSec = durationSec;
      return true;
    }
    return false;
  }

  addTrack(roomId, track, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.queue.push(track);

    // If nothing currently playing, start playing this track immediately
    if (!room.playback.currentTrack) {
      const firstTrack = room.queue.shift();
      room.playback.currentTrack = firstTrack;
      room.playback.isPlaying = true;
      room.playback.positionSec = 0;
      room.playback.duration = firstTrack.durationSec || 0;
      room.playback.lastUpdatedTimestamp = Date.now();
      return { autoStarted: true, track: firstTrack };
    }

    return { autoStarted: false, track };
  }

  removeTrack(roomId, trackId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const trackIndex = room.queue.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return false;

    const track = room.queue[trackIndex];
    const isUploader = track.uploaderId === socketId;
    if (!this.canControl(room, socketId) && !isUploader) {
      return false;
    }

    room.queue.splice(trackIndex, 1);
    return true;
  }

  nextTrack(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room || !this.canControl(room, socketId)) return null;

    if (room.queue.length > 0) {
      const next = room.queue.shift();
      room.playback.currentTrack = next;
      room.playback.isPlaying = true;
      room.playback.positionSec = 0;
      room.playback.duration = next.durationSec || 0;
      room.playback.lastUpdatedTimestamp = Date.now();
      return next;
    } else {
      room.playback.currentTrack = null;
      room.playback.isPlaying = false;
      room.playback.positionSec = 0;
      room.playback.duration = 0;
      room.playback.lastUpdatedTimestamp = Date.now();
      return null;
    }
  }

  addChatMessage(roomId, socketId, text) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const user = room.users.get(socketId);
    if (!user) return null;

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: socketId,
      senderName: user.name,
      senderColor: user.avatarColor,
      text: text.trim().substring(0, 300),
      timestamp: Date.now(),
      isSystem: false
    };

    room.chat.push(message);
    if (room.chat.length > 100) {
      room.chat.shift();
    }
    return message;
  }

  addSystemMessage(roomId, text) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const message = {
      id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: 'system',
      senderName: 'System',
      senderColor: '#00f2fe',
      text,
      timestamp: Date.now(),
      isSystem: true
    };

    room.chat.push(message);
    if (room.chat.length > 100) {
      room.chat.shift();
    }
    return message;
  }

  getPublicRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      mode: room.mode,
      createdAt: room.createdAt,
      playback: {
        currentTrack: room.playback.currentTrack,
        isPlaying: room.playback.isPlaying,
        positionSec: room.playback.positionSec,
        currentPositionSec: this.getCurrentPosition(room),
        lastUpdatedTimestamp: room.playback.lastUpdatedTimestamp,
        duration: room.playback.duration,
        serverTime: Date.now()
      },
      queue: room.queue,
      users: Array.from(room.users.values()),
      chat: room.chat
    };
  }
}

export const roomManager = new RoomManager();
