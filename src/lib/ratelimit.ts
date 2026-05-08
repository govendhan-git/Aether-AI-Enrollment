type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 20, intervalMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key) || { tokens: limit, updated: now };
  // refill
  const elapsed = now - b.updated;
  const refill = Math.floor((elapsed / intervalMs) * limit);
  if (refill > 0) {
    b.tokens = Math.min(limit, b.tokens + refill);
    b.updated = now;
  }
  if (b.tokens <= 0) {
    buckets.set(key, b);
    return { ok: false } as const;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true } as const;
}
