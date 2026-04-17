import { registry } from '../registry.js';
import { resolveBlockLocation } from '../github/block-resolver.js';

export interface GetBlockRepoOwnerInput {
  block_name: string;
  project?: string;
}

export interface GetBlockRepoOwnerOutput {
  project: string;
  org: string;
  repo: string;
  owner_repo: string;
  source: 'child-project' | 'milo-core' | 'not-found';
  milo_version: string | null;
}

function projectKeyForRepo(org: string, repo: string): string {
  const hit = Object.entries(registry.getAll()).find(([, c]) => c.owner === org && c.repo === repo);
  return hit?.[0] ?? repo;
}

/**
 * Which Milo ecosystem project key and GitHub repo this resolution maps to (same resolver as get_block_location).
 */
export async function getBlockRepoOwner(input: GetBlockRepoOwnerInput): Promise<GetBlockRepoOwnerOutput> {
  const projectKey = input.project ?? 'milo';
  const resolved = await resolveBlockLocation({ block_name: input.block_name, project: projectKey });

  if (resolved.source === 'not-found') {
    return {
      project: projectKey,
      org: '',
      repo: '',
      owner_repo: '',
      source: 'not-found',
      milo_version: null,
    };
  }

  const [org, repo] = resolved.owner_repo.split('/');
  return {
    project: projectKeyForRepo(org, repo),
    org,
    repo,
    owner_repo: resolved.owner_repo,
    source: resolved.source,
    milo_version: resolved.milo_version,
  };
}
