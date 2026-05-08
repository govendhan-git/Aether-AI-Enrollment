#!/usr/bin/env node
/*
  Usage:
    node --env-file=.env scripts/create-profile.js --email <email> [--first <first>] [--last <last>] [--entity <code>]

  Notes:
    - If --entity is not provided, the script will infer the LegalEntity by the email domain (matching LegalEntity.domains).
    - The profile will be created without a phone number. If a profile already exists, it will be updated and personal.phone will be removed.
*/

const mongoose = require('mongoose');
require('dotenv').config();

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}

async function main() {
  const email = getArg('--email') || getArg('-e') || process.argv.find((a) => a.includes('@'));
  const firstName = getArg('--first') || getArg('-f');
  const lastName = getArg('--last') || getArg('-l');
  const entityCode = getArg('--entity') || getArg('-c');
  if (!email) {
    console.error('Email is required. Usage: node --env-file=.env scripts/create-profile.js --email <email> [--first <first>] [--last <last>] [--entity <code>]');
    process.exit(1);
  }

  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const conn = mongoose.connection;

  try {
  const LegalEntity = conn.collection('legalentities');
  const UserProfile = conn.collection('userprofiles');

    // Resolve entity by code or email domain
    let entityDoc = null;
    if (entityCode) {
      const code = String(entityCode).toUpperCase();
      entityDoc = await conn.db.collection('legalentities').findOne({ code });
      if (!entityDoc) {
        throw new Error(`No LegalEntity found for code: ${code}`);
      }
    } else {
      const domain = String(email).split('@')[1]?.toLowerCase();
      if (!domain) throw new Error('Could not parse email domain');
      entityDoc = await conn.db.collection('legalentities').findOne({ domains: domain });
      if (!entityDoc) throw new Error(`No LegalEntity mapped for domain: ${domain}`);
    }

    // Check if a profile already exists for this email and entity
    const existing = await UserProfile.findOne({ email, legalEntityId: entityDoc._id });
    if (existing) {
      console.log(`Profile already exists for ${email} under entity ${entityDoc.code || entityDoc._id}. No changes made.`);
      const summary = {
        email: existing?.email,
        legalEntityId: existing?.legalEntityId,
        personal: { firstName: existing?.personal?.firstName, lastName: existing?.personal?.lastName, email: existing?.personal?.email },
      };
      console.log('Profile summary:', JSON.stringify(summary));
      return;
    }

    // Create a new profile (no phone number)
    const insertDoc = {
      email,
      role: 'employee',
      legalEntityId: entityDoc._id,
      personal: { firstName: firstName || undefined, lastName: lastName || undefined, email },
      employment: { companyId: entityDoc._id }
    };
    const result = await UserProfile.insertOne(insertDoc);
    const created = await UserProfile.findOne({ _id: result.insertedId });
    console.log(`Created profile for ${email} under entity ${entityDoc.code || entityDoc._id}`);
    const summary = {
      email: created?.email,
      legalEntityId: created?.legalEntityId,
      personal: { firstName: created?.personal?.firstName, lastName: created?.personal?.lastName, email: created?.personal?.email },
    };
    console.log('Profile summary:', JSON.stringify(summary));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
