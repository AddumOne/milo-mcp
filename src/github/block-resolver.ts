import { getOctokit, withRetry } from './client.js';
import { registry } from '../registry.js';

export interface ResolveBlockInput {
  block_name: string;
  project?: string;
}

export interface ResolveBlockOutput {
  owner_repo: string;
  path: string;
  source: 'child-project' | 'milo-core' | 'not-found';
  milo_version: string | null;
}

async function fileExists(owner: string, repo: string, path: string): Promise<boolean> {
  try {
    await withRetry(() => getOctokit().repos.getContent({ owner, repo, path }));
    return true;
  } catch {
    return false;
  }
}

async function getMiloVersion(childOwner: string, childRepo: string): Promise<string | null> {
  try {
    const { data } = await withRetry(() =>
      getOctokit().repos.getContent({ owner: childOwner, repo: childRepo, path: 'fstab.yaml' }),
    );
    if (!('content' in data)) return null;
    const text = Buffer.from(data.content, 'base64').toString('utf-8');
    const m = text.match(/https?:\/\/([\w-]+)--milo--adobecom\.aem\.\w+\/libs/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** True if `libs/blocks/{name}/{name}.js` exists in adobecom/milo. */
export async function blockJsExistsInMiloRepo(blockName: string): Promise<boolean> {
  const milo = registry.get('milo');
  const n = blockName.toLowerCase();
  const p = `${milo.blocksPath}/${n}/${n}.js`;
  return fileExists(milo.owner, milo.repo, p);
}

/**
 * Resolve which GitHub repo and file path contain the block's main `.js` file
 * (child project first when applicable, then Milo core).
 */
export async function resolveBlockLocation(input: ResolveBlockInput): Promise<ResolveBlockOutput> {
  const project = input.project ?? 'milo';
  const blockName = input.block_name.toLowerCase();

  if (project !== 'milo') {
    const proj = registry.get(project);
    const childPath = `${proj.blocksPath}/${blockName}/${blockName}.js`;
    if (await fileExists(proj.owner, proj.repo, childPath)) {
      const miloVersion = await getMiloVersion(proj.owner, proj.repo);
      return {
        owner_repo: `${proj.owner}/${proj.repo}`,
        path: childPath,
        source: 'child-project',
        milo_version: miloVersion,
      };
    }
  }

  const milo = registry.get('milo');
  const miloPath = `${milo.blocksPath}/${blockName}/${blockName}.js`;
  if (await fileExists(milo.owner, milo.repo, miloPath)) {
    return {
      owner_repo: `${milo.owner}/${milo.repo}`,
      path: miloPath,
      source: 'milo-core',
      milo_version: null,
    };
  }

  return {
    owner_repo: '',
    path: '',
    source: 'not-found',
    milo_version: null,
  };
}
