import { blockStore } from '../index/store.js';
import { buildIndex, DEFAULT_CACHE_PATH, isIndexing, setIndexing } from '../index/builder.js';
import { saveCache } from '../index/cache.js';
import { registry } from '../registry.js';

export interface RefreshIndexInput {
  project?: string;
}

export interface RefreshIndexOutput {
  status: 'completed' | 'already_in_progress';
  projects_refreshed: string[];
  total_blocks: number;
  duration_ms: number;
  errors?: { project: string; message: string }[];
}

export async function refreshIndex(input: RefreshIndexInput): Promise<RefreshIndexOutput> {
  if (isIndexing()) {
    return {
      status: 'already_in_progress',
      projects_refreshed: [],
      total_blocks: blockStore.size(),
      duration_ms: 0,
    };
  }

  setIndexing(true);
  const start = Date.now();
  const refreshed: string[] = [];
  const errors: { project: string; message: string }[] = [];

  try {
    if (input.project) {
      // Single project refresh
      registry.get(input.project); // validates project name
      blockStore.clear(input.project);
      await buildIndex(input.project);
      refreshed.push(input.project);
    } else {
      // Full refresh — clear+rebuild per project sequentially
      const projects = registry.allKeys();
      for (const project of projects) {
        try {
          blockStore.clear(project);
          await buildIndex(project);
          refreshed.push(project);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ project, message });
        }
      }
    }

    saveCache(DEFAULT_CACHE_PATH);
  } finally {
    setIndexing(false);
  }

  const result: RefreshIndexOutput = {
    status: 'completed',
    projects_refreshed: refreshed,
    total_blocks: blockStore.size(),
    duration_ms: Date.now() - start,
  };

  if (errors.length > 0) {
    result.errors = errors;
  }

  return result;
}
