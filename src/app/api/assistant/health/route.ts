import { NextResponse } from 'next/server';
import { getLLMProvider, getOpenAICompatible, lcChat } from '@/lib/langchain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const provider = getLLMProvider();
  let model = 'unknown';
  let ok = false;
  let reason: string | undefined;
  let lastStatus: number | undefined;
  const checks: Array<{ method: string; ok: boolean; status?: number; reason?: string }> = [];
  try {
  const cfg = getOpenAICompatible('chat');
    model = cfg.model;
    ok = !!cfg.apiKey;
    if (!ok) reason = 'missing_api_key_or_config';
    if (ok) {
      // 1) LangChain path
      try {
  const content = await lcChat([
          { role: 'system', content: 'Reply with exactly: pong' },
          { role: 'user', content: 'ping' }
  ], { task: 'chat' });
        ok = !!content;
        checks.push({ method: 'langchain', ok });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({ method: 'langchain', ok: false, reason: msg });
      }
      // 2) Direct REST to cfg.baseURL
      if (!ok) {
        try {
          const root = cfg.baseURL.replace(/\/$/, '');
          const url = root.includes('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({ model: cfg.model, max_tokens: 1, temperature: 0, messages: [ { role: 'system', content: 'pong' }, { role: 'user', content: 'ping' } ] })
          });
          lastStatus = res.status;
          if (res.ok) { ok = true; checks.push({ method: 'rest_openai_compat', ok: true, status: res.status }); }
          else {
            let body = '';
            try { body = await res.text(); } catch {}
            const rsn = `${res.status} ${res.statusText}\n${body.slice(0,300)}`;
            checks.push({ method: 'rest_openai_compat', ok: false, status: res.status, reason: rsn });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          checks.push({ method: 'rest_openai_compat', ok: false, reason: msg });
        }
      }
      // 3) Groq SDK (native) — uses api.groq.com root (no /openai)
      if (!ok && provider === 'groq') {
        try {
          const { default: Groq } = await import('groq-sdk');
          const sdkBase = (process.env.GROQ_SDK_BASE_URL || 'https://api.groq.com').trim();
          const client = new Groq({ apiKey: cfg.apiKey, baseURL: sdkBase });
          const resp = await client.chat.completions.create({ model: cfg.model, messages: [ { role: 'system', content: 'pong' }, { role: 'user', content: 'ping' } ], max_tokens: 1 } as unknown as Parameters<typeof client.chat.completions.create>[0]);
          const content = (resp as unknown as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || '';
          ok = !!content;
          checks.push({ method: 'groq_sdk', ok });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          checks.push({ method: 'groq_sdk', ok: false, reason: msg });
        }
      }
    }
  } catch (e) {
    ok = false;
    const msg = e instanceof Error ? e.message : String(e);
    reason = `config_error:${msg}`;
  }
  const flags = {
    MAP_INPUT_USE_LLM: String(process.env.MAP_INPUT_USE_LLM || '').toLowerCase() === 'true',
  };
  const payload = { ok, provider, model, flags, lastStatus, reason, checks };
  const res = NextResponse.json(payload, { status: ok ? 200 : 503 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
