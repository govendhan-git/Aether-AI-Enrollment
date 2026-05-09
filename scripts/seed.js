/* eslint-disable */
const mongoose = require('mongoose');
require('dotenv').config();

const LegalEntitySchema = new mongoose.Schema({
  name: String,
  code: { type: String, unique: true },
  domains: [String],
  themes: [{}],
  activeTheme: String,
  productIds: [mongoose.Schema.Types.ObjectId],
  brokerConfig: { brokerName: String, contactEmail: String }
});
const ProductSchema = new mongoose.Schema({
  name: String,
  code: { type: String, unique: true },
  logoUrl: String,
  images: [String],
  provider: String,
  description: String,
  longDescription: String,
  highlights: [String],
  disclosure: String,
  coverageOptions: [{ level: String, monthlyCost: Number, details: String }],
  requiresDependents: Boolean,
  category: String
});
const UserProfileSchema = new mongoose.Schema({
  clerkUserId: String,
  email: String,
  legalEntityId: mongoose.Schema.Types.ObjectId,
  personal: {
    firstName: String, lastName: String, ssnLast4: String, birthDate: Date, gender: String, email: String, phone: String, address: String
  },
  employment: {
    employeeId: String, payFrequency: String, department: String, hireDate: Date, companyId: mongoose.Schema.Types.ObjectId
  }
});

