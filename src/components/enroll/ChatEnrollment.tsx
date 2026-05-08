"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState, useRef as useRefAlias } from 'react';
import Image from 'next/image';
import { http } from '@/lib/http';
import { fetchJSON, abortable } from '@/lib/fetcher';
import { SideTracker } from './SideTracker';
// Assistant endpoints removed; disable client embeddings and remote Q&A
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppDispatch } from '../../store';
import { setProfile as setProfileGlobal, setSelected as setSelectedGlobal, setSteps as setStepsGlobal } from '../../store/enrollmentSlice';
import type { ClientField } from '@/schemas/enrollment';

// Minimal Web Speech types to avoid 'any' while keeping bundle clean
type WebSpeechEvent = { results?: ArrayLike<ArrayLike<{ transcript?: string }>> };
type WebSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  onresult: (e: WebSpeechEvent) => void;
  onend: () => void;
  start: () => void;
};
type WebSpeechRecognitionCtor = new () => WebSpeechRecognition;

// Very lightweight, client-driven chat wizard that calls existing APIs.
// It does not stream; it sequences prompts and persists data via API routes.

type Product = { _id: string; name: string; description?: string; longDescription?: string; highlights?: string[]; logoUrl?: string; images?: string[]; coverageOptions?: { level: string; monthlyCost: number }[] };
type EmployeeProfile = { firstName: string; lastName: string; email: string; phone: string; ssnLast4: string; birthDate: string; employeeId: string; department: string; payFrequency: string };

type StepCode = 'employee_profile' | 'product_select' | `product-${string}` | 'pre_confirm';

type Message = { role: 'ai' | 'user' | 'system'; text: string };
type SessionStep = { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> };

