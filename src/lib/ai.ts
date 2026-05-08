import Groq from 'groq-sdk';

export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };
export type StreamHandler = (delta: string) => void;

type Provider = 'groq' | 'openai' | 'ollama';

export function getProvider(): Provider {
	const p = (process.env.AI_PROVIDER || 'groq').toLowerCase();
	if (p === 'openai' || p === 'ollama') return p;
	return 'groq';
}

export type ChatResult = { content: string } | { streamed: true };
export async function chat(messages: ChatMessage[], opts?: { model?: string; temperature?: number; stream?: boolean; onToken?: StreamHandler }): Promise<ChatResult> {
	const provider = getProvider();
	const temperature = opts?.temperature ?? 0.3;
	const model = opts?.model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
	const stream = !!opts?.stream;

	if (provider === 'groq') {
		const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
		if (!apiKey) throw new Error('Missing GROQ_API_KEY');
		const client = new Groq({ apiKey, baseURL: process.env.GROQ_BASE_URL });
		if (stream && opts?.onToken) {
				const res = await client.chat.completions.create({ model, messages, temperature, stream: true } as unknown as Parameters<typeof client.chat.completions.create>[0]);
				type StreamChunk = { choices?: Array<{ delta?: { content?: string } }> };
				for await (const chunk of (res as unknown as AsyncIterable<StreamChunk>)) {
					const delta = chunk?.choices?.[0]?.delta?.content || '';
				if (delta) opts.onToken(delta);
			}
			return { streamed: true } as const;
		}
				const res = await client.chat.completions.create({ model, messages, temperature } as unknown as Parameters<typeof client.chat.completions.create>[0]);
				const content = (res as unknown as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || '';
		return { content };
	}

	// Stubs for other providers; can be filled when keys are present
	if (provider === 'openai') throw new Error('OpenAI provider not configured');
	if (provider === 'ollama') throw new Error('Ollama provider not configured');
	throw new Error('Unsupported AI provider');
}

