import { IdempotencyKey } from '@/models/IdempotencyKey';

export async function saveIdempotency(route: string, key: string | undefined | null, userId: string | undefined | null, status: number, result: Record<string, unknown>) {
  if (!key || !userId) return;
  try {
    await IdempotencyKey.updateOne(
      { key, userId, route },
      { $set: { status, result, createdAt: new Date() } },
      { upsert: true }
    );
  } catch {
    // ignore
  }
}
