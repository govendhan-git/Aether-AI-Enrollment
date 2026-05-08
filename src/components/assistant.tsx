"use client";
import { useEffect, useRef, useState } from 'react';
import { http } from '@/lib/http';

export default function AssistantWidget() {
	const [open, setOpen] = useState(false);
	const [health, setHealth] = useState<{ ok: boolean; provider?: string; model?: string } | null>(null);
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
	const scrolling = useRef<HTMLDivElement | null>(null);
	const endRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				// @ts-expect-error custom interceptor metadata not in Axios types
				const r = await http.get('/api/assistant/health', { metadata: { skipLoader: true } });
				if (mounted) setHealth({ ok: !!r.data?.ok, provider: r.data?.provider, model: r.data?.model });
			} catch {
				if (mounted) setHealth({ ok: false });
			}
		})();
		return () => { mounted = false; };
	}, []);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [messages, open]);

	async function send() {
		const text = input.trim();
		if (!text) return;
		setMessages((m) => [...m, { role: 'user', text }]);
		setInput('');
		try {
			// Try RAG for product Q&A (show global loader overlay)
			const r = await http.post('/api/assistant/rag', { query: text });
			let answer = (r.data?.answer as string) || '';
			if (!answer || /^(i\s+don\'t\s+know|not\s+specified|unsure)/i.test(answer)) {
				answer = 'I don\'t have that exact detail. You can ask about product coverage, eligibility, or costs, and I\'ll use available docs to help.';
			}
			setMessages((m) => [...m, { role: 'ai', text: answer }]);
		} catch {
			setMessages((m) => [...m, { role: 'ai', text: 'Sorry, I ran into an issue answering that.' }]);
		}
	}

	return (
		<>
			<button
				className="fixed bottom-4 right-4 rounded-full shadow-lg glass-button px-5 py-3 text-sm"
				onClick={() => setOpen((v) => !v)}
				aria-label="Assistant"
			>
				{health?.ok ? 'Ask AI' : 'AI Offline'}
			</button>
			{open && (
				<div className="fixed bottom-20 right-4 left-auto w-96 max-w-[92vw]">
					<div className="glass glass-card rounded-lg p-3 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<div className="text-sm opacity-80 inline-flex items-center gap-2">
								<span className={`${health?.ok ? 'bg-green-500 animate-pulse' : 'bg-red-500'} h-2 w-2 rounded-full`} />
								Assistant {health?.provider ? `· ${health.provider}` : ''} {health?.model ? `· ${health.model}` : ''}
							</div>
							<button className="text-xs opacity-70 hover:opacity-100" onClick={() => setOpen(false)}>Close</button>
						</div>
						<div ref={scrolling} className="h-64 overflow-auto rounded bg-black/5 dark:bg-white/5 p-2 space-y-2">
							{messages.map((m, i) => (
								<div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
									<span className={`${m.role === 'user' ? 'inline-block bg-blue-600/20' : 'inline-block bg-green-600/20'} px-2 py-1 rounded text-black dark:text-white`}>
										{m.text}
									</span>
								</div>
							))}
							<div ref={endRef} />
							{!messages.length && (
								<div className="text-xs opacity-70">Ask about products and benefits. I&apos;ll use product docs when available.</div>
							)}
						</div>
						<div className="flex gap-2">
							<input
								className="glass-input flex-1"
								placeholder="Ask a question..."
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
							/>
							<button className="glass-button px-3 py-2" onClick={send}>Send</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

