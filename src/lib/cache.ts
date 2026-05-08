type Entry<T> = { v: T; exp: number };
const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) { store.delete(key); return undefined; }
  return e.v as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { v: value, exp: Date.now() + ttlMs });
}

export function cacheDel(key: string): void { store.delete(key); }
export function cacheClear(): void { store.clear(); }
