# Synchronized Music Streaming Web Application — Design Specification

**Date:** 2026-10-07  
**Status:** Approved  
**Classification:** Architectural  

---

## 1. Executive Summary
The Synchronized Music Streaming application enables groups of users in shared virtual rooms to listen to audio simultaneously with sub-second synchronization. The application supports playing both uploaded audio files (MP3, WAV, OGG, FLAC, M4A) and YouTube tracks via the official YouTube IFrame Player API. Room creators can toggle between "Host Only" and "Collaborative / Party Mode" permissions. Additional interactive capabilities include synchronized audio spectrum visualizations, real-time room chat, animated floating emoji reactions, and live playlist queue management.

---

## 2. Architecture & Tech Stack

### 2.1 Technology Stack
* **Backend Runtime:** Node.js + Express
* **Real-time WebSockets:** Socket.IO
* **File Uploads & Streaming:** Multer + Express static byte-range streaming (`Accept-Ranges: bytes` for scrubbable audio seeking)
* **Frontend Framework:** React 18+ with Vite
* **Styling:** Modern dark cyber-glass design system with custom Vanilla CSS (glassmorphism, vibrant neon cyan `#00f2fe` and purple `#9d4edd` gradients, responsive grid/flexbox)
* **Audio Engines:**
  * **Uploaded Audio:** HTML5 `<audio>` element linked to Web Audio API (`AudioContext`, `AnalyserNode`) for spectrum visualization
  * **YouTube Audio:** YouTube IFrame Player API embedded with custom synchronization wrappers
* **Visualizer:** HTML5 `<canvas>` rendering real-time frequency waveforms for audio and rhythm pulse animations for YouTube

---

## 3. Data Models & State Management

### 3.1 Room State (`Room`)
```typescript
interface Room {
  id: string;               // Unique room code (e.g., 'vibe-4291')
  name: string;             // Room display name
  hostId: string;           // Socket ID of current host
  mode: 'host-only' | 'collaborative'; // Control permissions
  createdAt: number;
  users: Map<string, User>; // Connected users
  playback: PlaybackState;
  queue: QueueItem[];
  chat: ChatMessage[];
}
```

### 3.2 Playback State (`PlaybackState`)
```typescript
interface PlaybackState {
  currentTrack: QueueItem | null;
  isPlaying: boolean;
  positionSec: number;        // Position when last started or paused
  lastUpdatedTimestamp: number; // Server epoch ms when state changed
  duration: number;
}
```

### 3.3 Queue Item (`QueueItem`)
```typescript
interface QueueItem {
  id: string;
  title: string;
  artistOrChannel?: string;
  durationSec: number;
  type: 'file' | 'youtube';
  url: string;               // Streaming URL for uploaded files or YouTube video ID
  thumbnailUrl?: string;
  uploaderName: string;
  addedAt: number;
}
```

### 3.4 User & Chat State
```typescript
interface User {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  joinedAt: number;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}
```

---

## 4. Playback Synchronization Protocol

### 4.1 Authoritative Virtual Server Clock
The server is the single source of truth for time.
* When playing:
  $$\text{EffectiveServerPosition}(T_{\text{server}}) = \text{positionSec} + \frac{T_{\text{server}} - \text{lastUpdatedTimestamp}}{1000}$$
* When paused:
  $$\text{EffectiveServerPosition} = \text{positionSec}$$

### 4.2 Client Clock Calibration & Latency Estimation
Upon connection and periodically, the client sends a `ping` packet containing $t_0$. The server responds immediately with `{ clientSendTime: t0, serverTime: Date.now() }`.
The client calculates:
$$\text{RTT} = t_{\text{receive}} - t_0$$
$$\text{ClockOffset} = \text{serverTime} - \left(t_0 + \frac{\text{RTT}}{2}\right)$$
$$\text{EstimatedServerNow}() = \text{Date.now}() + \text{ClockOffset}$$

### 4.3 Drift Detection & Correction Rules
Whenever a state broadcast is received or during ongoing playback:
1. Client computes current target position using $\text{EstimatedServerNow}()$.
2. Measure difference: $\Delta = \text{localPlayerTime} - \text{targetPosition}$.
3. **Drift Policy:**
   * If $|\Delta| \le 1.0\text{s}$: No hard seek. Maintain continuous playback to avoid audio crackle or micro-stutters.
   * If $|\Delta| > 1.2\text{s}$: Execute instant seek to exact `targetPosition`.
   * If state changes (`play` $\leftrightarrow$ `pause`): Immediate synchronization.

---

## 5. User Interface & Experience Specifications

