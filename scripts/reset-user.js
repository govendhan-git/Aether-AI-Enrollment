#!/usr/bin/env node
/*
	Usage (PowerShell examples):
		node --env-file=.env scripts/reset-user.js --email user@example.com --final --scrub
		node --env-file=.env scripts/reset-user.js --email user@example.com --final --delete-profile

	Flags:
		--email <email>       Target user's email (required)
		--final               Also delete final Enrollment records (default: false)
		--scrub               Scrub profile, keeping only email, personal.firstName, personal.lastName, personal.ssnLast4, employment.employeeId, employment.payFrequency, employment.department (default)
		--delete-profile      Delete the entire UserProfile document(s) for the email
		--no-idem             Skip deletion of idempotency key records

	Notes:
		- If both --scrub and --delete-profile are provided, --delete-profile wins.
		- This script mirrors the admin reset API behavior and additionally supports scrubbing.
*/

const mongoose = require('mongoose');

function parseArgs() {
	const args = process.argv.slice(2);
	const getVal = (k) => {
		const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
		if (i === -1) return undefined;
		const eq = args[i].indexOf('=');
		if (eq !== -1) return args[i].slice(eq + 1);
		return args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : undefined;
	};
	const email = (getVal('--email') || '').trim().toLowerCase();
	const includeFinal = args.includes('--final');
	const deleteProfile = args.includes('--delete-profile');
	const scrub = args.includes('--scrub') || (!deleteProfile && !args.includes('--scrub'));
	const noIdem = args.includes('--no-idem');
	return { email, includeFinal, deleteProfile, scrub, noIdem };
}

async function main() {
	const { email, includeFinal, deleteProfile, scrub, noIdem } = parseArgs();
	if (!email) {
		console.error('Email required. Example: node --env-file=.env scripts/reset-user.js --email user@example.com --final --scrub');
		process.exit(1);
	}
	const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
	if (!uri) {
		console.error('Set DATABASE_URL or MONGODB_URI in your environment');
		process.exit(1);
	}

	await mongoose.connect(uri);
	const db = mongoose.connection.db;
	try {
		const profilesCol = db.collection('userprofiles');
		const sessionsCol = db.collection('enrollmentsessions');
		const enrollmentsCol = db.collection('enrollments');
		const idemCol = db.collection('idempotencykeys');

		const profiles = await profilesCol.find({ email }).toArray();
		if (!profiles.length) {
			console.error(`No user profile found for email: ${email}`);
			process.exit(2);
		}

		let totalSessions = 0;
		let totalEnrollments = 0;
		let totalIdem = 0;
		for (const p of profiles) {
			const delS = await sessionsCol.deleteMany({ userId: p._id });
			totalSessions += delS.deletedCount || 0;
			if (includeFinal) {
				const delE = await enrollmentsCol.deleteMany({ userId: p._id });
				totalEnrollments += delE.deletedCount || 0;
			}
			if (!noIdem && p.clerkUserId) {
				const delI = await idemCol.deleteMany({ userId: p.clerkUserId });
				totalIdem += delI.deletedCount || 0;
			}
		}

		console.log(`Deleted ${totalSessions} enrollment session(s) for ${email}`);
		if (includeFinal) console.log(`Deleted ${totalEnrollments} final enrollment record(s) for ${email}`);
		if (!noIdem) console.log(`Deleted ${totalIdem} idempotency key record(s) for ${email}`);

		if (deleteProfile) {
			const del = await profilesCol.deleteMany({ email });
			console.log(`Deleted ${del.deletedCount || 0} user profile(s) for ${email}`);
		} else if (scrub) {
			// Scrub sensitive fields but keep identifiers and minimal personal info
			// KEEP: personal.firstName, personal.lastName, personal.email, personal.ssnLast4
			// KEEP: employment.employeeId, employment.payFrequency, employment.department
			const unset = {
				// Personal
				'personal.birthDate': '',
				'personal.gender': '',
				'personal.phone': '',
				'personal.address': '',
				'personal.dependents': '',
				// Employment (selectively scrub only fields we don't need to keep)
				'employment.hireDate': '',
				'employment.companyId': '',
				// Misc
				'features': '',
			};
			const set = { email, 'personal.email': email };
			const res = await profilesCol.updateMany({ email }, { $unset: unset, $set: set });
			console.log(`Scrubbed ${res.modifiedCount || 0} user profile(s) for ${email}`);
		}
	} finally {
		await mongoose.disconnect();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

