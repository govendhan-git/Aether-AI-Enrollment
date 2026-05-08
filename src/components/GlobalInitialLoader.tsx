"use client";
import { useEffect } from 'react';
import { loader } from '@/lib/loader';

// Use the built-in IdleRequest types when available; otherwise fall back to setTimeout.

// Shows the global progress bar during initial page load/hydration safely.
export default function GlobalInitialLoader() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Prevent double-run across client navigations
  if ((window as unknown as { __gpInitShown?: boolean }).__gpInitShown) return;
  (window as unknown as { __gpInitShown?: boolean }).__gpInitShown = true;
    const ready = document.readyState;
    // Defer any DOM attribute toggles until after first paint to avoid interfering with hydration
    const defer = (fn: () => void) => {
      try {
        const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
        if (typeof w.requestIdleCallback === 'function') {
          w.requestIdleCallback(fn, { timeout: 300 });
          return;
        }
      } catch {}
      setTimeout(fn, 0);
    };

    if (ready !== 'complete') {
      let cleared = false;
      defer(() => { if (!cleared) loader.show(); });
      const onLoad = () => loader.hide();
      window.addEventListener('load', onLoad, { once: true });
      const t = window.setTimeout(() => loader.hide(), 2000);
      return () => {
        cleared = true;
        window.removeEventListener('load', onLoad);
        window.clearTimeout(t);
      };
    }
    // If already complete, still show a tiny sweep so users see readiness feedback
    let cancelled = false;
    defer(() => { if (!cancelled) loader.show(); });
    const t = window.setTimeout(() => loader.hide(), 180);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, []);
  return null;
}
