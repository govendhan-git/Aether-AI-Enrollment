import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { auth, currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import { Enrollment } from '@/models/Enrollment';
import { Product } from '@/models/Product';
import type { StepState } from '../../../../types/enrollment';
import { IdempotencyKey } from '@/models/IdempotencyKey';
import { getTraceIdFromRequest, logTrace } from '@/lib/trace';
import { generateUniqueConfirmation } from '@/lib/unique';
import { saveIdempotency } from '@/lib/idempotency';

// deprecated local generator removed in favor of sequence-based IDs
// sequence still exists for other uses; confirmation uses robust unique generator

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const traceId = getTraceIdFromRequest(req);
  try {
  await dbConnect();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const idemKey = req.headers.get('x-idempotency-key') || undefined;
    if (idemKey) {
      const existing = await IdempotencyKey.findOne({ key: idemKey, userId, route: '/api/enrollment/submit' });
      if (existing) return NextResponse.json(existing.result, { status: existing.status });
    }
    const isChat = req.headers.get('x-chat') === '1' || (req.headers.get('accept') || '').includes('application/json');
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let agree = false;
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({} as unknown as Record<string, unknown>));
      const v = (body as Record<string, unknown>)['agree'];
      agree = v === 'yes' || v === true;
    } else {
      try {
        const form = await req.formData();
        const v = form.get('agree');
        agree = v === 'yes' || v === 'true';
      } catch {
        // Fallback: try JSON if formData parse failed
        const body = await req.json().catch(() => ({} as unknown as Record<string, unknown>));
        const v = (body as Record<string, unknown>)['agree'];
        agree = v === 'yes' || v === true;
      }
    }
    if (!agree) return NextResponse.json({ error: 'Must agree' }, { status: 400 });

    let profile = await UserProfile.findOne({ clerkUserId: userId });
    if (!profile) {
      // Fallback: try by email if available
      try {
        const u = await currentUser();
        if (u?.emailAddresses?.[0]?.emailAddress) {
          profile = await UserProfile.findOne({ email: u.emailAddresses[0].emailAddress });
        }
      } catch {}
    }
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 });
  const session = await EnrollmentSession.findOne({ userId: profile._id, active: true });
    if (!session) return NextResponse.json({ error: 'No session' }, { status: 400 });
  if (!session.legalEntityId) {
    // Fallback: repair session with profile's legal entity if present
    if ((profile as unknown as { legalEntityId?: unknown })?.legalEntityId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).legalEntityId = (profile as unknown as { legalEntityId: unknown }).legalEntityId;
      await session.save();
      logTrace(traceId, '/api/enrollment/submit', 'info', 'session_legal_entity_repaired', {});
    } else {
      return NextResponse.json({ error: 'Session missing legal entity' }, { status: 400 });
    }
  }

  // Build enrollment from session
  const products: { productId: string; declined: boolean; level?: string }[] = [];
  let total = 0;
  const ids: string[] = [];
  const stepList = Array.isArray(session.steps) ? (session.steps as StepState[]) : [];
  for (const s of stepList) {
    const code = s.code || '';
    if (code.startsWith('product-')) ids.push(code.slice('product-'.length));
    else if (code.startsWith('product:')) ids.push(code.split(':')[1]);
  }
  const validIds = ids.filter((s) => /^[a-fA-F0-9]{24}$/.test(s));
  const prodDocs = await Product.find({ _id: { $in: validIds } }).lean<{ _id: { toString(): string }; coverageOptions?: { level: string; monthlyCost: number }[] }[]>();
  for (const s of stepList) {
    if ((s.code || '').startsWith('product-') || (s.code || '').startsWith('product:')) {
      const code = s.code as string;
  const productId = code.startsWith('product-') ? code.slice('product-'.length) : code.split(':')[1];
  if (!/^[a-fA-F0-9]{24}$/.test(productId)) continue;
      const declined = s.data?.declined;
  const level = (s.data as { level?: string } | undefined)?.level;
  products.push({ productId, declined: !!declined, level });
      if (!declined && level) {
  const prod = prodDocs.find((p) => p._id.toString() === productId);
        const price = prod?.coverageOptions?.find((c) => c.level === level)?.monthlyCost || 0;
        total += price;
      }
    }
  }

  // Generate and attempt insert once; if a duplicate occurs, surface it so the user can retry.
  const conf = await generateUniqueConfirmation('ENR-');
  try {
    await Enrollment.create({
    userId: profile._id,
      legalEntityId: session.legalEntityId,
    products,
    totalMonthlyCost: total,
      confirmationNumber: conf,
    submittedAt: new Date()
    });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (/E11000 duplicate key/.test(msg) && /confirmationNumber/i.test(msg)) {
      logTrace(traceId, '/api/enrollment/submit', 'error', 'duplicate_confirmation', { error: msg });
      return NextResponse.json({ error: 'Temporary conflict creating confirmation. Please retry submit.' }, { status: 409 });
    }
    throw err;
  }
  logTrace(traceId, '/api/enrollment/submit', 'info', 'enrollment_created', { userId, productsCount: products.length, totalMonthlyCost: total });

    session.active = false;
    await session.save();

  if (isChat) {
      const payload = { ok: true, next: 'confirm' } as const;
  await saveIdempotency('/api/enrollment/submit', idemKey, userId, 200, payload as unknown as Record<string, unknown>);
      logTrace(traceId, '/api/enrollment/submit', 'info', 'response_json', { status: 200 });
      return NextResponse.json(payload);
    }
    logTrace(traceId, '/api/enrollment/submit', 'info', 'response_redirect', { to: '/enroll/confirm' });
    return NextResponse.redirect(new URL('/enroll/confirm', new URL(req.url).origin));
  } catch (e: unknown) {
    const msg = (e as Error).message;
    logTrace(traceId, '/api/enrollment/submit', 'error', 'submit_failed', { error: msg });
    return NextResponse.json({ error: msg || 'Internal Server Error' }, { status: 500 });
  }
}
