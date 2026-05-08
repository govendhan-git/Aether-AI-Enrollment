import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    return (
      <div className="container py-10 text-white space-y-6">
        <div className="glass glass-card glow-border">
          <h1 className="text-2xl font-semibold neon-title">Welcome back</h1>
          <p className="text-sm opacity-80">Continue where you left off.</p>
          <div className="mt-4">
            <Link href="/dashboard" className="glass-button">Go to Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="container py-10 text-white space-y-6">
      <div className="glass glass-card glow-border fade-in-up">
        <h1 className="text-2xl font-semibold neon-title">Welcome to {process.env.NEXT_PUBLIC_APP_NAME || 'Enrollment App'}</h1>
        <p className="text-sm opacity-80">AI-orchestrated benefits enrollment. Secure, fast, and guided.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip"><span className="dot" style={{ background: 'var(--brand)' }} /> AI-guided</span>
          <span className="chip"><span className="dot" style={{ background: '#4bd5ff' }} /> Real-time</span>
          <span className="chip"><span className="dot" style={{ background: '#10B981' }} /> Secure</span>
        </div>
        <div className="mt-4 flex gap-3">
          <Link href="/sign-in" className="glass-button">Sign In</Link>
          <Link href="/enroll" className="glass-button" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>Explore Enrollment</Link>
        </div>
      </div>
    </div>
  );
}
