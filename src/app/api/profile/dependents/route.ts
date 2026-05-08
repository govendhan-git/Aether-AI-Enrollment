import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/db';
import { UserProfile } from '@/models/UserProfile';
import { z } from 'zod';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  await dbConnect();
  const email = req.nextUrl.searchParams.get('email');
  if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400 });
  const user = await UserProfile.findOne({ email }).lean<{ personal?: { dependents?: { name?: string; relationship?: string; birthDate?: Date }[] } }>();
  const dependents = user?.personal?.dependents || [];
  return Response.json({ dependents });
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const schema = z.object({
    email: z.string().email(),
    dependent: z.object({ name: z.string(), relationship: z.string(), birthDate: z.string().or(z.date()).optional() })
  });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  const { email, dependent } = parsed.data;
  const update: Record<string, unknown> = { $push: { 'personal.dependents': dependent } };
  const doc = await UserProfile.findOneAndUpdate({ email }, update, { upsert: false, new: true });
  return Response.json({ ok: true, dependents: doc?.personal?.dependents || [] });
}

export async function DELETE(req: NextRequest) {
  await dbConnect();
  const schema = z.object({ email: z.string().email(), name: z.string() });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  const { email, name } = parsed.data;
  const update: Record<string, unknown> = { $pull: { 'personal.dependents': { name } } };
  const doc = await UserProfile.findOneAndUpdate({ email }, update, { new: true });
  return Response.json({ ok: true, dependents: doc?.personal?.dependents || [] });
}
