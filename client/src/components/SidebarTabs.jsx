import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Trash2, Crown, Play } from 'lucide-react';
import { socketService } from '../services/socketService';

export function SidebarTabs({ room, currentUser, playbackState }) {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'chat' | 'listeners'
  const [chatInput, setChatInput] = useState('');
  const chatMessagesEndRef = useRef(null);

  const queue = room?.queue || [];
  const chat = room?.chat || [];
  const users = room?.users || [];
  const currentTrack = playbackState?.currentTrack;

  const isHost = currentUser?.isHost || room?.hostId === socketService.getSocketId();

  useEffect(() => {
    if (activeTab === 'chat') {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat, activeTab]);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketService.sendChat(chatInput);
    setChatInput('');
  };

  const handleRemoveTrack = (trackId) => {
    socketService.removeTrack(trackId);
  };

  return (
    <div className="communal-panel">
      {/* Tab Switchers */}
      <div className="communal-tabs-nav">
        <button
          className={`communal-tab-trigger ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          01 CRATE ({queue.length + (currentTrack ? 1 : 0)})
        </button>

        <button
          className={`communal-tab-trigger ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          02 THE WIRE
        </button>

        <button
          className={`communal-tab-trigger ${activeTab === 'listeners' ? 'active' : ''}`}
          onClick={() => setActiveTab('listeners')}
        >
          03 CREW ({users.length})
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="communal-scroll-area">
        {/* Tab 1: The Crate (Queue) */}
        {activeTab === 'queue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Current Active Track */}
            {currentTrack && (
              <div className="crate-row current-vibe">
                <Play size={13} style={{ color: 'var(--solar-flare)', flexShrink: 0 }} />
                <div className="crate-info">
                  <div className="crate-title">{currentTrack.title}</div>
                  <div className="crate-artist" style={{ color: 'var(--solar-flare)' }}>
                    ACTIVE // {currentTrack.artistOrChannel || 'STREAM'}
                  </div>
                </div>
              </div>
            )}

            {/* Queued Tracks */}
            {queue.map((track, idx) => {
              const canDelete = isHost || track.uploaderId === socketService.getSocketId() || room.mode === 'collaborative';
              return (
                <div key={track.id || idx} className="crate-row">
                  <span className="crate-index">
                    {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>

                  <div className="crate-info">
                    <div className="crate-title">{track.title}</div>
                    <div className="crate-artist">
                      {track.type === 'youtube' ? 'SATELLITE' : 'LOCAL TAPE'} // {track.uploaderName}
                    </div>
                  </div>

                  {canDelete && (
                    <button
                      onClick={() => handleRemoveTrack(track.id)}
                      className="arch-btn"
                      style={{ padding: '4px 8px', fontSize: '0.68rem' }}
                      title="Eject track"
                    >
                      <Trash2 size={12} style={{ color: 'var(--solar-flare)' }} />
                    </button>
                  )}
                </div>
              );
            })}

            {!currentTrack && queue.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--mercury-dark)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                  CRATE EMPTY
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', marginTop: '6px' }}>
                  Inject stream or audio file to begin transmission.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: The Wire (Chat) */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chat.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-wire-message ${msg.isSystem ? 'system' : ''}`}
                >
                  {!msg.isSystem && (
                    <span className="chat-wire-sender">
                      [{msg.senderName}]:
                    </span>
                  )}
                  <span>{msg.text}</span>
                </div>
              ))}
              <div ref={chatMessagesEndRef} />
            </div>

            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="TRANSMIT MESSAGE ON WIRE..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="arch-input"
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                maxLength={300}
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="arch-btn arch-btn-primary"
                style={{ padding: '8px 14px' }}
              >
                <ArrowRight size={14} />
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Session Crew */}
        {activeTab === 'listeners' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  border: '1px solid var(--hairline)',
                  background: 'rgba(255, 255, 255, 0.015)'
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    border: '1px solid var(--hairline-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    color: 'var(--mercury)'
                  }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--mercury)' }}>
                    {u.name} {u.id === socketService.getSocketId() ? '(YOU)' : ''}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--mercury-dark)' }}>
                    {u.isHost ? 'OPERATOR // HOST' : 'TETHERED LISTENER'}
                  </div>
                </div>

                {u.isHost && (
                  <Crown size={14} style={{ color: 'var(--solar-flare)' }} title="Room Operator" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
