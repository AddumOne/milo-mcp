import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'resources', 'models');
mkdirSync(cacheDir, { recursive: true });

const { pipeline, env } = await import('@xenova/transformers');
env.cacheDir = cacheDir;
env.localModelPath = cacheDir;
env.allowRemoteModels = true;

const modelId = process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
console.log(`Downloading ${modelId} into ${cacheDir} ...`);
await pipeline('feature-extraction', modelId, { quantized: true });
console.log('Done. Model files cached for bundling.');
