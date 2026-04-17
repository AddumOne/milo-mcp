import { dirname } from 'path';
import { getOctokit, withRetry } from '../github/client.js';
import { registry } from '../registry.js';
import { resolveBlockLocation, blockJsExistsInMiloRepo } from '../github/block-resolver.js';
import {
  fetchCodeownersRules,
  ownersForBlockDirectory,
  splitTeamsAndIndividuals,
} from '../github/codeowners.js';

export interface GetBlockCodeownerInput {
  block_name: string;
  project?: string;
}

export interface ActiveContributor {
  login: string;
  commit_count: number;
}

export interface GetBlockCodeownerOutput {
  declared_teams: string[];
  declared_individuals: string[];
  active_contributors: ActiveContributor[];
  recommended_contact: string | null;
  note: string;
  codeowners_repo: string;
  commits_repo: string;
  commits_path: string;
}

function isBotLogin(login: string | null | undefined): boolean {
  if (!login) return true;
  const l = login.toLowerCase();
  if (l.endsWith('[bot]')) return true;
  if (l === 'web-flow') return true;
  return false;
}

/**
 * CODEOWNERS-derived owners (Milo file when the block exists in core) plus commit activity on the resolved block directory.
 */
export async function getBlockCodeowner(input: GetBlockCodeownerInput): Promise<GetBlockCodeownerOutput> {
  const blockName = input.block_name.toLowerCase();
  const resolved = await resolveBlockLocation({ block_name: blockName, project: input.project });

  if (resolved.source === 'not-found') {
    return {
      declared_teams: [],
      declared_individuals: [],
      active_contributors: [],
      recommended_contact: null,
      note: 'Block not found in the child project (if any) or Milo core.',
      codeowners_repo: '',
      commits_repo: '',
      commits_path: '',
    };
  }

  const [resolvedOrg, resolvedRepoName] = resolved.owner_repo.split('/');
  const blockDir = dirname(resolved.path).replace(/\\/g, '/');

  const inMilo = await blockJsExistsInMiloRepo(blockName);
  const milo = registry.get('milo');

  let codeownersRepo: string;
  let declaredHandles: string[];

  if (inMilo) {
    const rules = await fetchCodeownersRules(milo.owner, milo.repo);
    const miloBlockDir = `${milo.blocksPath}/${blockName}`;
    declaredHandles = ownersForBlockDirectory(miloBlockDir, rules);
    codeownersRepo = `${milo.owner}/${milo.repo}`;
  } else {
    const rules = await fetchCodeownersRules(resolvedOrg, resolvedRepoName);
    declaredHandles = ownersForBlockDirectory(blockDir, rules);
    codeownersRepo = `${resolvedOrg}/${resolvedRepoName}`;
  }

  const { teams, individuals } = splitTeamsAndIndividuals(declaredHandles);

  const commitsPath = blockDir;
  let activeContributors: ActiveContributor[] = [];
  try {
    const { data: commits } = await withRetry(() =>
      getOctokit().repos.listCommits({
        owner: resolvedOrg,
        repo: resolvedRepoName,
        path: commitsPath,
        per_page: 100,
      }),
    );
    const counts = new Map<string, number>();
    for (const c of commits) {
      const login = c.author?.login ?? c.committer?.login;
      if (isBotLogin(login)) continue;
      if (!login) continue;
      counts.set(login, (counts.get(login) ?? 0) + 1);
    }
    activeContributors = [...counts.entries()]
      .map(([login, commit_count]) => ({ login, commit_count }))
      .sort((a, b) => b.commit_count - a.commit_count);
  } catch {
    // leave active_contributors empty
  }

  const noteParts: string[] = [
    'Declared ownership uses root CODEOWNERS on codeowners_repo.',
    'When the block exists in Milo core, CODEOWNERS is read from adobecom/milo even if the resolved file is in a child repo.',
    'Active contributors are from commits touching commits_path (up to 100 commits; commit-count proxy; bots excluded).',
  ];

  let recommended_contact: string | null = null;
  const top = activeContributors[0];
  if (top && top.commit_count >= 3) {
    recommended_contact = top.login;
    noteParts.push(`recommended_contact is the top human contributor (${top.commit_count} commits in sample).`);
  } else if (individuals.length > 0) {
    recommended_contact = individuals[0];
    noteParts.push('recommended_contact falls back to first declared individual (weak or sparse commit signal).');
  } else if (teams.length > 0) {
    recommended_contact = teams[0];
    noteParts.push('recommended_contact falls back to first declared team (no individual owners, or weak commit signal).');
  } else {
    noteParts.push(
      'recommended_contact is null: no declared owners in CODEOWNERS and no non-bot commit authors in the sample.',
    );
  }

  return {
    declared_teams: teams,
    declared_individuals: individuals,
    active_contributors: activeContributors,
    recommended_contact,
    note: noteParts.join(' '),
    codeowners_repo: codeownersRepo,
    commits_repo: `${resolvedOrg}/${resolvedRepoName}`,
    commits_path: commitsPath,
  };
}
