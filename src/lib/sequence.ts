import { Sequence } from '@/models/Sequence';

function pad(n: number, len = 6) {
  return n.toString().padStart(len, '0');
}

export async function nextSequence(key: string): Promise<number> {
  const doc = await Sequence.findOneAndUpdate(
    { key },
    { $inc: { value: 1 }, $set: { updatedAt: new Date() } },
    { new: true, upsert: true }
  ).lean<{ value: number }>();
  return doc!.value;
}

export async function generateConfirmationNumber(prefix = 'ENR-') {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  const seq = await nextSequence(`confirmation:${y}${m}${d}`);
  return `${prefix}${y}${m}${d}-${pad(seq, 6)}`;
}
