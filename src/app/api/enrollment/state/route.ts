import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import type { Types } from 'mongoose';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import { Product } from '@/models/Product';
import { newTraceId, logTrace } from '@/lib/trace';

type StepState = { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> };

export async function GET() {
  const traceId = newTraceId();
  await dbConnect();
  const user = await currentUser();
  const profile = await UserProfile.findOne({ clerkUserId: user?.id }).lean<{
    _id: Types.ObjectId;
    legalEntityId: Types.ObjectId;
    personal?: { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: Date | null };
    employment?: { employeeId?: string; department?: string; payFrequency?: string };
  }>();
  if (!profile) return NextResponse.json({ ok: false, error: 'No profile' }, { status: 400 });
  // Ensure an active session exists for this user
  let sessionDoc = await EnrollmentSession.findOne({ userId: profile._id, active: true });
  if (!sessionDoc) {
    sessionDoc = await EnrollmentSession.create({
      userId: profile._id,
      legalEntityId: profile.legalEntityId,
      steps: [
        { code: 'employee_profile', status: 'pending' },
        { code: 'product_select', status: 'pending' },
        { code: 'pre_confirm', status: 'pending' },
      ],
      selectedProductIds: [],
    });
  }
  const session = await EnrollmentSession.findById(sessionDoc._id).lean<{ steps?: StepState[]; selectedProductIds?: Array<string | { toString(): string }> }>();

  const rawSelected = Array.isArray(session?.selectedProductIds) ? session!.selectedProductIds! : [];
  const selectedIds: string[] = rawSelected
    .map((id) => (typeof id === 'string' ? id : id.toString()))
    .filter((v): v is string => Boolean(v));
  const canonical = ['employee_profile', 'product_select', ...selectedIds.map((id) => `product-${id}`), 'pre_confirm'];

  const steps: StepState[] = Array.isArray(session?.steps) ? (session!.steps as StepState[]) : [];
  const statusMap = new Map<string, 'pending' | 'complete'>();
  for (const s of steps) if (s.code && s.status) statusMap.set(s.code, s.status);
  const firstPending = canonical.find((c) => statusMap.get(c) !== 'complete') || canonical[canonical.length - 1];

  // Load products for selected ids
  const products = await Product.find({ _id: { $in: selectedIds } }).lean<{ _id: { toString(): string }; name: string; description?: string; longDescription?: string; highlights?: string[]; logoUrl?: string; images?: string[]; coverageOptions?: { level: string; monthlyCost: number }[] }[]>();

  const payload = {
    ok: true,
    profile: {
      firstName: profile.personal?.firstName || '',
      lastName: profile.personal?.lastName || '',
      email: profile.personal?.email || '',
      phone: profile.personal?.phone || '',
      ssnLast4: profile.personal?.ssnLast4 || '',
      birthDate: profile.personal?.birthDate || null,
      payFrequency: profile.employment?.payFrequency || '',
      department: profile.employment?.department || '',
      employeeId: profile.employment?.employeeId || ''
    },
    session: { steps, selectedProductIds: selectedIds },
    canonical,
    currentCode: firstPending,
    products
  };
  logTrace(traceId, '/api/enrollment/state', 'info', 'state', { userId: user?.id, selectedCount: selectedIds.length });
  return NextResponse.json(payload);
}
