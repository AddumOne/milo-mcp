import pLimit from 'p-limit';
import { getOctokit, withRetry } from '../github/client.js';
import { fetchCodeownersRules, ownersForBlockDirectory } from '../github/codeowners.js';
import { getLastCommitDate, lagDays } from '../github/file-utils.js';
import { registry } from '../registry.js';

export interface ListBlocksInput {
  project?: string;
  include_child_overrides?: boolean;
}

export interface BlockSummary {
  name: string;
  repo: string;
  path: string;
  owner: string[];
  is_override: boolean;
  override_lag_days?: number;
  child_last_modified?: string;
  milo_last_modified?: string;
}

export interface ListBlocksOutput {
  blocks: BlockSummary[];
  total: number;
}

async function fetchBlockDirs(
  owner: string,
  repo: string,
  blocksPath: string,
  excludeBlockDirs?: readonly string[],
): Promise<{ name: string; path: string }[]> {
  try {
    const { data } = await withRetry(() =>
      getOctokit().repos.getContent({ owner, repo, path: blocksPath }),
    );
    if (!Array.isArray(data)) return [];
    const skip = new Set(excludeBlockDirs ?? []);
    return data
      .filter((d) => d.type === 'dir' && !skip.has(d.name))
      .map((d) => ({ name: d.name, path: d.path }));
  } catch {
    return [];
  }
}


export async function listBlocks(input: ListBlocksInput): Promise<ListBlocksOutput> {
  const project = input.project ?? 'milo';
  const proj = registry.get(project);

  const items = await fetchBlockDirs(proj.owner, proj.repo, proj.blocksPath, proj.excludeBlockDirs);
  if (items.length === 0) return { blocks: [], total: 0 };

  const codeownersRules = await fetchCodeownersRules(proj.owner, proj.repo);

  // Simple listing — no override comparison needed
  if (!input.include_child_overrides || project === 'milo') {
    const blocks: BlockSummary[] = items.map((item) => ({
      name: item.name,
      repo: proj.repo,
      path: item.path,
      owner: ownersForBlockDirectory(item.path, codeownersRules),
      is_override: false,
    }));
    return { blocks, total: blocks.length };
  }

  // Child project + override comparison
  // Fetch milo block dirs to determine which child blocks are overrides
  const milo = registry.get('milo');
  const miloItems = await fetchBlockDirs(milo.owner, milo.repo, milo.blocksPath, milo.excludeBlockDirs);
  const miloBlockNames = new Set(miloItems.map((b) => b.name));

  const limit = pLimit(5);

  const blocks = await Promise.all(
    items.map((item) =>
      limit(async (): Promise<BlockSummary> => {
        const base: BlockSummary = {
          name: item.name,
          repo: proj.repo,
          path: item.path,
          owner: ownersForBlockDirectory(item.path, codeownersRules),
          is_override: false,
        };

        if (!miloBlockNames.has(item.name)) return base;

        // This block exists in both child and milo — it's an override
        const childJsPath = `${item.path}/${item.name}.js`;
        const miloJsPath = `${milo.blocksPath}/${item.name}/${item.name}.js`;

        const [childDate, miloDate] = await Promise.all([
          getLastCommitDate(proj.owner, proj.repo, childJsPath),
          getLastCommitDate(milo.owner, milo.repo, miloJsPath),
        ]);

        return {
          ...base,
          is_override: true,
          override_lag_days: lagDays(childDate, miloDate),
          child_last_modified: childDate,
          milo_last_modified: miloDate,
        };
      }),
    ),
  );

  return { blocks, total: blocks.length };
}
