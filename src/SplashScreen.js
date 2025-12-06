/**
 * SplashScreen Component
 *
 * Displays the AI demon logo with fade-in animation,
 * then fades out to reveal the main menu.
 */

import React, { useState, useEffect } from 'react';
import './SplashScreen.scss';

export function SplashScreen({ onComplete }) {
  const [phase, setPhase] = useState('fade-in'); // fade-in, visible, fade-out, done

  useEffect(() => {
    // Phase 1: Logo fades in (0-1s)
    const fadeInTimer = setTimeout(() => {
      setPhase('visible');
    }, 1000);

    // Phase 2: Logo stays visible (1-3s)
    const visibleTimer = setTimeout(() => {
      setPhase('fade-out');
    }, 3000);

    // Phase 3: Fade out and complete (3-4s)
    const fadeOutTimer = setTimeout(() => {
      setPhase('done');
      if (onComplete) {
        onComplete();
      }
    }, 4000);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(visibleTimer);
      clearTimeout(fadeOutTimer);
    };
  }, [onComplete]);

  // Skip splash on click
  const handleClick = () => {
    setPhase('done');
    if (onComplete) {
      onComplete();
    }
  };

  if (phase === 'done') {
    return null;
  }

  return (
    <div className={`splash-screen splash-screen--${phase}`} onClick={handleClick}>
      <div className="splash-screen__content">
        <img
          src={process.env.PUBLIC_URL + '/logo.png'}
          alt="DIABLO AI"
          className="splash-screen__logo"
        />
        <div className="splash-screen__title">
          <span className="splash-screen__title-main">DIABLO</span>
          <span className="splash-screen__title-sub">NEURAL AUGMENTED</span>
        </div>
        <div className="splash-screen__subtitle">
          AI-Powered Dungeon Generation
        </div>
      </div>
      <div className="splash-screen__skip">
        Click anywhere to skip
      </div>
    </div>
  );
}

export default SplashScreen;
