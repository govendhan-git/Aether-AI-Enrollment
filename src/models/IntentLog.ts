import { Schema, model, models } from 'mongoose';

export type IntentLogDoc = {
  traceId: string;
  step: string;
  text: string;
  updates?: Record<string, unknown>;
  nav?: { type: 'proceed' | 'back' | 'goto'; to?: string };
  source: 'llm' | 'heuristic' | 'none';
};

const IntentLogSchema = new Schema<IntentLogDoc>({
  traceId: { type: String, index: true },
  step: { type: String },
  text: { type: String },
  updates: { type: Schema.Types.Mixed },
  nav: { type: Schema.Types.Mixed },
  source: { type: String, enum: ['llm','heuristic','none'], default: 'none' },
}, { timestamps: true });

export const IntentLog = models.IntentLog || model<IntentLogDoc>('IntentLog', IntentLogSchema);
