import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type EnvCheck = {
  hasClerkPub: boolean;
  hasClerkSecret: boolean;
  hasDb: boolean;
  hasGroqKey: boolean;
  model: string;
};
type AiCheck = { ok: boolean; detail: string | null };

export async function GET() {
  const checks: { env: EnvCheck; ai: AiCheck } = {
  env: {
      hasClerkPub: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      hasClerkSecret: !!process.env.CLERK_SECRET_KEY,
      hasDb: !!(process.env.DATABASE_URL || process.env.MONGODB_URI),
      hasGroqKey: !!process.env.GROQ_API_KEY,
  model: process.env.AI_MODEL || process.env.GROQ_MODEL || 'default',
    },
    ai: { ok: false, detail: null },
  };

  // No live AI call in health; just report presence of env key
  checks.ai.ok = !!process.env.GROQ_API_KEY;
  checks.ai.detail = checks.ai.ok ? 'AI key present' : 'AI not configured';

  const status = checks.env.hasClerkPub && checks.env.hasClerkSecret && checks.env.hasDb ? 200 : 500;
  return NextResponse.json(checks, { status });
}
