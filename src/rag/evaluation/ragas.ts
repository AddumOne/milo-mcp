import type { SearchResult } from '../router.js';

/**
 * Faithfulness: Are the returned blocks actually among the expected ones?
 * Measures: did the LLM hallucinate a match, or are results grounded in the index?
 */
export function computeFaithfulness(results: SearchResult[], expected: string[]): number {
  if (expected.length === 0) return results.length === 0 ? 1.0 : 0.0;
  if (results.length === 0) return 0.0;
  const hits = results.filter((r) => expected.includes(r.name)).length;
  return hits / results.length;
}

/**
 * Answer Relevancy: Is the top result relevant to the query?
 * Uses the CRAG-validated relevance_score when available (it's a semantic LLM score),
 * falling back to term overlap for LOOKUP results which use a fixed score of 1.0.
 */
export function computeAnswerRelevancy(
  query: string,
  topResult: SearchResult | undefined,
  expected: string[],
): number {
  // No result returned AND no result expected = correct behaviour, score as neutral
  if (!topResult) return expected.length === 0 ? 0.5 : 0.0;
  // CRAG score is already a semantic relevance signal — prefer it over term overlap
  if (topResult.relevance_score > 0) return topResult.relevance_score;
  // Fall back to term overlap (e.g. for direct LOOKUP where relevance_score isn't set)
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const text = `${topResult.name} ${topResult.description}`.toLowerCase();
  const matchCount = terms.filter((t) => text.includes(t)).length;
  return terms.length > 0 ? matchCount / terms.length : 0.5;
}

/**
 * Context Precision: What fraction of the top-K results are useful?
 */
export function computeContextPrecision(results: SearchResult[], expected: string[]): number {
  if (expected.length === 0) return results.length === 0 ? 1.0 : 0.0;
  if (results.length === 0) return 0.0;
  const relevant = results.filter((r) => expected.includes(r.name)).length;
  return relevant / results.length;
}

/**
 * Context Recall: Did the search miss any expected blocks?
 */
export function computeContextRecall(results: SearchResult[], expected: string[]): number {
  if (expected.length === 0) return 1.0;
  if (results.length === 0) return 0.0;
  const resultNames = results.map((r) => r.name);
  const found = expected.filter((e) => resultNames.includes(e)).length;
  return found / expected.length;
}

export interface AggregatedMetrics {
  faithfulness: number;
  answer_relevancy: number;
  context_precision: number;
  context_recall: number;
}

export interface QueryResult {
  query: string;
  expected: string[];
  faithfulness: number;
  answer_relevancy: number;
  context_precision: number;
  context_recall: number;
}

export function aggregateMetrics(results: PromiseSettledResult<QueryResult>[]): AggregatedMetrics {
  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<QueryResult> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (fulfilled.length === 0) {
    return { faithfulness: 0, answer_relevancy: 0, context_precision: 0, context_recall: 0 };
  }

  const avg = (key: keyof QueryResult) =>
    fulfilled.reduce((sum, r) => sum + (r[key] as number), 0) / fulfilled.length;

  return {
    faithfulness: avg('faithfulness'),
    answer_relevancy: avg('answer_relevancy'),
    context_precision: avg('context_precision'),
    context_recall: avg('context_recall'),
  };
}
