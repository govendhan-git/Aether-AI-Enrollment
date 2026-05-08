#!/usr/bin/env node
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
  return { email };
}

(async () => {
  const { email } = parseArgs();
  if (!email) {
    console.error('Usage: node --env-file=.env scripts/inspect-profile.js --email user@example.com');
    process.exit(1);
  }
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    const profilesCol = db.collection('userprofiles');
    const doc = await profilesCol.findOne({ email });
    if (!doc) {
      console.error('No user profile found for', email);
      process.exit(2);
    }
    // Only print a subset for clarity
    const out = {
      _id: doc._id,
      email: doc.email,
      personal: {
        firstName: doc.personal?.firstName,
        lastName: doc.personal?.lastName,
        email: doc.personal?.email,
        ssnLast4: doc.personal?.ssnLast4,
        birthDate: doc.personal?.birthDate,
        gender: doc.personal?.gender,
        phone: doc.personal?.phone,
        address: doc.personal?.address,
        dependents: doc.personal?.dependents,
      },
      employment: {
        employeeId: doc.employment?.employeeId,
        payFrequency: doc.employment?.payFrequency,
        department: doc.employment?.department,
        hireDate: doc.employment?.hireDate,
        companyId: doc.employment?.companyId,
      },
      features: doc.features,
    };
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})();
