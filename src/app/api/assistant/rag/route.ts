import { NextRequest, NextResponse } from 'next/server';
import { getOpenAICompatible, getLLMProvider, lcChat } from '@/lib/langchain';
import { dbConnect } from '@/lib/db';
import { Product } from '@/models/Product';

export const runtime = 'nodejs';

async function getEmbedder() {
  try {
    const { FlagEmbedding, EmbeddingModel } = await import('fastembed');
    const fe = await FlagEmbedding.init({ model: EmbeddingModel.BGESmallEN });
    return async (text: string) => fe.queryEmbed(text);
  } catch {
    // Lightweight remote embedding via LLM if available; fallback to null vector (no RAG)
    return null as unknown as ((text: string) => Promise<number[] | null>);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, topK = 5 } = await req.json();
    if (!query) return NextResponse.json({ ok: false, error: 'missing query' }, { status: 400 });

    const cfg = getOpenAICompatible();
  const provider = getLLMProvider();

  let contexts: Array<Record<string, unknown>> = [];
  let contextText = '';
    try {
      const embed = await getEmbedder();
      if (embed) {
        const vec = await embed(query);
        if (vec && Array.isArray(vec)) {
          // Qdrant is optional; only attempt if lib is available and URL is configured
          try {
            const { QdrantClient } = await import('@qdrant/js-client-rest');
            const url = process.env.QDRANT_URL;
            if (url) {
              const client = new QdrantClient({ url, apiKey: process.env.QDRANT_API_KEY });
              const collection = process.env.QDRANT_COLLECTION || 'products';
              const res = await client.search(collection, { vector: vec, limit: Math.min(10, Number(topK) || 5) });
          type QHit = { id: string; score: number; payload?: { name?: string; description?: string; disclosure?: string; [k: string]: unknown } };
          const docs = (res as unknown as QHit[] || []).map((r) => ({ id: r.id, score: r.score, text: `${r?.payload?.name || ''}\n${r?.payload?.description || ''}\n${r?.payload?.disclosure || ''}`, payload: r.payload }));
          const sorted = docs.sort((a,b) => (b.score || 0) - (a.score || 0));
          contexts = sorted.slice(0, 5).map(d => d.payload || {});
          contextText = sorted.slice(0, 5).map((d) => `- ${d.text}`).join('\n');
            }
          } catch {
            // Qdrant not available; skip vector stage
          }
        }
      }
    } catch {
      // Ignore RAG pipeline failures; we'll answer without context
    }

    // If we don't have vector-based context, fall back to the product catalog from DB
    if (!contextText) {
      try {
        await dbConnect();
        const all = await Product.find({}, { name: 1, description: 1, longDescription: 1, category: 1, highlights: 1 }).lean();
        type P = { _id?: unknown; name?: string; description?: string; longDescription?: string; category?: string; highlights?: string[] };
        const q = String(query || '').toLowerCase();
        const scored = (all as P[]).map((p) => {
          const hay = [p.name, p.description, p.longDescription, (p.highlights || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
          let score = 0;
          for (const w of q.split(/\s+/).filter(Boolean)) if (hay.includes(w)) score += 1;
          return { p, score };
        }).sort((a, b) => b.score - a.score);
        const picked = (scored.length ? scored : (all as P[]).map((p) => ({ p, score: 0 }))).slice(0, 5).map(s => s.p);
        if (picked.length) {
          contexts = picked as Array<Record<string, unknown>>;
          contextText = picked.map((p) => {
            const hl = Array.isArray(p.highlights) && p.highlights.length ? `\nHighlights: ${p.highlights.slice(0, 5).join('; ')}` : '';
            const desc = p.description || p.longDescription || '';
            return `- ${p.name} (${p.category || 'Product'})\n${desc}${hl}`;
          }).join('\n');
        }
      } catch {
        // ignore DB fallback errors
      }
    }

    const sys = contextText
      ? 'Answer user questions about benefits products using the provided context. If a detail is not in context, say it is not specified.'
      : 'Answer user questions about employee benefits. Be helpful and concise. If exact details aren\'t known, provide general guidance and mention limitations.';
    const user = contextText ? `Question: ${query}\n\nContext:\n${contextText}` : `Question: ${query}`;
  const answer = await lcChat([
      { role: 'system', content: sys },
      { role: 'user', content: user }
  ], { task: 'rag' });
    return NextResponse.json({ ok: true, answer, contexts, provider, model: cfg.model });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
