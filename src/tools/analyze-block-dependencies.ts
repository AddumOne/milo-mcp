import pLimit from 'p-limit';
import { fetchFileContent } from '../github/file-utils.js';
import { resolveBlock } from './resolve-block.js';
import { blockStore } from '../index/store.js';

export interface AnalyzeBlockDependenciesInput {
  block_name: string;
  project?: string;
  include_reverse?: boolean;
}

interface Dependency {
  name: string;
  type: 'dynamic-import' | 'static-import' | 'dom-query' | 'string-reference';
  source_line?: string;
  exists_in_index: boolean;
}

export interface AnalyzeBlockDependenciesOutput {
  block_name: string;
  project: string;
  resolved_from: 'child-project' | 'milo-core' | 'not-found';
  dependencies: Dependency[];
  reverse_dependencies?: { name: string; type: string }[];
}

// Regex patterns prioritized for Milo's vanilla-JS / EDS runtime conventions
const DYNAMIC_IMPORT_RE = /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const STATIC_IMPORT_RE = /import\s+.*from\s+['"]([^'"]+)['"]/g;
const QUERY_SELECTOR_RE = /querySelector(?:All)?\(\s*['"][^'"]*\.([\w-]+)/g;

/** Extract a block name from an import path like `../../features/modal/modal.js` -> `modal` */
function blockNameFromPath(importPath: string): string | null {
  // Strip query params and hash
  const clean = importPath.split('?')[0].split('#')[0];
  // Get the last directory component before the filename
  const parts = clean.replace(/\.m?js$/, '').split('/');
  if (parts.length < 2) return null;
  const fileName = parts[parts.length - 1];
  const dirName = parts[parts.length - 2];
  // Convention: block files are named {dir}/{dir}.js
  if (fileName === dirName) return dirName;
  // Also handle cases where the filename itself is the block
  return fileName;
}

function extractDependencies(source: string, selfName: string, knownBlocks: Set<string>): Dependency[] {
  const deps = new Map<string, Dependency>();

  function add(name: string, type: Dependency['type'], line?: string) {
    if (name === selfName) return; // filter self-references
    if (!deps.has(name)) {
      deps.set(name, {
        name,
        type,
        source_line: line?.trim(),
        exists_in_index: knownBlocks.has(name),
      });
    }
  }

  const lines = source.split('\n');
  for (const line of lines) {
    // Dynamic imports (primary for Milo)
    for (const match of line.matchAll(DYNAMIC_IMPORT_RE)) {
      const blockName = blockNameFromPath(match[1]);
      if (blockName) add(blockName, 'dynamic-import', line);
    }

    // Static imports (rare but possible)
    for (const match of line.matchAll(STATIC_IMPORT_RE)) {
      const blockName = blockNameFromPath(match[1]);
      if (blockName) add(blockName, 'static-import', line);
    }

    // DOM class queries referencing block names
    for (const match of line.matchAll(QUERY_SELECTOR_RE)) {
      const className = match[1];
      if (knownBlocks.has(className)) {
        add(className, 'dom-query', line);
      }
    }
  }

  // String reference scan: look for known block names as string literals
  for (const blockName of knownBlocks) {
    if (blockName === selfName) continue;
    if (deps.has(blockName)) continue;
    // Match block name in string literals (single or double quotes)
    const strRe = new RegExp(`['"]${blockName}['"]`, 'g');
    for (const line of lines) {
      if (strRe.test(line)) {
        add(blockName, 'string-reference', line);
        break; // one match per block is enough
      }
    }
  }

  return Array.from(deps.values());
}

export async function analyzeBlockDependencies(
  input: AnalyzeBlockDependenciesInput,
): Promise<AnalyzeBlockDependenciesOutput> {
  const project = input.project ?? 'milo';
  const blockName = input.block_name.toLowerCase();

  const resolved = await resolveBlock({ block_name: blockName, project });

  if (resolved.source === 'not-found') {
    return {
      block_name: blockName,
      project,
      resolved_from: 'not-found',
      dependencies: [],
    };
  }

  const [owner, repo] = resolved.owner_repo.split('/');

  // Build set of known block names for validation
  const projectBlocks = blockStore.getAll(project);
  const miloBlocks = project !== 'milo' ? blockStore.getAll('milo') : [];
  const knownBlocks = new Set([
    ...projectBlocks.map((b) => b.name),
    ...miloBlocks.map((b) => b.name),
  ]);

  // Fetch JS source
  const source = await fetchFileContent(owner, repo, resolved.path);
  if (!source) {
    return {
      block_name: blockName,
      project,
      resolved_from: resolved.source,
      dependencies: [],
    };
  }

  const dependencies = extractDependencies(source, blockName, knownBlocks);

  const output: AnalyzeBlockDependenciesOutput = {
    block_name: blockName,
    project,
    resolved_from: resolved.source,
    dependencies,
  };

  // Reverse dependencies: scan all blocks in the same project
  if (input.include_reverse) {
    const limit = pLimit(5);
    const blocks = blockStore.getAll(project);
    const reverseDeps: { name: string; type: string }[] = [];

    await Promise.allSettled(
      blocks
        .filter((b) => b.name !== blockName)
        .map((b) =>
          limit(async () => {
            const bResolved = await resolveBlock({ block_name: b.name, project });
            if (bResolved.source === 'not-found') return;
            const [bOwner, bRepo] = bResolved.owner_repo.split('/');
            const bSource = await fetchFileContent(bOwner, bRepo, bResolved.path);
            if (!bSource) return;

            const bDeps = extractDependencies(bSource, b.name, knownBlocks);
            const refersToTarget = bDeps.find((d) => d.name === blockName);
            if (refersToTarget) {
              reverseDeps.push({ name: b.name, type: refersToTarget.type });
            }
          }),
        ),
    );

    output.reverse_dependencies = reverseDeps;
  }

  return output;
}
