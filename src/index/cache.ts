import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { blockStore, type BlockEntry } from './store.js';
import { config } from '../config.js';

const CACHE_VERSION = '1';

interface CachedBlock {
  name: string;
  repo: string;
  owner: string;
  project: string;
  path: string;
  description: string;
  owners: string[];
  embedding: number[] | null;
}

interface CacheFile {
  version: string;
  timestamp: number;
  embeddingModel: string;
  blocks: CachedBlock[];
}

function toSerializable(entry: BlockEntry): CachedBlock {
  return {
    name: entry.name,
    repo: entry.repo,
    owner: entry.owner,
    project: entry.project,
    path: entry.path,
    description: entry.description,
    owners: entry.owners,
    embedding: entry.embedding ? Array.from(entry.embedding) : null,
  };
}

function fromSerializable(cached: CachedBlock): BlockEntry {
  return {
    name: cached.name,
    repo: cached.repo,
    owner: cached.owner,
    project: cached.project,
    path: cached.path,
    description: cached.description,
    owners: cached.owners,
    embedding: cached.embedding ? new Float32Array(cached.embedding) : undefined,
  };
}

export function loadCache(cachePath: string): boolean {
  try {
    if (!existsSync(cachePath)) return false;

    const raw = readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(raw) as CacheFile;

    if (data.version !== CACHE_VERSION) return false;
    if (data.embeddingModel !== config.embeddingModel) return false;

    const age = Date.now() - data.timestamp;
    if (age > config.indexCacheTTLMs) return false;

    blockStore.clear();
    for (const cached of data.blocks) {
      blockStore.add(fromSerializable(cached));
    }

    return true;
  } catch {
    return false;
  }
}

export function saveCache(cachePath: string): void {
  try {
    const dir = dirname(cachePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const blocks = blockStore.getAll().map(toSerializable);
    const data: CacheFile = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      embeddingModel: config.embeddingModel,
      blocks,
    };

    writeFileSync(cachePath, JSON.stringify(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[milo-mcp] Failed to save index cache: ${msg}\n`);
  }
}
