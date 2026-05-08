import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { requireBroker } from '@/lib/authz';
import { UserProfile, type UserProfileDocument } from '@/models/UserProfile';
import { EnrollmentSession } from '@/models/EnrollmentSession';
import { Enrollment } from '@/models/Enrollment';
import { IdempotencyKey } from '@/models/IdempotencyKey';

export const runtime = 'nodejs';

type Body = { email?: string; includeFinal?: boolean; deleteProfile?: boolean };

export async function POST(req: NextRequest) {
	const authz = await requireBroker();
	if (!authz.ok) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

	await dbConnect();

	const url = new URL(req.url);
	const qpEmail = url.searchParams.get('email') || undefined;
	const body = (await req.json().catch(() => ({}))) as Body | undefined;
	const email = (body?.email || qpEmail || '').trim().toLowerCase();
	const includeFinal = body?.includeFinal !== false; // default true
	const deleteProfile = body?.deleteProfile !== false; // default true
	if (!email) return NextResponse.json({ ok: false, error: 'email_required' }, { status: 400 });

	const profiles = await UserProfile.find({ email }).lean<UserProfileDocument[]>();
	if (!profiles.length) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

	let totalSessions = 0;
	let totalEnrollments = 0;
	let totalIdem = 0;
	for (const p of profiles) {
		const delS = await EnrollmentSession.deleteMany({ userId: p._id });
		totalSessions += delS.deletedCount || 0;
		if (includeFinal) {
			const delE = await Enrollment.deleteMany({ userId: p._id });
			totalEnrollments += delE.deletedCount || 0;
		}
		if (p.clerkUserId) {
			const delI = await IdempotencyKey.deleteMany({ userId: p.clerkUserId });
			totalIdem += delI.deletedCount || 0;
		}
	}

	let profilesDeleted = 0;
	if (deleteProfile) {
		const delP = await UserProfile.deleteMany({ email });
		profilesDeleted = delP.deletedCount || 0;
	}

	return NextResponse.json({
		ok: true,
		email,
		totals: { sessions: totalSessions, enrollments: totalEnrollments, idempotencyKeys: totalIdem, profilesDeleted },
	});
}

