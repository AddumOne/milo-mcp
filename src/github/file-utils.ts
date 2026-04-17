import { getOctokit, withRetry } from './client.js';

/** Fetch a file's UTF-8 content from GitHub. Returns null if the file doesn't exist. */
export async function fetchFileContent(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const { data } = await withRetry(() =>
      getOctokit().repos.getContent({ owner, repo, path }),
    );
    if (!('content' in data)) return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/** Get the ISO date string of the most recent commit touching a path. */
export async function getLastCommitDate(owner: string, repo: string, path: string): Promise<string> {
  try {
    const { data } = await withRetry(() =>
      getOctokit().repos.listCommits({ owner, repo, path, per_page: 1 }),
    );
    return data[0]?.commit?.committer?.date ?? data[0]?.commit?.author?.date ?? '';
  } catch {
    return '';
  }
}

/** Days that a child override lags behind Milo core. Returns 0 if child is newer. */
export function lagDays(childDate: string, miloDate: string): number {
  if (!childDate || !miloDate) return 0;
  const diff = new Date(miloDate).getTime() - new Date(childDate).getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}
