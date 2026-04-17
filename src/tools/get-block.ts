import { fetchCodeownersRules, ownersForBlockDirectory } from '../github/codeowners.js';
import { fetchFileContent, getLastCommitDate } from '../github/file-utils.js';
import { resolveBlock } from './resolve-block.js';

export interface GetBlockInput {
  block_name: string;
  project?: string;
  include_source?: boolean;
  include_css?: boolean;
  include_tests?: boolean;
}

export interface GetBlockOutput {
  name: string;
  repo: string;
  path: string;
  owner: string[];
  last_modified: string;
  resolved_from: 'child-project' | 'milo-core' | 'not-found';
  source?: string;
  css?: string;
  tests?: string;
}

export async function getBlock(input: GetBlockInput): Promise<GetBlockOutput> {
  const resolved = await resolveBlock({ block_name: input.block_name, project: input.project });

  if (resolved.source === 'not-found') {
    return {
      name: input.block_name,
      repo: '',
      path: '',
      owner: [],
      last_modified: '',
      resolved_from: 'not-found',
    };
  }

  const [ownerStr, repo] = resolved.owner_repo.split('/');
  const jsPath = resolved.path;
  const basePath = jsPath.replace(/\/[^/]+\.js$/, '');
  const blockName = input.block_name.toLowerCase();

  const blockDir = jsPath.split('/').slice(0, -1).join('/');
  const [blockOwners, lastModified] = await Promise.all([
    fetchCodeownersRules(ownerStr, repo).then((rules) => ownersForBlockDirectory(blockDir, rules)),
    getLastCommitDate(ownerStr, repo, jsPath),
  ]);

  const output: GetBlockOutput = {
    name: blockName,
    repo,
    path: jsPath,
    owner: blockOwners,
    last_modified: lastModified,
    resolved_from: resolved.source,
  };

  if (input.include_source) {
    output.source = (await fetchFileContent(ownerStr, repo, jsPath)) ?? undefined;
  }
  if (input.include_css) {
    output.css = (await fetchFileContent(ownerStr, repo, `${basePath}/${blockName}.css`)) ?? undefined;
  }
  if (input.include_tests) {
    // Try nala test path
    const nalaPath = `nala/${blockName}/${blockName}.test.js`;
    output.tests = (await fetchFileContent(ownerStr, repo, nalaPath)) ?? undefined;
  }

  return output;
}
