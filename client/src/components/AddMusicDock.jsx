import React, { useState, useRef } from 'react';
import { UploadCloud, Plus, Loader2, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { socketService } from '../services/socketService';

export function AddMusicDock({ currentUser }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'youtube'

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // YouTube state
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytPreview, setYtPreview] = useState(null);
  const [ytError, setYtError] = useState(null);

  const handleFileUpload = async (file) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(20);
    setUploadSuccess(null);
    setUploadError(null);

    try {
      let duration = 0;
      try {
        const objectUrl = URL.createObjectURL(file);
        const tempAudio = new Audio(objectUrl);
        await new Promise((resolve) => {
          tempAudio.addEventListener('loadedmetadata', () => {
            duration = Math.round(tempAudio.duration);
            URL.revokeObjectURL(objectUrl);
            resolve();
          });
          tempAudio.addEventListener('error', () => {
            URL.revokeObjectURL(objectUrl);
            resolve();
          });
          setTimeout(resolve, 2000);
        });
      } catch (e) {
        console.warn('Metadata duration read warning:', e);
      }

      setUploadProgress(50);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('duration', duration.toString());
      formData.append('uploader', currentUser?.name || 'Anonymous');

      const baseUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      setUploadProgress(90);

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ingestion failed');
      }

      setUploadProgress(100);
      setUploadSuccess(`INGESTED // "${data.track.title}" ADDED TO CRATE`);

      await socketService.addTrack(data.track);

      setTimeout(() => {
        setUploadSuccess(null);
        setUploadProgress(0);
      }, 3000);
    } catch (err) {
      console.error('File upload error:', err);
      setUploadError(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFetchYouTube = async (e) => {
    e?.preventDefault();
    if (!ytUrl.trim()) return;

    setYtLoading(true);
    setYtError(null);
    setYtPreview(null);

    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || '';
      const res = await fetch(`${baseUrl}/api/youtube-info?url=${encodeURIComponent(ytUrl.trim())}&uploader=${encodeURIComponent(currentUser?.name || 'Anonymous')}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resolve stream link');
      }

      setYtPreview(data.track);
    } catch (err) {
      setYtError(err.message || 'Stream link unavailable');
    } finally {
      setYtLoading(false);
    }
  };

  const handleAddYouTubeTrack = async () => {
    if (!ytPreview) return;
    try {
      await socketService.addTrack(ytPreview);
      setYtUrl('');
      setYtPreview(null);
    } catch (err) {
      setYtError('Failed to inject into queue');
    }
  };

  return (
    <div className="ingestion-minimal-dock">
      {/* Dock Header */}
      <div className="dock-header-bar">
        <span className="dock-title-label">
          [ INGESTION BAY // CHANNEL INPUT ]
        </span>

        <div className="dock-tab-switches">
          <button
            className={`dock-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            01 LOCAL AUDIO
          </button>
          <button
            className={`dock-tab-btn ${activeTab === 'youtube' ? 'active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            02 SATELLITE (YT)
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      {activeTab === 'upload' && (
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
            style={{ display: 'none' }}
          />

          <div
            className={`drop-stream-box ${isDragOver ? 'active-drag' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={24} className="spinning-platter" style={{ color: 'var(--solar-flare)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  INGESTING AUDIO ({uploadProgress}%)...
                </span>
              </div>
            ) : uploadSuccess ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--solar-flare)' }}>
                <CheckCircle2 size={18} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{uploadSuccess}</span>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', letterSpacing: '0.04em' }}>
                  + DROP AUDIO TAPE OR CLICK TO BROWSE
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--mercury-dark)' }}>
                  SUPPORTS LOSSLESS FLAC, WAV, MP3, OGG, AAC (MAX 50MB)
                </div>
              </>
            )}
          </div>

          {uploadError && (
            <div style={{ color: 'var(--solar-flare)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '6px' }}>
              ERROR // {uploadError}
            </div>
          )}
        </div>
      )}

      {/* YouTube Zone */}
      {activeTab === 'youtube' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <form onSubmit={handleFetchYouTube} className="stream-input-form">
            <input
              type="text"
              placeholder="PASTE YOUTUBE OR MUSIC STREAM URL..."
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="arch-input"
            />
            <button
              type="submit"
              disabled={ytLoading || !ytUrl.trim()}
              className="arch-btn arch-btn-primary"
            >
              {ytLoading ? <Loader2 size={14} className="spinning-platter" /> : <ArrowUpRight size={14} />}
              RESOLVE
            </button>
          </form>

          {ytError && (
            <div style={{ color: 'var(--solar-flare)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              ERROR // {ytError}
            </div>
          )}

          {ytPreview && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px',
                border: '1px solid var(--hairline-strong)',
                background: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              {ytPreview.thumbnailUrl && (
                <img
                  src={ytPreview.thumbnailUrl}
                  alt={ytPreview.title}
                  style={{
                    width: '84px',
                    height: '48px',
                    objectFit: 'cover'
                  }}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {ytPreview.title}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--solar-flare)' }}>
                  CHANNEL // {ytPreview.artistOrChannel}
                </div>
              </div>

              <button onClick={handleAddYouTubeTrack} className="arch-btn arch-btn-primary">
                INJECT INTO CRATE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
