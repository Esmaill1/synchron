# 🎵 SyncWave — Real-Time Synchronized Music Streaming

A full-stack synchronized music streaming web platform that allows multiple users to listen to music simultaneously in real time with sub-second synchronization. Listeners can upload local audio files (MP3, WAV, OGG, FLAC, M4A) or stream YouTube tracks in shared virtual listening lounges.

---

## ✨ Features

- 🎧 **Exact Time Synchronization:** Server virtual clock + client NTP-style clock calibration and drift compensation ($< 1.0\text{s}$ smooth threshold, instant seek on lag) ensures all listeners hear the exact same beat at the exact same moment.
- 📁 **Local Audio File Uploads:** Drag-and-drop or browse audio files (MP3, WAV, FLAC, OGG, M4A, AAC). Streamed via HTTP 206 Partial Content byte ranges for instant scrubbing and seeking.
- ▶️ **Synchronized YouTube Streams:** Paste any YouTube video link (`youtube.com/watch?v=...`, `youtu.be/...`) with automatic oEmbed metadata previews (titles and thumbnails).
- 🎛️ **Dual-Mode Room Permissions:**
  - **Party Mode (Collaborative):** Anyone in the room can pause, play, seek, and manage the queue.
  - **Host Only:** Only the room host can pause, play, and seek; guests listen in lockstep and can queue tracks.
- 📊 **Dynamic Audio Visualizer:**
  - Real-time frequency spectrum visualizer rendered via HTML5 `<canvas>` and Web Audio API (`AnalyserNode`) for uploaded tracks.
  - Procedural acoustic rhythm wave pulsing to synchronized playback for YouTube and idle states.
- 💬 **Live Social Room Experience:**
  - Real-time room chat with sender color tags and system announcements.
  - Floating emoji reactions bar (🔥, 🎵, ❤️, 👏, 🎉, ⚡, 🚀, 😍) that drift upwards as animated particles across all listeners' viewports.
  - Active listeners panel with host crown indicator and room code invite link with 1-click clipboard copy.
- 🛡️ **Browser Autoplay Gate:** Elegant "Tune In" modal preventing browsers from silently blocking audio playback when joining an ongoing stream.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- npm

### 1. Installation
In the project root directory:
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 2. Running Locally

#### Option A: Unified Full-Stack Server (Recommended)
Build the frontend client once, and the Express backend will serve everything on a single port (`http://localhost:3001`):
```bash
# Build the client bundle
npm run build --prefix client

# Start the unified backend & static server
npm start
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser.

#### Option B: Development Mode (Hot Reloading)
Run backend and Vite dev server simultaneously:
```bash
# Terminal 1: Backend API & WebSockets
node server/server.js

# Terminal 2: Vite React Client with HMR
npm run dev --prefix client
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 📡 System Architecture

```mermaid
graph TD
  A[Client 1 - Host] -->|Socket.IO events| B[Express + Socket.IO Server]
  C[Client 2 - Guest] -->|Socket.IO events| B
  D[Client 3 - Guest] -->|Socket.IO events| B

  B -->|playback:sync & heartbeat| A
  B -->|playback:sync & heartbeat| C
  B -->|playback:sync & heartbeat| D

  A -->|POST /api/upload| E[Multer Storage /uploads/]
  E -->|GET /api/media/:file (206 Range)| A
  E -->|GET /api/media/:file (206 Range)| C
  E -->|GET /api/media/:file (206 Range)| D
```

### Authoritative Virtual Server Clock
- When playing:
  $$\text{CurrentPosition}(t) = \text{positionSec} + \frac{t_{\text{server}} - \text{lastUpdatedTimestamp}}{1000}$$
- When paused:
  $$\text{CurrentPosition} = \text{positionSec}$$

---

## 📁 Project Structure

```
├── client/                      # React 18 + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddMusicDock.jsx    # File uploader & YouTube preview
│   │   │   ├── AudioVisualizer.jsx # HTML5 Canvas audio spectrum & waveform
│   │   │   ├── AutoplayBanner.jsx  # Browser autoplay barrier handler
│   │   │   ├── FloatingReactions.jsx# Floating emoji particle dock
│   │   │   ├── LobbyScreen.jsx     # Room creation & joining screen
│   │   │   ├── NowPlayingHero.jsx  # Hero artwork & player container
│   │   │   ├── PlayerBar.jsx       # Scrubber, play/pause, volume controls
│   │   │   ├── RoomHeader.jsx      # Room badge, 1-click invite link, mode toggle
│   │   │   ├── SidebarTabs.jsx     # Shared queue, live chat, listeners list
│   │   │   └── YouTubePlayer.jsx   # YouTube IFrame API sync wrapper
│   │   ├── services/
│   │   │   ├── audioSyncEngine.js  # Dual audio controller & drift compensator
│   │   │   └── socketService.js    # Socket.IO client & clock calibration
│   │   ├── App.jsx                 # Master application controller
│   │   └── index.css               # Cyber-glass design system tokens
│   └── vite.config.js              # Vite server & proxy configuration
├── server/                      # Node.js backend
│   ├── routes/
│   │   └── api.js                  # Uploads, Range streaming (206), YouTube oEmbed
│   ├── services/
│   │   └── roomManager.js          # Room state, virtual clock, permissions
│   ├── socket/
│   │   └── socketHandler.js        # Socket.IO room events & periodic heartbeat
│   └── server.js                   # Express + Socket.IO server entry point
├── uploads/                     # Uploaded audio file storage
├── docs/                        # Architecture specs & implementation plans
└── package.json                 # Root package configuration
```

---

## 📜 License
MIT License. Built for real-time collaborative audio streaming.
