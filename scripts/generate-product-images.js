#!/usr/bin/env node
/*
  Generate simple on-brand SVG logos and product images for every Product in DB and update
  logoUrl/images fields accordingly.

  Usage (PowerShell):
    node --env-file=.env scripts/generate-product-images.js

  Notes:
  - Creates files under public/images/products/<code>-logo.svg and -1.svg, -2.svg
  - Re-runnable: will overwrite existing generated files.
*/
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: String,
  code: String,
  logoUrl: String,
  images: [String],
  category: String,
  provider: String,
  highlights: [String],
});

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }).catch(()=>{}); }

function colorFor(code) {
  const colors = ['#6C47FF','#0ea5e9','#22c55e','#f59e0b','#ef4444','#14b8a6','#8b5cf6','#e11d48'];
  let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

function svgLogo({ title, code, primary }) {
  const initials = (title || code || 'P').split(/\s+/).map(w=>w[0]).join('').slice(0,3).toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="96" height="96" rx="16" fill="url(#g)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="36" fill="#ffffff">${initials}</text>
</svg>`;
}

function svgBanner({ title, subtitle, primary }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff22"/>
      <stop offset="100%" stop-color="#ffffff00"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="640" height="360" fill="url(#bg)"/>
  <circle cx="520" cy="60" r="120" fill="url(#glow)"/>
  <text x="40" y="160" font-family="sans-serif" font-weight="700" font-size="36" fill="#fff">${title}</text>
  <text x="40" y="200" font-family="sans-serif" font-weight="400" font-size="18" fill="#e5e7eb">${subtitle}</text>
  <rect x="40" y="240" width="320" height="8" rx="4" fill="#ffffff33"/>
  <rect x="40" y="260" width="260" height="8" rx="4" fill="#ffffff26"/>
  <rect x="40" y="280" width="200" height="8" rx="4" fill="#ffffff1f"/>
  <rect x="40" y="300" width="280" height="8" rx="4" fill="#ffffff14"/>
  <rect x="40" y="320" width="220" height="8" rx="4" fill="#ffffff0f"/>
</svg>`;
}

async function main() {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set DATABASE_URL or MONGODB_URI');
  const conn = await mongoose.connect(uri);
  const Product = conn.model('Product', ProductSchema);
  const outDir = path.join(process.cwd(), 'public', 'images', 'products');
  await ensureDir(outDir);

  const prods = await Product.find({}).lean();
  let updated = 0; let generated = 0;
  for (const p of prods) {
    const code = (p.code || p.name || 'prod').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const primary = colorFor(code);
    const logoFile = `${code}-logo.svg`;
    const img1File = `${code}-1.svg`;
    const img2File = `${code}-2.svg`;
    const logoPath = path.join(outDir, logoFile);
    const img1Path = path.join(outDir, img1File);
    const img2Path = path.join(outDir, img2File);
    await fsp.writeFile(logoPath, svgLogo({ title: p.name, code: p.code, primary }), 'utf8'); generated++;
    await fsp.writeFile(img1Path, svgBanner({ title: p.name, subtitle: p.provider || p.category || 'Benefit Plan', primary }), 'utf8'); generated++;
    await fsp.writeFile(img2Path, svgBanner({ title: `${p.name} Coverage`, subtitle: 'Highlights & Advantages', primary }), 'utf8'); generated++;
    const logoUrl = `/images/products/${logoFile}`;
    const images = [`/images/products/${img1File}`, `/images/products/${img2File}`];
    const highlights = Array.isArray(p.highlights) && p.highlights.length ? p.highlights : [
      'Designed for employees and families',
      'Predictable monthly cost options',
      'Complements your medical plan',
    ];
    await Product.updateOne({ _id: p._id }, { $set: { logoUrl, images, highlights } });
    updated++;
  }
  console.log(`Generated ${generated} images; updated ${updated} product records.`);
  await conn.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
