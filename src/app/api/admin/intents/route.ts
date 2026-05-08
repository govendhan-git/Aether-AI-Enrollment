import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { IntentLog } from '@/models/IntentLog';
import { requireBroker } from '@/lib/authz';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authz = await requireBroker();
  if (!authz.ok) return NextResponse.json({ ok: false }, { status: 403 });
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const traceId = searchParams.get('traceId') || undefined;
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
  const cursor = searchParams.get('cursor');
  const q: Record<string, unknown> = traceId ? { traceId } : {};
  if (cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as { createdAt: string; _id: string };
      const createdAt = new Date(parsed.createdAt);
      const _id = new mongoose.Types.ObjectId(parsed._id);
      q.$or = [
        { createdAt: { $lt: createdAt } },
        { createdAt, _id: { $lt: _id } },
      ];
    } catch {}
  }
  const items = await IntentLog.find(q).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  let nextCursor: string | null = null;
  if (items.length === limit) {
    const last = items[items.length - 1] as { createdAt?: Date; _id?: mongoose.Types.ObjectId };
    if (last?.createdAt && last?._id) {
      nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), _id: String(last._id) }), 'utf-8').toString('base64');
    }
  }
  return NextResponse.json({ ok: true, items, nextCursor });
}