### 5.1 Main Layout Components
1. **Header Bar:**
   * Room title & room code badge.
   * "Copy Invite Link" 1-click action with toast feedback.
   * Mode switch: "Host Only" vs "Party Mode" (toggleable by host).
   * Connection status & latency indicator (`● Synced (22ms)`).
2. **Main Stage:**
   * **Hero Now Playing:** Title, artist/channel, media badge ("MP3 Audio" vs "YouTube").
   * **Visualizer / Video Frame:**
     * Audio file: Real-time frequency canvas visualizer pulsing to live frequencies.
     * YouTube: Responsive 16:9 embedded player with theater / mini toggle.
   * **Control Bar:**
     * Time scrub slider with buffered bar & timestamp counter (`02:14 / 04:30`).
     * Big Play/Pause button, Next Track skip, Volume slider, Mute toggle.
     * Permission gate indicator: In "Host Only" mode for guests, buttons display a lock badge with a helpful tooltip.
3. **Add Music Dock:**
   * Tab 1: **Upload Audio File** — Drag-and-drop zone supporting MP3, WAV, FLAC, OGG, AAC with live upload progress.
   * Tab 2: **YouTube Link** — Quick input supporting `youtube.com/watch?v=...`, `youtu.be/...`, with instant preview and "Add to Queue".
4. **Side Drawer / Tabs:**
   * **Queue:** Visual list of queued tracks with remove/reorder actions and empty state suggestions.
   * **Chat & Reactions:** Live message stream + floating emoji reaction bar (🔥 🎵 ❤️ 👏 🎉 ⚡) triggering floating particle bursts across all listeners' viewports.
   * **Listeners:** Active listeners list with host crown and avatar icons.

---

## 6. API & WebSocket Event Specifications

### 6.1 HTTP REST Endpoints
* `POST /api/upload`: Multipart upload using Multer (`file` field). Returns `{ success: true, file: { url, filename, duration, title, size } }`.
* `GET /api/media/:filename`: Serves audio file with full HTTP 206 Partial Content range support.
* `GET /api/youtube-info?url=...`: Fetches title and thumbnail preview metadata.

### 6.2 Socket.IO Events
* **Client $\to$ Server:**
  * `room:create`: `{ roomName, userName, mode }`
  * `room:join`: `{ roomId, userName }`
  * `playback:play`: `{}`
  * `playback:pause`: `{}`
  * `playback:seek`: `{ positionSec }`
  * `playback:trackEnd`: `{ trackId }`
  * `queue:add`: `{ track }`
  * `queue:remove`: `{ trackId }`
  * `queue:reorder`: `{ queue }`
  * `room:setMode`: `{ mode: 'host-only' | 'collaborative' }`
  * `chat:send`: `{ text }`
  * `reaction:send`: `{ emoji }`
  * `ping:sync`: `{ clientTime }`
* **Server $\to$ Client:**
  * `room:state`: Complete snapshot on join/reconnect.
  * `playback:sync`: `{ isPlaying, positionSec, lastUpdatedTimestamp, currentTrack }`
  * `queue:updated`: `{ queue }`
  * `chat:message`: `{ message }`
  * `reaction:broadcast`: `{ emoji, senderName }`
  * `room:users`: `{ users }`
  * `error:notification`: `{ message }`

---

## 7. Edge Cases & Resilience

1. **Autoplay Policy Restrictions:**
   Browsers block unmuted audio playback without user interaction.
   * If a user enters a room with music already playing, an interactive banner appears: *"Click anywhere to join synchronized audio"*. Clicking initializes the AudioContext and starts playback at the exact server timestamp.
2. **Tab Inactivity / Background Throttling:**
   When a user tabs back into the room, a sync reconciliation check is triggered immediately to catch up if drift exceeded $1.2\text{s}$.
3. **Host Disconnect:**
   If the host disconnects, the server automatically promotes the next longest-standing listener to Host, preserving room continuity.
4. **YouTube Embed Errors:**
   Detects YouTube player error codes (e.g., video not embeddable, removed, or geo-blocked) and emits a graceful room notification suggesting the host/party skip to the next track.

---

## 8. Verification & Test Plan
1. **Unit & Protocol Verification:**
   * Test server clock offset calculations and room state transitions.
   * Test audio range streaming seeking headers (`Content-Range`, `206 Partial Content`).
2. **Multi-Client Real-Time Synchronization:**
   * Open two browser windows (Host & Listener) in the same room.
   * Verify audio file upload and synchronized playback.
   * Verify YouTube track queueing and synchronized playback.
   * Verify play/pause/seek controls update in both sessions under $150\text{ms}$.
   * Verify chat messages and floating emoji animations trigger in both windows.
   * Verify permission toggling ("Host Only" vs "Party Mode").
