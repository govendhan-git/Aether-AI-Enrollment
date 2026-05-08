import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import { LegalEntity } from '@/models/LegalEntity';
import { Product } from '@/models/Product';
import type { Types } from 'mongoose';
import { buildClientProfileSchema, buildClientPreConfirmSchema, buildClientProductDetailSchema, buildClientSelectionSchema } from '@/schemas/enrollment';
import { getTraceIdFromRequest, logTrace } from '@/lib/trace';

type StepState = { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> };

export async function GET(request: Request) {
  const traceId = getTraceIdFromRequest(request);
  await dbConnect();
  const user = await currentUser();
  const profileDoc = await UserProfile.findOne({ clerkUserId: user?.id }).lean<{
    _id: Types.ObjectId;
    legalEntityId: Types.ObjectId;
    personal?: { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: Date | null };
    employment?: { employeeId?: string; department?: string; payFrequency?: string };
  }>();
  if (!profileDoc) return NextResponse.json({ ok: false, error: 'No profile' }, { status: 400 });

  // Ensure active enrollment session exists
  let session = await EnrollmentSession.findOne({ userId: profileDoc._id, active: true });
  if (!session) {
    session = await EnrollmentSession.create({
      userId: profileDoc._id,
      legalEntityId: profileDoc.legalEntityId,
      steps: [
        { code: 'employee_profile', status: 'pending' },
        { code: 'product_select', status: 'pending' },
        { code: 'pre_confirm', status: 'pending' },
      ],
      selectedProductIds: [],
    });
  }
  const sessLean = await EnrollmentSession.findById(session._id).lean<{ steps?: StepState[]; selectedProductIds?: Array<string | { toString(): string }> }>();
  const steps = Array.isArray(sessLean?.steps) ? (sessLean!.steps as StepState[]) : [];
  const rawSelected = Array.isArray(sessLean?.selectedProductIds) ? sessLean!.selectedProductIds! : [];
  const selectedIds: string[] = rawSelected
    .map((id) => (typeof id === 'string' ? id : id.toString()))
    .filter((v): v is string => Boolean(v));
  const canonical = ['employee_profile', 'product_select', ...selectedIds.map((id) => `product-${id}`), 'pre_confirm'];
  const statusMap = new Map<string, 'pending' | 'complete'>();
  for (const s of steps) if (s.code && s.status) statusMap.set(s.code, s.status);
  const currentCode = (canonical.find((c) => statusMap.get(c) !== 'complete') || canonical[canonical.length - 1]) as string;

  // Eligible products for this legal entity
  const company = await LegalEntity.findById(profileDoc.legalEntityId).lean<{ productIds?: unknown[] }>();
  const products = await Product.find({ _id: { $in: company?.productIds || [] } }).lean<{ _id: { toString(): string }; name: string; description?: string; coverageOptions?: { level: string; monthlyCost: number }[] }[]>();

  // Build client schemas
  const profileClient = buildClientProfileSchema();
  const selectionClient = buildClientSelectionSchema();
  const productDetails: Record<string, ReturnType<typeof buildClientProductDetailSchema>> = {};
  for (const p of products) {
    const id = p._id.toString();
    const levels = (p.coverageOptions || []).map((c) => c.level);
    productDetails[id] = buildClientProductDetailSchema(levels);
  }
  const preConfirmClient = buildClientPreConfirmSchema();

  const body = {
    ok: true,
    profile: {
      firstName: profileDoc.personal?.firstName || '',
      lastName: profileDoc.personal?.lastName || '',
      email: profileDoc.personal?.email || '',
      phone: profileDoc.personal?.phone || '',
      ssnLast4: profileDoc.personal?.ssnLast4 || '',
      birthDate: profileDoc.personal?.birthDate || null,
      payFrequency: profileDoc.employment?.payFrequency || '',
      department: profileDoc.employment?.department || '',
      employeeId: profileDoc.employment?.employeeId || ''
    },
    session: { steps, selectedProductIds: selectedIds },
    canonical,
    currentCode,
    products,
    schema: {
      profile: profileClient,
      selection: selectionClient,
      productDetails,
      preConfirm: preConfirmClient,
    }
  };
  logTrace(traceId, '/api/enrollment/bootstrap', 'info', 'bootstrap', { userId: user?.id, products: products.length });
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'X-Trace-Id': traceId,
    }
  });
}
