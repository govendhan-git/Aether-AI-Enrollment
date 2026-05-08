import Link from 'next/link';

export default function StepPage({ params }: { params: { stepCode: string } }) {
	const { stepCode } = params || { stepCode: '' };
	return (
		<div className="container py-10 text-white">
			<div className="glass glass-card glow-border max-w-2xl fade-in-up">
				<div className="text-2xl font-semibold neon-title">Enrollment Step</div>
				<div className="mt-1 text-sm opacity-80">{stepCode ? `Step: ${stepCode}` : 'Unknown step'}</div>
				<div className="mt-4 text-sm">
					This step is handled by the agentic chat experience. Continue in the enrollment chat to proceed, or use the button below to go back.
				</div>
				<div className="mt-5">
					<Link href="/enroll" className="glass-button">Return to Enrollment</Link>
				</div>
			</div>
		</div>
	);
}
