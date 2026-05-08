export default function Loading() {
	return (
		<div className="container py-10 text-white">
			<div className="glass glass-card glow-border">
				<div className="flex items-center gap-3">
					<div className="skeleton-avatar" />
					<div className="flex-1">
						<div className="skeleton-line w-40 mb-2" />
						<div className="skeleton-line w-24" />
					</div>
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
					<div className="skeleton-tile" />
					<div className="skeleton-tile" />
					<div className="skeleton-tile" />
					<div className="skeleton-tile" />
				</div>
			</div>
		</div>
	);
}
