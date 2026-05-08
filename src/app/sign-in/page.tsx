"use client";
import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="container py-10 text-slate-900 dark:text-slate-100">
      <div className="max-w-xl mx-auto glass glass-card glow-border p-6 space-y-5">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold neon-title">Sign In</h1>
            <p className="text-sm opacity-80">Access your agentic benefits experience.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip text-slate-800 dark:text-slate-100"><span className="dot" style={{ background: 'var(--brand)' }} /> Secure</span>
            <span className="chip text-slate-800 dark:text-slate-100"><span className="dot" style={{ background: '#4bd5ff' }} /> SSO</span>
            <span className="chip text-slate-800 dark:text-slate-100"><span className="dot" style={{ background: '#10B981' }} /> Fast</span>
          </div>
        </div>
        <div className="glass rounded-2xl border border-white/20 dark:border-white/10 p-4 text-center">
          <SignIn
            routing="hash"
            appearance={{
              elements: {
                formButtonPrimary: 'glass-button w-full justify-center',
                card: 'bg-transparent shadow-none border-0 text-slate-900 dark:text-slate-100 mx-auto max-w-md',
                headerTitle: 'neon-title text-center',
                headerSubtitle: 'opacity-80 text-center',
                socialButtons: 'space-y-2',
                formFieldLabel: 'opacity-80 text-slate-600 dark:text-slate-200',
                formFieldInput: 'glass-input !bg-white/80 !text-slate-900 !border-slate-200 placeholder:text-slate-500 dark:!bg-white/10 dark:!text-white dark:!border-white/20 dark:placeholder:text-slate-400',
              },
              variables: { colorPrimary: '#6C47FF' }
            }}
          />
        </div>
      </div>
    </div>
  );
}
