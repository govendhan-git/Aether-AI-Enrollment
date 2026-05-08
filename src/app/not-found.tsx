export default function NotFound() {
  return (
    <div className="container py-16 text-white">
      <div className="max-w-xl mx-auto glass glass-card glow-border text-center fade-in-up">
        <div className="text-4xl font-semibold neon-title">404</div>
        <div className="mt-2 text-sm opacity-80">We couldn’t find that page.</div>
        <div className="mt-4 flex justify-center gap-3">
          <a href="/" className="glass-button">Home</a>
          <a href="/dashboard" className="glass-button">Dashboard</a>
        </div>
      </div>
    </div>
  );
}
