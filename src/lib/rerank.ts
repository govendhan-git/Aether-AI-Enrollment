export type Doc = { id?: string; text: string; payload?: Record<string, unknown> };

export async function rerankWithCohere(query: string, docs: Doc[]): Promise<Doc[]> {
  const key = process.env.COHERE_API_KEY;
  if (!key) return docs;
  const url = process.env.COHERE_BASE_URL || 'https://api.cohere.com/v1/rerank';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, documents: docs.map((d) => d.text), top_n: docs.length, model: process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0' }),
  });
  if (!res.ok) return docs;
  const data = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> };
  const order = (data.results || []).map((r) => r.index);
  if (!order.length) return docs;
  return order.map((i) => docs[i]);
}
