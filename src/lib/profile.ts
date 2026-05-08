import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { LegalEntity } from '@/models/LegalEntity';
import type { Types } from 'mongoose';
import { dbConnect } from '@/lib/db';

export async function getOrLinkProfile() {
  await dbConnect();
  const user = await currentUser();
  if (!user) return { user: null, profile: null } as const;
  const clerkId = user.id;
  const email = user.emailAddresses?.[0]?.emailAddress || user.primaryEmailAddress?.emailAddress;
  let profile = await UserProfile.findOne({ clerkUserId: clerkId }).lean();
  if (!profile && email) {
    const byEmail = await UserProfile.findOne({ email }).lean<{ _id: unknown }>();
    if (byEmail) {
      await UserProfile.updateOne({ _id: byEmail._id }, { $set: { clerkUserId: clerkId } });
      profile = await UserProfile.findById(byEmail._id).lean();
    }
    // Auto-provision profile if still missing: map email domain to LegalEntity
  if (!profile) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain) {
    const entity = await LegalEntity.findOne({ domains: domain }).lean<{ _id: Types.ObjectId }>();
    if (entity && entity._id) {
          const firstName = user.firstName || undefined;
          const lastName = user.lastName || undefined;
          const created = await UserProfile.create({
            clerkUserId: clerkId,
            email,
            role: 'employee',
      legalEntityId: entity._id,
            personal: { firstName, lastName, email },
      employment: { companyId: entity._id }
          });
      profile = await UserProfile.findById(created._id).lean();
        }
      }
    }
  }
  return { user, profile } as const;
}
