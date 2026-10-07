import { socketService } from './socketService';

class AudioSyncEngine {
  constructor() {
    this.audioElement = null;
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.ytPlayer = null;

    this.currentPlaybackState = null;
    this.volume = 0.8;
    this.isMuted = false;
    this.autoplayBlocked = false;

    this.onAutoplayBlockedCallback = null;
    this.onPlaybackTimeUpdateCallback = null;
    this.onTrackEndedCallback = null;

    this.syncInterval = null;
  }

  initAudioElement(element) {
    if (this.audioElement === element) return;
    this.audioElement = element;
    this.audioElement.crossOrigin = 'anonymous';
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
      this.audioContext.resume();
    }
  }

  computeTargetPosition(playbackState) {
    if (!playbackState || !playbackState.currentTrack) return 0;
    if (!playbackState.isPlaying) {
      return playbackState.positionSec || 0;
    }
    const serverNow = socketService.getEstimatedServerNow();
    const elapsed = (serverNow - playbackState.lastUpdatedTimestamp) / 1000;
    let target = (playbackState.positionSec || 0) + elapsed;
    if (playbackState.duration > 0 && target > playbackState.duration) {
      target = playbackState.duration;
    }
    return Math.max(0, target);
  }

  applySync(playbackState, forceSeek = false) {
    this.currentPlaybackState = playbackState;
    if (!playbackState || !playbackState.currentTrack) {
      // No active track
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.src = '';
      }
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
      return;
    }

    const track = playbackState.currentTrack;
    const targetPos = this.computeTargetPosition(playbackState);

    if (track.type === 'file') {
      // Pause YouTube if it was playing
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        try { this.ytPlayer.pauseVideo(); } catch {}
      }

      if (!this.audioElement) return;

      const baseUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const fullMediaUrl = track.url.startsWith('http') ? track.url : `${baseUrl}${track.url}`;
      if (this.audioElement.src !== fullMediaUrl) {
        this.audioElement.src = fullMediaUrl;
        this.audioElement.currentTime = targetPos;
      }

      const drift = Math.abs(this.audioElement.currentTime - targetPos);

      if (forceSeek || drift > 1.25) {
        this.audioElement.currentTime = targetPos;
      }

      if (playbackState.isPlaying) {
        this.resumeAudioContext();
        const playPromise = this.audioElement.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              this.autoplayBlocked = true;
              if (this.onAutoplayBlockedCallback) this.onAutoplayBlockedCallback(true);
            }
          });
        }
      } else {
        this.audioElement.pause();
      }
    } else if (track.type === 'youtube') {
      // Pause HTML5 audio
      if (this.audioElement) {
        this.audioElement.pause();
      }

      if (!this.ytPlayer || typeof this.ytPlayer.getPlayerState !== 'function') return;

      try {
        const ytCurrentTime = this.ytPlayer.getCurrentTime() || 0;
        const drift = Math.abs(ytCurrentTime - targetPos);

        if (forceSeek || drift > 1.4) {
          this.ytPlayer.seekTo(targetPos, true);
        }

        if (playbackState.isPlaying) {
          this.ytPlayer.playVideo();
        } else {
          this.ytPlayer.pauseVideo();
        }
      } catch (err) {
        console.warn('YouTube sync error:', err);
      }
    }
  }

  // Triggered when user clicks anywhere after autoplay restriction
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
    this.syncInterval = setInterval(() => {
      if (this.currentPlaybackState && this.currentPlaybackState.isPlaying) {
        this.applySync(this.currentPlaybackState, false);
      }
    }, 4000);
  }

  stop() {
    if (this.syncInterval) clearInterval(this.syncInterval);
  }
}

export const audioSyncEngine = new AudioSyncEngine();
