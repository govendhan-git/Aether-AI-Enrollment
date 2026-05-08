import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ProfileSchema, productDetailSchema } from '@/schemas/enrollment';
import { getOpenAICompatible, getLLMProvider } from '@/lib/langchain';
import { getTraceIdFromRequest, logTrace } from '@/lib/trace';
import { dbConnect } from '@/lib/db';
import { Setting } from '@/models/Setting';
import { IntentLog } from '@/models/IntentLog';

// Minimal, safe NLP mapping mock: expects { step, text, productLevels? }
// This does NOT use an external LLM; it’s a placeholder where function-calling can be added.
const BodySchema = z.object({
  step: z.enum(['employee_profile', 'product_select', 'pre_confirm']).or(z.string().regex(/^product-/)),
  text: z.string().min(1),
  productLevels: z.record(z.array(z.string())).optional(),
});

type Nav = { type: 'proceed' | 'back' | 'goto'; to?: 'profile' | 'selection' | 'review' | `product-${string}` };

function norm(s: string) { return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,' ').trim(); }
function levenshtein(a: string, b: string) {
  const m = a.length, n = b.length; const dp = Array.from({length: m+1},()=>Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0]=i; for (let j=0;j<=n;j++) dp[0][j]=j;
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++) {
    const cost = a[i-1] === b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
  }
  return dp[m][n];
}
function bestFuzzyMatch(input: string, candidates: string[]): string | null {
  const ni = norm(input);
  let best: { s: string; d: number } | null = null;
  for (const c of candidates) {
    const d = levenshtein(ni, norm(c));
    if (!best || d < best.d) best = { s: c, d };
  }
  return best && best.d <= Math.max(2, Math.floor(best.s.length*0.25)) ? best.s : null;
}

