// Global Loader Service: ref-counted controller toggling body[data-loading] for the top progress bar
// Works in browser; safe no-ops on server.

class LoaderService {
  private count = 0;
  private safetyTimer: number | null = null;
  private lastShowAt = 0;
  private ensureBodyLoadedAttr() {
    if (typeof document === 'undefined') return;
    if (!document.body.getAttribute('data-loaded')) {
      document.body.setAttribute('data-loaded', 'true');
    }
  }
  show() {
    if (typeof document === 'undefined') return;
    this.ensureBodyLoadedAttr();
    this.count += 1;
    document.body.setAttribute('data-loading', 'true');
    this.lastShowAt = Date.now();
    if (this.safetyTimer) window.clearTimeout(this.safetyTimer);
    // Watchdog: if loading persists beyond 20s, force reset to avoid a stuck UI
    this.safetyTimer = window.setTimeout(() => {
      if (this.count > 0) {
        try { console.warn('[loader] Forcing reset after timeout. Count=', this.count, 'since', new Date(this.lastShowAt).toISOString()); } catch {}
        this.reset();
      }
    }, 20000);
  }
  hide() {
    if (typeof document === 'undefined') return;
    this.count = Math.max(0, this.count - 1);
    if (this.count === 0) {
      document.body.removeAttribute('data-loading');
      if (this.safetyTimer) { window.clearTimeout(this.safetyTimer); this.safetyTimer = null; }
    }
  }
  reset() {
    if (typeof document === 'undefined') return;
    this.count = 0;
    document.body.removeAttribute('data-loading');
    if (this.safetyTimer) { window.clearTimeout(this.safetyTimer); this.safetyTimer = null; }
  }
  async wrap<T>(p: Promise<T>): Promise<T> {
    this.show();
    try { return await p; } finally { this.hide(); }
  }
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    this.show();
    try { return await fn(); } finally { this.hide(); }
  }
}

export const loader = new LoaderService();
