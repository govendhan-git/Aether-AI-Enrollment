#!/usr/bin/env node
/*
  Usage:
    node --env-file=.env scripts/list-entity-products.js --code MPHASIS
*/

const mongoose = require('mongoose');
require('dotenv').config();

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const codeRaw = getArg('--code') || getArg('-c');
  if (!codeRaw) {
    console.error('Usage: --code <LEGAL_ENTITY_CODE>');
    process.exit(1);
  }
  const code = String(codeRaw).toUpperCase();

  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const conn = mongoose.connection;

  try {
    const LegalEntity = conn.collection('legalentities');
    const Product = conn.collection('products');

    const entity = await LegalEntity.findOne({ code });
    if (!entity) {
      console.error(`No legal entity found for code ${code}`);
      process.exit(1);
    }

    const productIds = entity.productIds || [];
    const products = await Product.find({ _id: { $in: productIds } })
      .project({ code: 1, name: 1, provider: 1, category: 1, _id: 0 })
      .sort({ name: 1 })
      .toArray();

    console.log(JSON.stringify({
      legalEntity: { _id: entity._id, name: entity.name, code: entity.code, domains: entity.domains },
      productCount: products.length,
      products
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
