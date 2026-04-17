import { config } from '../config.js';
import type { BlockEntry } from './store.js';

// Lazy-loaded pipeline
let pipeline: ((text: string | string[], options?: object) => Promise<{ data: Float32Array }[]>) | null = null;

async function getPipeline() {
  if (!pipeline) {
    // Dynamic import to avoid loading at startup — model download is ~30MB
    const transformers = await import('@xenova/transformers');
    const { pipeline: createPipeline, env } = transformers;
    if (process.env.MILO_MCP_MODEL_CACHE_DIR) {
      env.cacheDir = process.env.MILO_MCP_MODEL_CACHE_DIR;
      env.localModelPath = process.env.MILO_MCP_MODEL_CACHE_DIR;
    }
    if (process.env.MILO_MCP_OFFLINE_MODEL === '1') {
      env.allowRemoteModels = false;
    }
    pipeline = await createPipeline('feature-extraction', config.embeddingModel, {
      quantized: true,
    }) as unknown as typeof pipeline;
  }
  return pipeline!;
}

export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return output[0].data;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function searchByEmbedding(
  queryVec: Float32Array,
  blocks: BlockEntry[],
  topK: number,
): BlockEntry[] {
  const withScores = blocks
    .filter((b) => b.embedding)
    .map((b) => ({ block: b, score: cosineSimilarity(queryVec, b.embedding!) }))
    .sort((a, b) => b.score - a.score);

  return withScores.slice(0, topK).map((s) => s.block);
}
