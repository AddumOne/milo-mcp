import { blockStore, type BlockEntry } from '../../index/store.js';
import { semanticSearch } from './semantic.js';
import { cragValidate } from './corrective.js';
import pLimit from 'p-limit';

const OVERRIDE_KEYWORDS = ['override', 'overrides', 'stale', 'lag', 'compare', 'outdated', 'audit'];

function isOverrideQuery(query: string): boolean {
  const q = query.toLowerCase();
  return OVERRIDE_KEYWORDS.some((kw) => q.includes(kw));
}

/**
 * Iterative RAG — 3-pass retrieval for COMPOSITIONAL queries.
 *
 * Pass 1: Semantic search → candidate blocks.
 * Pass 2: For each candidate, retrieve:
 *   - Name-variant blocks (same prefix, e.g. carousel-with-text)
 *   - For override queries: the milo counterpart of child-project blocks
 * Pass 3: Combine, deduplicate, CRAG-rank top results.
 *
 * Passes 2+ parallelised with p-limit(5).
 */
export async function iterativeSearch(
  query: string,
  project?: string,
  topK = 5,
  queryType?: string,
): Promise<{ results: BlockEntry[]; fallback_used: boolean }> {
  const limit = pLimit(5);
  const overrideQuery = isOverrideQuery(query);

  // Pass 1 — semantic candidates
  const { blocks: pass1, queryVec } = await semanticSearch(query, project, topK * 2);

  // Pass 2 — expand with related and cross-project blocks (parallel)
  const relatedSets = await Promise.all(
    pass1.map((b) =>
      limit(async (): Promise<BlockEntry[]> => {
        const related: BlockEntry[] = [];

        // Name-variant siblings (e.g. "aside" when we found "accordion" in query about layout)
        const scope = project ? blockStore.getAll(project) : blockStore.getAll();
        for (const other of scope) {
          if (other.name === b.name) continue;
          const bRoot = b.name.split('-')[0];
          const oRoot = other.name.split('-')[0];
          if (bRoot === oRoot || other.name.startsWith(bRoot) || b.name.startsWith(oRoot)) {
            related.push(other);
          }
        }

        // For override queries: add the milo counterpart of each child block
        if (overrideQuery && b.project !== 'milo') {
          const miloVersion = blockStore.get('milo', b.name);
          if (miloVersion) related.push(miloVersion);
        }

        // For override queries where project is milo: add child-project overrides
        if (overrideQuery && (!project || project === 'milo')) {
          for (const childBlock of blockStore.getAll()) {
            if (childBlock.project !== 'milo' && childBlock.name === b.name) {
              related.push(childBlock);
            }
          }
        }

        return related;
      }),
    ),
  );

  // Pass 3 — combine, deduplicate, CRAG-rank
  const combined = [...pass1];
  for (const related of relatedSets) {
    for (const r of related) {
      if (!combined.find((c) => c.name === r.name && c.project === r.project)) {
        combined.push(r);
      }
    }
  }

  const { results, fallback_used } = await cragValidate(query, combined, queryVec, queryType);
  return { results: results.slice(0, topK), fallback_used };
}
