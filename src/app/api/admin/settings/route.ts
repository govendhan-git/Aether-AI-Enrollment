import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Setting } from '@/models/Setting';
import { requireBroker } from '@/lib/authz';

export const runtime = 'nodejs';

export async function GET() {
  const authz = await requireBroker();
  if (!authz.ok) return NextResponse.json({ ok: false }, { status: 403 });
  await dbConnect();
  const setting = await Setting.findOne({ key: 'MAP_INPUT_USE_LLM' }).lean<{ value?: unknown }>();
  const value = typeof setting?.value === 'boolean' ? setting?.value : String(setting?.value || '').toLowerCase() === 'true';
  return NextResponse.json({ ok: true, flags: { MAP_INPUT_USE_LLM: value } });
}

export async function POST(req: NextRequest) {
  const authz = await requireBroker();
  if (!authz.ok) return NextResponse.json({ ok: false }, { status: 403 });
  await dbConnect();
  const body = await req.json().catch(() => ({}));
  const v = !!(body?.MAP_INPUT_USE_LLM);
  await Setting.updateOne({ key: 'MAP_INPUT_USE_LLM' }, { $set: { value: v } }, { upsert: true });
  return NextResponse.json({ ok: true, flags: { MAP_INPUT_USE_LLM: v } });
}
