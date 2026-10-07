import React, { useState } from 'react';
import { Eye, EyeOff, Radio, CornerDownRight } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { YouTubePlayer } from './YouTubePlayer';
import { socketService } from '../services/socketService';

export function NowPlayingHero({ playbackState, room }) {
  const [showVideo, setShowVideo] = useState(true);

  const currentTrack = playbackState?.currentTrack;
  const isPlaying = playbackState?.isPlaying || false;
  const trackType = currentTrack?.type || 'none';

  const handleDurationLoaded = (durationSec) => {
    socketService.setDuration(durationSec);
  };

  return (
    <div className="monumental-hero">
      {/* Editorial Eyebrow */}
      <div className="hero-eyebrow">
        <span className="hero-eyebrow-index">
          [ ARCH // FIELD TRANSMISSION 01 ]
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="arch-pill arch-pill-active">
            {isPlaying ? '● KINETIC DRIVE ACTIVE' : '○ DECK ARMED'}
          </span>

          {trackType === 'youtube' && (
            <button
              onClick={() => setShowVideo(!showVideo)}
              className="arch-btn"
              style={{ padding: '4px 10px', fontSize: '0.7rem' }}
              title="Toggle YouTube video / wavefield monitor"
            >
              {showVideo ? <EyeOff size={11} /> : <Eye size={11} />}
              <span>{showVideo ? 'WAVEFIELD' : 'VIDEO MONITOR'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Massive Monumental Headline (Instrument Serif) */}
      <div>
        <h1 className="hero-monumental-title">
          {currentTrack ? (
            <>
              <em>{currentTrack.title.split(' ')[0]}</em>{' '}
              {currentTrack.title.split(' ').slice(1).join(' ') || ''}
            </>
          ) : (
            <>
              <em>Awaiting</em> Acoustic Transmission
            </>
          )}
        </h1>

        <div className="hero-artist-line" style={{ marginTop: '12px' }}>
          <CornerDownRight size={16} style={{ color: 'var(--solar-flare)' }} />
          <span>
            {currentTrack
              ? currentTrack.artistOrChannel || 'Studio Master'
              : 'Drop an audio file or stream URL into the bay below.'}
          </span>

          {currentTrack && (
            <span
              className="arch-pill"
              style={{
                marginLeft: '12px',
                fontSize: '0.68rem',
                color: trackType === 'youtube' ? 'var(--solar-flare)' : 'var(--cyan-beam)'
              }}
            >
              {trackType === 'youtube' ? 'YOUTUBE STREAM' : 'LOCAL AUDIO FLAC/MP3'} // BY {currentTrack.uploaderName || 'OPERATOR'}
            </span>
          )}
        </div>
      </div>

      {/* 3D Kinetic Sonic Wavefield / YouTube Screen */}
      <div className="wavefield-viewport">
        {trackType === 'youtube' && showVideo ? (
          <div style={{ width: '100%', height: '100%' }}>
            <YouTubePlayer
              videoId={currentTrack.url}
              playbackState={playbackState}
              onDurationLoaded={handleDurationLoaded}
            />
          </div>
        ) : (
          <>
            <AudioVisualizer
              isPlaying={isPlaying}
              trackType={trackType}
            />
          </>
        )}
      </div>
    </div>
  );
}
