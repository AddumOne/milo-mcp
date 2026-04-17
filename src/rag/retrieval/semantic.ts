import { blockStore, type BlockEntry } from '../../index/store.js';
import { embedText, searchByEmbedding } from '../../index/embeddings.js';

export interface SemanticResult {
  blocks: BlockEntry[];
  queryVec: Float32Array;
}

export async function semanticSearch(
  query: string,
  project?: string,
  topK = 5,
  precomputedEmbedding?: Float32Array,
): Promise<SemanticResult> {
  const queryVec = precomputedEmbedding ?? await embedText(query);
  const candidates = blockStore.getAll(project);
  const blocks = searchByEmbedding(queryVec, candidates, topK);
  return { blocks, queryVec };
}
