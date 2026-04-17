import { getOctokit, withRetry } from '../github/client.js';
import { registry } from '../registry.js';

export interface FstabData {
  raw: string;
  mountpoints: Record<string, string>;
  milo_version: string | null;
  milo_branch: string | null;
}

const MILO_MOUNT_RE = /https?:\/\/([\w-]+)--milo--adobecom\.aem\.\w+\/libs/;

export async function readFstab(project: string): Promise<FstabData> {
  if (project === 'milo') {
    return { raw: '# milo does not mount itself', mountpoints: {}, milo_version: null, milo_branch: null };
  }

  const proj = registry.get(project);
  const { data } = await withRetry(() =>
    getOctokit().repos.getContent({ owner: proj.owner, repo: proj.repo, path: 'fstab.yaml' }),
  );

  if (!('content' in data)) throw new Error(`fstab.yaml not found in ${project}`);
  const raw = Buffer.from(data.content, 'base64').toString('utf-8');

  // Parse mountpoints block
  const mountpoints: Record<string, string> = {};
  const mpSection = raw.match(/mountpoints:\s*([\s\S]*?)(?:\n\w|\s*$)/);
  if (mpSection) {
    for (const line of mpSection[1].split('\n')) {
      const m = line.match(/^\s+([\w/]+):\s*(.+)/);
      if (m) mountpoints[m[1].trim()] = m[2].trim();
    }
  }

  // Extract milo branch from /libs mountpoint
  const libsMount = mountpoints['/libs'] ?? '';
  const branchMatch = MILO_MOUNT_RE.exec(libsMount);
  const milo_branch = branchMatch ? branchMatch[1] : null;

  return { raw, mountpoints, milo_version: milo_branch, milo_branch };
}
