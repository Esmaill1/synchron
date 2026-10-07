import React, { useEffect, useRef } from 'react';
import { audioSyncEngine } from '../services/audioSyncEngine';
import { socketService } from '../services/socketService';

let isApiLoading = false;
let isApiLoaded = false;

function loadYouTubeApi() {
  if (isApiLoaded || window.YT) {
    isApiLoaded = true;
    return Promise.resolve(window.YT);
  }

  return new Promise((resolve) => {
    if (isApiLoading) {
      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          isApiLoaded = true;
          resolve(window.YT);
        }
      }, 100);
      return;
    }

    isApiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      isApiLoaded = true;
      resolve(window.YT);
    };
  });
}

export function YouTubePlayer({ videoId, playbackState, onDurationLoaded }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;

    loadYouTubeApi().then((YT) => {
      if (!isMounted || !containerRef.current) return;

      // If player already exists, load new video
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        const targetPos = audioSyncEngine.computeTargetPosition(playbackState);
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: targetPos
        });
        if (!playbackState.isPlaying) {
          playerRef.current.pauseVideo();
        }
        return;
      }

      // Create new player
      const player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            playerRef.current = event.target;
            audioSyncEngine.setYouTubePlayer(event.target);

            const duration = event.target.getDuration();
            if (duration && onDurationLoaded) {
              onDurationLoaded(duration);
            }

            audioSyncEngine.applySync(playbackState, true);
          },
          onStateChange: (event) => {
            // YT.PlayerState.PLAYING is 1 (Video finished buffering and started outputting frames)
            if (event.data === 1) {
              if (playbackState && playbackState.isPlaying) {
                const targetPos = audioSyncEngine.computeTargetPosition(playbackState);
                const actualPos = event.target.getCurrentTime() || 0;
                const drift = Math.abs(targetPos - actualPos);
                // If user's internet took extra seconds to buffer, snap to room clock:
                if (drift > 0.25) {
                  event.target.seekTo(targetPos, true);
                }
              } else if (playbackState && !playbackState.isPlaying) {
                event.target.pauseVideo();
              }
            }

            // YT.PlayerState.ENDED is 0
            if (event.data === 0) {
              if (playbackState?.currentTrack) {
                socketService.trackEnded(playbackState.currentTrack.id);
              }
            }
          },
          onError: (err) => {
            console.warn('YouTube Player error code:', err.data);
          }
        }
      });
    });

    return () => {
      isMounted = false;
    };
  }, [videoId]);

  // Sync state changes
  useEffect(() => {
    if (playerRef.current) {
      audioSyncEngine.applySync(playbackState, false);
    }
  }, [playbackState]);

  return (
    <div className="youtube-wrapper">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
