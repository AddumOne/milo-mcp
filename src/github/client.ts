import { Octokit } from '@octokit/rest';
import { config } from '../config.js';

/** GitHub REST calendar version; required to avoid `Deprecation` / sunset warnings on responses. */
const GITHUB_REST_API_VERSION = '2022-11-28' as const;

const VersionedOctokit = Octokit.plugin((octokit) => {
  octokit.hook.before('request', (options) => {
    Object.assign(options.headers, { 'X-GitHub-Api-Version': GITHUB_REST_API_VERSION });
  });
}) as typeof Octokit;

/** Octokit that sends `X-GitHub-Api-Version` on every REST request (for PAT probes, etc.). */
export function createOctokitWithAuth(auth: string): Octokit {
  return new VersionedOctokit({ auth });
}

export class MissingWriteTokenError extends Error {
  readonly code = 'MISSING_WRITE_TOKEN';
  constructor() {
    super('GITHUB_WRITE_TOKEN is required for write operations. Set it in your environment.');
    this.name = 'MissingWriteTokenError';
  }
}

let _readClient: Octokit | null = null;
let _writeClient: Octokit | null = null;

export function getOctokit(write = false): Octokit {
  if (write) {
    if (!config.githubWriteToken) throw new MissingWriteTokenError();
    if (!_writeClient) {
      _writeClient = new VersionedOctokit({ auth: config.githubWriteToken });
    }
    return _writeClient;
  }

  if (!config.githubToken) {
    throw new Error('GITHUB_TOKEN is required. Set it in your environment (read:repo scope).');
  }
  if (!_readClient) {
    _readClient = new VersionedOctokit({ auth: config.githubToken });
  }
  return _readClient;
}

/** Fetch with exponential backoff on 429 rate-limit responses. */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 403) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
