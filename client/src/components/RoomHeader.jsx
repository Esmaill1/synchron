import React, { useState, useEffect } from 'react';
import { Check, Copy, Shield, Crown, Radio } from 'lucide-react';
import { socketService } from '../services/socketService';

export function RoomHeader({ room, currentUser }) {
  const [copied, setCopied] = useState(false);
  const [latency, setLatency] = useState(12);

  const isHost = currentUser?.isHost || room?.hostId === socketService.getSocketId();

  useEffect(() => {
    const updateLatency = () => {
      setLatency(socketService.getLatency() || 12);
    };
    const interval = setInterval(updateLatency, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleToggleMode = () => {
    if (!isHost) return;
    const newMode = room.mode === 'host-only' ? 'collaborative' : 'host-only';
    socketService.setMode(newMode);
  };

  return (
    <header className="arch-header">
      {/* Brand Monolith */}
      <div className="brand-monolith">
        <span className="brand-logotype">SYNCHRON</span>
        <span className="brand-station-tag">
          // STATION [#{room?.id}]
        </span>
      </div>

      {/* Header Telemetry Cluster */}
      <div className="header-telemetry-cluster">
        {/* Latency Telemetry */}
        <div className="arch-pill arch-pill-active" title="Sub-second transmission sync">
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--solar-flare)',
              boxShadow: '0 0 8px var(--solar-flare)'
            }}
          />
          <span>SYNC LOCK [±{latency}MS]</span>
        </div>

        {/* Copy Tether Link */}
        <button
          onClick={handleCopyLink}
          className="arch-btn"
          title="Copy broadcast tether link"
        >
          {copied ? <Check size={12} style={{ color: 'var(--solar-flare)' }} /> : <Copy size={12} />}
          <span>{copied ? 'TETHER COPIED' : 'TETHER CREW'}</span>
        </button>

        {/* Mode Switch */}
        {isHost ? (
          <button
            onClick={handleToggleMode}
            className={`arch-btn ${room?.mode === 'host-only' ? '' : 'arch-btn-primary'}`}
            title="Toggle between Solo Lock and Open Field"
          >
            <Shield size={12} />
            <span>MODE // {room?.mode === 'host-only' ? 'SOLO LOCK' : 'OPEN FIELD'}</span>
          </button>
        ) : (
          <div className="arch-pill">
            <Shield size={12} />
            <span>MODE // {room?.mode === 'host-only' ? 'SOLO LOCK' : 'OPEN FIELD'}</span>
          </div>
        )}

        {/* Operator Tag */}
        {currentUser && (
          <div className="arch-pill" style={{ color: 'var(--mercury)' }}>
            {isHost && <Crown size={12} style={{ color: 'var(--solar-flare)' }} />}
            <span>OPERATOR [{currentUser.name.toUpperCase()}]</span>
          </div>
        )}
      </div>
    </header>
  );
}
