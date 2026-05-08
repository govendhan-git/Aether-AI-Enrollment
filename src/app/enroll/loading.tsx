export default function Loading() {
	return (
		<div className="container py-10 text-white">
			<div className="glass glass-card glow-border max-w-2xl animate-pulse">
				<div className="h-6 w-40 bg-white/20 rounded mb-4" />
				<div className="h-4 w-3/4 bg-white/10 rounded mb-2" />
				<div className="h-4 w-2/3 bg-white/10 rounded" />
			</div>
		</div>
	);
}
