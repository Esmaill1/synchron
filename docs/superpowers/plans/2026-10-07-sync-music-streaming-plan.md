# Synchronized Music Streaming Web App — Implementation Plan

**Spec Reference:** `docs/superpowers/specs/2026-10-07-sync-music-streaming-design.md`  
**Date:** 2026-10-07  

---

## Plan Overview
This plan implements a full-stack real-time synchronized music streaming application with sub-second synchronization, dual-engine playback (Uploaded audio files + YouTube IFrame API), room permission modes (Host Only vs Party Mode), real-time audio spectrum visualizer, live chat, floating emoji reactions, and playlist queue management.

---

### Task 1: Initialize Project Structure & Backend Foundation
* **Goal:** Set up root project, dependencies, Express server, and file streaming with HTTP 206 range request support.
* **Files to create/modify:**
  - `package.json`
  - `server/server.js`
  - `server/services/roomManager.js`
  - `server/routes/api.js`
  - `.gitignore`
* **Implementation Details:**
  - Install dependencies: `express`, `socket.io`, `cors`, `multer`, `dotenv`.
  - Configure `uploads/` directory for audio storage.
  - Implement `/api/upload` endpoint using `multer` with MIME type filtering (`audio/mpeg`, `audio/wav`, `audio/ogg`, etc.) and metadata extraction.
  - Implement `/api/media/:filename` endpoint supporting `Range: bytes=start-end` and returning HTTP 206 Partial Content (critical for audio scrub seeking).
  - Implement `/api/youtube-info` endpoint to fetch YouTube video title and thumbnail using oEmbed API (`https://www.youtube.com/oembed?url=...&format=json`).
* **Verification:** Start server (`node server/server.js`), curl `/api/health`, test file upload and range response headers.

---

### Task 2: Implement Real-Time Room State & Synchronization Protocol
* **Goal:** Create the authoritative server clock and WebSocket room state engine.
* **Files to create/modify:**
  - `server/services/roomManager.js`
  - `server/socket/socketHandler.js`
* **Implementation Details:**
  - `RoomManager` class:
    - In-memory Map of active rooms.
    - Methods: `createRoom(name, hostId, mode)`, `joinRoom(roomId, user)`, `leaveRoom(roomId, socketId)`, `setMode(roomId, mode)`, `addTrack(roomId, track)`, `removeTrack(roomId, trackId)`, `nextTrack(roomId)`.
    - Virtual clock computation:
      - `play(roomId)`: sets `isPlaying = true`, `lastUpdatedTimestamp = Date.now()`.
      - `pause(roomId)`: calculates elapsed position `positionSec += (Date.now() - lastUpdatedTimestamp) / 1000`, sets `isPlaying = false`.
      - `seek(roomId, positionSec)`: updates `positionSec` and resets `lastUpdatedTimestamp = Date.now()`.
      - `getCurrentPosition(roomId)`: returns computed position.
  - Socket handlers:
    - `ping:sync`: immediately replies with `{ clientSendTime, serverTime: Date.now() }` for clock calibration.
    - `room:create`, `room:join`, `playback:play`, `playback:pause`, `playback:seek`, `playback:trackEnd`, `queue:add`, `queue:remove`, `queue:reorder`, `room:setMode`, `chat:send`, `reaction:send`.
    - Host departure migration: if host disconnects, automatically transfer host role to the next user in the room.
* **Verification:** Run Socket.IO connection script to verify room creation, join, ping-pong calibration, and state broadcasts.

---

### Task 3: Initialize Frontend Client & Cyber-Glass Design System
* **Goal:** Set up Vite + React client and implement the dark glassmorphic styling system.
* **Files to create/modify:**
  - `client/package.json`
  - `client/vite.config.js`
  - `client/index.html`
  - `client/src/index.css`
  - `client/src/App.jsx`
* **Implementation Details:**
  - Vite React setup with standard modern plugins.
  - Build `index.css`:
    - CSS custom properties (color tokens: midnight dark `#080c14`, deep slate `#0f172a`, neon cyan `#00f2fe`, vibrant violet `#9d4edd`, glass backdrop blur, glowing borders).
    - Responsive layout utilities (desktop wide split view, mobile tabs/drawer).
    - Floating reaction particle animations (`@keyframes floatReaction`).
    - Audio visualizer canvas wrapper styles.
* **Verification:** Run Vite dev server, verify browser loads sleek styled dark theme base.

---

### Task 4: Client Socket Service & Dual Playback Synchronization Engine
* **Goal:** Build the client-side clock offset synchronizer and unified playback controller.
* **Files to create/modify:**
  - `client/src/services/socketService.js`
  - `client/src/services/audioSyncEngine.js`
* **Implementation Details:**
  - `socketService.js`:
    - Handles connection lifecycle, emits actions, listens for `room:state`, `playback:sync`, `queue:updated`, `chat:message`, `reaction:broadcast`.
    - Performs periodic ping/pong calibration to measure round-trip time (RTT) and maintain `serverClockOffset`.
    - `getEstimatedServerTime()` method.
  - `audioSyncEngine.js`:
    - Synchronizes both HTML5 `<audio>` and YouTube IFrame player.
    - Calculates target server playback position:
      $$T_{\text{target}} = \text{positionSec} + ((\text{ServerNow} - \text{lastUpdatedTimestamp}) / 1000)$$
    - Drift policy: If drift $> 1.2\text{s}$, seek immediately. If $\le 1.0\text{s}$, let it play smoothly.
    - Web Audio API setup: initializes `AudioContext` and `AnalyserNode` connected to HTML5 `<audio>` for real-time frequency data extraction.
