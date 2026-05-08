/* eslint-disable */
// Ensures Qdrant collection and payload indexes exist for products.
const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config();

async function ensureCollection(client, collection, size, distance = 'Cosine') {
  try {
    await client.getCollection(collection);
    console.log(`Collection '${collection}' exists`);
  } catch {
    await client.createCollection(collection, { vectors: { size, distance } });
    console.log(`Created collection '${collection}' (size=${size}, distance=${distance})`);
  }
}

async function ensurePayloadIndexes(client, collection) {
  // Keyword indexes for exact filtering; text index for name/description full-text-like
  const indexes = [
    { field_name: 'code', field_schema: 'keyword' },
    { field_name: 'category', field_schema: 'keyword' },
    { field_name: 'name', field_schema: 'text' },
    { field_name: 'description', field_schema: 'text' },
  ];
  for (const idx of indexes) {
    try {
      await client.createPayloadIndex(collection, idx);
      console.log(`Created payload index on '${idx.field_name}' (${idx.field_schema})`);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/already exists|exists/i.test(msg)) {
        console.log(`Index on '${idx.field_name}' already exists`);
      } else {
        console.warn(`Could not create index '${idx.field_name}':`, msg);
      }
    }
  }
}

async function main() {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = process.env.QDRANT_API_KEY;
  const collection = process.env.QDRANT_COLLECTION || 'products';
  const vectorSize = Number(process.env.QDRANT_VECTOR_SIZE || 384);

  const client = new QdrantClient({ url, apiKey });
  await ensureCollection(client, collection, vectorSize, 'Cosine');
  await ensurePayloadIndexes(client, collection);
  console.log('Qdrant setup complete.');
}

main().catch((e) => {
  console.error('Qdrant setup failed:', e?.message || e);
  process.exit(1);
});
