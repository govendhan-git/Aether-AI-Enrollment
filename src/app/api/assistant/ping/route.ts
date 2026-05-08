import { NextResponse } from 'next/server';
import { lcChat, getLLMProvider } from '@/lib/langchain';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const provider = getLLMProvider();
  const content = await lcChat([
      { role: 'system', content: 'Reply with exactly: pong' },
      { role: 'user', content: 'ping' }
  ], { task: 'chat' });
    return NextResponse.json({ ok: true, provider, content });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
