import { socketService } from './socketService';

class AudioSyncEngine {
  constructor() {
    this.audioElement = null;
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.ytPlayer = null;

    this.currentPlaybackState = null;
    this.currentMediaUrl = null;
    this.pendingSeekPos = null;
    this.volume = 0.85;
    this.isMuted = false;
    this.autoplayBlocked = false;

    this.lastHardSeekTime = 0;
    this.lastUserActionTimestamp = 0;

    this.onAutoplayBlockedCallback = null;
    this.onPlaybackTimeUpdateCallback = null;
    this.onTrackEndedCallback = null;

    this.syncInterval = null;
  }

  initAudioElement(element) {
    if (this.audioElement === element) return;
    this.audioElement = element;
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preload = 'auto';
    this.audioElement.volume = this.isMuted ? 0 : this.volume;

    this.audioElement.addEventListener('ended', () => {
      if (this.onTrackEndedCallback && this.currentPlaybackState?.currentTrack) {
        this.onTrackEndedCallback(this.currentPlaybackState.currentTrack.id);
      }
    });

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.onPlaybackTimeUpdateCallback && this.currentPlaybackState?.currentTrack?.type === 'file') {
        this.onPlaybackTimeUpdateCallback(this.audioElement.currentTime);
      }
    });
  }

  setupWebAudio() {
    if (!this.audioElement) return null;
    if (this.audioContext) return this.analyser;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      return this.analyser;
    } catch (err) {
      console.warn('Web Audio API initialization note:', err);
      return null;
    }
  }

  setYouTubePlayer(player) {
    this.ytPlayer = player;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.audioElement) {
      this.audioElement.volume = this.isMuted ? 0 : this.volume;
    }
    if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      this.ytPlayer.setVolume(this.isMuted ? 0 : this.volume * 100);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.setVolume(this.volume);
    return this.isMuted;
  }

  resumeAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  // Instant 0ms local play execution
  playLocally() {
    this.lastUserActionTimestamp = Date.now();
    this.resumeAudioContext();

    if (this.currentPlaybackState) {
      this.currentPlaybackState.isPlaying = true;
    }

    if (this.currentPlaybackState?.currentTrack?.type === 'file' && this.audioElement) {
      if (this.audioElement.paused) {
        this.audioElement.play().catch(() => {});
      }
      return this.audioElement.currentTime;
    }

    if (this.currentPlaybackState?.currentTrack?.type === 'youtube' && this.ytPlayer) {
      try {
        if (typeof this.ytPlayer.playVideo === 'function') {
          this.ytPlayer.playVideo();
        }
      } catch {}
      return typeof this.ytPlayer.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0;
    }

    return 0;
  }

  // Instant 0ms local pause execution
  pauseLocally() {
    this.lastUserActionTimestamp = Date.now();

    if (this.currentPlaybackState) {
      this.currentPlaybackState.isPlaying = false;
    }

    if (this.currentPlaybackState?.currentTrack?.type === 'file' && this.audioElement) {
      this.audioElement.pause();
      this.audioElement.playbackRate = 1.0;
      return this.audioElement.currentTime;
    }

    if (this.currentPlaybackState?.currentTrack?.type === 'youtube' && this.ytPlayer) {
      try {
        if (typeof this.ytPlayer.pauseVideo === 'function') {
          this.ytPlayer.pauseVideo();
        }
      } catch {}
      return typeof this.ytPlayer.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0;
    }

    return 0;
  }

  computeTargetPosition(playbackState) {
    if (!playbackState || !playbackState.currentTrack) return 0;
    if (!playbackState.isPlaying) {
      return playbackState.positionSec || 0;
    }
    const serverNow = socketService.getEstimatedServerNow();
    const elapsed = Math.max(0, (serverNow - playbackState.lastUpdatedTimestamp) / 1000);
    let target = (playbackState.positionSec || 0) + elapsed;
    if (playbackState.duration > 0 && target > playbackState.duration) {
      target = playbackState.duration;
    }
    return Math.max(0, target);
  }

  applySync(playbackState, forceSeek = false) {
    this.currentPlaybackState = playbackState;

    if (!playbackState || !playbackState.currentTrack) {
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.src = '';
        this.currentMediaUrl = null;
      }
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
      return;
    }

    // Ignore incoming sync if we just clicked Play/Pause locally or are the originator
    const isOriginator = playbackState.originSocketId && playbackState.originSocketId === socketService.getSocketId();
    const isRecentLocalAction = Date.now() - this.lastUserActionTimestamp < 500;
    if ((isOriginator || isRecentLocalAction) && !forceSeek) {
      return;
    }

    const track = playbackState.currentTrack;
    const targetPos = this.computeTargetPosition(playbackState);

    if (track.type === 'file') {
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        try { this.ytPlayer.pauseVideo(); } catch {}
      }

      if (!this.audioElement) return;

      const baseUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const fullMediaUrl = track.url.startsWith('http') ? track.url : `${baseUrl}${track.url}`;

      // When loading a brand new track
      if (this.currentMediaUrl !== fullMediaUrl) {
        this.currentMediaUrl = fullMediaUrl;
        this.pendingSeekPos = targetPos;
        this.audioElement.src = fullMediaUrl;
        this.audioElement.playbackRate = 1.0;

        const onReady = () => {
          this.audioElement.removeEventListener('canplay', onReady);
          if (typeof this.pendingSeekPos === 'number') {
            this.audioElement.currentTime = this.pendingSeekPos;
            this.pendingSeekPos = null;
          }
          if (this.currentPlaybackState?.isPlaying) {
            this.resumeAudioContext();
            this.audioElement.play().catch(() => {});
          }
        };

        this.audioElement.addEventListener('canplay', onReady, { once: true });
        this.audioElement.load();
        return;
      }

      // If playback is paused
      if (!playbackState.isPlaying) {
        this.audioElement.playbackRate = 1.0;
        if (!this.audioElement.paused) {
          this.audioElement.pause();
        }
        if (forceSeek || Math.abs(this.audioElement.currentTime - targetPos) > 0.2) {
          this.audioElement.currentTime = targetPos;
        }
        return;
      }

      // If playback is supposed to be playing
      if (this.audioElement.paused && this.audioElement.readyState >= 2) {
        this.resumeAudioContext();
        const p = this.audioElement.play();
        if (p !== undefined) {
          p.catch((err) => {
            if (err.name === 'NotAllowedError') {
              this.autoplayBlocked = true;
              if (this.onAutoplayBlockedCallback) this.onAutoplayBlockedCallback(true);
            }
          });
        }
      }

      // Smooth Anti-Glitch Phase-Locking (PLL)
      const currentPos = this.audioElement.currentTime;
      const diff = targetPos - currentPos; // > 0: behind target, < 0: ahead of target
      const absDiff = Math.abs(diff);

      // ZONE 3: Hard Seek (> 1.8s desync or explicit user scrub)
      if (forceSeek || absDiff > 1.8) {
        const now = Date.now();
        if (forceSeek || now - this.lastHardSeekTime > 2500) {
          this.audioElement.currentTime = targetPos;
          this.audioElement.playbackRate = 1.0;
          this.lastHardSeekTime = now;
        }
        return;
      }

      // ZONE 1: Deadband Lock (<= 120ms): Perfect sync, zero adjustment, zero clicks
      if (absDiff <= 0.12) {
        if (this.audioElement.playbackRate !== 1.0) {
          this.audioElement.playbackRate = 1.0;
        }
        return;
      }

      // ZONE 2: Soft Phase-Lock Warping (120ms to 1800ms)
      // Micro-adjust playbackRate with pitch preservation: ZERO buffer flushes, ZERO stutter/repeats!
      if (diff > 0) {
        // Lagging behind: gently speed up (max 5%)
        const warp = Math.min(1.05, 1.0 + diff * 0.035);
        this.audioElement.playbackRate = warp;
      } else {
        // Ahead of target: gently slow down (min 0.95)
        const warp = Math.max(0.95, 1.0 + diff * 0.035);
        this.audioElement.playbackRate = warp;
      }
    } else if (track.type === 'youtube') {
      if (this.audioElement) {
        this.audioElement.pause();
      }

      if (!this.ytPlayer || typeof this.ytPlayer.getPlayerState !== 'function') return;

      try {
        const playerState = this.ytPlayer.getPlayerState();
        // If currently buffering (3) or unstarted (-1), do not interrupt the network buffer download!
        if (playerState === 3 || playerState === -1) {
          return;
        }

        const ytCurrentTime = this.ytPlayer.getCurrentTime() || 0;
        const drift = Math.abs(ytCurrentTime - targetPos);

        // When actively playing, lock drift within 0.45s (network speed compensation)
        if (playerState === 1 && (forceSeek || drift > 0.45)) {
          const now = Date.now();
          if (forceSeek || now - (this.lastYtSeekTime || 0) > 1800) {
            this.ytPlayer.seekTo(targetPos, true);
            this.lastYtSeekTime = now;
          }
        }

        if (playbackState.isPlaying) {
          if (playerState !== 1 && playerState !== 3) {
            this.ytPlayer.playVideo();
          }
        } else {
          if (playerState === 1 || playerState === 3) {
            this.ytPlayer.pauseVideo();
          }
          if (drift > 0.25) {
            this.ytPlayer.seekTo(targetPos, true);
          }
        }
      } catch (err) {
        console.warn('YouTube sync error:', err);
      }
    }
  }

  unlockAutoplay() {
    this.autoplayBlocked = false;
    this.resumeAudioContext();
    if (this.onAutoplayBlockedCallback) this.onAutoplayBlockedCallback(false);

    if (this.currentPlaybackState && this.currentPlaybackState.isPlaying) {
      this.applySync(this.currentPlaybackState, true);
    }
  }

  startPeriodicDriftMonitor() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    // Smooth 1-second cadence: applies micro-rate phase lock smoothly
    this.syncInterval = setInterval(() => {
      if (this.currentPlaybackState && this.currentPlaybackState.isPlaying) {
        this.applySync(this.currentPlaybackState, false);
      }
    }, 1000);
  }

  stop() {
    if (this.syncInterval) clearInterval(this.syncInterval);
  }
}

export const audioSyncEngine = new AudioSyncEngine();
