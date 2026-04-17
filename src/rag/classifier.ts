export type QueryType = 'LOOKUP' | 'SEMANTIC' | 'COMPOSITIONAL' | 'MULTI_SOURCE';

const LOOKUP_PATTERNS = [
  /^(get|show|fetch|read)\s+(?:me\s+)?(?:the\s+)?[\w-]+\s+block$/i,
  /^(what is|what does)\s+the\s+[\w-]+\s+block/i,
  /^(show|display)\s+[\w-]+\s+block\s*(source|code|js|css)?$/i,
];

const MULTI_SOURCE_KW = ['figma', 'design', 'create a page', 'da page', 'new page from', 'document authoring'];
const COMPOSITIONAL_KW = ['all', 'which', 'compare', 'override', 'lag', 'stale', 'audit', 'outdated', 'list all', 'how many'];

export async function classifyQuery(query: string): Promise<QueryType> {
  const q = query.trim();

  // Fast-path pattern matching — no LLM call needed for clear cases
  if (LOOKUP_PATTERNS.some((p) => p.test(q))) return 'LOOKUP';
  if (MULTI_SOURCE_KW.some((kw) => q.toLowerCase().includes(kw))) return 'MULTI_SOURCE';

  const composScore = COMPOSITIONAL_KW.filter((kw) => q.toLowerCase().includes(kw)).length;
  if (composScore >= 2) return 'COMPOSITIONAL';

  return 'SEMANTIC';
}
