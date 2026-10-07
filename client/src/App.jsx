import React, { useState, useEffect, useRef } from 'react';
import { socketService } from './services/socketService';
import { audioSyncEngine } from './services/audioSyncEngine';
import { LobbyScreen } from './components/LobbyScreen';
import { RoomHeader } from './components/RoomHeader';
import { NowPlayingHero } from './components/NowPlayingHero';
import { PlayerBar } from './components/PlayerBar';
import { AddMusicDock } from './components/AddMusicDock';
import { SidebarTabs } from './components/SidebarTabs';
import { FloatingReactions } from './components/FloatingReactions';
import { AutoplayBanner } from './components/AutoplayBanner';

export default function App() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [playbackState, setPlaybackState] = useState(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const audioRef = useRef(null);

  // Initialize socket and audio element on mount
  useEffect(() => {
    socketService.connect();

    if (audioRef.current) {
      audioSyncEngine.initAudioElement(audioRef.current);
      audioSyncEngine.setupWebAudio();
    }

    audioSyncEngine.onAutoplayBlockedCallback = (blocked) => {
      setAutoplayBlocked(blocked);
    };

    audioSyncEngine.onTrackEndedCallback = (trackId) => {
      socketService.trackEnded(trackId);
    };

    audioSyncEngine.startPeriodicDriftMonitor();

    // Socket Event Listeners
    const handlePlaybackSync = (newPlayback) => {
      setPlaybackState(newPlayback);
      audioSyncEngine.applySync(newPlayback, false);
    };

    const handleQueueUpdated = ({ queue }) => {
      setCurrentRoom((prev) => (prev ? { ...prev, queue } : null));
    };

    const handleRoomUsers = ({ users, hostId }) => {
      setCurrentRoom((prev) => {
        if (!prev) return null;
        const myId = socketService.getSocketId();
        const me = users.find((u) => u.id === myId);
        if (me) setCurrentUser(me);
        return { ...prev, users, hostId };
      });
    };

    const handleModeChanged = ({ mode }) => {
      setCurrentRoom((prev) => (prev ? { ...prev, mode } : null));
    };

    const handleChatMessage = (message) => {
      setCurrentRoom((prev) => {
        if (!prev) return null;
        return { ...prev, chat: [...(prev.chat || []), message] };
      });
    };

    const handleSystemMessage = (message) => {
      setCurrentRoom((prev) => {
        if (!prev) return null;
        return { ...prev, chat: [...(prev.chat || []), message] };
      });
    };

    socketService.on('playback:sync', handlePlaybackSync);
    socketService.on('playback:heartbeat', handlePlaybackSync);
    socketService.on('queue:updated', handleQueueUpdated);
    socketService.on('room:users', handleRoomUsers);
    socketService.on('room:modeChanged', handleModeChanged);
    socketService.on('chat:message', handleChatMessage);
    socketService.on('chat:system', handleSystemMessage);

    return () => {
      socketService.off('playback:sync', handlePlaybackSync);
      socketService.off('playback:heartbeat', handlePlaybackSync);
      socketService.off('queue:updated', handleQueueUpdated);
      socketService.off('room:users', handleRoomUsers);
      socketService.off('room:modeChanged', handleModeChanged);
      socketService.off('chat:message', handleChatMessage);
      socketService.off('chat:system', handleSystemMessage);
      audioSyncEngine.stop();
    };
  }, []);

  const handleJoinedRoom = (roomData, userData) => {
    setCurrentRoom(roomData);
    setCurrentUser(userData);
    setPlaybackState(roomData.playback);

    // Update URL query parameter without full reload
    const url = new URL(window.location);
    url.searchParams.set('room', roomData.id);
    window.history.replaceState({}, '', url);

    if (audioRef.current) {
      audioSyncEngine.setupWebAudio();
    }

    if (roomData.playback) {
      audioSyncEngine.applySync(roomData.playback, true);
    }
  };

  return (
    <div>
      {/* Hidden Master HTML5 Audio Element for Local File Streaming */}
      <audio
        ref={audioRef}
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Autoplay Gatekeeper */}
      <AutoplayBanner
        isBlocked={autoplayBlocked}
        onUnlock={() => setAutoplayBlocked(false)}
      />

      {!currentRoom ? (
        <LobbyScreen onJoinedRoom={handleJoinedRoom} />
      ) : (
        <div className="app-container">
          {/* Header */}
          <RoomHeader room={currentRoom} currentUser={currentUser} />

          {/* Main Architectural Stage */}
          <main className="arch-stage-grid">
            {/* Monumental Sonic Stage (Left) */}
            <section className="sonic-stage-left">
              <NowPlayingHero
                playbackState={playbackState}
                room={currentRoom}
              />

              <PlayerBar
                playbackState={playbackState}
                room={currentRoom}
                currentUser={currentUser}
              />

              <AddMusicDock currentUser={currentUser} />
            </section>

            {/* Communal Sidebar (Right) */}
            <aside className="communal-sidebar-right">
              <SidebarTabs
                room={currentRoom}
                currentUser={currentUser}
                playbackState={playbackState}
              />

              <FloatingReactions />
            </aside>
          </main>
        </div>
      )}
    </div>
  );
}
