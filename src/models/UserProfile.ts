import { Schema, model, models, Types } from 'mongoose';

const EmploymentSchema = new Schema({
  employeeId: String,
  payFrequency: { type: String, enum: ['weekly','biweekly','semimonthly','monthly'], default: 'biweekly' },
  department: String,
  hireDate: Date,
  companyId: { type: Schema.Types.ObjectId, ref: 'LegalEntity' }
}, { _id: false });

const PersonalSchema = new Schema({
  firstName: String,
  lastName: String,
  ssnLast4: String,
  birthDate: Date,
  gender: { type: String, enum: ['male','female','non_binary','other'] },
  email: String,
  phone: String,
  address: String,
  dependents: [{ name: String, relationship: String, birthDate: Date }]
}, { _id: false });

const UserProfileSchema = new Schema({
  clerkUserId: { type: String, index: true },
  email: { type: String, index: true },
  role: { type: String, enum: ['employee','broker'], default: 'employee', index: true },
  legalEntityId: { type: Schema.Types.ObjectId, ref: 'LegalEntity', required: true },
  personal: PersonalSchema,
  employment: EmploymentSchema,
  features: { type: Map, of: Schema.Types.Mixed }
}, { timestamps: true });

export type UserProfileDocument = {
  _id: Types.ObjectId;
  clerkUserId?: string;
  email?: string;
  role?: 'employee' | 'broker';
  legalEntityId: Types.ObjectId;
  personal: {
  firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: Date; gender?: string; email?: string; phone?: string; address?: string; dependents?: { name?: string; relationship?: string; birthDate?: Date }[]
  };
  employment: {
    employeeId?: string; payFrequency?: string; department?: string; hireDate?: Date; companyId?: Types.ObjectId
  };
  features?: Record<string, unknown>;
}

export const UserProfile = models.UserProfile || model('UserProfile', UserProfileSchema);
