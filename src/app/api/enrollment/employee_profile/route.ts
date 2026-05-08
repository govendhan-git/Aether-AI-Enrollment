import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { dbConnect } from '@/lib/db';
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
    const existing = await IdempotencyKey.findOne({ key: idemKey, userId: user.id, route: '/api/enrollment/employee_profile' });
    if (existing) return NextResponse.json(existing.result, { status: existing.status });
  }
  const form = await req.formData();
  const email = String(form.get('email') || '');
  const phone = String(form.get('phone') || '');
  const firstName = String(form.get('firstName') || '');
  const lastName = String(form.get('lastName') || '');
  const ssnLast4 = String(form.get('ssnLast4') || '');
  const birthDate = form.get('birthDate') ? new Date(String(form.get('birthDate'))) : undefined;
  const payFrequency = String(form.get('payFrequency') || '');
  const department = String(form.get('department') || '');
  const employeeId = String(form.get('employeeId') || '');
  const isChat = req.headers.get('x-chat') === '1' || (req.headers.get('accept') || '').includes('application/json');

  const profile = await UserProfile.findOne({ clerkUserId: user?.id });
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 });

  // Update allowed fields
  profile.personal = {
    ...(profile.personal || {}),
    email: email || profile.personal?.email,
    phone: phone || profile.personal?.phone,
    firstName: firstName || profile.personal?.firstName,
    lastName: lastName || profile.personal?.lastName,
    ssnLast4: ssnLast4 || profile.personal?.ssnLast4,
    birthDate: birthDate || profile.personal?.birthDate,
  } as typeof profile.personal;
  profile.employment = {
    ...(profile.employment || {}),
    payFrequency: payFrequency || profile.employment?.payFrequency,
    department: department || profile.employment?.department,
    employeeId: employeeId || profile.employment?.employeeId,
    companyId: profile.employment?.companyId,
  } as typeof profile.employment;
  await profile.save();
  logTrace(traceId, '/api/enrollment/employee_profile', 'info', 'profile_updated', { userId: user?.id, employeeId, department, payFrequency });

  const session = await EnrollmentSession.findOne({ userId: profile._id, active: true });
  if (session) {
    const step = (session.steps as StepState[]).find((s) => s.code === 'employee_profile');
    if (step) step.status = 'complete';
    await session.save();
  }

  const payload = { ok: true, next: 'product_select', notice: 'employee_profile_saved' } as const;
  if (idemKey && user?.id) {
    try { await IdempotencyKey.create({ key: idemKey, userId: user.id, route: '/api/enrollment/employee_profile', status: 200, result: payload }); } catch {}
  }
  if (isChat) {
    logTrace(traceId, '/api/enrollment/employee_profile', 'info', 'response_json', { status: 200 });
    return NextResponse.json(payload);
  } else {
    const url = new URL('/enroll/step/product_select', new URL(req.url).origin);
    url.searchParams.set('notice', 'employee_profile_saved');
    logTrace(traceId, '/api/enrollment/employee_profile', 'info', 'response_redirect', { to: url.toString() });
    return NextResponse.redirect(url);
  }
}
