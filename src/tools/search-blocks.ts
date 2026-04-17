import { routeQuery, type RouterOutput } from '../rag/router.js';

export interface SearchBlocksInput {
  query: string;
  project?: string;
  limit?: number;
  explain?: boolean;
}

export async function searchBlocks(input: SearchBlocksInput): Promise<RouterOutput> {
  return routeQuery(input.query, input.project, input.limit ?? 5, input.explain ?? false);
}
