import React, { useState, useEffect } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { socketService } from '../services/socketService';

export function LobbyScreen({ onJoinedRoom }) {
  const [mode, setMode] = useState('join'); // 'create' | 'join'
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomMode, setRoomMode] = useState('collaborative'); // 'collaborative' | 'host-only'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomId(roomParam.trim());
      setMode('join');
    }
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Operator callsign is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await socketService.createRoom(
        roomName.trim() || `${userName}'s Acoustic Field`,
        userName.trim(),
        roomMode
      );

      if (res && res.success) {
        onJoinedRoom(res.room, res.room.users.find((u) => u.id === socketService.getSocketId()));
      } else {
        setError(res?.error || 'Field initialization failed');
      }
    } catch (err) {
      setError(err.message || 'Signal link error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Operator callsign is required');
      return;
    }
    if (!roomId.trim()) {
      setError('Station frequency code is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await socketService.joinRoom(roomId.trim(), userName.trim());

      if (res && res.success) {
        onJoinedRoom(res.room, res.user);
      } else {
        setError(res?.error || 'Frequency not found or transmission ended.');
      }
    } catch (err) {
      setError(err.message || 'Signal link error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="entrance-viewport">
      <div className="entrance-monolith-box">
        {/* Monolith Headline */}
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--solar-flare)',
              letterSpacing: '0.15em',
              marginBottom: '10px'
            }}
          >
            [ PROTOCOL // ACOUSTIC SYNCHRONIZATION ]
          </div>

          <h1 className="entrance-hero-type">
            <em>Synchron</em> Field
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--mercury-dim)',
              marginTop: '12px',
              lineHeight: '1.6'
            }}
          >
            Communal audio transmission platform with sub-second synchronization across listeners.
          </p>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--hairline)', paddingBottom: '16px' }}>
          <button
            className={`arch-btn ${mode === 'join' ? 'arch-btn-primary' : ''}`}
            onClick={() => { setMode('join'); setError(null); }}
          >
            01 TUNE TO FREQUENCY
          </button>
          <button
            className={`arch-btn ${mode === 'create' ? 'arch-btn-primary' : ''}`}
            onClick={() => { setMode('create'); setError(null); }}
          >
            02 INITIALIZE FIELD
          </button>
        </div>

        {error && (
          <div
            style={{
              borderLeft: '2px solid var(--solar-flare)',
              padding: '8px 12px',
              color: 'var(--solar-flare)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              background: 'rgba(255, 56, 0, 0.05)'
            }}
          >
            ERROR // {error}
          </div>
        )}

        {/* Join Screen */}
        {mode === 'join' ? (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--mercury-dim)' }}>
                STATION CODE
              </label>
              <input
                type="text"
                placeholder="e.g. beat-3334"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toLowerCase())}
                className="arch-input"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--mercury-dim)' }}>
                OPERATOR CALLSIGN
              </label>
              <input
                type="text"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="arch-input"
                required
                maxLength={24}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="arch-btn arch-btn-primary"
              style={{ width: '100%', padding: '14px', marginTop: '8px' }}
            >
              {loading ? <Loader2 size={15} className="spinning-platter" /> : <ArrowRight size={15} />}
              LOCK FREQUENCY & ENTER
            </button>
          </form>
        ) : (
          /* Create Screen */
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--mercury-dim)' }}>
                FIELD DESIGNATION (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. Kyoto Midnight Hall"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="arch-input"
                maxLength={32}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--mercury-dim)' }}>
                CHIEF OPERATOR CALLSIGN
              </label>
              <input
                type="text"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="arch-input"
                required
                maxLength={24}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--mercury-dim)' }}>
                PERMISSION SCHEME
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setRoomMode('collaborative')}
                  className={`arch-btn ${roomMode === 'collaborative' ? 'arch-btn-primary' : ''}`}
                >
                  OPEN FIELD
                </button>
                <button
                  type="button"
                  onClick={() => setRoomMode('host-only')}
                  className={`arch-btn ${roomMode === 'host-only' ? 'arch-btn-primary' : ''}`}
                >
                  SOLO LOCK
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="arch-btn arch-btn-primary"
              style={{ width: '100%', padding: '14px', marginTop: '8px' }}
            >
              {loading ? <Loader2 size={15} className="spinning-platter" /> : <ArrowRight size={15} />}
              INITIALIZE ACOUSTIC FIELD
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
