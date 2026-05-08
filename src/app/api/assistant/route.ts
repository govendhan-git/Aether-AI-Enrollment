import { NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/langchain';

export const runtime = 'nodejs';

export async function GET() {
	const provider = getLLMProvider();
	const useLLM = String(process.env.MAP_INPUT_USE_LLM || '').toLowerCase() === 'true';
	return NextResponse.json({ ok: true, provider, useLLM });
}
