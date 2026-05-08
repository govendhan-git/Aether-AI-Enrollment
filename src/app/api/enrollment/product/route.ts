import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import type { StepState } from '../../../../types/enrollment';
import { IdempotencyKey } from '@/models/IdempotencyKey';
import { saveIdempotency } from '@/lib/idempotency';
import { getTraceIdFromRequest, logTrace } from '@/lib/trace';

export async function POST(req: NextRequest) {
  const traceId = getTraceIdFromRequest(req);
  await dbConnect();
  const user = await currentUser();
  const idemKey = req.headers.get('x-idempotency-key') || undefined;
  if (idemKey && user?.id) {
    const existing = await IdempotencyKey.findOne({ key: idemKey, userId: user.id, route: '/api/enrollment/product' });
    if (existing) return NextResponse.json(existing.result, { status: existing.status });
  }
  const form = await req.formData();
  const isChat = req.headers.get('x-chat') === '1' || (req.headers.get('accept') || '').includes('application/json');
  const productId = String(form.get('productId'));
  const action = String(form.get('action'));
  const level = (form.get('level') || '').toString();
  const agree = form.get('agree') === 'yes';
  const profile = await UserProfile.findOne({ clerkUserId: user?.id });
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 });
  const session = await EnrollmentSession.findOne({ userId: profile._id, active: true });
  if (!session) return NextResponse.json({ error: 'No session' }, { status: 400 });

  const code = `product-${productId}`;
  let step = (session.steps as StepState[]).find((s) => s.code === code);
  if (!step) {
    step = { code, status: 'pending', data: {} };
    (session.steps as StepState[]).push(step);
  }

  if (action === 'decline') {
    step.status = 'complete';
    step.data = { declined: true };
  } else {
    // Require a level and disclosure agreement when saving (not declining)
    if (!level) {
      if (isChat) return NextResponse.json({ ok: false, error: 'select_level' }, { status: 400 });
      const url = new URL(`/enroll/step/${code}`, new URL(req.url).origin);
      url.searchParams.set('error', 'select_level');
      return NextResponse.redirect(url);
    }
    if (!agree) {
      if (isChat) return NextResponse.json({ ok: false, error: 'must_agree' }, { status: 400 });
      const url = new URL(`/enroll/step/${code}`, new URL(req.url).origin);
      url.searchParams.set('error', 'must_agree');
      return NextResponse.redirect(url);
    }
    step.status = 'complete';
    step.data = { level };
  }

  await session.save();
  // Move to next pending product step if any, else pre_confirm
  const nextProduct = (session.steps as StepState[]).find((s) => s.status === 'pending' && ((s.code || '').startsWith('product-') || (s.code || '').startsWith('product:')));
  const next = nextProduct?.code || 'pre_confirm';
  const payload = { ok: true, next, notice: 'product_saved' } as const;
  logTrace(traceId, '/api/enrollment/product', 'info', 'product_saved', { productId, action, level: level || null, next });
  await saveIdempotency('/api/enrollment/product', idemKey, user?.id || null, 200, payload as unknown as Record<string, unknown>);
  if (isChat) return NextResponse.json(payload);
  const url = new URL(`/enroll/step/${next}`, new URL(req.url).origin);
  url.searchParams.set('notice', 'product_saved');
  return NextResponse.redirect(url);
}
