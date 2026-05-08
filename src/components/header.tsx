"use client";
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { http } from '@/lib/http';

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [ai, setAi] = useState<{ ok: boolean; provider?: string; model?: string; reason?: string } | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
  (async () => {
      try {
        // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.get('/api/assistant/health', { metadata: { skipLoader: true } });
        if (alive) setAi({ ok: !!r.data?.ok, provider: r.data?.provider, model: r.data?.model, reason: r.data?.reason });
      } catch (err: unknown) {
        const anyErr = err as { response?: { data?: { reason?: string } } ; message?: string };
        const reason = anyErr?.response?.data?.reason || anyErr?.message;
        if (alive) setAi({ ok: false, reason });
      }
    })();
    // Poll every 20s to reflect env/model changes
    timer = setInterval(async () => {
      if (!alive) return;
      try {
        // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.get('/api/assistant/health', { metadata: { skipLoader: true } });
        if (alive) setAi({ ok: !!r.data?.ok, provider: r.data?.provider, model: r.data?.model, reason: r.data?.reason });
      } catch (err: unknown) {
        const anyErr = err as { response?: { data?: { reason?: string } } ; message?: string };
        const reason = anyErr?.response?.data?.reason || anyErr?.message;
        if (alive) setAi({ ok: false, reason });
      }
    }, 20000);
  return () => { alive = false; if (timer) clearInterval(timer as unknown as number); };
  }, []);

  return (
    <div className="w-full">
      <div className="container py-4">
        <div className="glass glass-card flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold neon-title">
            {process.env.NEXT_PUBLIC_APP_NAME || 'Enrollment App'}
          </Link>
          <div className="flex items-center gap-3">
            {ai && (
              <span
                className={`text-[11px] px-2 py-1 rounded-full border inline-flex items-center gap-1 max-w-[320px] truncate ${ai.ok ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}
                title={`${ai.provider || 'AI'}${ai.model ? ` · ${ai.model}` : ''}${ai.reason ? `\n${ai.reason}` : ''}`}
              >
                <span className={`h-2 w-2 rounded-full ${ai.ok ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="truncate">
                  {ai.ok ? (ai.provider ? `${ai.provider}` : 'AI') : 'AI Offline'}{ai?.model ? ` · ${ai.model}` : ''}{!ai.ok && ai.reason ? ` · ${ai.reason}` : ''}
                </span>
              </span>
            )}
            {mounted && (
              <select
                className="glass-select min-w-[110px] max-w-[200px]"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            )}
            <Link href="/enroll" className="glass-button px-3 py-2 text-sm">
              Enroll
            </Link>
            <UserButton />
          </div>
        </div>
      </div>
    </div>
  );
}
