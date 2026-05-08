"use client";

import { useEffect, useMemo, useState } from 'react';

type Flags = { MAP_INPUT_USE_LLM: boolean };

type IntentItem = {
  _id: string;
  traceId: string;
  step: string;
  text: string;
  updates?: Record<string, unknown>;
  nav?: { type: 'proceed' | 'back' | 'goto'; to?: string };
  source: 'llm' | 'heuristic' | 'none';
  createdAt?: string;
};

export default function ClientAdminConsole() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<IntentItem[]>([]);
  const [traceId, setTraceId] = useState('');
  const [loadingIntents, setLoadingIntents] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetFinal, setResetFinal] = useState(true);
  const [resetScrub, setResetScrub] = useState(true);
  const [resetResult, setResetResult] = useState<null | { ok?: boolean; error?: string; totals?: Record<string, number> }>(null);

  const loadFlags = async () => {
    const res = await fetch('/api/admin/settings', { cache: 'no-store' });
    const json = await res.json();
    if (json?.ok) setFlags(json.flags as Flags);
  };
  const saveFlags = async (patch: Partial<Flags>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const json = await res.json();
      if (json?.ok) setFlags(json.flags as Flags);
    } finally { setSaving(false); }
  };
  const loadIntents = async (trace?: string) => {
    setLoadingIntents(true);
    try {
      const q = trace ? `?traceId=${encodeURIComponent(trace)}` : '';
      const res = await fetch(`/api/admin/intents${q}`, { cache: 'no-store' });
      const json = await res.json();
      if (json?.ok) setItems(json.items as IntentItem[]);
    } finally { setLoadingIntents(false); }
  };

  const resetUser = async () => {
    setResetResult(null);
    if (!resetEmail) return;
    const res = await fetch('/api/admin/users/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail, final: resetFinal, scrubProfile: resetScrub }),
    });
    const json = await res.json().catch(() => ({}));
    setResetResult(json);
  };

  useEffect(() => { loadFlags(); loadIntents(); }, []);

  const status = useMemo(() => {
    if (!flags) return '...';
    return flags.MAP_INPUT_USE_LLM ? 'LLM mode' : 'Heuristic mode';
  }, [flags]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Assistant Settings</div>
          <div className="text-xs opacity-80">Runtime toggle for NLP mapping</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`chip ${flags?.MAP_INPUT_USE_LLM ? 'bg-emerald-600/20' : 'bg-slate-600/20'}`}>{status}</span>
          <button
            className="glass-button"
            disabled={!flags || saving}
            onClick={() => saveFlags({ MAP_INPUT_USE_LLM: !flags!.MAP_INPUT_USE_LLM })}
          >{flags?.MAP_INPUT_USE_LLM ? 'Switch to Heuristic' : 'Switch to LLM'}</button>
        </div>
      </div>
      <div className="mt-6">
        <div className="font-semibold mb-2">Reset User Enrollment</div>
        <div className="text-xs opacity-80">Deletes sessions and final enrollments; optionally scrubs profile.</div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[260px]">
            <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="user@example.com" className="input text-black w-full" />
          </div>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={resetFinal} onChange={(e) => setResetFinal(e.target.checked)} /> final</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={resetScrub} onChange={(e) => setResetScrub(e.target.checked)} /> scrub</label>
          <button className="glass-button" onClick={resetUser} disabled={!resetEmail}>Reset</button>
        </div>
        {resetResult && (
          <div className="mt-2 text-xs">
            {resetResult.ok ? (
              <span className="text-emerald-300">Done.</span>
            ) : (
              <span className="text-amber-300">{resetResult.error || 'Failed'}</span>
            )}
            {resetResult.totals && (
              <pre className="text-[11px] bg-black/30 p-2 rounded overflow-auto mt-2">{JSON.stringify(resetResult.totals, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="font-semibold">Recent Parsed Intents</div>
        <div className="text-xs opacity-80">Filter by Trace ID</div>
        <div className="mt-2 flex gap-2">
          <input value={traceId} onChange={(e) => setTraceId(e.target.value)} placeholder="TRACE-ID" className="input text-black" />
          <button className="glass-button" onClick={() => loadIntents(traceId || undefined)} disabled={loadingIntents}>Apply</button>
          <button className="glass-button" onClick={() => { setTraceId(''); loadIntents(); }} disabled={loadingIntents}>Clear</button>
        </div>
        <div className="mt-4 max-h-80 overflow-auto space-y-2">
          {items.map((it) => (
            <div key={it._id} className="glass glass-subtle p-3 rounded">
              <div className="text-xs opacity-80 flex justify-between">
                <span>{it.createdAt ? new Date(it.createdAt).toLocaleTimeString() : ''}</span>
                <span>trace: <b>{it.traceId}</b></span>
              </div>
              <div className="text-sm"><b>step:</b> {it.step}</div>
              <div className="text-sm"><b>text:</b> {it.text}</div>
              <div className="text-xs mt-2 grid grid-cols-2 gap-3">
                <div>
                  <div className="opacity-80">updates</div>
                  <pre className="text-[11px] bg-black/30 p-2 rounded overflow-auto">{JSON.stringify(it.updates || {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="opacity-80">nav ({it.source})</div>
                  <pre className="text-[11px] bg-black/30 p-2 rounded overflow-auto">{JSON.stringify(it.nav || {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          ))}
          {!items.length && <div className="text-sm opacity-70">No intent logs yet.</div>}
        </div>
      </div>
    </div>
  );
}
