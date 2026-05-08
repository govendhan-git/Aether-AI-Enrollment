#!/usr/bin/env node
/*
  Fix enrollment indexes:
  - Drop obsolete unique index on confirmationId (enrollments_confirmationId_key or similar)
  - Ensure a sane unique index exists on confirmationNumber (sparse to ignore legacy docs missing the field)

  Usage (PowerShell):
    node --env-file=.env scripts/fix-indexes.js
*/

const mongoose = require('mongoose');

async function main() {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }
  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    const col = db.collection('enrollments');
    const indexes = await col.indexes();
    const toDrop = indexes.filter((idx) => {
      // Drop any index that references confirmationId in name or key
      const nameHas = /confirmationid/i.test(idx.name || '');
      const keyHas = idx.key && Object.prototype.hasOwnProperty.call(idx.key, 'confirmationId');
      return nameHas || keyHas;
    });
    for (const idx of toDrop) {
      if (idx.name === '_id_') continue;
      console.log('Dropping index:', idx.name, idx.key);
      await col.dropIndex(idx.name).catch((e) => {
        console.warn('Failed to drop index', idx.name, e.message);
      });
    }

    // Ensure a proper unique index on confirmationNumber; sparse to skip legacy docs missing the field
    const wantName = 'uniq_confirmationNumber';
    const hasWanted = indexes.some((i) => i.name === wantName) || (await col.indexExists(wantName).catch(() => false));
    if (!hasWanted) {
      console.log('Creating index:', wantName, '{ confirmationNumber: 1 }, { unique: true, sparse: true }');
      await col.createIndex({ confirmationNumber: 1 }, { unique: true, sparse: true, name: wantName });
    } else {
      console.log('Index already exists:', wantName);
    }

    console.log('Index fix complete.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
