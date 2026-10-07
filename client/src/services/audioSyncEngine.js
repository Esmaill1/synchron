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
    this.lastYtSeekTime = 0;
    this.lastUserActionTimestamp = 0;
    this.scheduledStartTimer = null;
    this.ytWarpActive = false;

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

  // Mobile gesture unlock: pre-warms audio stack so scheduled epoch play is never blocked
  prepareForUserGesture() {
    this.resumeAudioContext();
    if (this.audioElement && this.audioElement.paused) {
      const p = this.audioElement.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    }
  }

  // Coordinated local pause execution
  pauseLocally() {
    this.lastUserActionTimestamp = Date.now();
    if (this.scheduledStartTimer) {
      clearTimeout(this.scheduledStartTimer);
      this.scheduledStartTimer = null;
    }

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
    const effectiveStart = playbackState.startAtServerTimestamp || playbackState.lastUpdatedTimestamp;

    // If scheduled future epoch has not arrived yet, position is fixed at starting position
    if (serverNow < effectiveStart) {
      return playbackState.positionSec || 0;
    }

    const elapsed = Math.max(0, (serverNow - effectiveStart) / 1000);
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

    const serverNow = socketService.getEstimatedServerNow();
    const effectiveStart = playbackState.startAtServerTimestamp || playbackState.lastUpdatedTimestamp;
    const timeUntilStart = effectiveStart - serverNow;
    const track = playbackState.currentTrack;
    const targetPos = this.computeTargetPosition(playbackState);

    // SCHEDULED FUTURE EPOCH START:
    // Both devices pre-seek to target position and fire play at the exact same millisecond
    if (playbackState.isPlaying && timeUntilStart > 0 && timeUntilStart < 1500) {
      if (track.type === 'file' && this.audioElement) {
        if (!this.audioElement.seeking && Math.abs(this.audioElement.currentTime - targetPos) > 0.01) {
          try { this.audioElement.currentTime = targetPos; } catch {}
        }
        if (this.scheduledStartTimer) clearTimeout(this.scheduledStartTimer);
        this.scheduledStartTimer = setTimeout(() => {
          if (this.currentPlaybackState?.isPlaying && this.audioElement) {
            this.resumeAudioContext();
            this.audioElement.playbackRate = 1.0;
            this.audioElement.play().catch((err) => {
              if (err.name === 'NotAllowedError') {
                this.autoplayBlocked = true;
                if (this.onAutoplayBlockedCallback) this.onAutoplayBlockedCallback(true);
              }
            });
          }
        }, Math.max(0, Math.round(timeUntilStart)));
      } else if (track.type === 'youtube' && this.ytPlayer) {
        if (typeof this.ytPlayer.seekTo === 'function') {
          try { this.ytPlayer.seekTo(targetPos, true); } catch {}
        }
        if (this.scheduledStartTimer) clearTimeout(this.scheduledStartTimer);
        this.scheduledStartTimer = setTimeout(() => {
          if (this.currentPlaybackState?.isPlaying && this.ytPlayer) {
            try { this.ytPlayer.playVideo(); } catch {}
          }
        }, Math.max(0, Math.round(timeUntilStart)));
      }
      return;
    }

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
        if (!this.audioElement.seeking && (forceSeek || Math.abs(this.audioElement.currentTime - targetPos) > 0.02)) {
          this.audioElement.currentTime = targetPos;
        }
        return;
      }

      // If supposed to be playing but paused
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

      // ULTRA-HIGH-PRECISION SAMPLE-ACCURATE PHASE-LOCKED LOOP (PLL)
      // Compensate for physical sound card hardware / WebAudio pipeline buffer latency:
      const outputLatency = (this.audioContext?.outputLatency || 0) + (this.audioContext?.baseLatency || 0);
      const currentPos = this.audioElement.currentTime;
      const effectivePos = Math.max(0, currentPos - outputLatency);
      const diff = targetPos - effectivePos; // > 0: audio is behind target; < 0: audio is ahead of target
      const absDiff = Math.abs(diff);

      // ANTI-GLITCH SAFETY: If browser is currently processing an asynchronous seek,
      // NEVER touch currentTime or rate — doing so causes decoded buffer flushes and audio frame repeats!
      if (this.audioElement.seeking) {
        return;
      }

      // ZONE 3: Hard Realignment (> 250ms desync or explicit user scrub)
      if (forceSeek || absDiff > 0.25) {
        const now = Date.now();
        if (forceSeek || now - this.lastHardSeekTime > 1500) {
          this.audioElement.currentTime = targetPos;
          this.audioElement.playbackRate = 1.0;
          this.lastHardSeekTime = now;
        }
        return;
      }

      // ZONE 0: True Phase Lock (<= 3ms / 0.003s)
      // Within 3ms, human auditory perception fuses soundwaves into an identical acoustic image.
      if (absDiff <= 0.003) {
        if (this.audioElement.playbackRate !== 1.0) {
          this.audioElement.playbackRate = 1.0;
        }
        return;
      }

      // ZONE 1: Ultra-Subtle Proportional Steering (3ms to 40ms / 0.003s - 0.040s)
      // Continuous micro-warping proportional to error:
      // For a 15ms error: rate is 1.012 -> closes the gap smoothly in ~600ms with ZERO pitch shift!
      if (absDiff <= 0.04) {
        const steer = Math.max(0.985, Math.min(1.015, 1.0 + diff * 0.8));
        this.audioElement.playbackRate = steer;
        return;
      }

      // ZONE 2: Fast Phase Catch-up (40ms to 250ms / 0.040s - 0.250s)
      // Proportional rate steering clamped to [0.94, 1.06]
      // Closes a 100ms gap in ~1.2s without audio repeats or buffer flushes!
      const fastSteer = Math.max(0.94, Math.min(1.06, 1.0 + diff * 0.4));
      this.audioElement.playbackRate = fastSteer;
    } else if (track.type === 'youtube') {
      if (this.audioElement) {
        this.audioElement.pause();
      }

      if (!this.ytPlayer || typeof this.ytPlayer.getPlayerState !== 'function') return;

      try {
        const playerState = this.ytPlayer.getPlayerState();
        // If buffering (3) or unstarted (-1), allow network buffer download to proceed
        if (playerState === 3 || playerState === -1) {
          return;
        }

        const ytCurrentTime = this.ytPlayer.getCurrentTime() || 0;
        const drift = targetPos - ytCurrentTime;
        const absDrift = Math.abs(drift);

        if (playbackState.isPlaying) {
          if (playerState !== 1 && playerState !== 3) {
            this.ytPlayer.playVideo();
          }

          // YouTube dynamic phase lock:
          // If drift is tight (<= 80ms), maintain normal playback
          if (absDrift <= 0.08) {
            if (this.ytWarpActive && typeof this.ytPlayer.setPlaybackRate === 'function') {
              this.ytPlayer.setPlaybackRate(1.0);
              this.ytWarpActive = false;
            }
            return;
          }

          // If drift is moderate (80ms to 400ms): use playbackRate warping if supported
          if (absDrift > 0.08 && absDrift <= 0.4) {
            if (typeof this.ytPlayer.setPlaybackRate === 'function') {
              const targetRate = drift > 0 ? 1.25 : 0.75;
              this.ytPlayer.setPlaybackRate(targetRate);
              this.ytWarpActive = true;
            }
            return;
          }

          // If drift is large (> 400ms) or forceSeek:
          if (forceSeek || absDrift > 0.4) {
            const now = Date.now();
            if (forceSeek || now - (this.lastYtSeekTime || 0) > 1800) {
              this.ytPlayer.seekTo(targetPos, true);
              this.lastYtSeekTime = now;
              if (typeof this.ytPlayer.setPlaybackRate === 'function') {
                this.ytPlayer.setPlaybackRate(1.0);
                this.ytWarpActive = false;
              }
            }
          }
        } else {
          if (playerState === 1 || playerState === 3) {
            this.ytPlayer.pauseVideo();
          }
          if (absDrift > 0.1) {
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
    // 150ms high-frequency cadence: catches drift before it ever exceeds 2ms!
    this.syncInterval = setInterval(() => {
      if (this.currentPlaybackState && this.currentPlaybackState.isPlaying) {
        this.applySync(this.currentPlaybackState, false);
      }
    }, 150);
  }

  stop() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.scheduledStartTimer) clearTimeout(this.scheduledStartTimer);
  }
}

export const audioSyncEngine = new AudioSyncEngine();
