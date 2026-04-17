import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'resources');
const destDir = join(root, 'dist', 'resources');

mkdirSync(destDir, { recursive: true });
for (const name of readdirSync(srcDir)) {
  if (name.endsWith('.md')) {
    cpSync(join(srcDir, name), join(destDir, name));
  }
}
