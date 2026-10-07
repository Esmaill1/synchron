import React from 'react';
import { Volume2, Sparkles, Radio } from 'lucide-react';
import { audioSyncEngine } from '../services/audioSyncEngine';

export function AutoplayBanner({ isBlocked, onUnlock }) {
  if (!isBlocked) return null;

  const handleClick = () => {
    audioSyncEngine.unlockAutoplay();
    if (onUnlock) onUnlock();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(9, 11, 16, 0.92)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={handleClick}
    >
      <div
        className="console-panel machined-card"
        style={{
          padding: '36px',
          maxWidth: '460px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '18px',
          background: 'linear-gradient(180deg, #161b26 0%, #0c0f16 100%)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 30px var(--tube-amber-glow)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #ffaf38 0%, #e68228 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 25px var(--tube-amber-glow)'
          }}
        >
          <Radio size={32} style={{ color: '#090b10' }} />
        </div>

        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--tube-amber)',
              letterSpacing: '1px'
            }}
          >
            TRANSMISSION ACTIVE
          </div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.6rem',
              fontWeight: 800,
              color: 'var(--text-white)',
              marginTop: '4px'
            }}
          >
            TUNE IN TO AUDIO
          </h3>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.5' }}>
          Browser audio gatekeeper active. Tap below to unlock the synchronized audio channel and live CRT oscilloscope.
        </p>

        <button
          onClick={handleClick}
          className="tactile-btn tactile-btn-amber"
          style={{ width: '100%', padding: '14px', fontSize: '0.9rem' }}
        >
          <Sparkles size={16} />
          UNLOCK TRANSMISSION
        </button>
      </div>
    </div>
  );
}
