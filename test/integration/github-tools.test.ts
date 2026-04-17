import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';

import { resolveBlock } from '../../src/tools/resolve-block.js';
import { getBlockLocation } from '../../src/tools/get-block-location.js';
import { getBlockRepoOwner } from '../../src/tools/get-block-repo-owner.js';
import { getBlockCodeowner } from '../../src/tools/get-block-codeowner.js';
import { getBlock } from '../../src/tools/get-block.js';
import { listBlocks } from '../../src/tools/list-blocks.js';
import { getBlockHistory } from '../../src/tools/get-block-history.js';
import { getPreviewUrl } from '../../src/tools/get-preview-url.js';
import { config } from '../../src/config.js';

beforeAll(() => {
  if (!config.githubToken) {
    throw new Error(
      'GITHUB_TOKEN not set. Integration tests require a real token. ' +
        'Add it to .env or export it in your shell.',
    );
  }
});

// ---------------------------------------------------------------------------
// resolveBlock
// ---------------------------------------------------------------------------

describe('resolveBlock (live)', () => {
  it('resolves accordion to milo-core', async () => {
    const result = await resolveBlock({ block_name: 'accordion' });
    expect(result.source).toBe('milo-core');
    expect(result.owner_repo).toBe('adobecom/milo');
    expect(result.path).toBe('libs/blocks/accordion/accordion.js');
  });

  it('resolves accordion in milo project explicitly', async () => {
    const result = await resolveBlock({ block_name: 'accordion', project: 'milo' });
    expect(result.source).toBe('milo-core');
    expect(result.owner_repo).toBe('adobecom/milo');
  });

  it('returns not-found for a nonexistent block', async () => {
    const result = await resolveBlock({ block_name: 'xyz-does-not-exist-99' });
    expect(result.source).toBe('not-found');
    expect(result.owner_repo).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getBlockLocation
// ---------------------------------------------------------------------------

describe('getBlockLocation (live)', () => {
  it('returns path and github_url for marquee in milo', async () => {
    const result = await getBlockLocation({ block_name: 'marquee' });
    expect(result.source).toBe('milo-core');
    expect(result.owner).toBe('adobecom');
    expect(result.repo).toBe('milo');
    expect(result.path).toBe('libs/blocks/marquee/marquee.js');
    expect(result.block_directory).toBe('libs/blocks/marquee');
    expect(result.github_url).toContain('github.com/adobecom/milo');
  });

  it('returns not-found for nonexistent block', async () => {
    const result = await getBlockLocation({ block_name: 'xyz-fake-block-777' });
    expect(result.source).toBe('not-found');
    expect(result.github_url).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getBlockRepoOwner
// ---------------------------------------------------------------------------

describe('getBlockRepoOwner (live)', () => {
  it('maps accordion to milo project key', async () => {
    const result = await getBlockRepoOwner({ block_name: 'accordion' });
    expect(result.project).toBe('milo');
    expect(result.org).toBe('adobecom');
    expect(result.repo).toBe('milo');
    expect(result.source).toBe('milo-core');
  });

  it('returns not-found for nonexistent block', async () => {
    const result = await getBlockRepoOwner({ block_name: 'xyz-nonexistent-block-42' });
    expect(result.source).toBe('not-found');
  });
});

// ---------------------------------------------------------------------------
// getBlockCodeowner
// ---------------------------------------------------------------------------

describe('getBlockCodeowner (live)', () => {
  it('returns CODEOWNERS data and commit activity for accordion', async () => {
    const result = await getBlockCodeowner({ block_name: 'accordion' });

    // We expect at least some ownership data from the live repo
    expect(result.codeowners_repo).toBe('adobecom/milo');
    expect(result.commits_repo).toBe('adobecom/milo');
    expect(result.commits_path).toBe('libs/blocks/accordion');

    // Should have at least one active contributor for a well-established block
    expect(result.active_contributors.length).toBeGreaterThan(0);
    for (const c of result.active_contributors) {
      expect(c.login).toBeTruthy();
      expect(c.commit_count).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getBlock
// ---------------------------------------------------------------------------

describe('getBlock (live)', () => {
  it('returns metadata for marquee without source', async () => {
    const result = await getBlock({ block_name: 'marquee' });
    expect(result.name).toBe('marquee');
    expect(result.repo).toBe('milo');
    expect(result.path).toBe('libs/blocks/marquee/marquee.js');
    expect(result.resolved_from).toBe('milo-core');
    expect(result.last_modified).toBeTruthy();
    // Source not requested
    expect(result.source).toBeUndefined();
    expect(result.css).toBeUndefined();
  });

  it('returns JS source when include_source is true', async () => {
    const result = await getBlock({ block_name: 'marquee', include_source: true });
    expect(result.source).toBeTruthy();
    expect(result.source).toContain('export'); // JS file should have an export
  });

  it('returns CSS when include_css is true', async () => {
    const result = await getBlock({ block_name: 'marquee', include_css: true });
    expect(result.css).toBeTruthy();
  });

  it('returns not-found for nonexistent block', async () => {
    const result = await getBlock({ block_name: 'zzz-no-such-block-999' });
    expect(result.resolved_from).toBe('not-found');
    expect(result.repo).toBe('');
  });
});

// ---------------------------------------------------------------------------
// listBlocks
// ---------------------------------------------------------------------------

describe('listBlocks (live)', () => {
  it('lists milo core blocks', async () => {
    const result = await listBlocks({ project: 'milo' });
    expect(result.total).toBeGreaterThan(10); // milo has many blocks
    expect(result.blocks.length).toBe(result.total);

    // Spot-check known blocks
    const names = result.blocks.map((b) => b.name);
    expect(names).toContain('accordion');
    expect(names).toContain('marquee');

    for (const block of result.blocks) {
      expect(block.repo).toBe('milo');
      expect(block.path).toBeTruthy();
      expect(block.is_override).toBe(false); // milo blocks are never overrides
    }
  });

  it('lists blocks for a child project', async () => {
    const result = await listBlocks({ project: 'da-bacom' });
    expect(result.total).toBeGreaterThan(0);

    for (const block of result.blocks) {
      expect(block.repo).toBe('da-bacom');
    }
  });

  it('computes override lag for child project', async () => {
    const result = await listBlocks({ project: 'da-bacom', include_child_overrides: true });
    expect(result.total).toBeGreaterThan(0);

    const overrides = result.blocks.filter((b) => b.is_override);
    // da-bacom should have at least some overrides of milo core blocks
    expect(overrides.length).toBeGreaterThan(0);

    for (const block of overrides) {
      expect(block.override_lag_days).toBeDefined();
      expect(typeof block.override_lag_days).toBe('number');
      expect(block.child_last_modified).toBeTruthy();
      expect(block.milo_last_modified).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// getBlockHistory
// ---------------------------------------------------------------------------

describe('getBlockHistory (live)', () => {
  it('returns commit history for accordion', async () => {
    const result = await getBlockHistory({ block_name: 'accordion', limit: 5 });
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits.length).toBeLessThanOrEqual(5);

    for (const commit of result.commits) {
      expect(commit.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(commit.message).toBeTruthy();
      expect(commit.date).toBeTruthy();
      expect(commit.url).toContain('github.com');
    }
  });

  it('returns empty commits for nonexistent block', async () => {
    const result = await getBlockHistory({ block_name: 'zzz-no-block-at-all' });
    expect(result.commits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPreviewUrl (pure function, no network, but included for completeness)
// ---------------------------------------------------------------------------

describe('getPreviewUrl', () => {
  it('generates correct stage URL', () => {
    const result = getPreviewUrl({ project: 'da-bacom' });
    expect(result.url).toBe('https://main--da-bacom--adobecom.aem.page');
  });

  it('generates live URL with branch and path', () => {
    const result = getPreviewUrl({
      project: 'da-bacom',
      branch: 'feat-test',
      path: '/products/photoshop',
      env: 'live',
    });
    expect(result.url).toBe(
      'https://feat-test--da-bacom--adobecom.aem.live/products/photoshop',
    );
  });

  it('appends milolibs query param', () => {
    const result = getPreviewUrl({ project: 'da-bacom', milo_branch: 'my-branch' });
    expect(result.milo_override_url).toContain('milolibs=my-branch');
  });
});
