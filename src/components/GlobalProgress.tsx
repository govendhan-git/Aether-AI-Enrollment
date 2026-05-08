"use client";
import { useEffect, useRef, useState } from 'react';

export default function GlobalProgress() {
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const doneTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const update = () => {
      const isLoading = document.body.hasAttribute('data-loading');
      if (isLoading) {
        if (doneTimer.current) window.clearTimeout(doneTimer.current);
        setDone(false);
        setActive(true);
      } else {
        // show a quick completion sweep, then hide
        setDone(true);
        doneTimer.current = window.setTimeout(() => {
          setActive(false);
          setDone(false);
        }, 350);
      }
    };

    // Initial state
    update();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && (m.attributeName === 'data-loading')) {
          update();
          break;
        }
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-loading'] });

    return () => {
      observer.disconnect();
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    };
  }, []);

  if (!active && !done) return null;

  const cls = `global-progress ${active ? 'active' : ''} ${done ? 'done' : ''}`.trim();
  return (
    <div className={cls} role="progressbar" aria-hidden={!active} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar" />
    </div>
  );
}
