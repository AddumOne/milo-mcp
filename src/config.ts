import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CUSTOM_PROJECTS_PATH = join(__dirname, '../.cache/custom-projects.json');

export const config = {
  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubWriteToken: process.env.GITHUB_WRITE_TOKEN,
  figmaApiKey: process.env.FIGMA_API_KEY,
  daApiToken: process.env.DA_API_TOKEN,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  repoOwner: process.env.MILO_REPO_OWNER ?? 'adobecom',
  repoName: process.env.MILO_REPO_NAME ?? 'milo',
  defaultBranch: process.env.MILO_DEFAULT_BRANCH ?? 'stage',
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2',
  cragThreshold: parseFloat(process.env.CRAG_THRESHOLD ?? '0.6'),
  selfRagMaxAttempts: parseInt(process.env.SELF_RAG_MAX_ATTEMPTS ?? '2'),
  cosineGap: parseFloat(process.env.COSINE_GAP ?? '0.20'),
  indexCacheTTLMs: parseInt(process.env.INDEX_CACHE_TTL_MS ?? '3600000'), // 1 hour
};

export interface ProjectConfig {
  owner: string;
  repo: string;
  blocksPath: string;
  /** Subdirs under `blocksPath` that are not blocks (no `{name}.js`); skipped for index / list. */
  excludeBlockDirs?: readonly string[];
}

export const KNOWN_PROJECTS: Record<string, ProjectConfig> = {
  milo:          { owner: 'adobecom', repo: 'milo',        blocksPath: 'libs/blocks' },
  aso:    { owner: 'adobecom', repo: 'aso',    blocksPath: 'blocks' },
  'da-bacom':    { owner: 'adobecom', repo: 'da-bacom',    blocksPath: 'blocks' },
  'da-bacom-blog':    { owner: 'adobecom', repo: 'da-bacom-blog',    blocksPath: 'blog/blocks' },
  bacom:         { owner: 'adobecom', repo: 'bacom',        blocksPath: 'blocks' },
  cc:            { owner: 'adobecom', repo: 'cc',           blocksPath: 'creativecloud/blocks' },
  'da-cc':    { owner: 'adobecom', repo: 'da-cc',    blocksPath: 'creativecloud/blocks' },
  'da-dc':    { owner: 'adobecom', repo: 'da-dc',    blocksPath: 'acrobat/blocks' },
  'dc-frictionless':    { owner: 'adobecom', repo: 'dc-frictionless',    blocksPath: 'dc-shared/blocks' },
  // 'da-events':    { owner: 'adobecom', repo: 'da-events',    blocksPath: 'blocks' }, # No blocks in this repo
  'da-express-milo':    { owner: 'adobecom', repo: 'da-express-milo',    blocksPath: 'express/code/blocks' },
  express:       { owner: 'adobecom', repo: 'express',    blocksPath: 'express/blocks', excludeBlockDirs: ['shared'] },
  'dme-partners':    { owner: 'adobecom', repo: 'dme-partners',    blocksPath: 'edsdme/blocks' },
  'da-dx-partners':    { owner: 'adobecom', repo: 'da-dx-partners',    blocksPath: 'eds/blocks' },
  devblog:    { owner: 'adobecom', repo: 'devblog',    blocksPath: 'blocks' },
  edu:    { owner: 'adobecom', repo: 'edu',    blocksPath: 'edu/blocks' },
  'ecc-milo':    { owner: 'adobecom', repo: 'ecc-milo',    blocksPath: 'ecc/blocks' },
  // 'federal':    { owner: 'adobecom', repo: 'federal',    blocksPath: 'blocks' }, # No blocks in this repo
  'da-genuine':    { owner: 'adobecom', repo: 'da-genuine',    blocksPath: 'genuine/blocks' },
  genuine:       { owner: 'adobecom', repo: 'genuine',      blocksPath: 'genuine/blocks' },
  'da-homepage':    { owner: 'adobecom', repo: 'da-homepage',    blocksPath: 'homepage/blocks' },
  homepage:    { owner: 'adobecom', repo: 'homepage',    blocksPath: 'homepage/blocks' },
  'milo-purple': { owner: 'adobecom', repo: 'milo-purple',  blocksPath: 'experiments/test001/blocks' },
  'milo-pink':   { owner: 'adobecom', repo: 'milo-pink',    blocksPath: 'libs/blocks' },
  // 'news':    { owner: 'adobecom', repo: 'news',    blocksPath: 'blocks' }, # No blocks in this repo
  upp:    { owner: 'adobecom', repo: 'upp',    blocksPath: 'upp/blocks' }
};

