import { registry } from '../registry.js';

export interface GetPreviewUrlInput {
  project: string;
  branch?: string;
  milo_branch?: string;
  path?: string;
  env?: 'stage' | 'live';
}

export interface GetPreviewUrlOutput {
  url: string;
  milo_override_url: string | null;
  local_url: string;
}

export function getPreviewUrl(input: GetPreviewUrlInput): GetPreviewUrlOutput {
  const proj = registry.get(input.project);
  const branch = input.branch ?? 'main';
  const env = input.env ?? 'stage';
  const tld = env === 'live' ? 'aem.live' : 'aem.page';
  const pathSuffix = input.path ? input.path : '';

  const base = `https://${branch}--${proj.repo}--${proj.owner}.${tld}${pathSuffix}`;
  const miloOverride = input.milo_branch
    ? `${base}${pathSuffix.includes('?') ? '&' : '?'}milolibs=${input.milo_branch}`
    : null;
  const localUrl = `http://localhost:3000${pathSuffix || '/'}${input.milo_branch ? `?milolibs=local` : ''}`;

  return { url: base, milo_override_url: miloOverride, local_url: localUrl };
}
