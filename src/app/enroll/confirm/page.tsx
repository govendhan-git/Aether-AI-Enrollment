export const dynamic = 'force-dynamic';
import { dbConnect } from '@/lib/db';
import { Enrollment } from '@/models/Enrollment';
import { Product } from '@/models/Product';
import Link from 'next/link';
import { getOrLinkProfile } from '@/lib/profile';

export default async function ConfirmPage() {
  await dbConnect();
  const { profile } = await getOrLinkProfile();
  const p = profile as unknown as { _id: { toString(): string } };
  const latest = await Enrollment.findOne({ userId: p._id }).sort({ createdAt: -1 }).lean<{ products: { productId: unknown; declined: boolean; level?: string }[]; totalMonthlyCost: number; confirmationNumber: string }>();
  const products = latest ? await Product.find({ _id: { $in: latest.products.map((p) => p.productId) } }).lean<{ _id: { toString(): string }; name: string; coverageOptions?: { level: string; monthlyCost: number }[] }[]>() : [];
  if (!latest) return (
    <div className="container py-10 text-white">
      <div className="glass glass-card glow-border">
        <div className="text-lg">No recent enrollment found.</div>
        <div className="mt-3">
          <a href="/enroll" className="glass-button">Start enrollment</a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container py-10 text-white">
      {/* Hero success card */}
      <div className="glass glass-card glow-border">
        <div className="flex items-center gap-4">
          <div className="pulse-ring">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, var(--brand), var(--brand-600))',
              boxShadow: '0 10px 30px rgba(108,71,255,0.35)'
            }}>
              {/* check icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold">
              <span className="neon-title">Enrollment Confirmed</span>
            </div>
            <div className="mt-1 text-sm text-gray-300">We’ve processed your selection successfully.</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="text-sm text-gray-300">Confirmation #</div>
          <div className="px-2 py-1 rounded-md bg-white/10 border border-white/15 font-mono text-sm tracking-wide">{latest.confirmationNumber}</div>
        </div>
      </div>

      {/* Products summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="md:col-span-2 space-y-4">
          {/* Employee Profile summary first */}
          <div className="glass glass-card">
            <div className="text-lg font-semibold mb-3">Employee Profile</div>
            {(() => {
              const prof = profile as unknown as {
                personal?: { firstName?: string; lastName?: string; email?: string; phone?: string; birthDate?: Date };
                employment?: { employeeId?: string; department?: string; payFrequency?: string };
              };
              const rows: { label: string; value?: string }[] = [
                { label: 'First name', value: prof?.personal?.firstName },
                { label: 'Last name', value: prof?.personal?.lastName },
                { label: 'Email', value: prof?.personal?.email },
                { label: 'Phone', value: prof?.personal?.phone },
                { label: 'Date of birth', value: prof?.personal?.birthDate ? new Date(prof.personal.birthDate).toLocaleDateString() : undefined },
                { label: 'Employee ID', value: prof?.employment?.employeeId },
                { label: 'Department', value: prof?.employment?.department },
                { label: 'Pay frequency', value: prof?.employment?.payFrequency },
              ];
              return (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {rows.map((r, i) => (
                    <li key={`prof-${i}`} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                      <span className="opacity-75">{r.label}</span>
                      <span className="font-medium">{r.value || '—'}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
          <div className="glass glass-card">
            <div className="text-lg font-semibold mb-3">Your selections</div>
            <div className="space-y-2">
              {latest.products.map((p: { productId: unknown; declined: boolean; level?: string }, idx: number) => {
                const id = String(p.productId);
                const prod = products.find((x: { _id: { toString(): string }; name?: string; coverageOptions?: { level: string; monthlyCost: number }[] }) => x._id.toString() === id);
                const price = !p.declined && p.level ? prod?.coverageOptions?.find(o => o.level === p.level)?.monthlyCost : undefined;
                const status = p.declined ? 'Declined' : (p.level ? `Level: ${p.level}${typeof price === 'number' ? ` — $${price.toFixed(2)}/mo` : ''}` : 'Selected');
                return (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ background: p.declined ? '#f43f5e' : 'var(--brand)' }} />
                      <div className="font-medium">{prod?.name || id}</div>
                    </div>
                    <div className="text-sm text-gray-300">{status}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="glass glass-card">
            <div className="text-lg font-semibold">Monthly total</div>
            <div className="mt-2 text-3xl font-semibold">${latest.totalMonthlyCost?.toFixed(2)}</div>
            <div className="mt-1 text-xs text-gray-300">Payroll deductions will reflect this total.</div>
            <div className="mt-5 flex gap-3">
              <Link href="/dashboard" className="glass-button">Back to Dashboard</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
