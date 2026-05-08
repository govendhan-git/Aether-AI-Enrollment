type CacheEntry<T> = { data: T; ts: number };
import { loader } from './loader';

const mem = new Map<string, CacheEntry<unknown>>();

export async function fetchJSON<T>(input: RequestInfo, init?: RequestInit & { cacheKey?: string; ttlMs?: number; signal?: AbortSignal; skipLoader?: boolean }): Promise<T> {
  const key = init?.cacheKey;
  const ttl = init?.ttlMs ?? 10_000;
  if (key) {
    const e = mem.get(key) as CacheEntry<T> | undefined;
    if (e && Date.now() - e.ts < ttl) return e.data;
  }
  const useLoader = typeof window !== 'undefined' && !init?.skipLoader;
  if (useLoader) loader.show();
  try {
    const res = await fetch(input, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    if (key) mem.set(key, { data, ts: Date.now() });
    return data;
  } finally {
    if (useLoader) loader.hide();
  }
}

export function abortable() {
  const c = new AbortController();
  return { controller: c, signal: c.signal };
}
