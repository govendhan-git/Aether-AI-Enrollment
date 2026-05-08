import { Schema, model, models, Types } from 'mongoose';

const CoverageOptionSchema = new Schema({
  level: { type: String, enum: ['low', 'medium', 'high'], required: true },
  monthlyCost: { type: Number, required: true },
  details: String
}, { _id: false });

const ProductSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  logoUrl: String,
  images: [String],
  provider: String,
  description: String,
  longDescription: String,
  highlights: [String],
  disclosure: String,
  coverageOptions: [CoverageOptionSchema],
  requiresDependents: { type: Boolean, default: false },
  category: { type: String, enum: ['critical_illness','accident','identity_theft','hospital','dental','vision','life','other'], default: 'other' }
}, { timestamps: true });

export type ProductDocument = {
  _id: Types.ObjectId;
  name: string;
  code: string;
  logoUrl?: string;
  images?: string[];
  provider?: string;
  description?: string;
  longDescription?: string;
  highlights?: string[];
  disclosure?: string;
  coverageOptions: { level: 'low'|'medium'|'high'; monthlyCost: number; details?: string }[];
  requiresDependents: boolean;
  category: string;
}

export const Product = models.Product || model('Product', ProductSchema);