* **Verification:** Test simulated time sync packets; verify drift calculation and seek triggers.

---

### Task 5: Audio Visualizer & YouTube Player Components
* **Goal:** Create visual feedback for music playback.
* **Files to create/modify:**
  - `client/src/components/AudioVisualizer.jsx`
  - `client/src/components/YouTubePlayer.jsx`
* **Implementation Details:**
  - `AudioVisualizer.jsx`:
    - Canvas-based visualizer.
    - When an uploaded audio file is playing, samples real-time frequency data via `AnalyserNode.getByteFrequencyData` to render glowing gradient audio spectrum bars with smooth spring physics.
    - When YouTube is playing or audio is idle, renders an ambient pulsing acoustic rhythm wave synced to playback state.
  - `YouTubePlayer.jsx`:
    - Dynamically loads `https://www.youtube.com/iframe_api`.
    - Manages YouTube player lifecycle (`onReady`, `onStateChange`, `onError`).
    - Syncs `playVideo()`, `pauseVideo()`, and `seekTo()` without recursive event loops.
    - Compact / theater mode toggle so users can choose between seeing the video or focusing on the music player & visualizer.
* **Verification:** Verify canvas animation runs smoothly at 60fps and YouTube player initializes cleanly.

---

### Task 6: Unified Player Bar & Music Add Dock (File Upload + YouTube)
* **Goal:** Create the player controls and track queueing interface.
* **Files to create/modify:**
  - `client/src/components/PlayerBar.jsx`
  - `client/src/components/AddMusicModal.jsx`
  - `client/src/components/NowPlayingHero.jsx`
* **Implementation Details:**
  - `NowPlayingHero.jsx`: Displays active track title, artist/channel, media type tag, and uploader.
  - `PlayerBar.jsx`:
    - Time scrub bar with elapsed & total duration.
    - Play/Pause toggle, Skip Next, Volume slider, Mute toggle.
    - Permission detection: if `room.mode === 'host-only'` and user is not host, controls show a locked badge with tooltip.
  - `AddMusicModal.jsx`:
    - Tab 1 (File Upload): Drag-and-drop zone for audio files with upload progress indicator (`/api/upload`). Auto-fills duration and title.
    - Tab 2 (YouTube): Input URL, calls `/api/youtube-info` for instant preview (title + thumbnail), and adds to room queue.
* **Verification:** Upload a test audio file and add a YouTube link; verify queue updates in real time.

---

### Task 7: Shared Queue, Real-Time Chat, Floating Reactions & Listeners Panel
* **Goal:** Implement the social and collaborative features.
* **Files to create/modify:**
  - `client/src/components/QueuePanel.jsx`
  - `client/src/components/ChatPanel.jsx`
  - `client/src/components/FloatingReactions.jsx`
  - `client/src/components/ListenersList.jsx`
  - `client/src/components/RoomHeader.jsx`
  - `client/src/components/AutoplayBanner.jsx`
* **Implementation Details:**
  - `RoomHeader.jsx`: Room title, 1-click "Copy Room Link" button with toast notification, "Host Only" vs "Party Mode" toggle (for host), connection ping badge (`● Synced (18ms)`).
  - `QueuePanel.jsx`: Shows upcoming tracks, currently playing indicator, remove track button, and quick jump to track.
  - `ChatPanel.jsx`: Live chat messages with sender badges and system event messages (e.g., "Sarah added a track").
  - `FloatingReactions.jsx`: Quick emoji action bar (🔥 🎵 ❤️ 👏 🎉 ⚡); clicks broadcast to room and render floating particle elements rising up the screen for all listeners.
  - `ListenersList.jsx`: List of active listeners with host crown and avatar chips.
  - `AutoplayBanner.jsx`: Floating unobtrusive prompt if browser autoplay restriction blocks unmuted audio.
* **Verification:** Verify chat messages and floating emoji animations trigger across rooms.

---

### Task 8: End-to-End Multi-Client Verification & Polish
* **Goal:** Test two simultaneous browser sessions (Host and Guest) in the same room.
* **Verification Steps:**
  1. Start server and client.
  2. Open Host session, create room `"Groove Room"`.
  3. Copy room link and open Guest session in a second browser window / incognito.
  4. Verify guest is visible in the Listeners panel with sync indicator.
  5. Upload an audio file from Host; verify audio starts playing in lockstep in both windows and visualizer reacts.
  6. Pause and scrub timeline from Host; verify Guest updates within $\approx 100\text{ms}$.
  7. Add a YouTube link; verify both sessions transition to YouTube track seamlessly.
  8. Test "Host Only" vs "Party Mode" permission restrictions.
  9. Send chat messages and floating emoji reactions; verify instant synchronization.
