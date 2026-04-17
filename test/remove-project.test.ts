import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRegistry, mockBlockStore } = vi.hoisted(() => ({
  mockRegistry: {
    remove: vi.fn(),
    saveCustom: vi.fn(),
    get: vi.fn(),
  },
  mockBlockStore: {
    clear: vi.fn(),
    getAll: vi.fn(() => [{ name: 'a' }, { name: 'b' }]),
  },
}));

vi.mock('../src/registry.js', () => ({ registry: mockRegistry }));
vi.mock('../src/config.js', () => ({ CUSTOM_PROJECTS_PATH: '/tmp/test-custom.json' }));
vi.mock('../src/index/store.js', () => ({ blockStore: mockBlockStore }));
vi.mock('../src/index/builder.js', () => ({
  buildIndex: vi.fn(),
  DEFAULT_CACHE_PATH: '/tmp/test-cache.json',
  isIndexing: vi.fn(() => false),
  setIndexing: vi.fn(),
}));
vi.mock('../src/index/cache.js', () => ({ saveCache: vi.fn() }));

import { removeProject } from '../src/tools/remove-project.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('removeProject', () => {
  it('returns not_found for unknown project', async () => {
    mockRegistry.remove.mockReturnValue('not_found');
    const result = await removeProject({ name: 'nope' });
    expect(result.status).toBe('not_found');
  });

  it('returns cannot_remove_default for built-in project', async () => {
    mockRegistry.remove.mockReturnValue('cannot_remove_default');
    const result = await removeProject({ name: 'milo' });
    expect(result.status).toBe('cannot_remove_default');
  });

  it('removes a pure custom project and clears blocks', async () => {
    mockRegistry.remove.mockReturnValue('removed');
    const result = await removeProject({ name: 'my-proj' });
    expect(result.status).toBe('removed');
    expect(mockBlockStore.clear).toHaveBeenCalledWith('my-proj');
  });

  it('reverts to default and re-indexes when removing a shadow', async () => {
    mockRegistry.remove.mockReturnValue('reverted_to_default');
    const result = await removeProject({ name: 'bacom' });
    expect(result.status).toBe('reverted_to_default');
    expect(mockBlockStore.clear).toHaveBeenCalledWith('bacom');
    expect(result.note).toContain('Reverted to default');
  });
});
