/* eslint-disable */
// Product vector indexer for Qdrant.
// Prefers FastEmbed when EMBEDDINGS_PROVIDER=fastembed, otherwise falls back to Xenova transformers.

const { QdrantClient } = require('@qdrant/js-client-rest');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
require('dotenv').config();

// FastEmbed loader (required)
let model = null;
let embedOnce = null;

// Minimal Product schema (JS script; we don't import TS model here)
const ProductSchema = new mongoose.Schema({
  name: String,
  code: String,
  description: String,
  disclosure: String,
  coverageOptions: [{ level: String, monthlyCost: Number, details: String }],
});

async function main() {
  const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  await mongoose.connect(mongoUri);
  const Product = mongoose.model('Product', ProductSchema);

  const products = await Product.find({}).lean();
  if (!products.length) {
    console.log('No products to index');
    process.exit(0);
  }

  const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  });
  const collection = process.env.QDRANT_COLLECTION || 'products';

  // Initialize FastEmbed model and infer dimension
  const { FlagEmbedding, EmbeddingModel } = require('fastembed');
  const selected = process.env.FASTEMBED_MODEL || 'fast-bge-small-en';
  const feModel = await FlagEmbedding.init({ model: EmbeddingModel.BGESmallEN });
  model = feModel;
  embedOnce = async (text) => feModel.queryEmbed(text);
  const dim = (await embedOnce('dimension test')).length;

  // Ensure collection exists with correct vector size
  try {
    await qdrant.getCollection(collection);
  } catch {
    await qdrant.createCollection(collection, { vectors: { size: dim, distance: 'Cosine' } });
  }

  const points = [];
  for (const p of products) {
    const text = `${p.name}\n${p.description || ''}\n${p.disclosure || ''}`;
    const raw = await embedOnce(text);
    const vector = Array.isArray(raw) ? raw.map((x) => Number(x)) : Array.from(raw || []);
    points.push({
      id: randomUUID(),
      vector,
      payload: {
        productId: p._id.toString(),
        code: p.code,
        name: p.name,
        description: p.description,
        disclosure: p.disclosure,
  brochureUrl: p.code ? `/brochures/${p.code}.pdf` : `/brochures/${p._id}.pdf`,
      },
    });
  }

  await qdrant.upsert(collection, { points });
  console.log(`Indexed ${points.length} products into '${collection}'.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
