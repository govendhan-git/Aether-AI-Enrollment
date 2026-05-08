import mongoose, { Schema } from 'mongoose';

type IdempotencyDoc = {
  key: string;
  userId?: string;
  route: string;
  status: number;
  result: Record<string, unknown>;
  createdAt: Date;
};

const IdempotencyKeySchema = new Schema<IdempotencyDoc>({
  key: { type: String, required: true, index: true },
  userId: { type: String, index: true },
  route: { type: String, required: true, index: true },
  status: { type: Number, required: true },
  result: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

// TTL: 10 minutes (single authoritative index to avoid duplicates)
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });
IdempotencyKeySchema.index({ key: 1, userId: 1, route: 1 }, { unique: true });

export const IdempotencyKey = (mongoose.models.IdempotencyKey || mongoose.model('IdempotencyKey', IdempotencyKeySchema)) as mongoose.Model<IdempotencyDoc>;
