#!/usr/bin/env node
/*
  Rename 'personal' step to 'employee_profile' in EnrollmentSession.steps for active sessions.

  Usage:
    node --env-file=.env scripts/migrate-steps-personal-to-employee.js [--all] [--dry-run]

  Options:
    --all     Include inactive sessions as well (default only active: true)
    --dry-run Show what would change without writing
*/
const mongoose = require('mongoose');

async function main() {
  const includeAll = process.argv.includes('--all');
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const sessions = db.collection('enrollmentsessions');

  const filter = includeAll ? { 'steps.code': 'personal' } : { active: true, 'steps.code': 'personal' };
  const cursor = sessions.find(filter);
  let scanned = 0;
  let updated = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned++;
    const steps = Array.isArray(doc.steps) ? doc.steps : [];

    // Map personal -> employee_profile
    const mapped = steps.map(s => ({ ...s, code: s.code === 'personal' ? 'employee_profile' : s.code }));

    // Deduplicate any employee_profile duplicates, prefer a 'complete' one
    let seenEmp = null; // index of kept 'employee_profile'
    const dedup = [];
    for (const s of mapped) {
      if (s.code !== 'employee_profile') {
        dedup.push(s);
        continue;
      }
      if (seenEmp === null) {
        dedup.push(s);
        seenEmp = dedup.length - 1;
      } else {
        // already have one; if current is complete and kept is pending, replace
        if (s.status === 'complete' && dedup[seenEmp].status !== 'complete') {
          dedup[seenEmp] = s;
        }
        // else skip
      }
    }

    // Only write if changed
    const changed = JSON.stringify(steps) !== JSON.stringify(dedup);
    if (changed) {
      if (dryRun) {
        console.log(`Would update session ${doc._id}: steps ${steps.length} -> ${dedup.length}`);
      } else {
        await sessions.updateOne({ _id: doc._id }, { $set: { steps: dedup } });
        updated++;
        console.log(`Updated session ${doc._id}: steps ${steps.length} -> ${dedup.length}`);
      }
    }
  }

  console.log(`Scanned: ${scanned}, Updated: ${updated}${dryRun ? ' (dry-run)' : ''}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
