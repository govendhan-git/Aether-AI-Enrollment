import Link from 'next/link';
import ClientAdminConsole from './ui/ClientAdminConsole';
import { requireBroker } from '@/lib/authz';

export default async function AdminPage() {
    const authz = await requireBroker();
	return (
		<div className="container py-10 text-white space-y-6">
			<div className="glass glass-card glow-border">
				<h1 className="text-2xl font-semibold neon-title">Admin</h1>
				<p className="text-sm opacity-80">Manage entities, products, and users.</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<span className="chip"><span className="dot" style={{ background: 'var(--brand)' }} /> Entities</span>
					<span className="chip"><span className="dot" style={{ background: '#4bd5ff' }} /> Products</span>
					<span className="chip"><span className="dot" style={{ background: '#10B981' }} /> Users</span>
				</div>
			</div>
			{!authz.ok && (
				<div className="glass glass-card">
					<div className="text-sm">You don’t have access to Admin. Please contact support.</div>
				</div>
			)}
			<div className="glass glass-card">
				<div className="text-sm opacity-80">Quick links</div>
				<div className="mt-3 flex flex-wrap gap-3">
					<Link href="/dashboard" className="glass-button">Back to Dashboard</Link>
					<Link href="/enroll" className="glass-button">Enrollment</Link>
				</div>
			</div>
			{authz.ok && (
				<div className="glass glass-card">
					<ClientAdminConsole />
				</div>
			)}
		</div>
	);
}
