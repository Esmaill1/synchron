import React, { useState, useEffect } from 'react';
import { socketService } from '../services/socketService';

const RESONANCES = [
  'RESONATE',
  'PULSE',
  'OVERDRIVE',
  'FLUX',
  'VORTEX',
  'ASCEND',
  'SUBLIME',
  'ECLIPSE'
];

export function FloatingReactions() {
  const [activeParticles, setActiveParticles] = useState([]);

  useEffect(() => {
    const handleReaction = ({ id, emoji, senderName }) => {
      const randomLeft = 14 + Math.random() * 72;
      const particle = {
        id: id || `${Date.now()}-${Math.random()}`,
        text: emoji,
        left: randomLeft,
        senderName
      };

      setActiveParticles((prev) => [...prev, particle]);

      setTimeout(() => {
        setActiveParticles((prev) => prev.filter((p) => p.id !== particle.id));
      }, 2800);
    };

    socketService.on('reaction:broadcast', handleReaction);
    return () => {
      socketService.off('reaction:broadcast', handleReaction);
    };
  }, []);

  const handleTriggerResonance = (word) => {
    socketService.sendReaction(word);
  };

  return (
    <>
      {/* Floating Kinetic Typographic Words */}
      {activeParticles.map((particle) => (
        <div
          key={particle.id}
          className="kinetic-ripple-particle"
          style={{ left: `${particle.left}%` }}
        >
          <em>{particle.text}</em>
        </div>
      ))}

      {/* Typographic Resonance Sparks Dock */}
      <div className="typographic-sparks-cluster">
        {RESONANCES.map((word) => (
          <button
            key={word}
            className="spark-word-btn"
            onClick={() => handleTriggerResonance(word)}
            title={`Broadcast ${word} resonance`}
          >
            {word}
          </button>
        ))}
      </div>
    </>
  );
}
