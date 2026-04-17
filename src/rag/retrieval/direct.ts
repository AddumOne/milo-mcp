import { blockStore, type BlockEntry } from '../../index/store.js';

/** Parse block name from a LOOKUP query like "get the accordion block" */
function parseBlockName(query: string): string {
  const m = query.match(/(?:get|show|fetch|read|display)\s+(?:the\s+)?([\w-]+)\s+block/i)
    ?? query.match(/(?:what is|what does)\s+(?:the\s+)?([\w-]+)\s+block/i);
  if (m) return m[1].toLowerCase();
  // Fallback: extract last word before "block"
  const fallback = query.match(/([\w-]+)\s+block/i);
  return fallback ? fallback[1].toLowerCase() : query.trim().toLowerCase();
}

export interface DirectResult {
  block: BlockEntry | null;
  blockName: string;
}

/** Try name variants to handle singular/plural and common aliases. */
function nameVariants(name: string): string[] {
  const variants = [name];
  if (!name.endsWith('s')) variants.push(`${name}s`);   // card → cards
  if (name.endsWith('s')) variants.push(name.slice(0, -1)); // tabs → tab
  return variants;
}

export function directLookup(query: string, project?: string): DirectResult {
  const blockName = parseBlockName(query);
  const variants = nameVariants(blockName);

  if (project && project !== 'milo') {
    for (const v of variants) {
      const entry = blockStore.get(project, v);
      if (entry) return { block: entry, blockName: v };
    }
  }

  // Fall back to milo core
  for (const v of variants) {
    const entry = blockStore.get('milo', v);
    if (entry) return { block: entry, blockName: v };
  }
  return { block: null, blockName };
}
