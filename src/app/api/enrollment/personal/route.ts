import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { dbConnect } from '@/lib/db';
import { UserProfile } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import type { StepState } from '../../../../types/enrollment';

export async function POST(req: NextRequest) {
  await dbConnect();
  const user = await currentUser();
  const form = await req.formData();
  const email = String(form.get('email') || '');
  const phone = String(form.get('phone') || '');
  const isChat = req.headers.get('x-chat') === '1' || (req.headers.get('accept') || '').includes('application/json');

  const profile = await UserProfile.findOne({ clerkUserId: user?.id });
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 });

  // Update only allowed fields (optional)
  if (email) profile.personal = { ...(profile.personal || {}), email };
  if (phone) profile.personal = { ...(profile.personal || {}), phone };
  await profile.save();

  const session = await EnrollmentSession.findOne({ userId: profile._id, active: true });
  if (session) {
    // Backward-compat: mark employee_profile as complete if present
    const step = (session.steps as StepState[]).find((s) => s.code === 'employee_profile');
    if (step) step.status = 'complete';
    await session.save();
  }

  if (isChat) {
  return NextResponse.json({ ok: true, next: 'product_select', notice: 'employee_profile_saved' });
  } else {
    const url = new URL('/enroll/step/product_select', new URL(req.url).origin);
  url.searchParams.set('notice', 'employee_profile_saved');
    return NextResponse.redirect(url);
  }
}
