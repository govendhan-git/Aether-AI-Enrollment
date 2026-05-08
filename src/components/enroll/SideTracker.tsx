"use client";
import React from 'react';
import Image from 'next/image';
import { useAppSelector } from '../../store';

type Step = { code: string; label: string; status: 'pending' | 'complete'; summary?: string };
type Product = { _id: string; name: string; logoUrl?: string; description?: string; coverageOptions?: { level: string; monthlyCost: number }[] };

export function SideTracker({ products, sessionSteps }: { products: Product[]; sessionSteps: { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }[]; }) {
  const steps = useAppSelector((s) => s.enrollment.steps) as Step[];
  const current = useAppSelector((s) => s.enrollment.currentCode) as string;
  const selected = useAppSelector((s) => s.enrollment.selectedProductIds) as string[];
  const profile = useAppSelector((s) => s.enrollment.profile) as { email?: string; phone?: string; firstName?: string; lastName?: string; employeeId?: string; department?: string; payFrequency?: string; ssnLast4?: string; birthDate?: string | Date | null } | null;
  return (
    <aside className="sticky top-4 space-y-3">
      <div className="glass glass-card glow-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Your enrollment</div>
            <div className="text-[11px] opacity-70">Live updates as you proceed</div>
          </div>
          <div className="text-[10px] px-2 py-1 rounded-md bg-white/10">Secure session</div>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((s) => {
          const open = s.code === current;
          const isFuture = false;
          // Find any session data for this step
          const sess = sessionSteps.find(st => st.code === s.code);
          return (
            <div key={s.code} className={`glass glass-card ${open ? 'ring-2 ring-[var(--brand)]' : ''} ${isFuture ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.status === 'complete' ? 'bg-emerald-400' : 'bg-white/50'}`} />
                  <div className="font-medium text-sm">{s.label}</div>
                </div>
                <div className="text-[10px] opacity-70 uppercase">{s.status}</div>
              </div>
              {/* Only the current step is expanded with details */}
              {open ? (
                <div className="mt-2 text-xs opacity-90 space-y-2">
          {s.code === 'employee_profile' && (
                    <div>
                      <div>Name: {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '—'}</div>
                      <div>Email: {(profile?.email || '').trim() || '—'}</div>
                      <div>Employee ID: {(profile?.employeeId || '').trim() || '—'}</div>
                      <div>Department: {(profile?.department || '').trim() || '—'}</div>
                      <div>Pay Frequency: {(profile?.payFrequency || '').trim() || '—'}</div>
                    </div>
                  )}
                  {s.code === 'product_select' && (
                    <div>
                      <div>Selected: {selected.length ? `${selected.length}` : 'None'}</div>
                      <ul className="mt-1 list-disc pl-5">
                        {selected.map(id => {
                          const p = products.find(pp => pp._id === id);
                          return <li key={id}>{p?.name || id}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                  {String(s.code).startsWith('product-') && (() => {
                    const id = String(s.code).replace('product-', '');
                    const p = products.find(pp => pp._id === id);
                    const data = sess?.data as { level?: string; declined?: boolean } | undefined;
                    return (
                      <div>
                        <div className="flex items-center gap-2">
                          {p?.logoUrl ? <Image src={p.logoUrl} alt="" width={16} height={16} className="h-4 w-4 rounded bg-white/10" /> : null}
                          <div>Product: {p?.name || id}</div>
                        </div>
                        <div>Status: {data?.declined ? 'Declined' : (data?.level ? `Level: ${data.level}` : 'Pending')}</div>
                      </div>
                    );
                  })()}
                  {s.code === 'pre_confirm' && (
                    <div>
                      <div>Review your selections and submit when ready.</div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
