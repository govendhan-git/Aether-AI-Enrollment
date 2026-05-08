import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { LegalEntity } from '@/models/LegalEntity';
import { Product } from '@/models/Product';
import { newTraceId, logTrace } from '@/lib/trace';

export async function GET() {
  const traceId = newTraceId();
  await dbConnect();
  const user = await currentUser();
  const profile = await UserProfile.findOne({ clerkUserId: user?.id }).lean<{ legalEntityId?: unknown }>();
  if (!profile) return NextResponse.json({ ok: false, error: 'No profile' }, { status: 400 });
  const company = await LegalEntity.findById(profile.legalEntityId).lean<{ productIds?: unknown[] }>();
  const products = await Product.find({ _id: { $in: company?.productIds || [] } }).lean();
  logTrace(traceId, '/api/enrollment/products', 'info', 'products', { userId: user?.id, count: Array.isArray(products) ? products.length : 0 });
  return NextResponse.json({ ok: true, products });
}
