import type { NextRequest } from 'next/server';

let CLIENT_TRACE_ID: string | null = null;

export function newTraceId() {
  // Short, URL-safe trace id
  const rnd = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${ts}-${rnd}`.toUpperCase();
}

export function getClientTraceId(): string {
  if (CLIENT_TRACE_ID) return CLIENT_TRACE_ID;
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __TRACE_ID__?: string };
    if (!w.__TRACE_ID__) w.__TRACE_ID__ = newTraceId();
    CLIENT_TRACE_ID = w.__TRACE_ID__!;
    return CLIENT_TRACE_ID;
  }
  CLIENT_TRACE_ID = newTraceId();
  return CLIENT_TRACE_ID;
}

export function getTraceIdFromRequest(req: NextRequest | Request): string {
  const h = (req.headers?.get?.('x-trace-id') || req.headers?.get?.('X-Trace-Id')) as string | null;
  return h || newTraceId();
}

export function logTrace(traceId: string, route: string, level: 'info' | 'error', message: string, extra?: Record<string, unknown>) {
  try {
    // Structured JSON for easy ingestion
    console[level === 'error' ? 'error' : 'log'](
      JSON.stringify({ ts: new Date().toISOString(), traceId, route, level, message, ...(extra || {}) })
    );
  } catch {
    // no-op
  }
}
