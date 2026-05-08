import mongoose from 'mongoose';

const URI = (process.env.DATABASE_URL || process.env.MONGODB_URI) as string | undefined;

// Typed global cache to avoid creating multiple connections in dev/hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

const globalCache = globalThis.__mongooseCache || { conn: null, promise: null };
globalThis.__mongooseCache = globalCache;

export async function dbConnect() {
  if (!URI) {
    throw new Error('DATABASE_URL or MONGODB_URI must be set');
  }
  if (globalCache.conn) return globalCache.conn;
  if (!globalCache.promise) {
    globalCache.promise = mongoose.connect(URI!).then((m) => m);
  }
  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}