export async function POST(req: NextRequest) {
  const traceId = getTraceIdFromRequest(req);
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    logTrace(traceId, '/api/assistant/map-input', 'error', 'invalid_body', { error: parsed.error.flatten() });
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { step, text, productLevels } = parsed.data;

  // Feature flag: enable LLM JSON extraction when explicitly turned on
  let useLLM = (process.env.MAP_INPUT_USE_LLM || '').toLowerCase() === 'true';
  try {
    await dbConnect();
    const setting = await Setting.findOne({ key: 'MAP_INPUT_USE_LLM' }).lean<{ value?: unknown }>();
    if (setting && typeof setting.value !== 'undefined') {
      useLLM = typeof setting.value === 'boolean' ? setting.value : String(setting.value).toLowerCase() === 'true';
    }
  } catch (e) {
    logTrace(traceId, '/api/assistant/map-input', 'error', 'settings_lookup_failed', { error: (e as Error).message });
  }
  const provider = getLLMProvider();
  const lower = text.toLowerCase();
  const normalized = norm(text);
  let nav: Nav | undefined;

  logTrace(traceId, '/api/assistant/map-input', 'info', 'request', { step, provider, useLLM, hasLevels: !!productLevels, textLen: text.length });

  // Expand synonyms for product levels to improve matching
  const levelSynonyms: Record<string, string[]> = {};
  if (productLevels) {
    for (const [pid, levels] of Object.entries(productLevels)) {
      const syns: string[] = [];
      for (const lvl of levels) {
        const L = lvl.toLowerCase();
        syns.push(L, L.replace(/\s+/g, ''));
        if (/basic|starter|bronze|core/.test(L)) syns.push('base','starter','bronze','low','core');
        if (/standard|silver|middle|mid|plus/.test(L)) syns.push('standard','silver','mid','middle','plus');
        if (/premium|gold|platinum|max|family/.test(L)) syns.push('premium','gold','platinum','max','maximum','family');
      }
      levelSynonyms[pid] = Array.from(new Set(syns));
    }
  }

  // LLM JSON-extraction path
  if (useLLM) {
    try {
      const cfg = getOpenAICompatible();
  const root = cfg.baseURL.replace(/\/$/, '');
  const url = root.includes('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
      const system = [
        'You are an extraction agent that outputs ONLY strict JSON matching this TypeScript type:',
        '{ updates?: Record<string,string>, nav?: { type: "proceed"|"back"|"goto", to?: "profile"|"selection"|"review"|`product-${string}` } }',
        'Rules:',
        '- Never include commentary; respond with a single JSON object.',
        '- updates keys must be valid for the given step. For employee_profile, keys are firstName,lastName,email,phone,ssnLast4,birthDate,employeeId,department,payFrequency.',
        '- For product-* steps, updates may include level (string) and agree ("yes").',
        '- If user implies proceed/next/back or goto product, fill nav accordingly.',
      ].join('\n');
      const user = JSON.stringify({ step, text, productLevels, levelSynonyms });
  const body: Record<string, unknown> = { model: cfg.model, temperature: 0, max_tokens: 200, messages: [ { role: 'system', content: system }, { role: 'user', content: user } ] };
      // Prefer JSON mode when available (OpenAI); some providers may ignore it.
      if (provider === 'openai') body.response_format = { type: 'json_object' };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`LLM ${res.status}`);
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content || '{}';
      let extracted: { updates?: Record<string,string>; nav?: Nav } = {};
      try { extracted = JSON.parse(raw); } catch { extracted = {}; }
      const llmUpdates = extracted.updates || {};
      const llmNav = extracted.nav as Nav | undefined;
  logTrace(traceId, '/api/assistant/map-input', 'info', 'llm_extracted', { keys: Object.keys(llmUpdates), nav: llmNav });
  try { await IntentLog.create({ traceId, step, text, updates: llmUpdates, nav: llmNav, source: 'llm' }); } catch {}
      // Validate updates with zod below (same path as heuristic)
      nav = llmNav;
      // Fall through to validation section with llmUpdates injected into updates flow
      // Merge with heuristics minimal extraction to avoid missing obvious email
      if (step === 'employee_profile') {
        const updates = { ...llmUpdates } as Record<string,string>;
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/);
        if (emailMatch && !updates.email) updates.email = emailMatch[0];
        const partial = ProfileSchema.partial().safeParse(updates);
  if (!partial.success) return NextResponse.json({ ok: false, updates: {}, nav });
  return NextResponse.json({ ok: true, updates: partial.data, nav });
      }
      if (String(step).startsWith('product-')) {
        const id = String(step).replace('product-', '');
        const levels = productLevels?.[id] || [];
        const schema = productDetailSchema(levels);
        const updates = { ...llmUpdates } as Record<string, unknown>;
        const partial = schema.partial().safeParse(updates);
  if (!partial.success) return NextResponse.json({ ok: false, updates: {}, nav });
  return NextResponse.json({ ok: true, updates: partial.data, nav });
      }
      if (step === 'pre_confirm') {
        const updates = { ...llmUpdates } as { agree?: string };
  return NextResponse.json({ ok: true, updates: { agree: updates.agree === 'yes' ? 'yes' : undefined }, nav });
      }
    } catch (e: unknown) {
      logTrace(traceId, '/api/assistant/map-input', 'error', 'llm_failed', { error: (e as Error).message });
      // fall through to heuristic
    }
  }

  // Basic navigation detection
  if (/^(proceed|next|continue|go next)\b/.test(normalized)) nav = { type: 'proceed' };
  const backTarget = /(back|go back)( to)? (profile|selection|review)/.exec(normalized)?.[3];
  if (backTarget) nav = { type: 'back', to: backTarget === 'profile' ? 'profile' : backTarget === 'selection' ? 'selection' : 'review' };
  const editProd = /edit\s+product\s+(.+)$/.exec(text)?.[1];
  if (editProd) {
    const id = editProd.trim();
    nav = { type: 'goto', to: (`product-${id}`) as `product-${string}` };
  }
  if (step === 'employee_profile') {
    const updates: Record<string, string> = {};
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/);
    if (emailMatch) updates.email = emailMatch[0];
    const firstNameMatch = text.match(/my name is\s+(\w+)/i);
    if (firstNameMatch) updates.firstName = firstNameMatch[1];
    // Fuzzy field setters: e.g., "set emial to ..."
    const mSet = /^(set|change)\s+(.+?)\s+(to|as)\s+(.+)$/.exec(text);
    if (mSet) {
      const field = mSet[2];
      const value = mSet[4];
      const fields = ['firstName','lastName','email','phone','ssnLast4','birthDate','employeeId','department','payFrequency'];
      const alias: Record<string,string[]> = {
        firstName:['first name','firstname','name'], lastName:['last name','lastname','surname'], email:['email','mail','email address'], phone:['phone','mobile','phone number','contact'], ssnLast4:['ssn','last 4','ssn last 4','ssn4'], birthDate:['dob','date of birth','birthday','birth date'], employeeId:['employee id','id','emp id'], department:['department','dept'], payFrequency:['pay','pay frequency','pay cycle','pay period']
      };
      const candidates = [...fields, ...Object.values(alias).flat()];
      const hit = bestFuzzyMatch(field, candidates);
  const key = fields.find((fld) => fld.toLowerCase() === (hit||'').replace(/\s/g,'')) || (Object.entries(alias).find(([, list]) => list.includes(hit||''))?.[0] as string | undefined);
  if (key) (updates as Record<string, string>)[key] = value;
    }
    // Validate with schema (partial ok)
  const partial = ProfileSchema.partial().safeParse(updates);
  if (!partial.success) return NextResponse.json({ ok: false, updates: {}, notice: 'no_valid_fields', nav });
  try { await IntentLog.create({ traceId, step, text, updates: partial.data, nav, source: 'heuristic' }); } catch {}
  return NextResponse.json({ ok: true, updates: partial.data, nav });
  }
  if (step.startsWith('product-')) {
    const id = step.replace('product-', '');
    const levels = productLevels?.[id] || [];
    const schema = productDetailSchema(levels);
    const updates: Record<string, string> = {};
    // Guess a level
    for (const lvl of levels) { if (lower.includes(lvl.toLowerCase())) { updates.level = lvl; break; } }
    // Try synonyms bucket
    if (!updates.level && levelSynonyms[id]?.length) {
      for (const syn of levelSynonyms[id]) { if (normalized.includes(norm(syn))) { updates.level = (levels.find(l => l.toLowerCase() === syn) || levels.find(l => l.toLowerCase().includes(syn)) || levels[0])!; break; } }
    }
    if (lower.includes('agree')) updates.agree = 'yes';
  const partial = schema.partial().safeParse(updates);
  if (!partial.success) return NextResponse.json({ ok: false, updates: {}, notice: 'no_valid_fields', nav });
  try { await IntentLog.create({ traceId, step, text, updates: partial.data, nav, source: 'heuristic' }); } catch {}
  return NextResponse.json({ ok: true, updates: partial.data, nav });
  }
  if (step === 'pre_confirm') {
  const updates = { agree: lower.includes('agree') ? 'yes' : undefined };
  try { await IntentLog.create({ traceId, step, text, updates, nav, source: 'heuristic' }); } catch {}
  return NextResponse.json({ ok: true, updates, nav });
  }
  logTrace(traceId, '/api/assistant/map-input', 'info', 'heuristic_extracted', { nav });
  try { await IntentLog.create({ traceId, step, text, updates: {}, nav, source: 'heuristic' }); } catch {}
  return NextResponse.json({ ok: true, updates: {}, nav });
}
