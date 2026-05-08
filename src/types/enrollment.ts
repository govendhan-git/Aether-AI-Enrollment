export type StepStatus = 'pending' | 'complete';
export interface StepState {
  code?: string;
  status: StepStatus;
  data?: Record<string, unknown>;
}
