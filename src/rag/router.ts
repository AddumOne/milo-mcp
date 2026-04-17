import { classifyQuery, type QueryType } from './classifier.js';
import { directLookup } from './retrieval/direct.js';
import { semanticSearch } from './retrieval/semantic.js';
import { cragValidate, type ScoredBlock } from './retrieval/corrective.js';
import { iterativeSearch } from './retrieval/iterative.js';
import { blockStore, type BlockEntry } from '../index/store.js';

export type Technique = 'direct' | 'cosine+crag' | 'iterative' | 'agentic';

export interface SearchResult {
  name: string;
  description: string;
  relevance_score: number;
  crag_reason?: string;
  repo: string;
  path: string;
  project: string;
}

export interface RouterOutput {
  query_type: QueryType;
  technique_used: Technique;
  results: SearchResult[];
  fallback_used: boolean;
}

function blockToResult(block: BlockEntry, score = 0, reason?: string): SearchResult {
  return {
    name: block.name,
    description: block.description,
    relevance_score: score,
    crag_reason: reason,
    repo: block.repo,
    path: block.path,
    project: block.project,
  };
}

function scoredToResult(block: ScoredBlock): SearchResult {
  return blockToResult(block, block.crag_score, block.crag_reason);
}

/** Deduplicate results by block name, keeping the first (highest-scored) entry. */
function dedupeByName(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
}

export async function routeQuery(
  query: string,
  project?: string,
  limit = 5,
  explain = false,
): Promise<RouterOutput> {
  const query_type = await classifyQuery(query);

  switch (query_type) {
    case 'LOOKUP': {
      const { block, blockName } = directLookup(query, project);
      const results = block ? [blockToResult(block, 1.0, explain ? `Exact name match: ${blockName}` : undefined)] : [];
      return { query_type, technique_used: 'direct', results, fallback_used: false };
    }

    case 'SEMANTIC': {
      // Fast-path: if query looks like a bare block name (1-2 tokens),
      // try direct lookup first to avoid CRAG rejecting terse queries.
      const tokens = query.trim().split(/\s+/);
      if (tokens.length <= 2) {
        const { block, blockName } = directLookup(query, project);
        if (block) {
          const results = [blockToResult(block, 1.0, explain ? `Direct name match: ${blockName}` : undefined)];
          // Also include the plural/singular variant if it exists
          const otherVariant = blockName.endsWith('s') ? blockName.slice(0, -1) : blockName + 's';
          const proj = project ?? 'milo';
          const otherBlock = blockStore.get(proj, otherVariant)
            ?? (proj !== 'milo' ? blockStore.get('milo', otherVariant) : undefined);
          if (otherBlock && otherBlock.name !== block.name) {
            results.push(blockToResult(otherBlock, 0.95, explain ? `Variant match: ${otherVariant}` : undefined));
          }
          return { query_type, technique_used: 'direct', results, fallback_used: false };
        }
      }

      const { blocks: candidates, queryVec } = await semanticSearch(query, project, limit * 2);
      const { results: scored, fallback_used } = await cragValidate(query, candidates, queryVec, 'SEMANTIC');
      const mapped = scored.map((b) => explain ? scoredToResult(b) : blockToResult(b, b.crag_score));
      const results = dedupeByName(mapped).slice(0, limit);
      return { query_type, technique_used: 'cosine+crag', results, fallback_used };
    }

    case 'COMPOSITIONAL': {
      const { results: blocks, fallback_used } = await iterativeSearch(query, project, limit, 'COMPOSITIONAL');
      const mapped = (blocks as ScoredBlock[]).map((b) =>
        explain ? scoredToResult(b) : blockToResult(b, (b as ScoredBlock).crag_score ?? 0),
      );
      const results = dedupeByName(mapped).slice(0, limit);
      return { query_type, technique_used: 'iterative', results, fallback_used };
    }

    case 'MULTI_SOURCE': {
      // Agentic RAG is Phase 4 — fall back to semantic for now
      const { blocks: candidates, queryVec } = await semanticSearch(query, project, limit * 2);
      const { results: scored, fallback_used } = await cragValidate(query, candidates, queryVec, 'MULTI_SOURCE');
      const mapped = scored.map((b) => explain ? scoredToResult(b) : blockToResult(b, b.crag_score));
      const results = dedupeByName(mapped).slice(0, limit);
      return { query_type, technique_used: 'agentic', results, fallback_used };
    }
  }
}
