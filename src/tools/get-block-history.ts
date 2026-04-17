import { getOctokit, withRetry } from '../github/client.js';
import { resolveBlock } from './resolve-block.js';

export interface GetBlockHistoryInput {
  block_name: string;
  project?: string;
  limit?: number;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GetBlockHistoryOutput {
  commits: CommitSummary[];
}

export async function getBlockHistory(input: GetBlockHistoryInput): Promise<GetBlockHistoryOutput> {
  const resolved = await resolveBlock({ block_name: input.block_name, project: input.project });
  if (resolved.source === 'not-found') return { commits: [] };

  const [owner, repo] = resolved.owner_repo.split('/');
  const perPage = input.limit ?? 10;

  try {
    const { data } = await withRetry(() =>
      getOctokit().repos.listCommits({ owner, repo, path: resolved.path, per_page: perPage }),
    );

    const commits: CommitSummary[] = data.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author?.name ?? c.commit.committer?.name ?? '',
      date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
      url: c.html_url,
    }));

    return { commits };
  } catch {
    return { commits: [] };
  }
}
