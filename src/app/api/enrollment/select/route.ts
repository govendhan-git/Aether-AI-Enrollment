import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import type { StepState } from '../../../../types/enrollment';
import { IdempotencyKey } from '@/models/IdempotencyKey';
import { getTraceIdFromRequest, logTrace } from '@/lib/trace';

export async function POST(req: NextRequest) {
  const traceId = getTraceIdFromRequest(req);
  await dbConnect();
  const user = await currentUser();
  const idemKey = req.headers.get('x-idempotency-key') || undefined;
  if (idemKey && user?.id) {
    const existing = await IdempotencyKey.findOne({ key: idemKey, userId: user.id, route: '/api/enrollment/select' });
    if (existing) return NextResponse.json(existing.result, { status: existing.status });
  }
  const form = await req.formData();
  const items = form.getAll('productIds').map((v) => String(v));
  const isChat = req.headers.get('x-chat') === '1' || (req.headers.get('accept') || '').includes('application/json');
  if (items.length === 0) {
    // Must select at least 1
    if (isChat) return NextResponse.json({ ok: false, error: 'select_one' }, { status: 400 });
    return NextResponse.redirect(new URL('/enroll/step/product_select?error=select_one', req.url));
  }
  const profile = await UserProfile.findOne({ clerkUserId: user?.id });
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 });
  const session = await EnrollmentSession.findOne({ userId: profile._id, active: true });
  if (!session) return NextResponse.json({ error: 'No session' }, { status: 400 });
  session.selectedProductIds = items as unknown as typeof session.selectedProductIds;
  // Reset product detail steps and append in canonical order; keep personal/product_select as-is; pre_confirm will be handled later
  const base = (session.steps as StepState[]).filter((s) => s.code === 'employee_profile' || s.code === 'product_select');
  // Mark product_select complete so user can proceed to details
  const productSelect = (session.steps as StepState[]).find((s) => s.code === 'product_select');
  if (productSelect) productSelect.status = 'complete';
  const details = items.map((id) => ({ code: `product-${id}`, status: 'pending' as const }));
  (session.steps as StepState[]) = [...base, ...details, { code: 'pre_confirm', status: 'pending' }];
  await session.save();
  const first = items[0];
  // If personal is still pending, direct to personal first; else go to first product detail
  const personal = (session.steps as StepState[]).find((s) => s.code === 'employee_profile');
  const next = (personal && personal.status !== 'complete')
    ? 'employee_profile'
    : (first ? `product-${first}` : 'pre_confirm');
  const payload = { ok: true, next, notice: 'selection_saved' } as const;
  logTrace(traceId, '/api/enrollment/select', 'info', 'selection_saved', { items, next });
  if (idemKey && user?.id) {
    try { await IdempotencyKey.create({ key: idemKey, userId: user.id, route: '/api/enrollment/select', status: 200, result: payload }); } catch {}
  }
  if (isChat) return NextResponse.json(payload);
  const url = new URL(`/enroll/step/${next}`, new URL(req.url).origin);
  url.searchParams.set('notice', 'selection_saved');
  logTrace(traceId, '/api/enrollment/select', 'info', 'response_redirect', { to: url.toString() });
  return NextResponse.redirect(url);
}
