import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { Webhook } from 'svix';

// Verify Clerk webhook signatures
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: 'Missing CLERK_WEBHOOK_SECRET' }, { status: 500 });

  const payload = await req.text();
  const h = headers();
  const svixId = h.get('svix-id');
  const svixTimestamp = h.get('svix-timestamp');
  const svixSignature = h.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const wh = new Webhook(webhookSecret);
  let evt: unknown;
  try {
    evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle relevant events (user.created, user.updated, etc.)
  // For now, just acknowledge
  const type = typeof evt === 'object' && evt && 'type' in (evt as Record<string, unknown>)
    ? String((evt as Record<string, unknown>).type)
    : 'unknown';
  return NextResponse.json({ ok: true, type });
}
