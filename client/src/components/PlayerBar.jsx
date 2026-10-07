import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Lock } from 'lucide-react';
import { socketService } from '../services/socketService';
import { audioSyncEngine } from '../services/audioSyncEngine';

function formatMonoTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function PlayerBar({ playbackState, room, currentUser }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  const isHost = currentUser?.isHost || room?.hostId === socketService.getSocketId();
  const canControl = room?.mode === 'collaborative' || isHost;
  const isPlaying = playbackState?.isPlaying || false;
  const duration = playbackState?.duration || playbackState?.currentTrack?.durationSec || 0;

  useEffect(() => {
    const updateTime = () => {
      if (isSeeking) return;
      if (!playbackState || !playbackState.currentTrack) {
        setCurrentTime(0);
        return;
      }
      const pos = audioSyncEngine.computeTargetPosition(playbackState);
      setCurrentTime(pos);
    };

    updateTime();
    const interval = setInterval(updateTime, 250);
    return () => clearInterval(interval);
  }, [playbackState, isSeeking]);

  const handlePlayPause = () => {
    if (!canControl) return;
    if (isPlaying) {
      const pausedPos = audioSyncEngine.pauseLocally();
      setCurrentTime(pausedPos);
      socketService.pause(pausedPos);
    } else {
      audioSyncEngine.prepareForUserGesture();
      const targetPos = audioSyncEngine.computeTargetPosition(playbackState) || currentTime;
      socketService.play(targetPos);
    }
  };

  const handleNext = () => {
    if (!canControl) return;
    socketService.nextTrack();
  };

  const handleSeekChange = (e) => {
    if (!canControl) return;
    setIsSeeking(true);
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekCommit = () => {
    if (!canControl) return;
    setIsSeeking(false);
    socketService.seek(seekValue);
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    audioSyncEngine.setVolume(newVol);
    if (isMuted && newVol > 0) {
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    const muted = audioSyncEngine.toggleMute();
    setIsMuted(muted);
  };

  const displayTime = isSeeking ? seekValue : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;

  return (
    <div className="sculptural-transport">
      {/* Timecode & Hairline Progress Bar */}
      <div className="timecode-rail-row">
        <span className="timecode-num">{formatMonoTime(displayTime)}</span>

        <div className="hairline-scrubber-track">
          <div className="hairline-rail-bg">
            <div
              className="hairline-rail-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="hairline-rail-handle"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={displayTime}
            disabled={!canControl || !playbackState?.currentTrack}
            onChange={handleSeekChange}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            className="hairline-scrub-input"
            title={canControl ? 'Scrub timeline' : 'Host lock active'}
          />
        </div>

        <span className="timecode-num timecode-num-total">{formatMonoTime(duration)}</span>
      </div>

      {/* Transport Controls Row */}
      <div className="transport-actions-row">
        <div className="transport-glyphs-group">
          {/* Monumental Sculptural Play Button */}
          <button
            onClick={handlePlayPause}
            disabled={!canControl || !playbackState?.currentTrack}
            className="btn-glyph-master"
            title={
              !canControl
                ? 'Host controls locked'
                : isPlaying
                ? 'Halt (Sync All)'
                : 'Play (Sync All)'
            }
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: '4px' }} />}
          </button>

          {/* Cue Next Track */}
          <button
            onClick={handleNext}
            disabled={!canControl || !playbackState?.currentTrack}
            className="btn-glyph-secondary"
            title={canControl ? 'Cue next track' : 'Host lock active'}
          >
            <SkipForward size={18} />
          </button>

          {!canControl && (
            <span className="arch-pill arch-pill-active" style={{ fontSize: '0.7rem' }}>
              <Lock size={11} /> HOST CONTROL ONLY
            </span>
          )}
        </div>

        {/* Minimal Audio Level Slider */}
        <div className="volume-level-block">
          <button
            onClick={handleToggleMute}
            className="btn-glyph-secondary"
            style={{ width: '36px', height: '36px' }}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="volume-slider-line"
            title="Local monitor level"
          />

          <span
            className="timecode-num"
            style={{ fontSize: '0.78rem', minWidth: '34px', textAlign: 'right' }}
          >
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
