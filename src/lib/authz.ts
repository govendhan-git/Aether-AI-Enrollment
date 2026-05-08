import { getOrLinkProfile } from './profile';

type ProfileRole = 'employee' | 'broker' | undefined;

export async function requireBroker() {
  const { profile } = await getOrLinkProfile();
  const role: ProfileRole = (profile && typeof profile === 'object' ? (profile as Record<string, unknown>).role as ProfileRole : undefined);
  if (role !== 'broker') return { ok: false as const };
  return { ok: true as const };
}
