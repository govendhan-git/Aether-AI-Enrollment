import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  return client;
}

export async function redisGet<T = unknown>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  const v = await r.get(key);
  return v ? (JSON.parse(v) as T) : null;
}

export async function redisSet(key: string, value: unknown, ttlMs = 60000): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
  await r.set(key, JSON.stringify(value), 'EX', ttlSec);
}
