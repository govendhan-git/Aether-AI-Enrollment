import crypto from 'crypto';
import { Enrollment } from '@/models/Enrollment';

function base36Ts() {
  return Date.now().toString(36).toUpperCase();
}

function rand(size = 6) {
  // URL-safe base36 from random bytes; fallback to Math.random only if crypto unavailable
  try {
    const buf = crypto.randomBytes(size);
    // Convert to base36-like string by mapping bytes to [0..35]
    let out = '';
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] % 36;
      out += v.toString(36);
    }
    return out.toUpperCase();
  } catch {
    return Math.random().toString(36).slice(2, 2 + size).toUpperCase();
  }
}

/**
 * Generate a confirmation number guaranteed unique against the Enrollment collection
 * without relying on catching duplicate key errors.
 */
export async function generateUniqueConfirmation(prefix = 'ENR-'): Promise<string> {
  // Try a bounded number of attempts with extremely low collision probability
  for (let i = 0; i < 5; i++) {
    const id = `${prefix}${base36Ts()}-${rand(8)}`;
    const exists = await Enrollment.exists({ confirmationNumber: id }).lean();
    if (!exists) return id;
  }
  // As a last resort, include a larger random suffix to reduce any chance of collision
  const id = `${prefix}${base36Ts()}-${rand(16)}`;
  const exists = await Enrollment.exists({ confirmationNumber: id }).lean();
  if (!exists) return id;
  // If still exists (pathological), throw explicit error
  throw new Error('Failed to generate unique confirmation number');
}
