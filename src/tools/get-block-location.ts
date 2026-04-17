import { dirname } from 'path';
import { config } from '../config.js';
import { resolveBlockLocation } from '../github/block-resolver.js';

export interface GetBlockLocationInput {
  block_name: string;
  project?: string;
}

export interface GetBlockLocationOutput {
  owner: string;
  repo: string;
  path: string;
  block_directory: string;
  branch: string;
  source: 'child-project' | 'milo-core' | 'not-found';
  github_url: string;
}

/**
 * Physical file path and GitHub blob URL for the block's main `.js` file.
 */
export async function getBlockLocation(input: GetBlockLocationInput): Promise<GetBlockLocationOutput> {
  const resolved = await resolveBlockLocation({ block_name: input.block_name, project: input.project });

  const branch = config.defaultBranch;

  if (resolved.source === 'not-found') {
    return {
      owner: '',
      repo: '',
      path: '',
      block_directory: '',
      branch,
      source: 'not-found',
      github_url: '',
    };
  }

  const [owner, repo] = resolved.owner_repo.split('/');
  const blockDir = dirname(resolved.path).replace(/\\/g, '/');
  const github_url = `https://github.com/${owner}/${repo}/blob/${branch}/${resolved.path}`;

  return {
    owner,
    repo,
    path: resolved.path,
    block_directory: blockDir,
    branch,
    source: resolved.source,
    github_url,
  };
}
