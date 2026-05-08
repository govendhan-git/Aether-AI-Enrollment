/* eslint-disable */
// Drops the configured Qdrant collection to allow a clean reindex.
const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config();

async function main() {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = process.env.QDRANT_API_KEY;
  const collection = process.env.QDRANT_COLLECTION || 'products';
  const client = new QdrantClient({ url, apiKey });
  try {
    await client.deleteCollection(collection);
    console.log(`Deleted collection '${collection}'.`);
  } catch (e) {
    console.warn('Delete failed or collection missing:', e?.message || e);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
