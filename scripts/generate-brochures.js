/* eslint-disable */
// Generates sample product brochures as PDFs with images and text using pdfkit.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
require('dotenv').config();

const ProductSchema = new mongoose.Schema({
  name: String,
  code: String,
  description: String,
  disclosure: String,
  logoUrl: String,
  category: String,
  coverageOptions: [{ level: String, monthlyCost: Number, details: String }],
});

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'brochures');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  await mongoose.connect(mongoUri);
  const Product = mongoose.model('Product', ProductSchema);
  const products = await Product.find({}).lean();
  if (!products.length) {
    console.log('No products found. Seed first.');
    process.exit(0);
  }

  for (const p of products) {
    const file = path.join(outDir, `${p.code || p._id}.pdf`);
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);

    // Header
    doc.fontSize(22).fillColor('#0F172A').text(p.name, { underline: true });
    if (p.category) doc.moveDown(0.2).fontSize(12).fillColor('#334155').text(`Category: ${p.category.toUpperCase()}`);
    doc.moveDown(0.5);

    // Logo or placeholder banner
    if (p.logoUrl && /^https?:/i.test(p.logoUrl)) {
      // Remote images aren't embedded by default; add placeholder box
      doc.rect(doc.x, doc.y, 200, 80).stroke('#94A3B8');
      doc.text('Logo (remote)', doc.x + 10, doc.y + 30);
    } else {
      doc.rect(doc.x, doc.y, 200, 80).fillAndStroke('#E2E8F0', '#94A3B8');
      doc.fillColor('#475569').text('Logo Placeholder', doc.x + 20, doc.y + 30);
      doc.fillColor('#0F172A');
    }
    doc.moveDown(1.2);

    // Description and Key Features
    doc.fontSize(12).fillColor('#0F172A').text('Overview', { underline: true });
    doc.moveDown(0.3);
    const overview = p.description || `${p.name} provides financial protection and peace of mind.`;
    doc.fontSize(11).fillColor('#1F2937').text(overview, { align: 'justify' });
    doc.moveDown(0.6);
    doc.fontSize(12).fillColor('#0F172A').text('Key Features', { underline: true });
    doc.moveDown(0.3);
    const features = [
      'Nationwide network coverage (where applicable).',
      'No lifetime maximum on covered benefits unless specified.',
      'Pre-existing conditions and waiting periods may apply; see policy for details.',
      'Easy online claims process with 24/7 support.',
      'Portable coverage options when changing employers (state restrictions may apply).',
    ];
    features.forEach(f => doc.fontSize(11).fillColor('#111827').text(`• ${f}`));
    doc.moveDown(0.6);

    // Coverage options
    if (Array.isArray(p.coverageOptions) && p.coverageOptions.length) {
      doc.fontSize(12).fillColor('#0F172A').text('Coverage Options', { underline: true });
      doc.moveDown(0.3);
      p.coverageOptions.forEach((opt) => {
        doc.fontSize(11).fillColor('#111827').text(`• ${opt.level.toUpperCase()} — $${opt.monthlyCost.toFixed(2)}/mo`);
        if (opt.details) doc.fontSize(10).fillColor('#374151').text(`  ${opt.details}`);
        doc.moveDown(0.2);
      });
      doc.moveDown(0.6);
    }

  // Eligibility and Exclusions
  doc.fontSize(12).fillColor('#0F172A').text('Eligibility', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#374151').text('Eligible employees: Full-time employees working 30+ hours per week. Dependents eligible if listed. Coverage begins on the first day of the month following enrollment unless otherwise stated.');
  doc.moveDown(0.6);
  doc.fontSize(12).fillColor('#0F172A').text('Exclusions & Limitations', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#374151').text('Benefits are not payable for services not medically necessary or outside the scope of policy. Waiting periods, pre-existing condition exclusions, and state variations may apply. See policy certificate for full details.');
  doc.moveDown(0.6);
  // Disclosure
  const disclosure = p.disclosure || 'This brochure provides a summary of benefits. All coverage is subject to the terms and conditions of the policy. In the event of any conflict, the policy certificate governs. Not all benefits are available in all states.';
  doc.fontSize(11).fillColor('#111827').text('Important Disclosures', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#374151').text(disclosure, { align: 'justify' });
  doc.moveDown(0.6);

    // Footer
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#6B7280').text('This is a sample brochure generated for demo purposes.');

    doc.end();
    await new Promise((r) => stream.on('finish', r));
    console.log('Wrote', file);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
