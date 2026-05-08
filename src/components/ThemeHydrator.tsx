"use client";
import { useEffect } from 'react';

type ThemePayload = {
  className: string; // e.g., theme-classic
  cssVars?: Record<string, string>;
};

export default function ThemeHydrator() {
  useEffect(() => {
    let cancelled = false;
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
  const apply = (t: ThemePayload) => {
      const html = document.documentElement;
      if (!html) return;
    const prevClass = html.className || '';
    const classes = new Set(prevClass.split(/\s+/).filter(Boolean));
      // remove any previous theme-* classes and add the new one
      for (const c of Array.from(classes)) if (c.startsWith('theme-')) classes.delete(c);
      classes.add(t.className || 'theme-classic');
    const nextClass = Array.from(classes).join(' ');
    defer(() => {
        if (nextClass !== prevClass) html.className = nextClass;
        if (t.cssVars) {
          for (const [k, v] of Object.entries(t.cssVars)) {
            if (html.style.getPropertyValue(k) !== v) html.style.setProperty(k, v);
          }
        }
      });
    };
  const run = async () => {
      try {
    const res = await fetch('/api/theme', { credentials: 'include' });
  if (!res.ok) return;
    const data = (await res.json()) as ThemePayload;
        if (!cancelled && data?.className) apply(data);
      } catch {
        // ignore theme failures
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);
  return null;
}
