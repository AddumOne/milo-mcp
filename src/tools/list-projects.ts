import { registry } from '../registry.js';
import { blockStore } from '../index/store.js';

export interface ListProjectsOutput {
  projects: Array<{
    name: string;
    owner: string;
    repo: string;
    blocks_path: string;
    source: 'default' | 'custom' | 'custom_override';
    indexed_blocks: number;
  }>;
  total: number;
}

export function listProjects(): ListProjectsOutput {
  const all = registry.getAll();
  const projects = registry.allKeys().map((name) => {
    const config = all[name];
    return {
      name,
      owner: config.owner,
      repo: config.repo,
      blocks_path: config.blocksPath,
      source: registry.source(name),
      indexed_blocks: blockStore.getAll(name).length,
    };
  });

  return { projects, total: projects.length };
}
