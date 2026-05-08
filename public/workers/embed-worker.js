/* global self */
// Lightweight browser embeddings using fastembed-web (onnxruntime-web)
// This file runs in a Web Worker to avoid blocking the UI thread.

let embeddingModel = null;

self.onmessage = async (e) => {
  const { type, text } = e.data || {};
  if (type === 'init') {
    try {
      const mod = await import('https://cdn.skypack.dev/fastembed-web@0.1.6');
      embeddingModel = await mod.FlagEmbedding.init({ model: mod.EmbeddingModel.BGESmallEN });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err?.message || err) });
    }
  } else if (type === 'embed' && embeddingModel) {
    try {
      const vec = await embeddingModel.queryEmbed(String(text || ''));
      self.postMessage({ type: 'vector', vector: vec });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err?.message || err) });
    }
  }
};
