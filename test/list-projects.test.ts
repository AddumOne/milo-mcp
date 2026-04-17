import { describe, it, expect, vi } from 'vitest';

const { mockRegistry, mockBlockStore } = vi.hoisted(() => ({
  mockRegistry: {
    getAll: vi.fn(() => ({
      milo: { owner: 'adobecom', repo: 'milo', blocksPath: 'libs/blocks' },
      'my-proj': { owner: 'org', repo: 'my-proj', blocksPath: 'blocks' },
    })),
    allKeys: vi.fn(() => ['milo', 'my-proj']),
    source: vi.fn((name: string) => (name === 'milo' ? 'default' : 'custom')),
  },
  mockBlockStore: {
    getAll: vi.fn((project?: string) => {
      if (project === 'milo') return [{ name: 'a' }, { name: 'b' }];
      if (project === 'my-proj') return [{ name: 'c' }];
      return [];
    }),
  },
}));

vi.mock('../src/registry.js', () => ({ registry: mockRegistry }));
vi.mock('../src/index/store.js', () => ({ blockStore: mockBlockStore }));

import { listProjects } from '../src/tools/list-projects.js';

describe('listProjects', () => {
  it('returns all projects with source and block count', () => {
    const result = listProjects();
    expect(result.total).toBe(2);
    expect(result.projects[0]).toEqual({
      name: 'milo',
      owner: 'adobecom',
      repo: 'milo',
      blocks_path: 'libs/blocks',
      source: 'default',
      indexed_blocks: 2,
    });
    expect(result.projects[1]).toEqual({
      name: 'my-proj',
      owner: 'org',
      repo: 'my-proj',
      blocks_path: 'blocks',
      source: 'custom',
      indexed_blocks: 1,
    });
  });
});
