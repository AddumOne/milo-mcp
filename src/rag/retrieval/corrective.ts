import { complete } from '../../llm/client.js';
import { config } from '../../config.js';
import { cosineSimilarity } from '../../index/embeddings.js';
import type { BlockEntry } from '../../index/store.js';

export interface ScoredBlock extends BlockEntry {
  crag_score: number;
  crag_reason: string;
}

export interface CRAGResult {
  results: ScoredBlock[];
  fallback_used: boolean;
}

interface CRAGResponse {
  score: number;
  reason: string;
}

async function scoreSingle(query: string, block: BlockEntry, queryType?: string): Promise<ScoredBlock> {
  try {
    const descLine = block.description ? ` (${block.description})` : '';

    const prompt = queryType === 'COMPOSITIONAL'
      ? `Is the "${block.name}"${descLine} web block mentioned in, or directly relevant to, this query?
Query: "${query}"
Reply YES or NO and nothing else.`
      : `Is the "${block.name}"${descLine} web block a good match for this user need?
Common UI block names: accordion=expandable/FAQ, carousel=rotating slideshow, \
modal=dialog/popup/overlay, fragment=reusable embed, marquee=hero/banner, \
columns=side-by-side layout, tabs=navigation switching, chart=data graphs, \
cards=card grid, video=media player, aside=complementary sidebar.
User need: "${query}"
Reply YES or NO and nothing else.`;

    const raw = await complete(prompt, 5);
    const yes = /yes/i.test(raw.trim());
    return {
      ...block,
      crag_score: yes ? 0.85 : 0.1,
      crag_reason: yes ? 'matched' : 'not matched',
    };
  } catch {
    return { ...block, crag_score: 0, crag_reason: 'scoring failed' };
  }
}

async function searchMiloDocs(query: string): Promise<string[]> {
  // External corrective fallback — search milo.adobe.com docs.
  // In production this would call a web search API; here we return a hint.
  return [`See https://milo.adobe.com for blocks matching: ${query}`];
}

export async function cragValidate(
  query: string,
  candidates: BlockEntry[],
  queryEmbedding?: Float32Array,
  queryType?: string,
): Promise<CRAGResult> {
  if (!config.anthropicApiKey) {
    const scored: ScoredBlock[] = candidates.map((c) => ({
      ...c,
      crag_score: queryEmbedding && c.embedding ? cosineSimilarity(queryEmbedding, c.embedding) : 0.5,
      crag_reason: 'cosine-only (CRAG unavailable — set ANTHROPIC_API_KEY to enable)',
    }));
    return { results: scored.sort((a, b) => b.crag_score - a.crag_score), fallback_used: false };
  }

  const scored = await Promise.all(candidates.map((c) => scoreSingle(query, c, queryType)));
  // Binary scoring: YES→0.85, NO→0.1. Threshold 0.6 cleanly separates them.
  let passing = scored.filter((c) => c.crag_score >= config.cragThreshold);

  // For SEMANTIC queries with multiple CRAG-YES candidates, apply a
  // cosine-similarity gap to filter false positives that the LLM over-approved.
  // Skip for COMPOSITIONAL queries where the analytical CRAG prompt is already
  // well-calibrated and cosine distance is unreliable (query intent ≠ block function).
  if (queryEmbedding && passing.length > 1 && queryType !== 'COMPOSITIONAL') {
    const withCosine = passing
      .map((block) => ({
        block,
        cosine: block.embedding ? cosineSimilarity(queryEmbedding, block.embedding) : 0,
      }))
      .sort((a, b) => b.cosine - a.cosine);

    const bestCosine = withCosine[0].cosine;
    passing = withCosine
      .filter((c, i) => i === 0 || c.cosine >= bestCosine - config.cosineGap)
      .map((c) => c.block);
  }

  if (passing.length < 2) {
    await searchMiloDocs(query); // external corrective fallback (results not used in Phase 1)
    return {
      results: passing.sort((a, b) => b.crag_score - a.crag_score),
      fallback_used: true,
    };
  }

  return {
    results: passing.sort((a, b) => b.crag_score - a.crag_score),
    fallback_used: false,
  };
}
