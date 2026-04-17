import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock github client
vi.mock('../src/github/client.js', () => ({
  getOctokit: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

// Mock registry
vi.mock('../src/registry.js', () => {
  const reg = {
    has: vi.fn(),
    isDefault: vi.fn(),
    get: vi.fn(),
    add: vi.fn(),
    saveCustom: vi.fn(),
  };
  return { registry: reg };
});

// Mock builder
vi.mock('../src/index/builder.js', () => ({
  buildIndex: vi.fn(),
  DEFAULT_CACHE_PATH: '/tmp/test-cache.json',
  isIndexing: vi.fn(() => false),
  setIndexing: vi.fn(),
}));

// Mock store
vi.mock('../src/index/store.js', () => ({
  blockStore: {
    clear: vi.fn(),
    getAll: vi.fn(() => [{ name: 'block-a' }, { name: 'block-b' }]),
  },
}));

// Mock cache
vi.mock('../src/index/cache.js', () => ({
  saveCache: vi.fn(),
}));

// Mock config
vi.mock('../src/config.js', () => ({
  CUSTOM_PROJECTS_PATH: '/tmp/test-custom.json',
}));

import { addProject } from '../src/tools/add-project.js';
import { getOctokit } from '../src/github/client.js';
import { isIndexing } from '../src/index/builder.js';

const mockOctokit = {
  repos: {
    get: vi.fn(),
    getContent: vi.fn(),
  },
};

beforeEach(() => {
  vi.mocked(getOctokit).mockReturnValue(mockOctokit as never);
  mockOctokit.repos.get.mockReset();
  mockOctokit.repos.getContent.mockReset();
  vi.mocked(isIndexing).mockReturnValue(false);
});

describe('addProject', () => {
  it('rejects invalid project names', async () => {
    await expect(addProject({ name: 'Bad Name!', repo: 'r' })).rejects.toThrow('Invalid project name');
  });

  it('returns index_busy when indexing is in progress', async () => {
    vi.mocked(isIndexing).mockReturnValue(true);
    const result = await addProject({ name: 'test', repo: 'test-repo' });
    expect(result.status).toBe('index_busy');
  });

  it('rejects when repo does not exist', async () => {
    mockOctokit.repos.get.mockRejectedValue(new Error('Not Found'));
    await expect(addProject({ name: 'test', repo: 'nonexistent' })).rejects.toThrow('not found or not accessible');
  });

  it('rejects when blocks_path is not a directory', async () => {
    mockOctokit.repos.get.mockResolvedValue({});
    mockOctokit.repos.getContent.mockResolvedValue({ data: { type: 'file' } });
    await expect(addProject({ name: 'test', repo: 'test-repo', blocks_path: 'file.js' })).rejects.toThrow(
      'is not a directory',
    );
  });

  it('successfully adds a project', async () => {
    mockOctokit.repos.get.mockResolvedValue({});
    mockOctokit.repos.getContent.mockResolvedValue({ data: [{ name: 'block-a', type: 'dir' }] });

    const result = await addProject({ name: 'my-proj', repo: 'my-repo' });
    expect(result.status).toBe('added');
    expect(result.project).toBe('my-proj');
    expect(result.indexed_blocks).toBe(2);
  });
});
