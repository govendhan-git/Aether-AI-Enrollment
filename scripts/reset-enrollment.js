#!/usr/bin/env node
/*
  Usage:
    node --env-file=.env scripts/reset-enrollment.js <email> [--final] [--purge]

  Options:
    --final   Also delete any final submitted Enrollment records for the user.
    --purge   Also delete the UserProfile document(s) for the email, making the user "new" again.
*/
const mongoose = require('mongoose');

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('-'));
  const includeFinal = args.includes('--final') || args.includes('--all') || args.includes('-f');
  const purgeProfile = args.includes('--purge') || args.includes('--all');
  if (!email) {
    console.error('Email required. Usage: node --env-file=.env scripts/reset-enrollment.js <email>');
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
    const profiles = db.collection('userprofiles');
    const sessions = db.collection('enrollmentsessions');
    const enrollments = db.collection('enrollments');

    const matches = await profiles.find({ email }).toArray();
    if (!matches.length) {
      console.error(`No user profile found for email: ${email}`);
      process.exit(2);
    }

    let totalSessions = 0;
    let totalEnrollments = 0;
    for (const profile of matches) {
      const res = await sessions.deleteMany({ userId: profile._id });
      totalSessions += (res.deletedCount || 0);
      if (includeFinal) {
        const res2 = await enrollments.deleteMany({ userId: profile._id });
        totalEnrollments += (res2.deletedCount || 0);
      }
    }
    console.log(`Deleted ${totalSessions} enrollment session(s) for ${email}`);
    if (includeFinal) console.log(`Deleted ${totalEnrollments} final enrollment record(s) for ${email}`);

    if (purgeProfile) {
      const del = await profiles.deleteMany({ email });
      console.log(`Deleted ${del.deletedCount || 0} user profile(s) for ${email}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
