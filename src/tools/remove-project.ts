import { registry } from '../registry.js';
import { CUSTOM_PROJECTS_PATH } from '../config.js';
import { blockStore } from '../index/store.js';
import { buildIndex, DEFAULT_CACHE_PATH, isIndexing, setIndexing } from '../index/builder.js';
import { saveCache } from '../index/cache.js';

export interface RemoveProjectInput {
  name: string;
}

export interface RemoveProjectOutput {
  status: 'removed' | 'reverted_to_default' | 'cannot_remove_default' | 'not_found';
  project: string;
  note: string;
}

export async function removeProject(input: RemoveProjectInput): Promise<RemoveProjectOutput> {
  const name = input.name.toLowerCase();
  const result = registry.remove(name);

  switch (result) {
    case 'not_found':
      return {
        status: 'not_found',
        project: name,
        note: `Project "${name}" is not registered.`,
      };

    case 'cannot_remove_default':
      return {
        status: 'cannot_remove_default',
        project: name,
        note: `Project "${name}" is a built-in default and cannot be removed.`,
      };

    case 'removed':
      blockStore.clear(name);
      registry.saveCustom(CUSTOM_PROJECTS_PATH);
      saveCache(DEFAULT_CACHE_PATH);
      return {
        status: 'removed',
        project: name,
        note: `Project "${name}" removed. Its blocks have been cleared from the index.`,
      };

    case 'reverted_to_default': {
      blockStore.clear(name);
      registry.saveCustom(CUSTOM_PROJECTS_PATH);

      // Re-index with the default config
      if (!isIndexing()) {
        setIndexing(true);
        try {
          await buildIndex(name);
        } catch {
          // If re-indexing fails, the project still reverts to default config
        } finally {
          setIndexing(false);
        }
      }

      saveCache(DEFAULT_CACHE_PATH);

      const blockCount = blockStore.getAll(name).length;
      return {
        status: 'reverted_to_default',
        project: name,
        note: `Custom override for "${name}" removed. Reverted to default config and re-indexed ${blockCount} block(s).`,
      };
    }
  }
}
