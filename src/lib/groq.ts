import Groq from 'groq-sdk';

export function getGroq() {
  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');
  return new Groq({ apiKey });
}

export type GroqMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };
export async function chatGroq(messages: GroqMessage[], model = 'llama-3.1-8b-instant', stream = false) {
  const groq = getGroq();
  const res = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
    stream
  } as unknown as Parameters<typeof groq.chat.completions.create>[0]);
  return res;
}
