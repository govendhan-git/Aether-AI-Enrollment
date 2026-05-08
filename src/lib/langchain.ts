import { ChatMessage } from './ai';

// Lightweight LangChain wiring that remains provider-agnostic.
// We support Groq via OpenAI-compatible API when ENV GROQ_* is set.

export type LLMProvider = 'groq' | 'openai' | 'ollama';
export type ModelTask = 'chat' | 'rag' | 'json';

export function getLLMProvider(): LLMProvider {
  const p = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  if (p === 'openai' || p === 'ollama') return p;
  return 'groq';
}

function sanitizeEnv(val: string | undefined, fallback = ''): string {
  const v = (val ?? fallback).trim();
  // Strip a single pair of surrounding quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function getModelFor(task?: ModelTask): string {
  const base = sanitizeEnv(process.env.GROQ_MODEL, 'llama-3.1-8b-instant');
  const t = (task || 'chat');
  if (t === 'rag') return sanitizeEnv(process.env.GROQ_MODEL_RAG, '') || base;
  if (t === 'json') return sanitizeEnv(process.env.GROQ_MODEL_JSON, '') || base;
  return sanitizeEnv(process.env.GROQ_MODEL_CHAT, '') || base;
}

// Basic OpenAI-compatible client creator for LangChain use.
export function getOpenAICompatible(task?: ModelTask) {
  const provider = getLLMProvider();
  if (provider === 'groq') {
    const apiKey = sanitizeEnv(process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY, '');
    let baseURL = sanitizeEnv(process.env.GROQ_BASE_URL, 'https://api.groq.com/openai/v1');
  // Ensure Groq uses the OpenAI-compatible prefix
    if (!baseURL.includes('/openai')) baseURL = baseURL.replace(/\/$/, '') + '/openai';
    if (!/\/(v1)(\/)?$/.test(baseURL)) baseURL = baseURL.replace(/\/$/, '') + '/v1';
    if (!apiKey) throw new Error('Missing GROQ_API_KEY');
  const model = getModelFor(task);
  if (!model) throw new Error('Missing GROQ_MODEL');
  return { apiKey, baseURL, model };
  }
  if (provider === 'openai') {
    const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY, '');
    const baseURL = sanitizeEnv(process.env.OPENAI_BASE_URL, 'https://api.openai.com/v1');
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  const model = sanitizeEnv(process.env.OPENAI_MODEL, 'gpt-4o-mini');
  if (!model) throw new Error('Missing OPENAI_MODEL');
  return { apiKey, baseURL, model };
  }
  if (provider === 'ollama') {
    const baseURL = sanitizeEnv(process.env.OLLAMA_BASE_URL, 'http://localhost:11434/v1');
  const model = sanitizeEnv(process.env.OLLAMA_MODEL, 'llama3.1');
  if (!model) throw new Error('Missing OLLAMA_MODEL');
  return { apiKey: 'ollama', baseURL, model };
  }
  throw new Error('Unsupported provider');
}

// Minimal LC usage via @langchain/openai model and a simple prompt.
export async function lcChat(messages: ChatMessage[], opts?: { task?: ModelTask; model?: string }): Promise<string> {
  const cfg = getOpenAICompatible(opts?.task);
  const model = opts?.model || cfg.model;
  const { ChatOpenAI } = await import('@langchain/openai');
  // Try LangChain first (works with many OpenAI-compatible endpoints)
  const llm = new ChatOpenAI({ apiKey: cfg.apiKey, model, temperature: 0.2, configuration: { baseURL: cfg.baseURL } });
  // Simpler: join messages into a single prompt; ChatOpenAI routes to /chat/completions.
  const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  try {
    const res = await llm.invoke(prompt);
    type LCMessage = { content?: string } | string;
    const msg = res as LCMessage;
    return typeof msg === 'string' ? msg : (msg.content || '');
  } catch {
    // Fallback to direct REST call using cfg.baseURL so provider keys don’t 401 due to wrong host
    const root = cfg.baseURL.replace(/\/$/, '');
    const url = root.includes('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model, temperature: 0.2, messages })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}\n${body}`);
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content || '';
  }
}

// Stream tokens using OpenAI-compatible REST API (works for Groq/OpenAI/Ollama compat endpoints)
export async function lcStream(messages: ChatMessage[], onToken: (delta: string) => void, opts?: { task?: ModelTask; model?: string }): Promise<void> {
  const cfg = getOpenAICompatible(opts?.task);
  const model = opts?.model || cfg.model;
  const root = cfg.baseURL.replace(/\/$/, '');
  const url = root.includes('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status} ${res.statusText}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) onToken(delta);
      } catch {
        // ignore parse errors for keep-alive lines
      }
    }
  }
}
