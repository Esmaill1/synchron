import React, { useEffect, useRef } from 'react';
import { audioSyncEngine } from '../services/audioSyncEngine';

export function AudioVisualizer({ isPlaying, trackType }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let angle = 0;
    let pulse = 0;

    const ringCount = 14;
    const pointsPerRing = 48;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      // Dark velvet void background
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#08090d';
      ctx.fillRect(0, 0, width, height);

      // Subtle architectural crosshair lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      const analyser = audioSyncEngine.analyser;

      let freqData = null;
      let energy = 0;

      if (trackType === 'file' && analyser && isPlaying) {
        freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < 30; i++) sum += freqData[i];
        energy = (sum / 30) / 255;
      } else if (isPlaying) {
        energy = 0.45 + Math.sin(angle * 3) * 0.2;
      }

      angle += isPlaying ? 0.015 + energy * 0.02 : 0.005;
      pulse += isPlaying ? 0.04 : 0.01;

      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(width, height) * 0.44;

      // --- 3D TOPOLOGICAL SONIC WAVEFIELD ---
      ctx.save();

      for (let r = 0; r < ringCount; r++) {
        const ringProgress = (r + 1) / ringCount;
        const baseRadius = ringProgress * maxRadius;

        // Extract frequency slice for this ring
        let ringAmp = 0;
        if (freqData) {
          const sliceIndex = Math.floor(ringProgress * (freqData.length / 4));
          ringAmp = (freqData[sliceIndex] || 0) / 255;
        } else {
          ringAmp = energy * Math.sin(r * 0.4 + pulse);
        }

        ctx.beginPath();

        // Color gradient from center to outer ring: solar flare to mercury white
        const alpha = Math.max(0.1, ringProgress * (isPlaying ? 0.85 : 0.4));
        if (r < 3) {
          ctx.strokeStyle = `rgba(255, 56, 0, ${alpha * 1.2})`;
          ctx.shadowColor = '#ff3800';
          ctx.shadowBlur = isPlaying ? 16 : 4;
        } else {
          ctx.strokeStyle = `rgba(244, 245, 248, ${alpha * 0.55})`;
          ctx.shadowBlur = 0;
        }

        ctx.lineWidth = r === 0 ? 2 : 1;

        for (let p = 0; p <= pointsPerRing; p++) {
          const theta = (p / pointsPerRing) * Math.PI * 2;

          // 3D Perspective Tilt projection
          const rotAngle = theta + angle * (r % 2 === 0 ? 1 : -1);

          // Harmonic perturbation
          const harmonic = Math.sin(rotAngle * 6 + pulse) * Math.cos(rotAngle * 3 - pulse);
          const displacement = ringAmp * (18 + r * 3) * harmonic;

          const currentR = baseRadius + displacement;

          // Isometric 3D tilt: compress Y axis
          const x = centerX + Math.cos(rotAngle) * currentR;
          const y = centerY + Math.sin(rotAngle) * currentR * 0.58;

          if (p === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.closePath();
        ctx.stroke();
      }

      ctx.restore();

      // Center Solar Flare Core
      ctx.beginPath();
      const coreRadius = 4 + energy * 8;
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3800';
      ctx.shadowColor = '#ff3800';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Architectural Telemetry Coordinates in corners of canvas
      ctx.font = '10px "Space Mono", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'left';
      ctx.fillText(
        isPlaying ? '[ FIELD // RESONANCE LOCK ACTIVE ]' : '[ FIELD // STANDBY HARMONIC ]',
        20,
        28
      );

      ctx.textAlign = 'right';
      ctx.fillText(
        `[ TRANSIENT ENERGY: ${(energy * 100).toFixed(1)}% ]`,
        width - 20,
        28
      );

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isPlaying, trackType]);

  return (
    <canvas
      ref={canvasRef}
      className="wavefield-canvas"
      style={{ display: 'block' }}
    />
  );
}
