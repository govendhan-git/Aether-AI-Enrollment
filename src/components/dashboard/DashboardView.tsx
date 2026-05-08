"use client";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatWidget } from '@/components/ui/StatWidget';
import { AnimatedButton } from '@/components/ui/AnimatedButton';

export type DashboardProduct = { id: string; name: string; category: string; description?: string; logoUrl?: string };
export type DashboardEnrollment = Record<string, { status: 'enrolled' | 'declined'; level?: string; date?: string }>;

export default function DashboardView({
  userName,
  userEmail,
  companyName,
  products,
  enrolled,
  hasActiveSession,
  hasFinalEnrollment,
}: {
  userName?: string;
  userEmail?: string;
  companyName?: string;
  products: DashboardProduct[];
  enrolled: DashboardEnrollment;
  hasActiveSession: boolean;
  hasFinalEnrollment: boolean;
}) {
  return (
    <div className="container py-10 text-slate-900 dark:text-slate-100 space-y-6">
      <div className="glass glass-card glow-border">
        <h1 className="text-2xl font-semibold neon-title">{`Welcome${userName ? `, ${userName}` : ''}`}</h1>
        {userEmail ? <p className="text-sm opacity-80">Signed in as {userEmail}</p> : null}
        {companyName ? <p className="text-sm opacity-80">Company: {companyName}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip text-slate-800 dark:text-slate-100"><span className="dot" style={{ background: 'var(--brand)' }} /> Personalized</span>
          <span className="chip text-slate-800 dark:text-slate-100"><span className="dot" style={{ background: '#4bd5ff' }} /> Real-time</span>
          <span className="chip text-slate-800 dark:text-slate-100"><span className="dot" style={{ background: '#10B981' }} /> Secure</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatWidget label="Available" value={products.length} hint="Benefits offered" />
        <StatWidget label="Enrolled" value={Object.values(enrolled).filter(v=>v.status==='enrolled').length} />
        <StatWidget label="Declined" value={Object.values(enrolled).filter(v=>v.status==='declined').length} />
        <StatWidget label="Status" value={hasActiveSession ? 'In progress' : 'Idle'} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {p.logoUrl ? <Image src={p.logoUrl} alt="" width={24} height={24} className="h-6 w-6 rounded bg-white/10" /> : null}
                  <div className="font-semibold">{p.name}</div>
                </div>
                <div className="text-xs opacity-70">{p.category}</div>
              </div>
              {(() => {
                const st = enrolled[p.id];
                if (st?.status === 'enrolled') return <span className="chip"><span className="dot" style={{ background: '#10B981' }} /> Enrolled</span>;
                if (st?.status === 'declined') return <span className="chip"><span className="dot" style={{ background: '#f43f5e' }} /> Declined</span>;
                return <span className="chip"><span className="dot" style={{ background: 'var(--brand)' }} /> Available</span>;
              })()}
            </div>
            {p.description ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-200">{p.description}</p> : null}
            {(() => {
              const st = enrolled[p.id];
              if (!st) return null;
              return <p className="mt-1 text-xs opacity-70">{st.status === 'enrolled' ? `Coverage: ${st.level}` : 'Coverage declined'}{st.date ? ` • ${new Date(st.date).toLocaleDateString()}` : ''}</p>;
            })()}
          </Card>
        ))}
      </div>
      <div>
        {/* Prefer Review/Update when a final enrollment exists, even if a session is active */}
        {hasFinalEnrollment ? (
          <Link href="/enroll"><AnimatedButton>Review/Update Enrollment</AnimatedButton></Link>
        ) : hasActiveSession ? (
          <Link href="/enroll"><AnimatedButton>Resume Enrollment</AnimatedButton></Link>
        ) : (
          <Link href="/enroll"><AnimatedButton>Start Enrollment</AnimatedButton></Link>
        )}
      </div>
    </div>
  );
}
