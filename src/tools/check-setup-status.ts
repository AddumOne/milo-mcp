import { blockStore } from '../index/store.js';
import { listProjects } from './list-projects.js';
import { testGitHubToken, testAnthropicKey, HealthResult } from '../setup/health.js';

export interface CheckSetupStatusOutput {
  credentials: {
    GITHUB_TOKEN: HealthResult;
    ANTHROPIC_API_KEY: HealthResult;
  };
  index: {
    built: boolean;
    total_blocks: number;
    by_project: Array<{ project: string; blocks: number }>;
  };
  notes: string[];
}

export async function checkSetupStatus(): Promise<CheckSetupStatusOutput> {
  const [github, anthropic] = await Promise.all([
    testGitHubToken(process.env.GITHUB_TOKEN ?? ''),
    testAnthropicKey(process.env.ANTHROPIC_API_KEY ?? ''),
  ]);

  const blockCount = blockStore.size();
  const byProject = listProjects().projects.map((p) => ({
    project: p.name,
    blocks: p.indexed_blocks,
  }));
  const indexBuilt = blockCount > 0;

  const notes: string[] = [];
  if (!github.ok) {
    notes.push('GITHUB_TOKEN is required for indexing and all GitHub-backed tools.');
  }
  if (!anthropic.ok) {
    notes.push('ANTHROPIC_API_KEY is invalid — check the key value.');
  } else if (anthropic.degraded) {
    notes.push('ANTHROPIC_API_KEY not set — search_blocks will use cosine-only ranking. Set it to enable CRAG semantic validation.');
  }
  if (github.ok && !indexBuilt) {
    notes.push('Index is empty — run refresh_index or restart the server.');
  }

  return {
    credentials: {
      GITHUB_TOKEN: github,
      ANTHROPIC_API_KEY: anthropic,
    },
    index: {
      built: indexBuilt,
      total_blocks: blockCount,
      by_project: byProject,
    },
    notes,
  };
}
