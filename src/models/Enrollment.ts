import { Schema, model, models, Types } from 'mongoose';

const SelectedCoverageSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  // Accept any string level to match Product coverageOptions; validation is enforced at selection time
  level: { type: String },
  dependents: [{ name: String, relationship: String, birthDate: Date }],
  declined: { type: Boolean, default: false }
}, { _id: false });

const EnrollmentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'UserProfile', required: true },
  legalEntityId: { type: Schema.Types.ObjectId, ref: 'LegalEntity', required: true },
  products: [SelectedCoverageSchema],
  totalMonthlyCost: { type: Number, default: 0 },
  // Stored confirmation code; uniqueness is enforced via the named index below.
  confirmationNumber: { type: String },
  submittedAt: Date
}, { timestamps: true });

// Single authoritative index for confirmationNumber. `1` means ascending index key
// (not a literal value). unique:true guarantees no two docs share the same code.
// sparse:true avoids indexing legacy docs missing the field.
EnrollmentSchema.index({ confirmationNumber: 1 }, { unique: true, sparse: true, name: 'uniq_confirmationNumber' });

export type EnrollmentDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  legalEntityId: Types.ObjectId;
  products: { productId: Types.ObjectId; level?: 'low'|'medium'|'high'; dependents?: { name: string; relationship: string; birthDate?: Date }[]; declined?: boolean }[];
  totalMonthlyCost: number;
  confirmationNumber?: string;
  submittedAt?: Date;
}

export const Enrollment = models.Enrollment || model('Enrollment', EnrollmentSchema);
