import { roomManager } from '../services/roomManager.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentRoomId = null;

    // Fast clock synchronization ping
    socket.on('ping:sync', (data) => {
      socket.emit('pong:sync', {
        clientSendTime: data?.clientSendTime || 0,
        serverTime: Date.now()
      });
    });

    // Create Room
    socket.on('room:create', ({ roomName, userName, mode }, callback) => {
      try {
        const room = roomManager.createRoom(roomName, socket.id, userName, mode);
        currentRoomId = room.id;
        socket.join(room.id);

        const state = roomManager.getPublicRoomState(room.id);
        roomManager.addSystemMessage(room.id, `Welcome to ${room.name}! Room code: ${room.id}`);

        if (typeof callback === 'function') {
          callback({ success: true, room: state });
        }
      } catch (err) {
        console.error('room:create error:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: err.message });
        }
      }
    });

    // Join Room
    socket.on('room:join', ({ roomId, userName }, callback) => {
      try {
        const normalizedId = roomId?.trim().toLowerCase();
        const result = roomManager.joinRoom(normalizedId, socket.id, userName);

        if (!result) {
          if (typeof callback === 'function') {
            return callback({ success: false, error: 'Room not found or expired.' });
          }
          return;
        }

        currentRoomId = normalizedId;
        socket.join(normalizedId);

        const state = roomManager.getPublicRoomState(normalizedId);

        // System announcement
        roomManager.addSystemMessage(normalizedId, `${result.user.name} tuned in`);

        // Notify room members of updated user list & chat
        io.to(normalizedId).emit('room:users', { users: state.users, hostId: state.hostId });
        io.to(normalizedId).emit('chat:system', state.chat[state.chat.length - 1]);

        if (typeof callback === 'function') {
          callback({ success: true, room: state, user: result.user });
        }
      } catch (err) {
        console.error('room:join error:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: err.message });
        }
      }
    });

    // Play action (instant response)
    socket.on('playback:play', (data, callback) => {
      const cb = typeof data === 'function' ? data : callback;
      const positionSec = typeof data === 'object' ? data?.positionSec : null;

      if (!currentRoomId) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room) return;

      if (!roomManager.canControl(room, socket.id)) {
        if (typeof cb === 'function') cb({ success: false, error: 'Host-only mode is active.' });
        return;
      }

      const success = roomManager.play(currentRoomId, socket.id, positionSec);
      if (success) {
        const state = roomManager.getPublicRoomState(currentRoomId);
        io.to(currentRoomId).emit('playback:sync', { ...state.playback, originSocketId: socket.id });
        io.to(currentRoomId).emit('queue:updated', { queue: state.queue });
        if (typeof cb === 'function') cb({ success: true });
      }
    });

    // Pause action (instant response)
    socket.on('playback:pause', (data, callback) => {
      const cb = typeof data === 'function' ? data : callback;
      const positionSec = typeof data === 'object' ? data?.positionSec : null;

      if (!currentRoomId) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room) return;

      if (!roomManager.canControl(room, socket.id)) {
        if (typeof cb === 'function') cb({ success: false, error: 'Host-only mode is active.' });
        return;
      }

      const success = roomManager.pause(currentRoomId, socket.id, positionSec);
      if (success) {
        const state = roomManager.getPublicRoomState(currentRoomId);
        io.to(currentRoomId).emit('playback:sync', { ...state.playback, originSocketId: socket.id });
        if (typeof cb === 'function') cb({ success: true });
      }
    });

    // Seek action (instant response)
    socket.on('playback:seek', ({ positionSec }, callback) => {
      if (!currentRoomId) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room) return;

      if (!roomManager.canControl(room, socket.id)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Host-only mode is active.' });
        return;
      }

      const success = roomManager.seek(currentRoomId, positionSec, socket.id);
      if (success) {
        const state = roomManager.getPublicRoomState(currentRoomId);
        io.to(currentRoomId).emit('playback:sync', { ...state.playback, originSocketId: socket.id });
        if (typeof callback === 'function') callback({ success: true });
      }
    });

    // Report duration (e.g., when YouTube player loads video)
    socket.on('playback:setDuration', ({ durationSec }) => {
      if (!currentRoomId) return;
      const updated = roomManager.setDuration(currentRoomId, durationSec);
      if (updated) {
        const state = roomManager.getPublicRoomState(currentRoomId);
        io.to(currentRoomId).emit('playback:sync', state.playback);
      }
    });

    // Track ended
    socket.on('playback:trackEnd', ({ trackId }) => {
      if (!currentRoomId) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room || !room.playback.currentTrack) return;

      // Avoid duplicate triggers
      if (trackId && room.playback.currentTrack.id !== trackId) return;

      roomManager.nextTrack(currentRoomId, socket.id);
      const state = roomManager.getPublicRoomState(currentRoomId);
      io.to(currentRoomId).emit('playback:sync', state.playback);
      io.to(currentRoomId).emit('queue:updated', { queue: state.queue });
    });

    // Skip to next track
    socket.on('playback:next', (callback) => {
      if (!currentRoomId) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room || !roomManager.canControl(room, socket.id)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Host-only mode is active.' });
        return;
      }

      roomManager.nextTrack(currentRoomId, socket.id);
      const state = roomManager.getPublicRoomState(currentRoomId);
      io.to(currentRoomId).emit('playback:sync', state.playback);
      io.to(currentRoomId).emit('queue:updated', { queue: state.queue });
      if (typeof callback === 'function') callback({ success: true });
    });

    // Add track to queue
    socket.on('queue:add', (trackData, callback) => {
      if (!currentRoomId) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room) return;

      const track = {
        ...trackData,
        id: trackData.id || `track-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        uploaderId: socket.id,
        addedAt: Date.now()
      };

      const result = roomManager.addTrack(currentRoomId, track, socket.id);
      const state = roomManager.getPublicRoomState(currentRoomId);

      io.to(currentRoomId).emit('playback:sync', state.playback);
      io.to(currentRoomId).emit('queue:updated', { queue: state.queue });

      roomManager.addSystemMessage(currentRoomId, `Added to queue: "${track.title}"`);
      io.to(currentRoomId).emit('chat:system', state.chat[state.chat.length - 1]);

      if (typeof callback === 'function') {
        callback({ success: true, autoStarted: result.autoStarted });
      }
    });

    // Remove track from queue
    socket.on('queue:remove', ({ trackId }, callback) => {
      if (!currentRoomId) return;
      const success = roomManager.removeTrack(currentRoomId, trackId, socket.id);
      if (success) {
        const state = roomManager.getPublicRoomState(currentRoomId);
        io.to(currentRoomId).emit('queue:updated', { queue: state.queue });
        if (typeof callback === 'function') callback({ success: true });
      } else {
        if (typeof callback === 'function') callback({ success: false, error: 'Permission denied.' });
      }
    });

    // Toggle Room Mode (Host Only vs Collaborative)
    socket.on('room:setMode', ({ mode }, callback) => {
      if (!currentRoomId) return;
      const success = roomManager.setMode(currentRoomId, mode, socket.id);
      if (success) {
        const state = roomManager.getPublicRoomState(currentRoomId);
        const modeLabel = mode === 'host-only' ? 'Host Only' : 'Party / Collaborative';
        roomManager.addSystemMessage(currentRoomId, `Room mode changed to ${modeLabel}`);

        io.to(currentRoomId).emit('room:modeChanged', { mode });
        io.to(currentRoomId).emit('chat:system', state.chat[state.chat.length - 1]);
        if (typeof callback === 'function') callback({ success: true });
      } else {
        if (typeof callback === 'function') callback({ success: false, error: 'Only the room host can change the mode.' });
      }
    });

    // Send Chat Message
    socket.on('chat:send', ({ text }) => {
      if (!currentRoomId || !text?.trim()) return;
      const message = roomManager.addChatMessage(currentRoomId, socket.id, text);
      if (message) {
        io.to(currentRoomId).emit('chat:message', message);
      }
    });

    // Floating Emoji Reaction
    socket.on('reaction:send', ({ emoji }) => {
      if (!currentRoomId || !emoji) return;
      const room = roomManager.getRoom(currentRoomId);
      if (!room) return;
      const user = room.users.get(socket.id);

      io.to(currentRoomId).emit('reaction:broadcast', {
        id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        emoji,
        senderName: user ? user.name : 'Listener',
        senderColor: user ? user.avatarColor : '#00f2fe'
      });
    });

    // Request full state sync
    socket.on('room:requestSync', (callback) => {
      if (!currentRoomId) return;
      const state = roomManager.getPublicRoomState(currentRoomId);
      if (state && typeof callback === 'function') {
        callback(state);
      }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      if (currentRoomId) {
        const result = roomManager.leaveRoom(currentRoomId, socket.id);
        if (result) {
          const state = roomManager.getPublicRoomState(currentRoomId);
          if (state) {
            io.to(currentRoomId).emit('room:users', { users: state.users, hostId: state.hostId });
            if (result.newHost) {
              roomManager.addSystemMessage(currentRoomId, `${result.newHost.name} is now the room host 👑`);
              io.to(currentRoomId).emit('chat:system', state.chat[state.chat.length - 1]);
            }
          }
        }
      }
    });
  });

  // Periodic room heartbeat (every 5 seconds) to keep all client clocks calibrated
  setInterval(() => {
    for (const [roomId, room] of roomManager.rooms.entries()) {
      if (room.users.size > 0 && room.playback.isPlaying) {
        const state = roomManager.getPublicRoomState(roomId);
        if (state) {
          io.to(roomId).emit('playback:heartbeat', state.playback);
        }
      }
    }
  }, 5000);
}
