import { z } from 'zod';

// Employee Profile Schema
export const ProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  ssnLast4: z.string().regex(/^\d{4}$/).optional().or(z.literal('')).default(''),
  birthDate: z.string().min(1), // ISO date string yyyy-mm-dd
  employeeId: z.string().min(2).max(32),
  department: z.string().optional().default(''),
  payFrequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']),
});

// Product Selection Schema
export const ProductSelectionSchema = z.object({
  productIds: z.array(z.string()).min(1),
});

// Product Detail Schema (factory per product based on coverage options)
export function productDetailSchema(levels: string[]) {
  return z.object({
    level: z.enum(levels as [string, ...string[]]),
    agree: z.literal('yes'),
  });
}

// Review/Pre-confirm Schema
export const PreConfirmSchema = z.object({
  agree: z.literal('yes'),
});

// Convert zod-like definitions into a lightweight client schema (labels/types/options)
export type ClientField = { key: string; label: string; type: 'text' | 'email' | 'phone' | 'date' | 'alphanumeric' | 'select' | 'boolean'; required?: boolean; options?: string[]; placeholder?: string };
export type ClientSchema = { profile: ClientField[]; productDetails: Record<string, ClientField[]>; selection: ClientField[]; preConfirm: ClientField[] };

export function buildClientProfileSchema(): ClientField[] {
  return [
    { key: 'firstName', label: 'First name', type: 'text', required: true, placeholder: 'Enter your first name' },
    { key: 'lastName', label: 'Last name', type: 'text', required: true, placeholder: 'Enter your last name' },
    { key: 'birthDate', label: 'Date of birth', type: 'date', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'phone', required: false, placeholder: 'e.g. +1 555 555 5555' },
    { key: 'employeeId', label: 'Employee ID', type: 'alphanumeric', required: true },
    { key: 'department', label: 'Department', type: 'text', required: false },
    { key: 'payFrequency', label: 'Pay frequency', type: 'select', required: true, options: ['weekly','biweekly','semimonthly','monthly'] },
    { key: 'ssnLast4', label: 'SSN last 4', type: 'alphanumeric', required: false },
  ];
}

export function buildClientProductDetailSchema(levels: string[]): ClientField[] {
  return [
    { key: 'level', label: 'Coverage level', type: 'select', required: true, options: levels },
    { key: 'agree', label: 'Disclosure', type: 'boolean', required: true },
  ];
}

export function buildClientSelectionSchema(): ClientField[] {
  return [
    { key: 'productIds', label: 'Products', type: 'select', required: true },
  ];
}

export function buildClientPreConfirmSchema(): ClientField[] {
  return [
    { key: 'agree', label: 'Agreement', type: 'boolean', required: true },
  ];
}
