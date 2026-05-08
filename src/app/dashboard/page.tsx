export const dynamic = 'force-dynamic';
import { dbConnect } from '@/lib/db';
import { LegalEntity } from '@/models/LegalEntity';
import { Product } from '@/models/Product';
import DashboardView, { DashboardProduct, DashboardEnrollment } from '@/components/dashboard/DashboardView';
import { getOrLinkProfile } from '@/lib/profile';
import { Enrollment } from '@/models/Enrollment';
import { EnrollmentSession } from '@/models/EnrollmentSession';

export default async function DashboardPage() {
  try {
    await dbConnect();
    const { profile } = await getOrLinkProfile();
    if (!profile) {
      return <div className="container py-10 text-slate-900 dark:text-slate-100">No profile found. Please contact your broker.</div>;
    }
    const p = profile as unknown as { _id: { toString(): string }; legalEntityId: unknown; personal?: { firstName?: string; lastName?: string; email?: string } };
    const company = await LegalEntity.findById(p.legalEntityId).lean<{ _id: unknown; name: string; productIds?: unknown[] }>();
  const rawProducts = await Product.find({ _id: { $in: company?.productIds || [] } }).lean<{ _id: { toString(): string }; name: string; category: string; description?: string; logoUrl?: string }[]>();
    // Sanitize products to primitives only
  const products = (rawProducts || []).map((it) => ({ id: it._id.toString(), name: it.name, category: it.category, description: it.description || '', logoUrl: it.logoUrl }));
    const latestEnrollment = await Enrollment.findOne({ userId: p._id }).sort({ createdAt: -1 }).lean<{ products: { productId: { toString(): string }; declined?: boolean; level?: string }[]; submittedAt?: Date }>();
    const activeSession = await EnrollmentSession.findOne({ userId: p._id, active: true }).lean();

    // Use a plain record instead of Map/Date
    const enrolled: Record<string, { status: 'enrolled'|'declined'; level?: string; date?: string }> = {};
    if (latestEnrollment) {
      for (const pe of (latestEnrollment.products as { productId: { toString(): string }; declined?: boolean; level?: string }[])) {
        enrolled[pe.productId.toString()] = { status: pe.declined ? 'declined' : 'enrolled', level: pe.level, date: latestEnrollment.submittedAt ? new Date(latestEnrollment.submittedAt).toISOString() : undefined };
      }
    }

    const viewProps: {
      userName?: string;
      userEmail?: string;
      companyName?: string;
      products: DashboardProduct[];
      enrolled: DashboardEnrollment;
      hasActiveSession: boolean;
      hasFinalEnrollment: boolean;
    } = {
      userName: p.personal?.firstName,
      userEmail: p.personal?.email,
      companyName: company?.name,
      products,
      enrolled,
      hasActiveSession: !!activeSession,
      hasFinalEnrollment: !!latestEnrollment,
    };
    return <DashboardView {...viewProps} />;
  } catch (err) {
    console.error('Dashboard load failed:', err);
    // Soft-fallback to avoid RSC digest errors
    return (
      <div className="container py-10 text-slate-900 dark:text-slate-100">
        <div className="glass glass-card glow-border">
          <h2 className="text-xl font-semibold">Dashboard temporarily unavailable</h2>
          <p className="opacity-80 text-sm mt-2">Please try again in a moment.</p>
        </div>
      </div>
    );
  }
}
