import { Schema, model, models, Types } from 'mongoose';

const ThemeSchema = new Schema({
  name: { type: String, required: true },
  primary: String,
  secondary: String,
  dark: { type: Boolean, default: false },
  logoUrl: String,
  cssVars: { type: Map, of: String },
}, { _id: false });

const LegalEntitySchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  // Allowed email domains that map users to this entity (e.g., "acme.com")
  domains: [{ type: String, index: true }],
  themes: [ThemeSchema],
  activeTheme: { type: String, default: 'classic' },
  productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  brokerConfig: {
    brokerName: String,
    contactEmail: String
  }
}, { timestamps: true });

export type LegalEntityDocument = {
  _id: Types.ObjectId;
  name: string;
  code: string;
  domains?: string[];
  themes: Array<{
    name: string; primary?: string; secondary?: string; dark?: boolean; logoUrl?: string; cssVars?: Record<string,string>
  }>;
  activeTheme?: string;
  productIds: Types.ObjectId[];
  brokerConfig?: { brokerName?: string; contactEmail?: string };
}

export const LegalEntity = models.LegalEntity || model('LegalEntity', LegalEntitySchema);
