import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import type { StepState } from '../../../../types/enrollment';

// Advances the enrollment flow by computing the canonical step order and
// returning the first pending step. Also ensures the session has entries for
// canonical steps (including product detail steps and pre_confirm).
export async function POST() {
	await dbConnect();
	const user = await currentUser();
	const profile = await UserProfile.findOne({ clerkUserId: user?.id });
	if (!profile) return NextResponse.json({ ok: false, error: 'No profile' }, { status: 400 });
	const session = await EnrollmentSession.findOne({ userId: profile._id, active: true });
	if (!session) return NextResponse.json({ ok: false, error: 'No session' }, { status: 404 });

	// Build canonical sequence from selected products
		const selectedIds: string[] = Array.isArray(session.selectedProductIds)
			? (session.selectedProductIds as unknown[])
					.map((id) => (typeof id === 'string' ? id : (id as { toString(): string }).toString()))
					.filter((v): v is string => Boolean(v))
			: [];
	const canonical = ['employee_profile', 'product_select', ...selectedIds.map((id) => `product-${id}`), 'pre_confirm'];

	// Ensure steps exist for all canonical codes; keep existing status/data
	const steps = Array.isArray(session.steps) ? (session.steps as StepState[]) : [];
	const byCode = new Map<string, StepState>();
	for (const s of steps) if (s.code) byCode.set(s.code, s);
	let mutated = false;
	for (const code of canonical) {
		if (!byCode.has(code)) {
			const st: StepState = { code, status: 'pending' };
			steps.push(st);
			byCode.set(code, st);
			mutated = true;
		}
	}
		// If employee_profile has all required fields on file, mark it complete
		const emp = byCode.get('employee_profile');
		if (emp && emp.status !== 'complete') {
			const requiredOk = Boolean(
				(profile.personal?.firstName || '').trim() &&
				(profile.personal?.lastName || '').trim() &&
				(profile.personal?.email || '').trim() &&
				(profile.personal?.birthDate) &&
				(profile.employment?.employeeId || '').trim() &&
				(profile.employment?.payFrequency || '').trim()
			);
			if (requiredOk) {
				emp.status = 'complete';
				mutated = true;
			}
		}
	// Optionally, drop any non-canonical steps (keep unknowns for safety). We keep them.

	if (mutated) {
		(session.steps as StepState[]) = steps;
		await session.save();
	}

	// Determine first pending step in canonical order
	const statusMap = new Map<string, 'pending' | 'complete'>();
	for (const s of steps) if (s.code && s.status) statusMap.set(s.code, s.status);
	const next = canonical.find((c) => statusMap.get(c) !== 'complete') || 'pre_confirm';

	return NextResponse.json({ ok: true, next });
}
