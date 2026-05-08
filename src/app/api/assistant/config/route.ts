import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const aiProvider = process.env.AI_PROVIDER || 'groq';
  const groqModel = process.env.GROQ_MODEL || '';
  const groqBase = process.env.GROQ_BASE_URL || '';
  const groqKeyRaw = (process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '').trim();
  const hasGroqKey = !!groqKeyRaw;
  const groqKeyPreview = groqKeyRaw ? `${groqKeyRaw.slice(0,4)}…${groqKeyRaw.slice(-4)}` : null;
  const groqKeyStartsWithGsk = groqKeyRaw.startsWith('gsk_');
  const openaiModel = process.env.OPENAI_MODEL || '';
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  return NextResponse.json({
    aiProvider,
    groq: { model: groqModel, base: groqBase, hasKey: hasGroqKey, keyPreview: groqKeyPreview, keyStartsWithGsk: groqKeyStartsWithGsk },
    openai: { model: openaiModel, hasKey: hasOpenAIKey },
  });
}
