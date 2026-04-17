import { getOctokit, withRetry } from '../github/client.js';
import { registry } from '../registry.js';
import { CUSTOM_PROJECTS_PATH } from '../config.js';
import { blockStore } from '../index/store.js';
import { buildIndex, DEFAULT_CACHE_PATH, isIndexing, setIndexing } from '../index/builder.js';
import { saveCache } from '../index/cache.js';

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AddProjectInput {
  name: string;
  owner?: string;
  repo: string;
  blocks_path?: string;
}

export interface AddProjectOutput {
  status: 'added' | 'updated' | 'index_busy';
  project: string;
  config: { owner: string; repo: string; blocksPath: string } | null;
  indexed_blocks: number;
  duration_ms: number;
  note: string;
}

export async function addProject(input: AddProjectInput): Promise<AddProjectOutput> {
  const name = input.name.toLowerCase();
  const owner = input.owner ?? 'adobecom';
  const repo = input.repo;
  const blocksPath = input.blocks_path ?? 'blocks';

  if (!NAME_RE.test(name)) {
    throw new Error(
      `Invalid project name "${name}". Use lowercase alphanumeric characters and hyphens (e.g. "my-project").`,
    );
  }

  if (isIndexing()) {
    return {
      status: 'index_busy',
      project: name,
      config: null,
      indexed_blocks: 0,
      duration_ms: 0,
      note: 'Another indexing operation is in progress. Try again shortly.',
    };
  }

  const octokit = getOctokit();

  // Validate repo exists
  try {
    await withRetry(() => octokit.repos.get({ owner, repo }));
  } catch {
    throw new Error(`Repository ${owner}/${repo} not found or not accessible.`);
  }

  // Validate blocks_path directory exists
  try {
    const { data } = await withRetry(() =>
      octokit.repos.getContent({ owner, repo, path: blocksPath }),
    );
    if (!Array.isArray(data)) {
      throw new Error(`Path "${blocksPath}" in ${owner}/${repo} is not a directory.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('is not a directory')) throw err;
    throw new Error(
      `Blocks path "${blocksPath}" not found in ${owner}/${repo}. Check the path and try again.`,
    );
  }

  const wasExisting = registry.has(name);
  const status = wasExisting && registry.isDefault(name) ? 'updated' : wasExisting ? 'updated' : 'added';

  const projectConfig = { owner, repo, blocksPath };
  registry.add(name, projectConfig);
  registry.saveCustom(CUSTOM_PROJECTS_PATH);

  // Index the new project
  const start = Date.now();
  setIndexing(true);
  try {
    blockStore.clear(name);
    await buildIndex(name);
    saveCache(DEFAULT_CACHE_PATH);
  } finally {
    setIndexing(false);
  }

  const indexedBlocks = blockStore.getAll(name).length;
  const durationMs = Date.now() - start;

  return {
    status,
    project: name,
    config: projectConfig,
    indexed_blocks: indexedBlocks,
    duration_ms: durationMs,
    note: `Project "${name}" ${status}. Indexed ${indexedBlocks} block(s) in ${durationMs}ms.`,
  };
}
