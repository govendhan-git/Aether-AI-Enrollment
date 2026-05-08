#!/usr/bin/env node
/*
  Usage:
    node --env-file=.env scripts/create-legal-entity.js --name "Mphasis Ltd" --code MPHASIS --domain mphasis.com [--products crit,acc] [--broker-name "Broker"] [--broker-email broker@example.com]

  Notes:
    - If the entity code already exists, the script updates its name/domains/products.
    - Product codes are matched against the Product collection (code field, case-insensitive).
    - When --products is omitted, all products in the database are assigned to the entity.
*/

const mongoose = require('mongoose');
require('dotenv').config();

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function run() {
  const name = getArg('--name') || getArg('-n');
  const codeRaw = getArg('--code') || getArg('-c');
  const domainRaw = getArg('--domain') || getArg('-d');
  const productsRaw = getArg('--products') || getArg('-p');
  const brokerName = getArg('--broker-name');
  const brokerEmail = getArg('--broker-email');

  if (!name || !codeRaw || !domainRaw) {
    console.error('Missing required arguments. Usage: --name "Name" --code CODE --domain example.com');
    process.exit(1);
  }

  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set DATABASE_URL or MONGODB_URI in your environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const conn = mongoose.connection;

  const LegalEntitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    domains: [{ type: String, index: true }],
    themes: [{}],
    activeTheme: { type: String, default: 'classic' },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    brokerConfig: { brokerName: String, contactEmail: String }
  }, { timestamps: true });

  const ProductSchema = new mongoose.Schema({
    name: String,
    code: { type: String, unique: true },
  });

  const LegalEntity = conn.model('LegalEntity', LegalEntitySchema);
  const Product = conn.model('Product', ProductSchema);

  try {
    const code = String(codeRaw).toUpperCase();
    const domain = String(domainRaw).toLowerCase();
    const productCodes = parseCsv(productsRaw).map((c) => c.toLowerCase());

    let productsToAssign;
    if (productCodes.length) {
      productsToAssign = await Product.find({ code: { $in: productCodes } });
      const missingCodes = productCodes.filter((c) => !productsToAssign.find((p) => p.code.toLowerCase() === c));
      if (missingCodes.length) {
        throw new Error(`Could not find products for codes: ${missingCodes.join(', ')}`);
      }
    } else {
      productsToAssign = await Product.find({});
    }

    if (!productsToAssign.length) {
      throw new Error('No products available to assign. Insert products first.');
    }

    const update = {
      name,
      code,
      activeTheme: 'classic',
      productIds: productsToAssign.map((p) => p._id),
      brokerConfig: {
        brokerName: brokerName || undefined,
        contactEmail: brokerEmail || undefined,
      },
    };

    // Ensure themes array exists with a default classic palette
    update.themes = [{ name: 'classic', primary: '#4F46E5', secondary: '#0EA5E9' }];

    const existing = await LegalEntity.findOne({ code });
    if (existing) {
      const domains = new Set(existing.domains || []);
      domains.add(domain);
      update.domains = Array.from(domains);
      await LegalEntity.updateOne({ _id: existing._id }, { $set: update });
      const refreshed = await LegalEntity.findById(existing._id);
      console.log(`Updated legal entity ${code}`);
      console.log(JSON.stringify({
        _id: refreshed._id,
        name: refreshed.name,
        code: refreshed.code,
        domains: refreshed.domains,
        productCount: refreshed.productIds?.length || 0,
      }, null, 2));
    } else {
      update.domains = [domain];
      const created = await LegalEntity.create(update);
      console.log(`Created legal entity ${code}`);
      console.log(JSON.stringify({
        _id: created._id,
        name: created.name,
        code: created.code,
        domains: created.domains,
        productCount: created.productIds?.length || 0,
      }, null, 2));
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
