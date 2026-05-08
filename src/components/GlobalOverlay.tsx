"use client";
import { useEffect, useRef, useState } from 'react';

export default function GlobalOverlay() {
  const [active, setActive] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const setStateFromAttr = () => {
      const isLoading = document.body.hasAttribute('data-loading');
      // Debounce to avoid flicker on very short requests
      if (isLoading) {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        if (!active) {
          showTimer.current = window.setTimeout(() => setActive(true), 80);
        }
      } else {
        if (showTimer.current) window.clearTimeout(showTimer.current);
        hideTimer.current = window.setTimeout(() => setActive(false), 120);
      }
    };

    setStateFromAttr();
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'data-loading') {
          setStateFromAttr();
          break;
        }
      }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-loading'] });
    return () => { obs.disconnect(); if (showTimer.current) window.clearTimeout(showTimer.current); if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [active]);

  if (!active) return null;

  return (
    <div className="global-overlay" aria-live="polite" aria-busy="true" aria-label="Loading">
      <div className="overlay-spinner" aria-hidden="true">
        <div className="spinner-dot" />
        <div className="spinner-ring" />
      </div>
      <div className="overlay-text">Working…</div>
    </div>
  );
}
