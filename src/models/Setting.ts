import { Schema, model, models } from 'mongoose';

type SettingDoc = {
  key: string;
  value: unknown;
};

const SettingSchema = new Schema<SettingDoc>({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed },
}, { timestamps: true });

export const Setting = models.Setting || model<SettingDoc>('Setting', SettingSchema);
