import { NextRequest, NextResponse } from 'next/server';
import { getOpenAICompatible, getLLMProvider } from '@/lib/langchain';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { profile, products } = body || {};
    // Helper to produce a simple heuristic fallback
    function heuristic() {
      type P = { _id?: string; id?: string; name?: string; category?: string; coverageOptions?: Array<{ level: string; monthlyCost: number }> };
      const list = Array.isArray(products) ? (products as P[]) : [];
      const scored = list.map((p) => {
        const opt = Array.isArray(p.coverageOptions) ? p.coverageOptions.length : 0;
        const cat = (p.category || '').toLowerCase();
        let score = opt;
        if (/health|medical/.test(cat)) score += 2;
        if (/dental|vision/.test(cat)) score += 1;
        return { p, score };
      }).sort((a,b)=>b.score-a.score);
      const picks = scored.slice(0, Math.min(3, scored.length)).map(({ p }) => ({ productId: String(p._id || p.id || ''), reason: `Popular option${(p.coverageOptions?.length? ' with multiple levels' : '')}.` }));
      const names = picks.map(pk => list.find(pp => String(pp._id||pp.id)===pk.productId)?.name || pk.productId).filter(Boolean).join(', ');
      const summary = names ? `A balanced bundle: ${names}. Adjust based on budget and needs.` : 'Tailor your bundle based on needs and budget.';
      return { picks, summary };
    }

    // Try LLM path first; fall back gracefully on any error
    try {
  const cfg = getOpenAICompatible('json');
  const provider = getLLMProvider();
  const root = cfg.baseURL.replace(/\/$/, '');
  const url = root.includes('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
      const sys = 'You recommend 1-3 benefits products as a bundle. Be concise. Output JSON: {\n  "picks": Array<{ productId: string, reason: string }>,\n  "summary": string\n}';
      type ProdIn = { _id?: string; id?: string; name?: string; category?: string };
      const user = JSON.stringify({ profile, products: (products as ProdIn[] || []).map((p)=>({ id: p._id || p.id, name: p.name, category: p.category })) });
  const body: Record<string, unknown> = { model: cfg.model, temperature: 0.1, max_tokens: 400, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] };
  if (provider === 'openai') body.response_format = { type: 'json_object' };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`LLM ${res.status}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  let raw = json.choices?.[0]?.message?.content || '{}';
  // Strip code fences like ```json ... ``` and trim
  raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: { picks?: Array<{ productId: string; reason: string }>; summary?: string } = {};
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      if (!parsed.picks?.length && !parsed.summary) {
        const fb = heuristic();
        return NextResponse.json({ ok: true, ...fb, source: 'fallback' });
      }
      return NextResponse.json({ ok: true, ...parsed, source: 'llm' });
    } catch {
      const fb = heuristic();
      return NextResponse.json({ ok: true, ...fb, source: 'fallback' });
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
