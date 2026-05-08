import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type EmployeeProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ssnLast4: string;
  birthDate: string;
  employeeId: string;
  department: string;
  payFrequency: string;
};

export type EnrollmentState = {
  profile: Partial<EmployeeProfile> | null;
  selectedProductIds: string[];
  steps: Array<{ code: string; label: string; status: 'pending' | 'complete'; summary?: string }>;
  currentCode: string;
};

const initialState: EnrollmentState = {
  profile: null,
  selectedProductIds: [],
  steps: [],
  currentCode: 'employee_profile',
};

const slice = createSlice({
  name: 'enrollment',
  initialState,
  reducers: {
    setProfile(state, action: PayloadAction<Partial<EmployeeProfile> | null>) {
      state.profile = action.payload;
    },
    patchProfile(state, action: PayloadAction<Partial<EmployeeProfile>>) {
      state.profile = { ...(state.profile || {}), ...action.payload };
    },
    setSelected(state, action: PayloadAction<string[]>) {
      state.selectedProductIds = action.payload;
    },
    toggleProduct(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.selectedProductIds = state.selectedProductIds.includes(id)
        ? state.selectedProductIds.filter((x) => x !== id)
        : [...state.selectedProductIds, id];
    },
    setSteps(
      state,
      action: PayloadAction<{ steps: Array<{ code: string; label: string; status: 'pending' | 'complete'; summary?: string }>; currentCode: string }>
    ) {
      state.steps = action.payload.steps;
      state.currentCode = action.payload.currentCode;
    },
  },
});

export const { setProfile, patchProfile, setSelected, toggleProduct, setSteps } = slice.actions;
export default slice.reducer;
