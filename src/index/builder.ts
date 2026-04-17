import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pLimit from 'p-limit';
import { getOctokit, withRetry } from '../github/client.js';
import { fetchCodeownersRules, ownersForBlockDirectory } from '../github/codeowners.js';
import { blockStore, type BlockEntry } from './store.js';
import { embedText } from './embeddings.js';
import { loadCache, saveCache } from './cache.js';
import { registry } from '../registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CACHE_PATH = join(__dirname, '../../.cache/block-index.json');

// Shared mutex — prevents concurrent indexing from add_project and refresh_index
let _indexing = false;
export function isIndexing(): boolean { return _indexing; }
export function setIndexing(v: boolean): void { _indexing = v; }

const JSDOC_DESCRIPTION_RE = /@description\s+(.+)/;

/**
 * Fallback descriptions for well-known Milo blocks that don't have JSDoc @description tags.
 * These are used as the embedding text when no description is extracted from source.
 * More descriptive text = better cosine similarity for semantic queries.
 */
const KNOWN_BLOCK_DESCRIPTIONS: Record<string, string> = {
  accordion:    'expandable collapsible sections FAQ toggle show hide',
  aside:        'side-by-side two-column split layout complementary content',
  carousel:     'rotating slideshow image gallery slider loop auto-play',
  cards:        'grid card layout content items list product feature',
  card:         'single card content item product feature',
  chart:        'data visualization bar line pie graph statistics metrics',
  columns:      'multi-column grid side-by-side layout content sections',
  fragment:     'reusable embeddable include remote content section',
  marquee:      'hero banner full-width promotional header page top',
  modal:        'dialog popup overlay lightbox confirm alert',
  tabs:         'navigation tab panel switching content sections horizontal',
  video:        'video player embed media playback streaming',
  'text':       'rich text content paragraph body copy prose',
  'media':      'image video figure media asset',
  'table':      'data table rows columns comparison grid',
  'z-pattern':  'alternating image text layout zigzag pattern',
  'icon-block': 'icon feature benefit list pictogram',
  'quote':      'blockquote testimonial customer quote pull quote',
  'rating':     'star rating review score feedback',
  'share':      'social share links email copy URL',
  'breadcrumbs':'navigation breadcrumb path site hierarchy',
  'search':     'search input query find results filter',
  'form':       'form input fields submit email contact',
  'timeline':   'chronological events history steps process',
  'section-metadata': 'section styling background color metadata',
  'metadata':   'page metadata SEO title description',
};

async function fetchBlockDescription(
  owner: string,
  repo: string,
  blockPath: string,
  blockName: string,
): Promise<string> {
  const octokit = getOctokit();
  try {
    const { data } = await withRetry(() =>
      octokit.repos.getContent({ owner, repo, path: `${blockPath}/${blockName}.js` }),
    );
    if (!('content' in data)) return '';
    const source = Buffer.from(data.content, 'base64').toString('utf-8');
    const m = JSDOC_DESCRIPTION_RE.exec(source);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

export async function buildIndex(project: string): Promise<void> {
  const proj = registry.get(project);
  const octokit = getOctokit();

  // Fetch block directory listing
  let items: { name: string; type: string; path: string }[] = [];
  try {
    const { data } = await withRetry(() =>
      octokit.repos.getContent({ owner: proj.owner, repo: proj.repo, path: proj.blocksPath }),
    );
    if (!Array.isArray(data)) return;
    const skip = new Set(proj.excludeBlockDirs ?? []);
    items = data.filter((d) => d.type === 'dir' && !skip.has(d.name));
  } catch {
    return;
  }

  const codeownersRules = await fetchCodeownersRules(proj.owner, proj.repo);
  const limit = pLimit(10);

  const tasks = items.map((item) =>
    limit(async () => {
      const blockName = item.name;
      const blockPath = item.path;
      const description = await fetchBlockDescription(proj.owner, proj.repo, blockPath, blockName);
      const owners = ownersForBlockDirectory(blockPath, codeownersRules);
      const knownDesc = KNOWN_BLOCK_DESCRIPTIONS[blockName];
      const effectiveDescription = description || knownDesc || blockName;
      const text = `${blockName}: ${effectiveDescription}`;
      let embedding: Float32Array | undefined;
      try {
        embedding = await embedText(text);
      } catch {
        // embedding is optional — continue without it
      }

      const entry: BlockEntry = {
        name: blockName,
        repo: proj.repo,
        owner: proj.owner,
        project,
        path: blockPath,
        description: description || knownDesc || '',
        owners,
        embedding,
      };
      blockStore.add(entry);
    }),
  );

  await Promise.allSettled(tasks);
}

export async function buildAllIndexes(): Promise<void> {
  // Try loading from disk cache first
  if (loadCache(DEFAULT_CACHE_PATH)) {
    process.stderr.write(`[milo-mcp] Loaded ${blockStore.size()} blocks from cache\n`);

    // Check for projects in registry that have no cached blocks (e.g. custom
    // projects added after the last cache save)
    const uncached = registry.allKeys().filter((p) => blockStore.getAll(p).length === 0);
    if (uncached.length > 0) {
      process.stderr.write(`[milo-mcp] Building index for ${uncached.length} uncached project(s)\n`);
      for (const project of uncached) {
        try {
          await buildIndex(project);
        } catch {
          // skip unavailable projects
        }
      }
      saveCache(DEFAULT_CACHE_PATH);
    }

    return;
  }

  const projects = registry.allKeys();
  // Build sequentially to stay within rate limits at startup
  for (const project of projects) {
    try {
      await buildIndex(project);
    } catch {
      // Don't fail server start if one project is unavailable
    }
  }

  // Save to cache for next startup
  saveCache(DEFAULT_CACHE_PATH);
  const total = blockStore.size();
  process.stderr.write(`[milo-mcp] Cached ${total} blocks to disk\n`);
  if (total === 0) {
    process.stderr.write(
      '[milo-mcp] WARNING: index is empty — all projects failed to fetch. ' +
      'Check that GITHUB_TOKEN is valid and has read access to public repos. ' +
      'Run the check_setup_status tool for a detailed diagnosis.\n',
    );
  }
}