export function ChatEnrollment() {
  const [state, setState] = useState<{ profile?: { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: string | Date | null; payFrequency?: string; department?: string; employeeId?: string }; products: Product[]; selected: string[]; current: StepCode; steps: { code: StepCode; label: string; status: 'pending' | 'complete'; summary?: string }[]; sessionSteps: SessionStep[] }>({ products: [], selected: [], current: 'employee_profile', steps: [], sessionSteps: [] });
  const [messages, setMessages] = useState<Message[]>([]);
  // no global busy flag; individual API calls update messages directly
  const scrollRef = useRef<HTMLDivElement>(null);
  // Anchor to keep latest chat in view even when step UI renders after messages
  const messageAnchorRef = useRef<HTMLDivElement>(null);
  // Anchor at the top of step content to realign view when step changes
  const stepTopRef = useRef<HTMLDivElement>(null);
  const productImageRef = useRefAlias<HTMLDivElement | null>(null);
  // Refs to manage focus behavior
  const askInputRef = useRef<HTMLInputElement>(null);
  const fieldInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  // Track product step entry to suppress immediate input focus on load
  const productJustEnteredRef = useRefAlias(false);
  // Skip auto-scroll-to-bottom for a specific number of message appends
  
  // Lightweight pending map to debounce actions
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const setBusy = useCallback((key: string, val: boolean) => {
    setPending((p) => ({ ...p, [key]: val }));
  }, []);
  // Block user actions while any async action is in-flight
  const aiBusy = useMemo(() => Object.values(pending).some(Boolean), [pending]);
  // (Removed) depAskShownRef; dependents prompt now shows only after profile completion
  // Stable snapshot for dependency arrays (avoid ref-like .current warnings)
  const stepCode = state.current;

  // Do not show the global overlay for local AI thinking within enrollment
  // (Overlay will still appear for actual network calls unless explicitly skipped.)

  function scrollChatEnd(smooth = true) {
    // Only scroll the chat container to the bottom; never use element.scrollIntoView on the page
    const el = scrollRef.current;
    if (!el) return;
    try { el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }
    catch { el.scrollTop = el.scrollHeight; }
  }
  // Removed page-level scroll helpers; we only scroll inside the chat container
  function scrollElementIntoChatView(target: HTMLElement, smooth = true) {
    const container = scrollRef.current;
    if (!container || !target) return;
    try {
      // Compute target's top relative to the scroll container
      let y = 0;
      let el: HTMLElement | null = target;
      while (el && el !== container) {
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const targetTop = y;
      const targetBottom = y + target.offsetHeight;
      if (targetTop < viewTop) {
        container.scrollTo({ top: Math.max(0, targetTop - 16), behavior: smooth ? 'smooth' : 'auto' });
      } else if (targetBottom > viewBottom) {
        const newTop = targetBottom - container.clientHeight + 16;
        container.scrollTo({ top: Math.max(0, newTop), behavior: smooth ? 'smooth' : 'auto' });
      }
    } catch {}
  }

  // Scroll chat container so a child element is at the top (align start) without moving the page
  function scrollChatToChildTop(target: HTMLElement, offset = 0, smooth = true) {
    const container = scrollRef.current;
    if (!container || !target) return;
    try {
      let y = 0;
      let el: HTMLElement | null = target;
      while (el && el !== container) {
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      const top = Math.max(0, y - offset);
      container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    } catch {}
  }
  function scrollChatToAnchorOffset(offset = 24, smooth = true) {
    const container = scrollRef.current;
    const anchor = messageAnchorRef.current;
    if (!container || !anchor) return;
    try {
      let y = 0;
      let el: HTMLElement | null = anchor as HTMLElement;
      while (el && el !== container) {
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      const top = Math.max(0, y - offset);
      container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    } catch {}
  }

  // Smooth-scroll the chat container so the product step top is slightly above view (removed: not used)
  // (Removed) Page-level scrolling for Q&A was reverted; we only move the chat container now

  // Controlled state now drives product selections; no DOM queries needed

  // Echo a user Ask once and bring the chat into view
  function postUserAsk(text: string, opts?: { pinToEnd?: boolean }) {
    setMessages((m) => [...m, { role: 'user', text }]);
  // Pin to the end of the chat without moving the page
  if (opts?.pinToEnd !== false) setTimeout(() => scrollChatEnd(true), 0);
  }

  const focusChatArea = useCallback(() => {
    // On first render of a product step, do not auto-focus fields/Ask; keep user at the step start
    if (String(stepCode).startsWith('product-') && productJustEnteredRef.current) {
      return;
    }
    // When on profile, prefer the field input if present; otherwise focus Ask box
    if (stepCode === 'employee_profile' && fieldInputRef.current) {
      // Focus without triggering page scroll
      try { (fieldInputRef.current as HTMLElement).focus({ preventScroll: true }); } catch { fieldInputRef.current.focus(); }
  // Ensure the input is visible within the chat container without moving the page
  scrollElementIntoChatView(fieldInputRef.current as HTMLElement, true);
    } else {
      try { askInputRef.current?.focus({ preventScroll: true }); } catch { askInputRef.current?.focus(); }
    }
  }, [stepCode, productJustEnteredRef]);
  // Local UI state for per-product choices and agreements
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [agreements, setAgreements] = useState<Record<string, boolean>>({});
  // Product selection confirmation loop state
  const [selectionConfirm, setSelectionConfirm] = useState(false);
  // When editing from review, return to pre_confirm after save/decline
  const returnToRef = useRefAlias<{ code?: StepCode }>({});
  // Dependents local state
  const [dependents, setDependents] = useState<Array<{ name: string; relationship: string; birthDate?: string }>>([]);
  // Dependent form via react-hook-form + zod: once the form is open, all fields are mandatory
  const DependentSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    relationship: z.string().min(1, 'Relationship is required'),
    birthDate: z.string().min(1, 'Birth date is required'),
  });
  const { register, handleSubmit, reset: resetDep, formState: { errors } } = useForm<z.infer<typeof DependentSchema>>({
    defaultValues: { name: '', relationship: '', birthDate: '' },
    resolver: zodResolver(DependentSchema),
  });
  const [showDepForm, setShowDepForm] = useState(false);
  // Ask to add dependents only after profile is complete
  const [depAskVisible, setDepAskVisible] = useState(false);
  // Language + voice
  const [lang, setLang] = useState<'English'|'Spanish'|'French'>('English');
  const [ask, setAsk] = useState('');
  const recRef = useRefAlias<WebSpeechRecognition | null>(null);
  const dispatch = useAppDispatch();
  // Pre-confirm agreement state (controlled)
  const [agreeSubmit, setAgreeSubmit] = useState(false);
  // Guard initial refresh from React Strict Mode double-invoke
  const didInitRef = useRefAlias(false);
  // Ensure only last refresh applies (avoid out-of-order flicker)
  const refreshSeqRef = useRefAlias(0);
  // Abort in-flight refresh
  const refreshAbortRef = useRefAlias<AbortController | null>(null);
  // Render gate for initial data
  const [initDone, setInitDone] = useState(false);
  // Local guard: keep UI on a step until user explicitly proceeds
  const holdStepRef = useRefAlias<StepCode | null>(null);
  

  // Employee profile local form state
  const [ep, setEp] = useState<EmployeeProfile>(
    { firstName: '', lastName: '', email: '', phone: '', ssnLast4: '', birthDate: '', employeeId: '', department: '', payFrequency: '' }
  );
  // Optional server-driven profile schema
  const serverProfileSchemaRef = useRefAlias<null | Array<{ key: keyof EmployeeProfile; label: string; type: FieldType; required?: boolean; options?: string[]; placeholder?: string }>>(null);
  // Server-driven schemas for other steps
  const selectionSchemaRef = useRefAlias<ClientField[] | null>(null);
  const productDetailsSchemaRef = useRefAlias<Record<string, ClientField[]> | null>(null);
  const preConfirmSchemaRef = useRefAlias<ClientField[] | null>(null);
  type FieldType = 'text' | 'email' | 'phone' | 'date' | 'alphanumeric' | 'select';
  type FieldDef = { key: keyof EmployeeProfile; label: string; type: FieldType; required?: boolean; options?: string[]; placeholder?: string; validate?: (v: string) => string | null };
  const defaultProfileSchema = useMemo<FieldDef[]>(() => [
    { key: 'firstName', label: 'First name', type: 'text', required: true, placeholder: 'Enter your first name', validate: (v) => v.trim().length < 1 ? 'First name is required' : null },
    { key: 'lastName', label: 'Last name', type: 'text', required: true, placeholder: 'Enter your last name', validate: (v) => v.trim().length < 1 ? 'Last name is required' : null },
    { key: 'birthDate', label: 'Date of birth', type: 'date', required: true, validate: (v) => !v ? 'Date of birth is required' : null },
    { key: 'email', label: 'Email', type: 'email', required: true, validate: (v) => /.+@.+\..+/.test(v) ? null : 'Enter a valid email' },
    { key: 'phone', label: 'Phone', type: 'phone', required: false, placeholder: 'e.g. +1 555 555 5555', validate: (v) => v && v.length < 7 ? 'Enter a valid phone' : null },
    { key: 'employeeId', label: 'Employee ID', type: 'alphanumeric', required: true, validate: (v) => /^[a-z0-9\-_.]{2,32}$/i.test(v) ? null : '2-32 chars, letters/numbers/._-' },
    { key: 'department', label: 'Department', type: 'text', required: false },
    { key: 'payFrequency', label: 'Pay frequency', type: 'select', required: true, options: ['weekly','biweekly','semimonthly','monthly'] },
    { key: 'ssnLast4', label: 'SSN last 4', type: 'alphanumeric', required: false, validate: (v) => v && !/^\d{4}$/.test(v) ? 'Enter last 4 digits' : null },
  ], []);
  const profileSchema = useMemo<FieldDef[]>(() => {
    const serverDefs = serverProfileSchemaRef.current;
    if (!serverDefs || !serverDefs.length) return defaultProfileSchema;
    const defaultMap: Record<string, FieldDef> = {};
    for (const def of defaultProfileSchema) defaultMap[def.key as string] = def;
    // Use server-provided order, but merge with defaults for validation/types/options
    const merged: FieldDef[] = serverDefs.map((d) => ({
      ...(defaultMap[d.key as string] || { key: d.key, label: d.label, type: d.type }),
      key: d.key,
      label: d.label,
      type: d.type,
      required: d.required ?? defaultMap[d.key as string]?.required,
      options: d.options ?? defaultMap[d.key as string]?.options,
      placeholder: d.placeholder ?? defaultMap[d.key as string]?.placeholder,
    }));
    // Append any default fields not present in the server list (e.g., payFrequency)
    const present = new Set(merged.map(m => m.key));
    for (const def of defaultProfileSchema) {
      if (!present.has(def.key)) merged.push(def);
    }
    return merged;
  }, [defaultProfileSchema, serverProfileSchemaRef]);
  const orderedProfileSchema = useCallback((current: EmployeeProfile) => {
    const filled = new Set(Object.entries(current).filter(([, v]) => String(v || '').trim().length > 0).map(([k]) => k));
    const required = profileSchema.filter((f) => f.required).sort((a, b) => (filled.has(a.key) ? 1 : 0) - (filled.has(b.key) ? 1 : 0));
    const optional = profileSchema.filter((f) => !f.required).sort((a, b) => (filled.has(a.key) ? 1 : 0) - (filled.has(b.key) ? 1 : 0));
    return [...required, ...optional];
  }, [profileSchema]);
  const [pf, setPf] = useState<{ idx: number; finished: boolean; editingKey?: keyof EmployeeProfile; error?: string; currentValue: string }>({ idx: 0, finished: false, currentValue: '' });

  function normalizeProfileStrings(p?: { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: string | Date | null; payFrequency?: string; department?: string; employeeId?: string } | null): Partial<EmployeeProfile> {
    return {
      firstName: p?.firstName || '',
      lastName: p?.lastName || '',
      email: p?.email || '',
      phone: p?.phone || '',
      ssnLast4: p?.ssnLast4 || '',
      birthDate: p?.birthDate ? String(p.birthDate).slice(0, 10) : '',
      employeeId: p?.employeeId || '',
      department: p?.department || '',
      payFrequency: p?.payFrequency || ''
    };
  }

  // Helper: build steps with labels and summaries
  function buildSteps(args: {
    canonical: string[];
    currentCode: string;
    sessionSteps: { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }[];
    selected: string[];
    productsById: Map<string, Product>;
  profile?: { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: string | Date | null; payFrequency?: string; department?: string; employeeId?: string };
  }) {
    const { canonical, currentCode, sessionSteps, selected, productsById, profile } = args;
    const statusMap = new Map<string, 'pending' | 'complete'>();
    const dataMap = new Map<string, Record<string, unknown>>();
    for (const s of sessionSteps) {
      if (s.code) {
        if (s.status) statusMap.set(s.code, s.status);
        if (s.data) dataMap.set(s.code, s.data);
      }
    }
    return canonical.map((code) => {
      const label = code === 'employee_profile'
        ? 'Employee Profile'
        : code === 'product_select'
          ? 'Select Products'
          : code.startsWith('product-')
            ? (productsById.get(code.replace('product-', ''))?.name || 'Details')
            : code === 'pre_confirm' ? 'Review' : code;
  // Default unknown steps to pending to prevent premature completion display
  const status = statusMap.get(code) ?? (code === currentCode ? 'pending' : 'pending');
      let summary: string | undefined;
      if (code === 'employee_profile' && (profile?.email || profile?.employeeId || profile?.department)) {
        summary = [profile?.email, profile?.employeeId, profile?.department].filter(Boolean).join(' • ');
      } else if (code === 'product_select') {
        summary = selected.length ? `${selected.length} selected` : 'None selected';
      } else if (code.startsWith('product-')) {
        const data = dataMap.get(code);
        if (data && typeof (data as { declined?: unknown }).declined === 'boolean' && (data as { declined?: boolean }).declined) {
          summary = 'Declined';
        } else {
          const lvl = data ? (data as { level?: unknown }).level : undefined;
          if (typeof lvl === 'string') summary = `Level: ${lvl}`; else summary = 'Pending';
        }
      }
      return { code: code as StepCode, label, status: status as 'pending' | 'complete', summary };
    });
  }

  const startProfileWizard = useCallback((incoming?: Partial<EmployeeProfile>) => {
    const merged = { ...ep, ...(incoming || {}) } as EmployeeProfile;
    const seq = orderedProfileSchema(merged);
    // find first field missing or invalid
    const firstIdx = seq.findIndex((f) => {
      const v = merged[f.key];
      const s = String(v || '');
      if (!s) return true;
      return f.validate ? !!f.validate(s) : false;
    });
    const idx = firstIdx === -1 ? 0 : firstIdx;
    setPf({ idx, finished: firstIdx === -1, currentValue: merged[seq[idx]?.key] || '' });
  // Hold on employee_profile until user explicitly proceeds
  holdStepRef.current = 'employee_profile';
    if (firstIdx === -1) {
      setMessages((m) => [...m, { role: 'ai', text: 'All profile details appear complete. You can edit a field or proceed to the next step.' }]);
  setDepAskVisible(true);
    } else {
      const f = seq[idx];
      const mandatory = f.required ? ' (mandatory)' : ' (optional)';
      const ask = f.type === 'date' ? 'Please select your date of birth' : `Please enter your ${f.label.toLowerCase()}`;
      setMessages((m) => [...m, { role: 'ai', text: `${ask}${mandatory}.` }]);
    }
  }, [ep, orderedProfileSchema, holdStepRef]);

  const refresh = useCallback(async (initial = false) => {
    const seq = ++refreshSeqRef.current;
    // Prefer consolidated bootstrap endpoint
    type BootData = {
      ok?: boolean;
      profile?: Partial<EmployeeProfile>;
      session?: { steps?: Array<{ code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }>; selectedProductIds?: string[] };
      canonical?: string[];
      currentCode?: string;
      products?: Array<{ _id: string; name: string; description?: string; coverageOptions?: { level: string; monthlyCost: number }[] }>;
      schema?: {
        profile?: Array<{ key: keyof EmployeeProfile; label: string; type: FieldType; required?: boolean; options?: string[]; placeholder?: string }>;
        selection?: ClientField[];
        productDetails?: Record<string, ClientField[]>;
        preConfirm?: ClientField[];
      };
    };
    let st: { data: { ok?: boolean; profile?: Partial<EmployeeProfile>; session?: { steps?: Array<{ code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }>; selectedProductIds?: string[] }; canonical?: string[]; currentCode?: string; products?: Product[] } };
    let available: { data: { ok?: boolean; products?: Product[] } };
    try {
      // Abort any in-flight bootstrap
      try { refreshAbortRef.current?.abort(); } catch {}
      const { controller, signal } = abortable();
      refreshAbortRef.current = controller;
      const boot = await fetchJSON<BootData>('/api/enrollment/bootstrap', { cacheKey: 'enroll-bootstrap', ttlMs: 10_000, signal, skipLoader: true });
      // Adopt server-driven schemas when present
      const serverProfileSchema = boot?.schema?.profile;
      if (serverProfileSchema && Array.isArray(serverProfileSchema) && serverProfileSchema.length) serverProfileSchemaRef.current = serverProfileSchema;
      if (Array.isArray(boot?.schema?.selection)) selectionSchemaRef.current = boot!.schema!.selection!;
      if (boot?.schema?.productDetails) productDetailsSchemaRef.current = boot.schema.productDetails;
      if (Array.isArray(boot?.schema?.preConfirm)) preConfirmSchemaRef.current = boot!.schema!.preConfirm!;
      st = { data: { ok: boot.ok, profile: boot.profile, session: boot.session, canonical: boot.canonical, currentCode: boot.currentCode, products: (boot.products || []) as unknown as Product[] } };
      available = { data: { ok: true, products: (boot.products || []) as unknown as Product[] } };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
      // Fallback to existing endpoints if bootstrap is unavailable
      const noOverlay = { metadata: { skipLoader: true } } as unknown as Record<string, unknown>;
      [st, available] = await Promise.all([
        http.get('/api/enrollment/state', noOverlay),
        http.get('/api/enrollment/products', noOverlay),
      ]);
    }
    // If a newer refresh completed, ignore this response
    if (seq !== refreshSeqRef.current) return;
  const selected = (st.data.session?.selectedProductIds || []) as string[];
  const availProducts: Product[] = (available.data.products || []).map((p: { _id: string; name: string; description?: string; longDescription?: string; highlights?: string[]; logoUrl?: string; images?: string[]; coverageOptions?: { level: string; monthlyCost: number }[] }) => ({ _id: p._id, name: p.name, description: p.description, longDescription: p.longDescription, highlights: p.highlights, logoUrl: p.logoUrl, images: p.images, coverageOptions: p.coverageOptions }));
    // Build product map preferring selected product details returned by state endpoint
  const selectedProducts: Product[] = (st.data.products || []).map((p: { _id: string | { toString(): string }; name: string; description?: string; longDescription?: string; highlights?: string[]; logoUrl?: string; images?: string[]; coverageOptions?: { level: string; monthlyCost: number }[] }) => ({ _id: (typeof p._id === 'string' ? p._id : p._id.toString()), name: p.name, description: p.description, longDescription: p.longDescription, highlights: p.highlights, logoUrl: p.logoUrl, images: p.images, coverageOptions: p.coverageOptions }));
    const productsById = new Map<string, Product>([...availProducts, ...selectedProducts].map((p) => [p._id, p]));
    // Apply local hold: keep current on held step and keep its status pending while held
    let effectiveCurrent = (st.data.currentCode || 'employee_profile') as StepCode;
    if (holdStepRef.current) {
      // Prefer our local hold unless server indicates we're already past it
      effectiveCurrent = holdStepRef.current;
    }
    let sessionStepsLocal = (st.data.session?.steps || []) as { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }[];
    if (holdStepRef.current === 'employee_profile') {
      sessionStepsLocal = sessionStepsLocal.map((s) => s.code === 'employee_profile' ? { ...s, status: 'pending' } : s);
    }
    // Ensure canonical includes product detail steps for all selected products in selected order
    const serverCanonical = (st.data.canonical || []) as string[];
    const productCodes = (selected || []).map((id) => `product-${id}`);
    const withoutProducts = serverCanonical.filter((c) => !String(c).startsWith('product-'));
    const insertAfter = Math.max(
      withoutProducts.findIndex((c) => c === 'product_select'),
      withoutProducts.findIndex((c) => c === 'employee_profile')
    );
    let canonicalEffective: string[];
    if (productCodes.length) {
      if (insertAfter >= 0) {
        canonicalEffective = [
          ...withoutProducts.slice(0, insertAfter + 1),
          ...productCodes,
          ...withoutProducts.slice(insertAfter + 1),
        ];
      } else {
        canonicalEffective = [...productCodes, ...withoutProducts];
      }
    } else {
      canonicalEffective = withoutProducts;
    }
    // De-dup just in case
    const seenCodes = new Set<string>();
    canonicalEffective = canonicalEffective.filter((c) => (seenCodes.has(c) ? false : (seenCodes.add(c), true)));
    // Merge server steps with any more-advanced local steps to prevent regressions
    setState((prev) => {
      const localByCode = new Map<string, SessionStep>();
      for (const s of prev.sessionSteps) if (s.code) localByCode.set(s.code, s);
      const serverByCode = new Map<string, SessionStep>();
      for (const s of sessionStepsLocal) if (s.code) serverByCode.set(String(s.code), { code: s.code, status: s.status, data: s.data });
      const allCodes = new Set<string>([...canonicalEffective]);
      for (const k of serverByCode.keys()) allCodes.add(k);
      for (const k of localByCode.keys()) allCodes.add(k);
      const merged: SessionStep[] = [];
      for (const code of allCodes) {
        const l = localByCode.get(code);
        const s = serverByCode.get(code);
        if (l && s) {
          // Prefer the more advanced state; complete > pending, richer data wins
          const lComplete = l.status === 'complete';
          const sComplete = s.status === 'complete';
          if (lComplete && !sComplete) merged.push(l);
          else if (!lComplete && sComplete) merged.push(s);
          else if (lComplete && sComplete) {
            const lHas = l.data && ((l.data as { level?: string }).level || (l.data as { declined?: boolean }).declined);
            const sHas = s.data && ((s.data as { level?: string }).level || (s.data as { declined?: boolean }).declined);
            merged.push(lHas ? l : (sHas ? s : l));
          } else {
            // both pending: prefer server
            merged.push(s);
          }
        } else if (s) {
          merged.push(s);
        } else if (l) {
          merged.push(l);
        }
      }
      // Order merged by our effective canonical
      const order = new Map<string, number>();
      canonicalEffective.forEach((c, i) => order.set(c, i));
      merged.sort((a, b) => (order.get(a.code || '') ?? 9999) - (order.get(b.code || '') ?? 9999));

      const steps = buildSteps({
        canonical: canonicalEffective,
        currentCode: effectiveCurrent,
        sessionSteps: merged as { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }[],
        selected,
        productsById,
        profile: st.data.profile,
      });

      // Seed per-product UI selections from merged steps
      const savedLevels: Record<string, string> = {};
      const savedAgreements: Record<string, boolean> = {};
      for (const s of merged) {
        const code = s.code || '';
        if (code.startsWith('product-')) {
          const id = code.replace('product-', '');
          const lvl = (s.data && typeof (s.data as { level?: unknown }).level === 'string') ? (s.data as { level?: string }).level : undefined;
          if (lvl) { savedLevels[id] = lvl; savedAgreements[id] = true; }
        }
      }
      setLevels((prevLv) => ({ ...prevLv, ...savedLevels }));
      setAgreements((prevAg) => ({ ...prevAg, ...savedAgreements }));

      // Sync global store for app-wide access
      dispatch(setProfileGlobal(st.data.profile || null));
      dispatch(setSelectedGlobal(selected));
      dispatch(setStepsGlobal({ steps: steps.map(s => ({ code: s.code, label: s.label, status: s.status, summary: s.summary })), currentCode: effectiveCurrent }));

      return { ...prev, profile: st.data.profile, products: availProducts, selected, current: effectiveCurrent, steps, sessionSteps: merged };
    });
    // Seed employee profile form from profile on first load
    setEp({
      firstName: st.data.profile?.firstName || '',
      lastName: st.data.profile?.lastName || '',
      email: st.data.profile?.email || '',
      phone: st.data.profile?.phone || '',
      ssnLast4: st.data.profile?.ssnLast4 || '',
      birthDate: st.data.profile?.birthDate ? String(st.data.profile.birthDate).slice(0, 10) : '',
      employeeId: st.data.profile?.employeeId || '',
      department: st.data.profile?.department || '',
      payFrequency: st.data.profile?.payFrequency || ''
    });
    // Load dependents (read-only) for profile
    if (st.data.profile?.email) {
      try {
  // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.get(`/api/profile/dependents?email=${encodeURIComponent(st.data.profile.email)}`, { metadata: { skipLoader: true } });
        setDependents(Array.isArray(r.data?.dependents) ? r.data.dependents : []);
      } catch {}
    }
    if (initial) {
      const existingPairs = Object.entries(st.data.profile || {}).filter(([k, v]) => ['firstName','lastName','email','employeeId','department','payFrequency','birthDate','phone'].includes(k) && v).map(([k, v]) => `${k}: ${k === 'birthDate' ? String(v).slice(0,10) : v}`);
      const intro = `Hi ${st.data.profile?.firstName || ''}! Let’s confirm your employee profile.`;
      const found = existingPairs.length ? `I found these on file: ${existingPairs.join(' • ')}.` : 'We don’t have any details on file yet.';
      setMessages([{ role: 'ai', text: `${intro} ${found} I’ll guide you one by one.` }]);
      // Start conversational profile wizard
      const normalized = normalizeProfileStrings(st.data.profile);
      setTimeout(() => startProfileWizard(normalized), 10);
      setInitDone(true);
    }
  // refresh uses internal refs that are stable; disable exhaustive-deps to avoid noisy warnings
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startProfileWizard, dispatch]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void refresh(true);
  }, [refresh, didInitRef]);

  useEffect(() => {
    scrollChatEnd(true);
  }, [messages]);
  // Scroll when step context changes; align product steps to their image (or step start) within chat, never the page
  useEffect(() => {
    if (String(stepCode).startsWith('product-')) {
      productJustEnteredRef.current = true;
      const el = (productImageRef.current as HTMLElement | null) || (stepTopRef.current as HTMLElement | null);
      if (el) {
        // Defer to ensure layout is ready
        setTimeout(() => scrollChatToChildTop(el, 0, true), 0);
        // After aligning, clear the guard asynchronously; subsequent focus calls can proceed
        setTimeout(() => { productJustEnteredRef.current = false; }, 50);
      } else {
        scrollChatEnd(true);
      }
      // Do not auto-focus Ask or fields on initial product step load
    } else {
      scrollChatEnd(true);
      focusChatArea();
    }
  }, [stepCode, focusChatArea, productImageRef, productJustEnteredRef]);
  // Other UI toggles that change layout within the same step
  useEffect(() => {
    scrollChatEnd(true);
    focusChatArea();
  }, [selectionConfirm, depAskVisible, showDepForm, focusChatArea]);

  // Focus when profile field index/finished state changes
  useEffect(() => {
    focusChatArea();
  }, [pf.idx, pf.finished, focusChatArea]);

  // startProfileWizard defined via useCallback above

  const promptForField = useCallback((f: FieldDef) => {
    const mandatory = f.required ? ' (mandatory)' : ' (optional)';
    const ask = f.type === 'date' ? 'Please select your date of birth' : `Please enter your ${f.label.toLowerCase()}`;
    return `${ask}${mandatory}.`;
  }, []);

  // Simple parser for free-text answers to the current field
  function parseValueForField(f: FieldDef, raw: string): { value?: string; error?: string } {
    const text = raw.trim();
    if (!text) return { error: `${f.label} cannot be empty` };
    if (f.type === 'select') {
      const opts = (f.options || []).map(o => String(o));
      const match = opts.find(o => o.toLowerCase() === text.toLowerCase()) || opts.find(o => o.toLowerCase().includes(text.toLowerCase()));
      if (!match) return { error: `Please choose one of: ${opts.join(', ')}` };
      return { value: match };
    }
    if (f.type === 'date') {
      // Accept YYYY-MM-DD or common formats; rely on input to normalize later
      const iso = text.match(/^\d{4}-\d{2}-\d{2}$/);
      const slash = text.match(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/);
      if (!iso && !slash) return { error: 'Enter a valid date (YYYY-MM-DD)' };
      // Basic normalization for MM/DD/YYYY style
      if (!iso && slash) {
  const parts = text.replace(/\./g,'/').replace(/-/g,'/').split('/').map(p=>p.trim());
  const [a,b,cRaw] = parts;
  const c = cRaw.length === 2 ? `20${cRaw}` : cRaw; // naive 2-digit year -> 20xx
  const mm = a.padStart(2,'0');
  const dd = b.padStart(2,'0');
  const yyyy = c.length === 4 ? c : `20${c}`;
        return { value: `${yyyy}-${mm}-${dd}` };
      }
      return { value: text };
    }
    // email/phone/alphanumeric/text: pass through
    return { value: text };
  }

  // When entering a product step, hold on product details loop until user proceeds to review
  // Product hold is managed during refresh and when editing a product explicitly

  function getProductStepStatusMap() {
    const map = new Map<string, 'pending'|'complete'>();
    for (const s of state.sessionSteps) {
      if (s.code && s.code.startsWith('product-') && (s.status === 'pending' || s.status === 'complete')) {
        map.set(s.code, s.status);
      }
    }
    return map;
  }
  function allSelectedProductsCompleted() {
    const status = getProductStepStatusMap();
    return state.selected.every((id) => status.get(`product-${id}`) === 'complete');
  }

  // (Reverted) No extra polling; rely on a single refresh after saving product decision

  function displayValue(f: FieldDef, v: string) {
    if (f.key === 'ssnLast4') return v ? `••${v}` : '';
    if (f.key === 'birthDate') return v ? String(v).slice(0,10) : '';
    return v;
  }

  function recomputeStepsLocal(updatedProfile: Partial<EmployeeProfile>) {
    setState((s) => {
      const newProfile = { ...(s.profile || {}), ...updatedProfile } as { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: string | Date | null; payFrequency?: string; department?: string; employeeId?: string };
      const productsById = new Map<string, Product>(s.products.map((p) => [p._id, p]));
      const steps = buildSteps({
        canonical: s.steps.map(st => st.code) as string[],
        currentCode: s.current,
        sessionSteps: s.sessionSteps,
        selected: s.selected,
        productsById,
        profile: newProfile,
      });
  // Sync global store too
      const normalizedForGlobal: Partial<EmployeeProfile> = {
        firstName: newProfile.firstName || '',
        lastName: newProfile.lastName || '',
        email: newProfile.email || '',
        phone: newProfile.phone || '',
        ssnLast4: newProfile.ssnLast4 || '',
        birthDate: newProfile.birthDate ? String(newProfile.birthDate).slice(0, 10) : '',
        employeeId: newProfile.employeeId || '',
        department: newProfile.department || '',
        payFrequency: newProfile.payFrequency || '',
      };
      dispatch(setProfileGlobal(normalizedForGlobal));
  dispatch(setStepsGlobal({ steps: steps.map(st => ({ code: st.code, label: st.label, status: st.status, summary: st.summary })), currentCode: s.current }));
  return { ...s, profile: newProfile, steps };
    });
  }

  async function saveProfileField(f: FieldDef, value: string) {
    if (pending['saveField']) return;
    setBusy('saveField', true);
    const fd = new FormData();
    fd.append(f.key, value);
    try {
  // @ts-expect-error custom interceptor metadata not in Axios types
  const res = await http.post('/api/enrollment/employee_profile', fd, { metadata: { skipLoader: true } });
      if (res.status >= 400) throw new Error('Failed');
      // Update local profile and step summary
      recomputeStepsLocal({ [f.key]: value } as Partial<EmployeeProfile>);
      setEp((e) => ({ ...e, [f.key]: value } as EmployeeProfile));
      // Chat confirmations
      const shown = displayValue(f, value);
      setMessages((m) => [...m, { role: 'user', text: `${f.label}: ${shown}` }, { role: 'ai', text: `${f.label} saved.` }]);
      // Move to next field
  const mergedEp = { ...ep, [f.key]: value } as EmployeeProfile;
      const seq = orderedProfileSchema(mergedEp);
      const currPos = seq.findIndex(x => x.key === f.key);
      let nextIdx = -1;
      for (let i = currPos + 1; i < seq.length; i++) {
        const ff = seq[i];
        const v2 = mergedEp[ff.key];
        if (!v2 || (ff.validate ? !!ff.validate(String(v2)) : false)) { nextIdx = i; break; }
      }
  // Only surface dependents prompt after the entire profile flow is complete

      if (nextIdx === -1) {
        setPf({ idx: 0, finished: true, currentValue: '' });
        setMessages((m) => [...m, { role: 'ai', text: 'All details captured for Employee Profile. Would you like to proceed to the next step or make changes to a field?' }]);
  setDepAskVisible(true);
  // Keep hold until user clicks Proceed
  holdStepRef.current = 'employee_profile';
      } else {
        const nf = seq[nextIdx];
        setPf({ idx: nextIdx, finished: false, currentValue: mergedEp[nf.key] || '' });
        setMessages((m) => [...m, { role: 'ai', text: promptForField(nf) }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: `Couldn’t save ${f.label}. Please try again.` }]);
    } finally {
      setBusy('saveField', false);
    }
  }

  const currentIsProduct = state.current?.startsWith('product-');
  async function askProductQuestion(q: string, opts?: { echo?: boolean; pinToEnd?: boolean }) {
    if (!q) return;
  if (pending['ask'] || aiBusy) return;
    setBusy('ask', true);
  // Only ensure the chat is pinned; do not move the page
    if (opts?.echo !== false) setMessages((m) => [...m, { role: 'user', text: q }]);
  scrollChatEnd(true);
    try {
  // Skip overlay for inline AI Q&A inside enrollment
  // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.post('/api/assistant/rag', { query: q, topK: 5 }, { metadata: { skipLoader: true } });
      const answer = (r.data?.answer as string) || '';
      if (answer) setMessages((m) => [...m, { role: 'ai', text: answer }]);
      else setMessages((m) => [...m, { role: 'ai', text: 'I couldn’t find that in the product docs.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: 'Sorry, I ran into an issue answering that.' }]);
    } finally {
      setBusy('ask', false);
      // Keep the Ask box focused after Q&A; do not move the page
      setTimeout(() => {
        scrollChatEnd(true);
        try { askInputRef.current?.focus({ preventScroll: true }); } catch { askInputRef.current?.focus(); }
      }, 0);
    }
  }
  async function getRecommendations() {
  if (pending['recommend'] || aiBusy) return;
    setBusy('recommend', true);
    setMessages((m) => [...m, { role: 'user', text: 'Recommend a bundle for me.' }]);
  scrollChatEnd(true);
    try {
  // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.post('/api/assistant/recommend', { profile: state.profile, products: state.products }, { metadata: { skipLoader: true } });
      const picks = Array.isArray(r.data?.picks) ? r.data.picks : [];
      const summary = r.data?.summary as string | undefined;
      if (picks.length) {
        type Pick = { productId?: string; id?: string };
        const names = (picks as Pick[]).map((p) => state.products.find(sp => sp._id === (p.productId || p.id))?.name || p.productId || p.id).filter(Boolean).join(', ');
        setMessages((m) => [...m, { role: 'ai', text: `Suggested: ${names}${summary ? `. ${summary}` : ''}` }]);
      } else if (summary) {
        setMessages((m) => [...m, { role: 'ai', text: summary }]);
      } else {
        setMessages((m) => [...m, { role: 'ai', text: 'No specific recommendations right now.' }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: 'Sorry, I couldn’t generate recommendations.' }]);
    } finally {
      setBusy('recommend', false);
      // Keep focus on Ask box and ensure chat is at the response
      setTimeout(() => { scrollChatEnd(true); askInputRef.current?.focus(); }, 0);
    }
  }

  function startSTT() {
    if (typeof window === 'undefined') return;
  const anyWin = window as unknown as { SpeechRecognition?: WebSpeechRecognitionCtor; webkitSpeechRecognition?: WebSpeechRecognitionCtor };
    const SR = anyWin.SpeechRecognition || anyWin.webkitSpeechRecognition;
    if (!SR) return alert('Speech recognition not supported');
    const rec = new SR();
    rec.lang = lang === 'Spanish' ? 'es-ES' : lang === 'French' ? 'fr-FR' : 'en-US';
    rec.interimResults = false;
    rec.onresult = async (e: WebSpeechEvent) => {
      const text = (e?.results?.[0]?.[0]?.transcript ?? '') as string;
      setAsk(text);
      // Echo once in chat and then route to NLP / RAG without re-echo
      postUserAsk(text);
      const handled = await handleChatInput(text, { echo: false });
      if (!handled) await askProductQuestion(text, { echo: false });
  setTimeout(() => { scrollChatEnd(true); }, 0);
    };
    rec.onend = () => { recRef.current = null; };
    recRef.current = rec;
    rec.start();
  }
  function speakLast() {
    const last = [...messages].reverse().find((m) => m.role === 'ai');
    if (!last) return;
    const u = new SpeechSynthesisUtterance(last.text);
    u.lang = lang === 'Spanish' ? 'es-ES' : lang === 'French' ? 'fr-FR' : 'en-US';
    window.speechSynthesis.speak(u);
  }
  // addDependent helper is planned for future conversational dependents flow

  // no generic handleSubmit; each step has inline controls

  // Removed legacy saveEmployeeProfile; we save field-by-field in saveProfileField

  async function addDependent(values: { name: string; relationship: string; birthDate: string }) {
    if (!state.profile?.email) return;
    if (!values.name || !values.relationship) return alert('Enter name and relationship');
    try {
      setBusy('dep:save', true);
  // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.post('/api/profile/dependents', { email: state.profile.email, dependent: values }, { metadata: { skipLoader: true } });
      const list = Array.isArray(r.data?.dependents) ? r.data.dependents : [];
      setDependents(list);
      resetDep();
      setShowDepForm(false);
      setMessages((m) => [
        ...m,
        { role: 'user', text: `Added dependent ${values.name}.` },
        { role: 'ai', text: 'Dependent saved.' },
        { role: 'ai', text: 'Would you like to add another dependent?' },
      ]);
      setDepAskVisible(true);
    } catch {} finally {
      setBusy('dep:save', false);
    }
  }

  async function advanceToNextStep() {
    if (pending['advance']) return;
    setBusy('advance', true);
    try {
  // Release local hold and let server advance the step
  holdStepRef.current = null;
  // @ts-expect-error custom interceptor metadata not in Axios types
  await http.post('/api/enrollment/next', undefined, { metadata: { skipLoader: true } });
      await refresh();
    } catch {
      // no-op
    } finally {
      setBusy('advance', false);
    }
  }

  async function submitSelection() {
    if (state.selected.length === 0) {
      setMessages((m) => [...m, { role: 'ai', text: 'Please select at least one product to continue.' }]);
      return;
    }
  // Enter confirmation loop before committing selection
    setSelectionConfirm(true);
    setMessages((m) => [...m, { role: 'ai', text: `Review your selection. You can remove items or confirm to continue.` }]);
  scrollChatEnd(true);
  focusChatArea();
  }

  async function confirmSelectionAndContinue() {
    if (pending['confirmSel'] || aiBusy) return;
    if (state.selected.length === 0) {
      setSelectionConfirm(false);
      setMessages((m) => [...m, { role: 'ai', text: 'No products selected. Please choose at least one to continue.' }]);
      return;
    }
    const fd = new FormData();
    state.selected.forEach((id) => fd.append('productIds', id));
    try {
  setBusy('confirmSel', true);
      // @ts-expect-error custom interceptor metadata not in Axios types
      const res = await http.post('/api/enrollment/select', fd, { metadata: { skipLoader: true } });
      if (res.status < 400) {
        // Deterministically compute next steps locally: profile -> selection -> product-ids -> review
        const nextSession: SessionStep[] = [...state.sessionSteps.filter(s => !String(s.code || '').startsWith('product-'))];
        for (const id of state.selected) {
          if (!nextSession.find(s => s.code === `product-${id}`)) nextSession.push({ code: `product-${id}`, status: 'pending' });
        }
        const productsById = new Map<string, Product>(state.products.map((p) => [p._id, p]));
        const canonicalLocal: string[] = ['employee_profile', 'product_select', ...state.selected.map(id => `product-${id}`), 'pre_confirm'];
        const stepsLocal = buildSteps({ canonical: canonicalLocal, currentCode: state.current, sessionSteps: nextSession, selected: state.selected, productsById, profile: state.profile });
        // Move to first pending product detail
        const firstPending = state.selected.find((id) => !state.sessionSteps.find(s => s.code === `product-${id}` && s.status === 'complete')) || state.selected[0];
        const nextCode = (`product-${firstPending}`) as StepCode;
        holdStepRef.current = nextCode;
        setState((prev) => ({ ...prev, sessionSteps: nextSession, steps: stepsLocal, current: nextCode }));
        // Sync global tracker
        dispatch(setStepsGlobal({ steps: stepsLocal.map(s => ({ code: s.code, label: s.label, status: s.status, summary: s.summary })), currentCode: nextCode }));
        setSelectionConfirm(false);
        setMessages((m) => [...m, { role: 'ai', text: `Selection saved. Let’s configure ${productsById.get(firstPending!)?.name || 'your first product'}.` }]);
        scrollChatEnd(true);
        // Background reconcile with server state (will not override current due to hold)
        void refresh();
      }
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: 'Could not save selection. Please try again.' }]);
    } finally {
      setBusy('confirmSel', false);
    }
  }

  function toggleProduct(id: string) {
  // Allow toggling unless we're actively confirming selection
  if (pending['confirmSel']) return;
    setState((s) => {
      const nextSelected = s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id];
      // Update product_select summary in steps for realtime feedback
      const nextSteps = s.steps.map((st) => st.code === 'product_select' ? { ...st, summary: nextSelected.length ? `${nextSelected.length} selected` : 'None selected' } : st);
  // Conversational confirmation
  const product = s.products.find(p => p._id === id);
  setMessages((m) => [...m, { role: 'ai', text: `${nextSelected.includes(id) ? 'Selected' : 'Unselected'} ${product?.name || 'product'}. ${nextSelected.length || 0} selected.` }]);
  scrollChatEnd(true);
  focusChatArea();
  // Sync global store
  dispatch(setSelectedGlobal(nextSelected));
  dispatch(setStepsGlobal({ steps: nextSteps.map(st => ({ code: st.code, label: st.label, status: st.status, summary: st.summary })), currentCode: s.current }));
  return { ...s, selected: nextSelected, steps: nextSteps };
    });
  }

  async function saveProductDecision(id: string, action: 'decline' | 'save', level?: string) {
    const key = `prod:${id}`;
    if (pending[key]) return;
    setBusy(key, true);
    try {
      const fd = new FormData();
      fd.append('productId', id);
      fd.append('action', action);
      // Use controlled state values for reliability
      const levelToUse = level || levels[id];
      if (levelToUse) fd.append('level', levelToUse);
      if (action === 'save') {
        const agreeNow = !!agreements[id];
        if (agreeNow) fd.append('agree', 'yes');
      }
      // Skip global overlay for inline product decisions to avoid UX bounce
      // @ts-expect-error custom interceptor metadata not in Axios types
      const res = await http.post('/api/enrollment/product', fd, { metadata: { skipLoader: true } });
      if (res.status < 400) {
        const serverNext: string | undefined = (res.data && (res.data.next as string)) || undefined;
        const product = state.products.find((p) => p._id === id);
        const productName = product?.name || 'Product';
        setMessages((m) => [
          ...m,
           { role: 'user', text: action === 'decline' ? `Declined ${productName}` : `Selected ${productName} (${levelToUse})` },
          { role: 'ai', text: action === 'decline' ? `${productName} declined.` : `${productName} saved.` },
        ]);
        scrollChatEnd(true);
        focusChatArea();
        // Optimistically reflect the decision locally for snappier UX
        setState((prev) => {
          const code = `product-${id}`;
          let found = false;
          const nextSession: SessionStep[] = prev.sessionSteps.map((s): SessionStep => {
            if (s.code === code) {
              found = true;
              const data: Record<string, unknown> = action === 'decline' ? { declined: true } : { level: levelToUse };
              return { ...s, status: 'complete', data };
            }
            return s;
          });
          if (!found) {
            const data: Record<string, unknown> = action === 'decline' ? { declined: true } : { level: levelToUse };
            const newStep: SessionStep = { code, status: 'complete', data };
            nextSession.push(newStep);
          }
          // Ensure we have step entries for all selected products (pending if not yet completed)
          for (const pid of prev.selected) {
            const c = `product-${pid}`;
            if (!nextSession.find((s) => s.code === c)) {
              nextSession.push({ code: c, status: 'pending' });
            }
          }
          const productsById = new Map<string, Product>(prev.products.map((p) => [p._id, p]));
          // Keep product steps in the order of current selection; then review
          const canonicalLocal: string[] = ['employee_profile', 'product_select', ...prev.selected.map(pid => `product-${pid}`), 'pre_confirm'];
          // Determine next step: next pending product, else go to review
          const pendingNext = prev.selected.find(pid => !nextSession.find(s => s.code === `product-${pid}` && s.status === 'complete'));
          const serverSuggestsProduct = typeof serverNext === 'string' && serverNext.startsWith('product-');
          const nextCode = (serverSuggestsProduct ? (serverNext as StepCode) : (pendingNext ? (`product-${pendingNext}` as StepCode) : ('pre_confirm' as StepCode)));
          const steps = buildSteps({
            canonical: canonicalLocal,
            currentCode: nextCode,
            sessionSteps: nextSession as { code?: string; status?: 'pending' | 'complete'; data?: Record<string, unknown> }[],
            selected: prev.selected,
            productsById,
            profile: prev.profile as { email?: string; phone?: string; firstName?: string; lastName?: string; ssnLast4?: string; birthDate?: string | Date | null; payFrequency?: string; department?: string; employeeId?: string } | undefined,
          });
          dispatch(setStepsGlobal({ steps: steps.map(s => ({ code: s.code, label: s.label, status: s.status, summary: s.summary })), currentCode: nextCode }));
          holdStepRef.current = nextCode;
          return { ...prev, sessionSteps: nextSession, steps, current: nextCode };
        });
        // Smoothly align to the new step content in the chat container
        setTimeout(() => {
          const anchor = (productImageRef.current as HTMLElement | null) || (stepTopRef.current as HTMLElement | null);
          if (anchor) scrollChatToChildTop(anchor, 0, true);
          else scrollChatEnd(true);
        }, 0);
        // Ask server to advance to the next step so backend currentCode matches our local nextCode
        try {
          // @ts-expect-error custom interceptor metadata not in Axios types
          await http.post('/api/enrollment/next', undefined, { metadata: { skipLoader: true } });
        } catch {}
        // Reconcile with backend in the background; keep current product step held
        void refresh();
        if (returnToRef.current.code === 'pre_confirm') {
          setState((s) => ({ ...s, current: 'pre_confirm' }));
          returnToRef.current = {};
        }
      } else {
        setMessages((m) => [...m, { role: 'ai', text: 'Could not save your choice. Please try again.' }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: 'Could not save your choice. Please try again.' }]);
    } finally {
      setBusy(key, false);
    }
  }

  async function submitAll(agree: boolean) {
    if (!agree) return;
    if (pending['submitAll']) return;
    const fd = new FormData();
    fd.append('agree', 'yes');
    try {
      setBusy('submitAll', true);
  // @ts-expect-error custom interceptor metadata not in Axios types
  const res = await http.post('/api/enrollment/submit', fd, { metadata: { skipLoader: true } });
      if (res.status < 400) {
        window.location.href = '/enroll/confirm';
      } else {
        const err = (res.data && (res.data.error || res.data.message)) || `HTTP ${res.status}`;
        setMessages((m) => [...m, { role: 'ai', text: `Submit failed: ${err}` }]);
      }
    } catch (e: unknown) {
      const err = (e as { response?: { status?: number; data?: Record<string, unknown> } }).response;
      const d = err?.data as Record<string, unknown> | undefined;
      const msg = (typeof d?.error === 'string' && d?.error) || (typeof d?.message === 'string' && d?.message) || `HTTP ${err?.status || 500}`;
      setMessages((m) => [...m, { role: 'ai', text: `Submit failed: ${msg}` }]);
    } finally {
      setBusy('submitAll', false);
    }
  }

  // Chat intent router: interpret user input as step/navigation/edit commands when possible.
  function normalizeText(s: string) { return s.toLowerCase().trim(); }
  function fieldKeyFromName(name: string): keyof EmployeeProfile | null {
    const n = normalizeText(name).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
    const candidates: Array<[keyof EmployeeProfile, string[]]> = [
      ['firstName', ['first name','firstname','name']],
      ['lastName', ['last name','lastname','surname']],
      ['email', ['email','mail','email address']],
      ['phone', ['phone','mobile','phone number','contact']],
      ['ssnLast4', ['ssn','last 4','ssn last 4','ssn4']],
      ['birthDate', ['dob','date of birth','birthday','birth date']],
      ['employeeId', ['employee id','id','emp id']],
      ['department', ['department','dept']],
      ['payFrequency', ['pay','pay frequency','pay cycle','pay period']]
    ];
    for (const [key, list] of candidates) {
      if (list.some(alias => n.includes(alias))) return key;
    }
    // Direct exact key fallback
    const known = ['firstname','lastname','email','phone','ssnlast4','birthdate','employeeid','department','payfrequency'];
    if (known.includes(n.replace(/\s/g,''))) {
      const map: Record<string, keyof EmployeeProfile> = { firstname:'firstName', lastname:'lastName', email:'email', phone:'phone', ssnlast4:'ssnLast4', birthdate:'birthDate', employeeid:'employeeId', department:'department', payfrequency:'payFrequency' };
      return map[n.replace(/\s/g,'')];
    }
    return null;
  }
  function findProductByNameOrId(q: string): Product | null {
    const n = normalizeText(q);
    let prod = state.products.find(p => normalizeText(p._id) === n || normalizeText(p.name).includes(n));
    if (!prod) {
      // try best-effort contains by words
      const words = n.split(/\s+/).filter(Boolean);
      prod = state.products.find(p => words.every(w => normalizeText(p.name).includes(w)));
    }
    return prod || null;
  }
  function remainingSelectedProductIds(): string[] {
    const status = new Map<string, 'pending'|'complete'>();
    for (const s of state.sessionSteps) if (s.code && (s.status === 'pending' || s.status === 'complete')) status.set(s.code, s.status);
    return state.selected.filter(id => status.get(`product-${id}`) !== 'complete');
  }
  async function handleChatInput(raw: string, opts?: { echo?: boolean }): Promise<boolean> {
    const text = raw.trim();
    if (!text) return true;
    if (aiBusy) return true;
    const n = normalizeText(text);
    // Optionally echo the user message (default true) — Ask button will echo once via postUserAsk
    if (opts?.echo !== false) {
      setMessages((m) => [...m, { role: 'user', text }]);
      setTimeout(() => scrollChatEnd(true), 0);
    }

    // Dependent prompt quick intents
    if (depAskVisible) {
      if (/^(yes|y|add)/.test(n)) {
        setShowDepForm(true);
        setDepAskVisible(false);
        setMessages((m)=>[...m,{ role:'ai', text:'Great—please enter dependent name, relationship, and birth date.' }]);
        return true;
      }
      if (/^(no|n|skip|later)/.test(n)) {
        setDepAskVisible(false);
        if (pf.finished) setMessages((m)=>[...m,{ role:'ai', text:'All details captured for Employee Profile. Proceed or edit a field?' }]);
        return true;
      }
    }

    // Conversational field capture for Employee Profile (real-time chat style)
    if (state.current === 'employee_profile' && !pf.finished) {
      const seq = orderedProfileSchema(ep);
      const field = seq[pf.idx];
      if (field) {
        if (/^skip(\s+this)?$/.test(n)) {
          if (field.required) {
            setMessages((m)=>[...m,{ role:'ai', text: `${field.label} is mandatory. Please provide a value.` }]);
          } else {
            // advance to next optional/required field
            const currIdx = pf.idx;
            let nextIdx = -1;
            for (let i = currIdx + 1; i < seq.length; i++) {
              const ff = seq[i];
              const v2 = ep[ff.key];
              if (!v2 || (ff.validate ? !!ff.validate(String(v2)) : false)) { nextIdx = i; break; }
            }
            if (nextIdx === -1) {
              setPf({ idx: 0, finished: true, currentValue: '' });
              setMessages((m)=>[...m,{ role:'ai', text: 'All details captured for Employee Profile. Proceed or edit a field?' }]);
              setDepAskVisible(true);
              holdStepRef.current = 'employee_profile';
            } else {
              const nf = seq[nextIdx];
              setPf({ idx: nextIdx, finished: false, currentValue: ep[nf.key] || '' });
              setMessages((m)=>[...m,{ role:'ai', text: promptForField(nf) }]);
            }
          }
          return true;
        }
        // Treat free text as the value for the current field
        const { value, error } = parseValueForField(field, text);
        const err2 = error || (field.validate ? field.validate(String(value ?? '')) : (field.required && !value ? `${field.label} is required` : null));
        if (err2) {
          setMessages((m)=>[...m,{ role:'ai', text: `${err2}. Please try again.` }]);
          return true;
        }
        await saveProfileField(field, String(value));
        return true;
      }
    }

    // Global navigation intents
    if (/^(proceed|next|continue|go next)$/.test(n)) {
      if (state.current === 'employee_profile') {
        if (pf.finished) { void advanceToNextStep(); } else { setMessages((m)=>[...m,{role:'ai',text:'Please finish your profile prompts first.'}]); }
      } else if (state.current === 'product_select') {
        if (!selectionConfirm) { setSelectionConfirm(true); setMessages((m)=>[...m,{role:'ai',text:'Review your selection. Confirm to continue.'}]); }
        else { void confirmSelectionAndContinue(); }
      } else if (state.current?.startsWith('product-')) {
        const rem = remainingSelectedProductIds();
        if (rem.length === 0) { holdStepRef.current = null; void advanceToNextStep(); }
        else { setMessages((m)=>[...m,{role:'ai',text:`Finish details for ${rem.length} product(s) first.`}]); }
      }
      return true;
    }
    if (/(^|\b)(back|go back) to (profile|selection|review)(\b|$)/.test(n)) {
      const target = /(profile|selection|review)/.exec(n)?.[1];
      if (target === 'profile') {
        holdStepRef.current = 'employee_profile';
        setState((s)=>({ ...s, current: 'employee_profile' }));
        setMessages((m)=>[...m,{role:'ai',text:'Back to Profile. Choose a field to edit or type “proceed”.'}]);
      } else if (target === 'selection') {
        holdStepRef.current = 'product_select';
        setSelectionConfirm(false);
        setState((s)=>({ ...s, current: 'product_select' }));
        setMessages((m)=>[...m,{role:'ai',text:'Back to Selection. Update your choices or type “review selection”.'}]);
      } else {
        holdStepRef.current = null;
        void advanceToNextStep();
      }
      return true;
    }

    // Profile edits
    if (/^(edit|change)\b/.test(n)) {
      // edit product ...
      const mProd = /product\s+(.+)$/.exec(n);
      if (mProd) {
        const prod = findProductByNameOrId(mProd[1]);
        if (prod) {
          const code = `product-${prod._id}` as StepCode;
          holdStepRef.current = code;
          setState((s)=>({ ...s, current: code }));
          setMessages((m)=>[...m,{role:'ai',text:`Editing ${prod.name}. Choose a level and agree, then Save.`}]);
        } else {
          setMessages((m)=>[...m,{role:'ai',text:'Product not found.'}]);
        }
        return true;
      }
      // edit <field>
      const mFld = /(?:edit|change)\s+(.+)$/.exec(n);
      if (mFld) {
        const key = fieldKeyFromName(mFld[1]);
        if (key) {
          const idx = orderedProfileSchema(ep).findIndex(f => f.key === key);
          const f = orderedProfileSchema(ep)[idx];
          holdStepRef.current = 'employee_profile';
          setState((s)=>({ ...s, current: 'employee_profile' }));
          setPf({ idx, finished: false, currentValue: ep[key] || '', editingKey: key });
          setMessages((m)=>[...m,{role:'ai',text:`Editing ${f.label}. ${promptForField(f)}` }]);
          return true;
        }
      }
    }

    // Set <field> to <value>
    const mSet = /^(set|change)\s+(.+?)\s+(to|as)\s+(.+)$/.exec(n);
    if (mSet) {
      const key = fieldKeyFromName(mSet[2] || '');
      const val = raw.replace(/^(set|change)\s+/i,'').replace(/\s+(to|as)\s+/i,'|||').split('|||')[1]?.trim() || '';
      if (key && val) {
        const def = profileSchema.find(f=>f.key===key)!;
        void saveProfileField(def, val);
        return true;
      }
    }

    // Selection modify intents
    if (/^(review\s+selection)$/.test(n)) {
      setSelectionConfirm(true);
      setMessages((m)=>[...m,{role:'ai',text:'Review your selection. Confirm to continue.'}]);
      return true;
    }
    if (/^(confirm)$/.test(n) && selectionConfirm) {
      void confirmSelectionAndContinue();
      return true;
    }
    if (/^(select|add)\s+(.+)$/.test(n)) {
      const prod = findProductByNameOrId(n.replace(/^(select|add)\s+/,''));
      if (prod && !state.selected.includes(prod._id)) {
        toggleProduct(prod._id);
      }
      return true;
    }
    if (/^(remove|unselect|delete)\s+(.+)$/.test(n)) {
      const prod = findProductByNameOrId(n.replace(/^(remove|unselect|delete)\s+/,''));
      if (prod && state.selected.includes(prod._id)) {
        toggleProduct(prod._id);
      }
      return true;
    }

    // Dependents
    if (/(add|new)\s+dependent/.test(n)) {
      setShowDepForm(true);
      setDepAskVisible(false);
      setMessages((m)=>[...m,{role:'ai',text:'Please enter dependent name, relationship, and birth date in the form.'}]);
      return true;
    }

    // Product details via chat: accept level/agree/save/decline intents
    if (currentIsProduct) {
      const id = state.current.replace('product-', '');
      const product = state.products.find(p => p._id === id);
      if (product) {
        const levelsList = (product.coverageOptions || []).map(o => o.level);
        const matchLevel = levelsList.find(l => n.includes(l.toLowerCase())) || levelsList.find(l => l.toLowerCase() === n);
        if (/^(decline|remove|skip product)$/.test(n)) {
          await saveProductDecision(id, 'decline');
          return true;
        }
        if (/^(agree|i agree|yes)$/i.test(text)) {
          setAgreements(prev => ({ ...prev, [id]: true }));
          setMessages((m)=>[...m,{ role:'ai', text: 'Disclosure accepted.' }]);
          return true;
        }
        if (matchLevel) {
          setLevels(prev => ({ ...prev, [id]: matchLevel! }));
          setMessages((m)=>[...m,{ role:'ai', text: `Level set to ${matchLevel}. Please confirm disclosure, then say "save".` }]);
          return true;
        }
        if (/^(save|confirm)$/i.test(text)) {
          const lvl = levels[id];
          if (!lvl) { setMessages((m)=>[...m,{ role:'ai', text: 'Pick a coverage level first.' }]); return true; }
          if (!agreements[id]) { setMessages((m)=>[...m,{ role:'ai', text: 'Please accept the disclosure to continue.' }]); return true; }
          await saveProductDecision(id, 'save', lvl);
          return true;
        }
      }
    }

    // Not handled by local rules: use assistant NLP mapping
    try {
      setBusy('nlp', true);
      const productLevels: Record<string, string[]> = {};
      for (const p of state.products) {
        const levels = (p.coverageOptions || []).map((o) => o.level);
        if (levels.length) productLevels[p._id] = levels;
      }
  // @ts-expect-error custom interceptor metadata not in Axios types
  const r = await http.post('/api/assistant/map-input', { step: state.current, text, productLevels }, { metadata: { skipLoader: true } });
      const updates = (r.data?.updates || {}) as Record<string, string>;
      const nav = r.data?.nav as { type?: 'proceed'|'back'|'goto'; to?: string } | undefined;
      let nlpHandled = false;
      if (state.current === 'employee_profile' && Object.keys(updates).length) {
        for (const [k, v] of Object.entries(updates)) {
          const def = profileSchema.find(f => f.key === (k as keyof EmployeeProfile));
          if (def && typeof v === 'string') await saveProfileField(def, v);
        }
        nlpHandled = true;
      }
      if (state.current.startsWith('product-') && (updates.level || updates.agree)) {
        const id = state.current.replace('product-', '');
        if (updates.level) setLevels((prev)=>({ ...prev, [id]: updates.level! }));
        if (updates.agree === 'yes') setAgreements((prev)=>({ ...prev, [id]: true }));
        if (updates.level && updates.agree === 'yes') await saveProductDecision(id, 'save', updates.level);
        nlpHandled = true;
      }
      if (state.current === 'pre_confirm' && updates.agree === 'yes') await submitAll(true);
      if (nav?.type === 'proceed') {
        if (state.current === 'employee_profile') {
          if (pf.finished) { void advanceToNextStep(); } else { setMessages((m)=>[...m,{role:'ai',text:'Please finish your profile prompts first.'}]); }
        } else if (state.current === 'product_select') {
          if (!selectionConfirm) { setSelectionConfirm(true); setMessages((m)=>[...m,{role:'ai',text:'Review your selection. Confirm to continue.'}]); }
          else { void confirmSelectionAndContinue(); }
        } else if (state.current?.startsWith('product-')) {
          const rem = remainingSelectedProductIds();
          if (rem.length === 0) { holdStepRef.current = null; void advanceToNextStep(); }
          else { setMessages((m)=>[...m,{role:'ai',text:`Finish details for ${rem.length} product(s) first.`}]); }
        }
        nlpHandled = true;
      } else if (nav?.type === 'back') {
        const to = nav.to || 'profile';
        if (to === 'profile') { holdStepRef.current = 'employee_profile'; setState((s)=>({ ...s, current: 'employee_profile' })); }
        else if (to === 'selection') { holdStepRef.current = 'product_select'; setSelectionConfirm(false); setState((s)=>({ ...s, current: 'product_select' })); }
        else { holdStepRef.current = null; void advanceToNextStep(); }
        nlpHandled = true;
      } else if (nav?.type === 'goto' && nav.to?.startsWith('product-')) {
        const code = nav.to as StepCode;
        holdStepRef.current = code;
        setState((s)=>({ ...s, current: code }));
        nlpHandled = true;
      }
  setBusy('nlp', false);
      // If NLP didn’t map to any concrete action, signal caller to fallback to RAG Q&A
      if (!nlpHandled) return false;
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: 'I didn’t recognize that command. Try “proceed”, “edit email”, or “select Dental”.' }]);
      setBusy('nlp', false);
      return true;
    }
    return true;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      {!initDone ? (
        <div className="glass glass-card p-6 text-sm opacity-80">Loading enrollment…</div>
      ) : null}
  <div className="glass glass-card p-0 overflow-hidden">
  <div ref={scrollRef} className="h-[60vh] overflow-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[85%] ${m.role === 'user' ? 'ml-auto' : ''}`}>
              <div className={`rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-[var(--brand)] text-white' : 'bg-white/10'}`}>{m.text}</div>
            </div>
          ))}
          {aiBusy ? (
            <div className="max-w-[85%]">
              <div className="rounded-2xl px-3 py-2 text-sm bg-white/10 animate-pulse">AI is thinking…</div>
            </div>
          ) : null}
          <div ref={messageAnchorRef} />

      {/* Employee profile conversational wizard */}
          {state.current === 'employee_profile' && (() => {
            const seq = orderedProfileSchema(ep);
            const field = seq[pf.idx];
            return (
              <div className="space-y-3">
        <div ref={stepTopRef} />
                {/* Dependents prompt (agentic) appears only when profile is complete */}
  {depAskVisible && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-medium mb-2">Add dependents?</div>
                    <div className="text-xs opacity-80 mb-2">You can add your spouse/children now or later.</div>
                    <div className="flex gap-2">
          <button className="glass-button px-3 py-1.5 text-sm" onClick={() => { setShowDepForm(true); setDepAskVisible(false); }} disabled={aiBusy}>
                        Yes, add now
                      </button>
          <button className="text-[11px] underline" onClick={() => setDepAskVisible(false)} disabled={aiBusy}>Maybe later</button>
                    </div>
                    {dependents.length ? <div className="mt-2 text-[11px] opacity-80">{dependents.length} on file</div> : null}
                  </div>
                )}
                {pf.finished && showDepForm && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">Add a dependent</div>
                      <button className="text-[11px] underline" onClick={() => setShowDepForm(false)}>Cancel</button>
                    </div>
          <form className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2" onSubmit={handleSubmit(advance => addDependent(advance))}>
                      <label className="text-xs">
                        <div className="opacity-80 mb-1">Name</div>
            <input className="glass-input w-full" {...register('name')} disabled={aiBusy} />
                        {errors.name ? <div className="mt-1 text-[11px] text-amber-200">{errors.name.message?.toString()}</div> : null}
                      </label>
                      <label className="text-xs">
                        <div className="opacity-80 mb-1">Relationship</div>
            <input className="glass-input w-full" {...register('relationship')} disabled={aiBusy} />
                        {errors.relationship ? <div className="mt-1 text-[11px] text-amber-200">{errors.relationship.message?.toString()}</div> : null}
                      </label>
                      <label className="text-xs">
                        <div className="opacity-80 mb-1">Birth date</div>
            <input type="date" className="glass-input w-full" {...register('birthDate')} disabled={aiBusy} />
                        {errors.birthDate ? <div className="mt-1 text-[11px] text-amber-200">{errors.birthDate.message?.toString()}</div> : null}
                      </label>
                      <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="glass-button px-3 py-1.5 text-sm" disabled={pending['dep:save']}>Save dependent</button>
                      </div>
                    </form>
                    {dependents.length ? <div className="mt-2 text-[11px] opacity-80">{dependents.length} on file</div> : null}
                  </div>
                )}

                {/* Current field prompt card: ask one at a time */}
                {!pf.finished && field ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-medium mb-2">{field.label} {field.required ? <span className="opacity-80">(mandatory)</span> : <span className="opacity-60">(optional)</span>}</div>
        {(() => {
          if (field.type === 'date') return (
                        <input
                          type="date"
                          className="glass-input w-full"
                          value={pf.currentValue}
          ref={fieldInputRef as React.RefObject<HTMLInputElement>}
                          disabled={aiBusy}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPf((p) => ({ ...p, currentValue: e.target.value, error: undefined }))}
                          onBlur={() => {
                            const err = field.validate ? field.validate(pf.currentValue) : (field.required && !pf.currentValue ? `${field.label} is required` : null);
            if (err) { setPf((p) => ({ ...p, error: err })); setMessages((m) => [...m, { role: 'ai', text: `${err}. Please try again.` }]); return; }
            // Do not auto-save on blur; rely on explicit Save to avoid duplicate prompts
                          }}
                        />
                      );
          if (field.type === 'select') return (
                        <select
                          className="glass-input w-full"
                          value={pf.currentValue}
          ref={fieldInputRef as React.RefObject<HTMLSelectElement>}
                          disabled={aiBusy}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPf((p) => ({ ...p, currentValue: e.target.value, error: undefined }))}
                          onBlur={() => {
                            const err = field.validate ? field.validate(pf.currentValue) : (field.required && !pf.currentValue ? `${field.label} is required` : null);
            if (err) { setPf((p) => ({ ...p, error: err })); setMessages((m) => [...m, { role: 'ai', text: `${err}. Please try again.` }]); return; }
            // Do not auto-save on blur; rely on explicit Save to avoid duplicate prompts
                          }}
                        >
                          <option value="">Select</option>
                          {field.options?.map(o => <option key={o} value={o}>{o[0].toUpperCase()+o.slice(1)}</option>)}
                        </select>
                      );
                      const type = field.type === 'email' ? 'email' : 'text';
                      const inputMode = field.type === 'phone' ? 'tel' : 'text';
                      return (
                        <input
                          type={type}
                          inputMode={inputMode}
                          className="glass-input w-full"
                          placeholder={field.placeholder}
                          value={pf.currentValue}
          ref={fieldInputRef as React.RefObject<HTMLInputElement>}
                          disabled={aiBusy}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPf((p) => ({ ...p, currentValue: e.target.value, error: undefined }))}
                          onBlur={() => {
                            const err = field.validate ? field.validate(pf.currentValue) : (field.required && !pf.currentValue ? `${field.label} is required` : null);
                            if (err) { setPf((p) => ({ ...p, error: err })); setMessages((m) => [...m, { role: 'ai', text: `${err}. Please try again.` }]); return; }
                            // Do not auto-save on blur; rely on explicit Save to avoid duplicate prompts
                          }}
                        />
                      );
                    })()}
                    {pf.error ? <div className="mt-1 text-[11px] text-amber-200">{pf.error}</div> : null}
                    <div className="mt-2 flex items-center gap-2 justify-end">
                      {!field.required ? <button className="text-[11px] underline" disabled={pending['saveField']} onClick={() => {
                        setMessages((m) => [...m, { role: 'user', text: `Skipped ${field.label}.` }]);
                        const seq2 = orderedProfileSchema(ep);
                        const currIdx = seq2.findIndex(f => f.key === field.key);
                        let nextIdx = -1;
                        for (let i = currIdx + 1; i < seq2.length; i++) {
                          const k = seq2[i].key;
                          if (!ep[k]) { nextIdx = i; break; }
                        }
                        if (nextIdx === -1) {
                          setPf({ idx: 0, finished: true, currentValue: '' });
                          setMessages((m) => [...m, { role: 'ai', text: 'All details captured for Employee Profile. Proceed or edit a field?' }]);
                        } else {
                          const nf = seq2[nextIdx];
                          setPf({ idx: nextIdx, finished: false, currentValue: ep[nf.key] || '' });
                          setMessages((m) => [...m, { role: 'ai', text: promptForField(nf) }]);
                        }
                      }}>Skip</button> : null}
                      <button className="glass-button px-3 py-1.5 text-sm" disabled={pending['saveField']} onClick={() => {
                        const err = field.validate ? field.validate(pf.currentValue) : (field.required && !pf.currentValue ? `${field.label} is required` : null);
                        if (err) { setPf((p) => ({ ...p, error: err })); setMessages((m) => [...m, { role: 'ai', text: `${err}. Please try again.` }]); return; }
                        void saveProfileField(field, pf.currentValue);
                        setTimeout(() => { scrollChatEnd(true); focusChatArea(); }, 0);
                      }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-medium mb-2">Employee profile complete</div>
                    <div className="text-xs opacity-80">Review the captured details below. Say “edit &lt;field&gt;” to change, or click Proceed.</div>
                    <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {profileSchema.map((f, i) => (
                        <li key={`sum-${String(f.key)}-${i}`} className="rounded-md bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                          <span className="opacity-80">{f.label}</span>
                          <span className="font-medium">{displayValue(f, String((ep[f.key as keyof EmployeeProfile] as string) || '')) || '—'}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button className="glass-button px-3 py-1.5 text-sm" onClick={advanceToNextStep} disabled={pending['advance']}>Proceed</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Product selection controls */}
      {state.current === 'product_select' && (
            <div className="space-y-2">
        <div ref={stepTopRef} />
        <div className="text-sm font-medium">{(selectionSchemaRef.current?.find(f=>f.key==='productIds')?.label) || 'Select products'}</div>
              {!selectionConfirm ? (
                <>
                  <div className="space-y-2">
                    {state.products.map((p) => (
                      <label key={p._id} className="flex items-center gap-2">
                        <input type="checkbox" checked={state.selected.includes(p._id)} onChange={() => toggleProduct(p._id)} disabled={pending['confirmSel']} />
                        {p.logoUrl ? <Image src={p.logoUrl} alt="" width={20} height={20} className="h-5 w-5 rounded bg-white/10" /> : null}
                        <span className="text-sm">{p.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <button className="text-[11px] underline" onClick={() => getRecommendations()} disabled={aiBusy}>Recommend for me</button>
                    <button className="glass-button" disabled={pending['confirmSel'] || state.selected.length === 0} onClick={submitSelection}>Review selection</button>
                  </div>
                  {state.selected.length === 0 ? (
                    <div className="text-[11px] opacity-80">Select at least one product to continue.</div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                    <div className="text-xs font-medium mb-2">Selected products</div>
                    {state.selected.length === 0 ? (
                      <div className="text-xs opacity-80">None selected</div>
                    ) : (
                      <ul className="space-y-2">
                        {state.selected.map((id) => {
                          const prod = state.products.find(p => p._id === id);
                          return (
                            <li key={`sel-${id}`} className="flex items-center justify-between gap-2">
                              <div className="text-xs">{prod?.name || id}</div>
                              <button className="text-[11px] underline" onClick={() => toggleProduct(id)} disabled={aiBusy}>Remove</button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button className="text-[11px] underline" onClick={() => setSelectionConfirm(false)} disabled={pending['confirmSel']}>Back to edit</button>
                    <button className="glass-button" disabled={pending['confirmSel'] || state.selected.length === 0} onClick={confirmSelectionAndContinue}>Confirm & Continue</button>
                  </div>
                </>
              )}
              <div className="mt-2 text-[11px] opacity-80">Ask about products: <button className="underline" onClick={() => askProductQuestion('Which plan covers hospitalization best?')} disabled={aiBusy}>What covers hospitalization?</button></div>
            </div>
          )}

          {/* Product detail controls */}
      {currentIsProduct && (() => {
            const id = state.current.replace('product-', '');
            const product = state.products.find((p) => p._id === id);
            if (!product) return null;
            const pdSchema = productDetailsSchemaRef.current?.[id] || null;
            const levelLabel = pdSchema?.find(f=>f.key==='level')?.label || 'Choose your coverage';
            const agreeLabel = pdSchema?.find(f=>f.key==='agree')?.label || 'Disclosure';
            return (
              <div className="space-y-3">
        <div ref={stepTopRef} />
                {Array.isArray(product.images) && product.images[0] ? (
                  <div ref={(el) => { productImageRef.current = el; }} className="overflow-hidden rounded-lg border border-white/10">
                    <Image src={product.images[0]} alt={`${product.name} banner`} width={640} height={360} className="w-full h-auto" />
                  </div>
                ) : null}
                <div className="text-xs opacity-80">Let&rsquo;s choose your coverage for <span className="font-medium">{product.name}</span>. You can edit other products below.</div>
                <div className="text-sm font-semibold">{product.name}</div>
                {product.description ? (
                  <div className="text-xs opacity-80">{product.description}</div>
                ) : null}
                {Array.isArray(product.highlights) && product.highlights.length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs opacity-90">
                    {product.highlights.slice(0,5).map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                ) : null}
                {product.longDescription ? (
                  <div className="mt-1 text-[11px] opacity-70">{product.longDescription}</div>
                ) : null}
                <div className="rounded-lg border border-white/10 p-2 text-[11px]">Got a question? <button className="underline" onClick={async () => { const q = `Does ${product.name} cover pre-existing conditions?`; postUserAsk(q, { pinToEnd: false }); scrollChatToAnchorOffset(24, true); await askProductQuestion(q, { echo: false, pinToEnd: false }); }} disabled={aiBusy}>Ask about this product</button></div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="opacity-70">Suggestions:</span>
                  <button className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20" onClick={async () => { const q = `For ${product.name}, what’s the best level for families?`; postUserAsk(q, { pinToEnd: false }); scrollChatToAnchorOffset(24, true); await askProductQuestion(q, { echo: false, pinToEnd: false }); }} disabled={aiBusy}>Best for families</button>
                  <button className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20" onClick={async () => { const q = `For ${product.name}, how do out-of-pocket costs compare across levels?`; postUserAsk(q, { pinToEnd: false }); scrollChatToAnchorOffset(24, true); await askProductQuestion(q, { echo: false, pinToEnd: false }); }} disabled={aiBusy}>Out-of-pocket by level</button>
                  <button className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20" onClick={async () => { const q = `For ${product.name}, are pre-existing conditions covered? Any waiting periods?`; postUserAsk(q, { pinToEnd: false }); scrollChatToAnchorOffset(24, true); await askProductQuestion(q, { echo: false, pinToEnd: false }); }} disabled={aiBusy}>Pre-existing coverage</button>
                </div>
                <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                  <div className="text-xs font-medium mb-2">{levelLabel}</div>
                  <div className="space-y-2">
                    {product.coverageOptions?.map((opt) => (
                      <label key={opt.level} className="flex items-center justify-between gap-2 rounded-md bg-white/5 p-2">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`level-${id}`}
                            value={opt.level}
                            checked={levels[id] === opt.level}
                            onChange={() => setLevels((m) => ({ ...m, [id]: opt.level }))}
                            disabled={pending[`prod:${id}`]}
                          />
                          <span className="text-sm capitalize">{opt.level}</span>
                        </span>
                        <span className="text-xs opacity-80">${opt.monthlyCost.toFixed(2)}/mo</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Disclosure appears only when a level is selected (save flow) */}
        {levels[id] ? (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
          <div className="text-xs font-medium text-amber-200">{agreeLabel}</div>
                    <div className="mt-1 text-xs opacity-90">
                      By selecting this coverage, you acknowledge that plan details, premiums, and eligibility are subject to the policy terms and carrier approval. Please review the summary of benefits and exclusions provided by your employer.
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <input data-agree-for={id} type="checkbox" checked={!!agreements[id]} onChange={(e) => setAgreements((m) => ({ ...m, [id]: e.target.checked }))} disabled={pending[`prod:${id}`]} />
                      I have read and agree to the disclosure.
                    </label>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    className="glass-button"
                    onClick={() => {
                      const lvl = levels[id];
                      if (!lvl) return alert('Select a coverage level');
                      if (!agreements[id]) return alert('Please agree to the disclosure to continue');
                      saveProductDecision(id, 'save', lvl);
                    }}
                    disabled={pending[`prod:${id}`]}
                  >
                    Save
                  </button>
                  <button className="glass-button" onClick={() => saveProductDecision(id, 'decline')} disabled={pending[`prod:${id}`]}>Decline</button>
                </div>

                {/* Product edit loop summary */}
                <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                  <div className="text-xs font-medium mb-2">Your products</div>
                  <ul className="space-y-2">
                    {state.selected.map((pid) => {
                      const prod = state.products.find(p => p._id === pid);
                      const step = state.sessionSteps.find(s => s.code === `product-${pid}`);
                      const summary = step?.data && typeof (step.data as { level?: unknown }).level === 'string'
                        ? `Level: ${(step.data as { level?: string }).level}`
                        : (step?.data && (step.data as { declined?: unknown }).declined === true)
                          ? 'Declined'
                          : 'Pending';
                      return (
                        <li key={`prod-${pid}`} className="flex items-center justify-between gap-2">
                          <div className="text-xs">
                            <div className="font-medium">{prod?.name || pid}</div>
                            <div className="opacity-80">{summary}</div>
                          </div>
                          <button
                            className="text-[11px] rounded-md bg-white/10 px-2 py-1"
                            onClick={() => {
                              const code = `product-${pid}` as StepCode;
                              holdStepRef.current = code;
                              setState((prev) => {
                                const next = { ...prev, current: code };
                                dispatch(setStepsGlobal({
                                  steps: next.steps.map((st: { code: StepCode; label: string; status: 'pending'|'complete'; summary?: string }) => ({ code: st.code, label: st.label, status: st.status, summary: st.summary })),
                                  currentCode: code,
                                }));
                                return next;
                              });
                              setMessages((m) => [...m, { role: 'ai', text: `Editing ${prod?.name || 'product'}.` }]);
                            }}
                            disabled={pending[`prod:${pid}`]}
                          >
                            Edit
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      className="glass-button"
                      disabled={pending['advance'] || !allSelectedProductsCompleted()}
                      onClick={async () => {
                        // Release product hold and proceed to review
                        holdStepRef.current = null;
                        await advanceToNextStep();
                      }}
                    >
                      Proceed to Review
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Review/submit controls */}
      {state.current === 'pre_confirm' && (
            <div className="space-y-3">
        <div className="text-sm font-medium">{(preConfirmSchemaRef.current?.find(f=>f.key==='agree')?.label) || 'Review & Submit'}</div>
              <div className="text-xs opacity-80">You can update earlier steps if needed, then submit.</div>

              {/* Full step-by-step details */}
              <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                <div className="text-xs font-medium mb-2">Review details</div>
                {/* Employee Profile */}
                <div className="mb-3">
                  <div className="text-[11px] opacity-80 mb-1">Employee Profile</div>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {profileSchema.map((f, i) => {
                      const prof = normalizeProfileStrings(state.profile || null);
                      const val = displayValue(f, String(((prof as Record<string, string>)[f.key as string]) || '')) || '—';
                      return (
                        <li key={`pc-prof-${String(f.key)}-${i}`} className="rounded-md bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                          <span className="opacity-80">{f.label}</span>
                          <span className="font-medium">{val}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {/* Product Selection */}
                <div className="mb-3">
                  <div className="text-[11px] opacity-80 mb-1">Selected Products</div>
                  {state.selected.length === 0 ? (
                    <div className="text-xs opacity-80">None</div>
                  ) : (
                    <ul className="text-xs list-disc pl-5">
                      {state.selected.map((id) => {
                        const prod = state.products.find(p => p._id === id);
                        return <li key={`pc-sel-${id}`}>{prod?.name || id}</li>;
                      })}
                    </ul>
                  )}
                </div>
                {/* Per-product details */}
                {state.selected.length ? (
                  <div className="space-y-2">
                    <div className="text-[11px] opacity-80">Product Details</div>
                    <ul className="space-y-2">
                      {state.selected.map((pid) => {
                        const prod = state.products.find(p => p._id === pid);
                        const step = state.sessionSteps.find(s => s.code === `product-${pid}`);
                        const declined = !!(step?.data && (step.data as { declined?: boolean }).declined);
                        const level = (step?.data && (step.data as { level?: string }).level) || '';
                        const price = prod?.coverageOptions?.find(o => o.level === level)?.monthlyCost;
                        return (
                          <li key={`pc-prod-${pid}`} className="rounded-md bg-white/5 p-2">
                            <div className="text-xs font-medium flex items-center gap-2">
                              {prod?.logoUrl ? <Image src={prod.logoUrl} alt="" width={16} height={16} className="h-4 w-4 rounded bg-white/10" /> : null}
                              <span>{prod?.name || pid}</span>
                            </div>
                            <div className="text-[11px] opacity-80 mt-1">
                              {declined ? 'Declined' : (level ? `Level: ${level}${typeof price === 'number' ? ` — $${price.toFixed(2)}/mo` : ''}` : 'Pending')}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="text-[11px] rounded-md bg-white/10 px-2 py-1"
                  onClick={() => {
                    holdStepRef.current = 'employee_profile';
                    setState((s) => ({ ...s, current: 'employee_profile' }));
                    setMessages((m) => [...m, { role: 'ai', text: 'Back to Profile. Choose a field to edit or proceed when ready.' }]);
                  }}
                  disabled={aiBusy}
                >
                  Back to Profile
                </button>
                <button
                  className="text-[11px] rounded-md bg-white/10 px-2 py-1"
                  onClick={() => {
                    holdStepRef.current = 'product_select';
                    setSelectionConfirm(false);
                    setState((s) => ({ ...s, current: 'product_select' }));
                    setMessages((m) => [...m, { role: 'ai', text: 'Back to Selection. Update your products, then review again.' }]);
                  }}
                  disabled={aiBusy}
                >
                  Back to Selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input id="agree" type="checkbox" checked={agreeSubmit} onChange={(e) => setAgreeSubmit(e.target.checked)} />
                <label htmlFor="agree" className="text-xs">I agree the selections are mine</label>
              </div>
              <div className="flex justify-end">
                <button className="glass-button" disabled={aiBusy || !agreeSubmit} onClick={() => submitAll(agreeSubmit)}>Submit</button>
              </div>
            </div>
          )}
        </div>
  {/* No bottom chat input on employee profile; forms above handle entry */}
      </div>

      <SideTracker
        products={state.products}
        sessionSteps={state.sessionSteps}
      />
      {/* Multilingual + voice controls */}
      <div className="md:col-span-2 -mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="opacity-80">Language</label>
        <select
          className="glass-select min-w-[110px] max-w-[200px] px-2.5 py-1.5 text-xs md:text-sm"
          value={lang}
          onChange={(e)=>setLang(e.target.value as 'English'|'Spanish'|'French')}
          disabled={aiBusy}
        >
          <option>English</option>
          <option>Spanish</option>
          <option>French</option>
        </select>
  <input
    className="glass-input flex-1 min-w-[200px] md:min-w-[320px] px-3 py-2 text-sm"
          placeholder="Ask a question"
          value={ask}
          onChange={(e)=>setAsk(e.target.value)}
    ref={askInputRef}
    disabled={aiBusy}
        />
  <button className="glass-button px-3 py-1.5 text-sm" onClick={async ()=> { const q = ask.trim(); if (!q) return; postUserAsk(q, { pinToEnd: false }); if (currentIsProduct) scrollChatToAnchorOffset(24, true); const handled = await handleChatInput(q, { echo: false }); if (!handled) await askProductQuestion(q, { echo: false, pinToEnd: false }); setAsk(''); setTimeout(() => { try { askInputRef.current?.focus({ preventScroll: true }); } catch { askInputRef.current?.focus(); } }, 0); }} disabled={aiBusy}>Ask</button>
  <button className="glass-button px-3 py-1.5 text-sm" onClick={startSTT} disabled={aiBusy}>🎤</button>
        <button className="glass-button px-3 py-1.5 text-sm" onClick={speakLast}>🔊</button>
      </div>
    </div>
  );
}
