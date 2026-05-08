export const dynamic = 'force-dynamic';
import { dbConnect } from '@/lib/db';
import { LegalEntity } from '@/models/LegalEntity';
import { Product } from '@/models/Product';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import { Enrollment } from '@/models/Enrollment';
import { getOrLinkProfile } from '@/lib/profile';
import { ChatEnrollment } from '@/components/enroll/ChatEnrollment';
import { redirect } from 'next/navigation';

export default async function EnrollPage() {
  try {
    await dbConnect();
    const { user, profile } = await getOrLinkProfile();

    // If not signed in, send to sign-in and return
    if (!user) {
      redirect('/sign-in?redirect_url=/enroll');
    }

    // Narrow the profile shape for safe access
    const p = profile as unknown as { _id?: { toString(): string }; legalEntityId?: unknown } | null;

    // Preload eligible products for UX, but guard when profile/entity missing
    if (p?.legalEntityId) {
      const company = await LegalEntity.findById(p.legalEntityId).lean<{ productIds?: unknown[] }>();
      if (company?.productIds && Array.isArray(company.productIds) && company.productIds.length > 0) {
        await Product.find({ _id: { $in: company.productIds } }).lean();
      }
    }

    // Ensure a session exists only when we have required identifiers
    if (p?._id && p.legalEntityId) {
      const existing = await EnrollmentSession.findOne({ userId: p._id, active: true });
      if (!existing) {
        // If user has a finalized enrollment, start in review mode seeded from last submission.
        const latest = await Enrollment.findOne({ userId: p._id }).sort({ createdAt: -1 }).lean<{
          products: { productId: { toString(): string }; declined?: boolean; level?: string }[]
        }>();
        if (latest) {
          const selectedIds = (latest.products || [])
            .filter((pe) => !pe.declined)
            .map((pe) => pe.productId.toString());
          const steps = [
            { code: 'employee_profile', status: 'complete' as const },
            { code: 'product_select', status: 'complete' as const },
            ...latest.products.map((pe) => ({
              code: `product-${pe.productId.toString()}`,
              status: 'complete' as const,
              data: pe.declined ? { declined: true } : (pe.level ? { level: pe.level } : {}),
            })),
            { code: 'pre_confirm', status: 'pending' as const },
          ];
          await EnrollmentSession.create({
            userId: p._id,
            legalEntityId: p.legalEntityId,
            steps,
            selectedProductIds: selectedIds,
          });
        } else {
          await EnrollmentSession.create({
            userId: p._id,
            legalEntityId: p.legalEntityId,
            steps: [
              { code: 'employee_profile', status: 'pending' as const },
              { code: 'product_select', status: 'pending' as const },
            ],
            selectedProductIds: []
          });
        }
      }
    }

    // If profile couldn't be provisioned, show a friendly message instead of crashing
    if (!p?._id || !p.legalEntityId) {
      return (
        <div className="container py-8 text-white space-y-6">
          <div className="glass glass-card glow-border fade-in-up">
            <h1 className="text-2xl font-semibold neon-title">Enrollment</h1>
            <p className="text-sm opacity-80">We couldn&apos;t locate your employee profile yet.</p>
            <p className="text-sm opacity-80">If you just signed up, give it a moment and refresh. Otherwise, contact your HR admin to be provisioned.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="container py-8 text-white space-y-6">
        <div className="glass glass-card glow-border fade-in-up">
          <h1 className="text-2xl font-semibold neon-title">Enrollment</h1>
          <p className="text-sm opacity-80">Chat-based, agentic enrollment. You can pause and resume anytime.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip"><span className="dot" style={{ background: 'var(--brand)' }} /> AI-guided</span>
            <span className="chip"><span className="dot" style={{ background: '#4bd5ff' }} /> Multilingual</span>
            <span className="chip"><span className="dot" style={{ background: '#10B981' }} /> Voice-ready</span>
          </div>
        </div>
        <div className="fade-in-up fade-in-delay">
          <ChatEnrollment />
        </div>
      </div>
    );
  } catch (err) {
    console.error('EnrollPage error:', err);
    return (
      <div className="container py-8 text-white space-y-6">
        <div className="glass glass-card glow-border">
          <h1 className="text-2xl font-semibold neon-title">Enrollment</h1>
          <p className="text-sm opacity-80">Something went wrong loading enrollment. Please refresh or try again later.</p>
        </div>
      </div>
    );
  }
}
