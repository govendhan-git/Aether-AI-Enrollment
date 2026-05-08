import mongoose, { Schema } from 'mongoose';

type SequenceDoc = {
  key: string;
  value: number;
  updatedAt: Date;
};

const SequenceSchema = new Schema<SequenceDoc>({
  key: { type: String, required: true },
  value: { type: Number, required: true, default: 0 },
  updatedAt: { type: Date, default: () => new Date() },
});

SequenceSchema.index({ key: 1 }, { unique: true });

export const Sequence = (mongoose.models.Sequence || mongoose.model('Sequence', SequenceSchema)) as mongoose.Model<SequenceDoc>;
