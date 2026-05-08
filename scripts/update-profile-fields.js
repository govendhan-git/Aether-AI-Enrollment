#!/usr/bin/env node
/*
  Usage:
    node --env-file=.env scripts/update-profile-fields.js --email user@example.com \
      [--employee-id MPH1001] [--pay-frequency biweekly] [--department Engineering] [--ssn-last4 7890]
*/

const mongoose = require('mongoose');
require('dotenv').config();

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const email = getArg('--email') || getArg('-e');
  if (!email) {
    console.error('Usage: --email <user@example.com>');
    process.exit(1);
  }

  const employeeId = getArg('--employee-id');
  const payFrequency = getArg('--pay-frequency');
  const department = getArg('--department');
  const ssnLast4 = getArg('--ssn-last4');

  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const conn = mongoose.connection;

  try {
    const updates = {};
    if (employeeId) updates['employment.employeeId'] = employeeId;
    if (payFrequency) updates['employment.payFrequency'] = payFrequency;
    if (department) updates['employment.department'] = department;
    if (ssnLast4) updates['personal.ssnLast4'] = ssnLast4;

    if (!Object.keys(updates).length) {
      console.error('No updates provided');
      return;
    }

    const result = await conn.collection('userprofiles').findOneAndUpdate(
      { email },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      console.error(`No profile found for ${email}`);
    } else {
      console.log('Updated profile:', JSON.stringify(result.value, null, 2));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