async function run() {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');
  const conn = await mongoose.connect(uri);

  const LegalEntity = conn.model('LegalEntity', LegalEntitySchema);
  const Product = conn.model('Product', ProductSchema);
  const UserProfile = conn.model('UserProfile', UserProfileSchema);

  await Promise.all([LegalEntity.deleteMany({}), Product.deleteMany({}), UserProfile.deleteMany({})]);

  // Products
  const products = await Product.insertMany([
    { name: 'Critical Illness', provider: 'Nationwide', code: 'crit', category: 'critical_illness', logoUrl: '/images/products/crit.png', images: ['/images/products/crit-1.jpg','/images/products/crit-2.jpg'], highlights: ['Tax-advantaged lump sum on diagnosis', 'Covers major critical conditions', 'Wellness benefit in select states'], description: 'Lump-sum benefit upon diagnosis of covered critical illnesses.', longDescription: 'Nationwide Critical Illness provides a tax-advantaged lump-sum benefit upon first diagnosis of covered conditions such as heart attack, stroke, cancer, and more. Benefits can be used for medical bills, travel, child care, or everyday expenses. Coverage tiers scale benefits and premiums to meet family needs. Includes wellness benefit for preventive screenings in some states.', disclosure: 'Policy features, availability, and definitions vary by state. Pre-existing condition limitations and waiting periods may apply.', coverageOptions: [
      { level: 'low', monthlyCost: 12, details: 'Basic coverage' },
      { level: 'medium', monthlyCost: 24, details: 'Enhanced coverage' },
      { level: 'high', monthlyCost: 36, details: 'Premium coverage' }
  ] },
  { name: 'Accident', provider: 'Mercer', code: 'acc', category: 'accident', logoUrl: '/images/products/acc.png', images: ['/images/products/acc-1.jpg'], highlights: ['Cash paid directly to you', 'Pairs with medical plan', 'Coverage for treatments and follow-ups'], description: 'Cash benefits for covered accidental injuries and services.', longDescription: 'Mercer Accident Insurance pays fixed benefits for emergency treatment, hospitalization, fractures, dislocations, follow-up care, and more due to covered accidents. Benefits are paid directly to you and can be used alongside medical insurance. Optional rider benefits may include hospital confinement and off-the-job coverage.', disclosure: 'Exclusions include self-inflicted injuries, acts of war, or injuries while committing a felony. See policy for details.', coverageOptions: [
      { level: 'low', monthlyCost: 8 }, { level: 'medium', monthlyCost: 16 }, { level: 'high', monthlyCost: 24 }
  ] },
  { name: 'Identity Theft', provider: 'Mphasis Wyde', code: 'idtheft', category: 'identity_theft', logoUrl: '/images/products/idtheft.png', images: ['/images/products/id-1.jpg'], highlights: ['Dark web monitoring', '24/7 alerts and recovery help', 'Family protection options'], description: 'Identity monitoring and restoration services.', longDescription: 'Wyde Identity Protection offers continuous monitoring of credit files, dark web surveillance, and real-time alerts for suspicious activities. Dedicated resolution specialists help restore your identity, manage disputes, and guide you through recovery. Family plans may extend coverage to spouse and dependents.', disclosure: 'Certain features require enrollment with credit bureaus. Coverage and features may vary by plan level.', coverageOptions: [
      { level: 'low', monthlyCost: 5 }, { level: 'medium', monthlyCost: 10 }, { level: 'high', monthlyCost: 15 }
  ] },
  { name: 'Hospital Indemnity', provider: 'Nationwide', code: 'hosp', category: 'hospital', logoUrl: '/images/products/hosp.png', images: ['/images/products/hosp-1.jpg'], highlights: ['Pays on admission and daily stay', 'Offsets deductibles and coinsurance', 'Direct cash to you'], description: 'Cash benefits for hospital admissions and stays.', longDescription: 'Nationwide Hospital Indemnity pays a fixed amount for hospital admission and a per-day benefit for inpatient stays due to covered illness or injury. Additional benefits may include ICU confinement and surgical benefits. Payouts are direct to you to offset deductibles and out-of-pocket costs.', disclosure: 'Benefits may be subject to maximums per confinement or per year; limitations apply. Refer to the certificate for details.', coverageOptions: [
      { level: 'low', monthlyCost: 10 }, { level: 'medium', monthlyCost: 20 }, { level: 'high', monthlyCost: 30 }
  ] },
  { name: 'Dental', provider: 'Mercer', code: 'dental', category: 'dental', logoUrl: '/images/products/dental.png', images: ['/images/products/dental-1.jpg'], highlights: ['Preventive care covered', 'Options for major services', 'Potential ortho benefits'], description: 'Preventive, basic, and major dental services coverage.', longDescription: 'Mercer Dental offers coverage for preventive exams and cleanings, basic services (fillings, extractions), and major services (crowns, root canals) depending on plan tier. Orthodontia benefits may be available at higher levels or as a rider. Networks may offer negotiated rates to reduce out-of-pocket costs.', disclosure: 'Waiting periods may apply to major services. Frequency limitations for cleanings and exams are typical.', coverageOptions: [
      { level: 'low', monthlyCost: 15 }, { level: 'medium', monthlyCost: 25 }, { level: 'high', monthlyCost: 40 }
    ] }
  ]);

  // Legal Entities
  const entities = await LegalEntity.insertMany([
    { name: 'Acme Corp', code: 'ACME', domains: ['acme.com'], themes: [{ name: 'classic', primary: '#6C47FF' }], activeTheme: 'classic', productIds: [products[0]._id, products[1]._id, products[2]._id] },
    { name: 'Globex Inc', code: 'GLOBEX', domains: ['globex.com'], themes: [{ name: 'classic', primary: '#0ea5e9' }], activeTheme: 'classic', productIds: [products[1]._id, products[3]._id] },
    { name: 'Initech', code: 'INITECH', domains: ['initech.com'], themes: [{ name: 'classic', primary: '#22c55e' }], activeTheme: 'classic', productIds: [products[0]._id, products[2]._id, products[4]._id] },
    { name: 'Umbrella Co', code: 'UMBRELLA', domains: ['umbrella.com'], themes: [{ name: 'classic', primary: '#ef4444' }], activeTheme: 'classic', productIds: [products[2]._id, products[3]._id, products[4]._id] },
    { name: 'Stark Industries', code: 'STARK', domains: ['stark.com'], themes: [{ name: 'classic', primary: '#f59e0b' }], activeTheme: 'classic', productIds: [products[0]._id, products[1]._id, products[4]._id] },
    { name: 'Astiram', code: 'ASTIRAM', domains: ['astiram.com'], themes: [{ name: 'classic', primary: '#00E5FF' }], activeTheme: 'classic', productIds: [products[0]._id, products[1]._id, products[3]._id] }
  ]);

  // Users (10)
  const genders = ['male','female','non_binary'];
  const payFreq = ['weekly','biweekly','semimonthly','monthly'];
  const users = [];
  for (let i = 0; i < 10; i++) {
    const entity = entities[i % entities.length];
    users.push({
      clerkUserId: `seed_user_${i+1}`,
      email: `user${i+1}@example.com`,
      legalEntityId: entity._id,
      personal: {
        firstName: `User${i+1}`, lastName: 'Seed', ssnLast4: String(1000 + i), birthDate: new Date(1990, i % 12, (i % 28) + 1), gender: genders[i % genders.length], email: `user${i+1}@example.com`, phone: `555-000${i}`
      },
      employment: {
        employeeId: `E${1000 + i}`, payFrequency: payFreq[i % payFreq.length], department: 'Engineering', hireDate: new Date(2020, i % 12, (i % 28) + 1), companyId: entity._id
      }
    });
  }
  // Add a broker user
  users.push({
    clerkUserId: 'seed_broker_1',
    email: 'broker@example.com',
    role: 'broker',
    legalEntityId: entities[0]._id,
    personal: { firstName: 'Brock', lastName: 'Er', email: 'broker@example.com' },
    employment: { employeeId: 'B0001', department: 'Brokerage', companyId: entities[0]._id }
  });

  // Seed a specific employee for Astiram so login maps cleanly
  const astiram = entities.find(e => e.code === 'ASTIRAM');
  if (astiram) {
    users.push({
      clerkUserId: 'seed_astiram_emp_1',
      email: 'manivasagam@astiram.com',
      legalEntityId: astiram._id,
      personal: { firstName: 'Alask', lastName: 'Awery', email: 'AlaskAwery@gmail.com' },
      employment: { employeeId: 'AST1001', department: 'Engineering', hireDate: new Date(2022, 0, 15), companyId: astiram._id }
    });
  }

  await UserProfile.insertMany(users);

  console.log('Seed completed');
  await conn.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
