import { Schema, model, models, Types } from 'mongoose';
import type { StepState } from '../types/enrollment';

const StepStateSchema = new Schema<StepState>({
  code: { type: String, required: false },
  status: { type: String, enum: ['pending','complete'], default: 'pending' },
  data: { type: Schema.Types.Mixed }
}, { _id: false });

const EnrollmentSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'UserProfile', required: true },
  legalEntityId: { type: Schema.Types.ObjectId, ref: 'LegalEntity', required: true },
  steps: [StepStateSchema],
  selectedProductIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  active: { type: Boolean, default: true }
}, { timestamps: true });

// Enforce at most one active session per user
EnrollmentSessionSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { active: true } });

export type EnrollmentSessionDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  legalEntityId: Types.ObjectId;
  steps: StepState[];
  selectedProductIds: Types.ObjectId[];
  active: boolean;
}

export const EnrollmentSession = models.EnrollmentSession || model('EnrollmentSession', EnrollmentSessionSchema);
