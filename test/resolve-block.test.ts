import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the github client before importing the tool
vi.mock('../src/github/client.js', () => ({
  getOctokit: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { resolveBlock } from '../src/tools/resolve-block.js';
import { getOctokit } from '../src/github/client.js';

const mockOctokit = {
  repos: {
    getContent: vi.fn(),
  },
};

beforeEach(() => {
  vi.mocked(getOctokit).mockReturnValue(mockOctokit as never);
  mockOctokit.repos.getContent.mockReset();
});

describe('resolveBlock', () => {
  it('returns child-project when block exists in child repo', async () => {
    // First call: child repo JS file → exists
    mockOctokit.repos.getContent
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } })
      // Second call: fstab.yaml
      .mockResolvedValueOnce({
        data: {
          type: 'file',
          content: Buffer.from('mountpoints:\n  /libs: https://main--milo--adobecom.aem.live/libs').toString('base64'),
        },
      });

    const result = await resolveBlock({ block_name: 'custom-hero', project: 'da-bacom' });

    expect(result.source).toBe('child-project');
    expect(result.owner_repo).toBe('adobecom/da-bacom');
    expect(result.path).toContain('custom-hero');
    expect(result.milo_version).toBe('main');
  });

  it('falls back to milo-core when block is not in child repo', async () => {
    // First call: child JS → 404
    mockOctokit.repos.getContent
      .mockRejectedValueOnce({ status: 404 })
      // Second call: milo core JS → exists
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } });

    const result = await resolveBlock({ block_name: 'accordion', project: 'da-bacom' });

    expect(result.source).toBe('milo-core');
    expect(result.owner_repo).toBe('adobecom/milo');
    expect(result.path).toContain('accordion');
    expect(result.milo_version).toBeNull();
  });

  it('returns not-found when block exists in neither repo', async () => {
    mockOctokit.repos.getContent
      .mockRejectedValueOnce({ status: 404 }) // child
      .mockRejectedValueOnce({ status: 404 }); // milo core

    const result = await resolveBlock({ block_name: 'nonexistent-block', project: 'da-bacom' });

    expect(result.source).toBe('not-found');
    expect(result.owner_repo).toBe('');
    expect(result.path).toBe('');
  });

  it('goes directly to milo-core when project is "milo"', async () => {
    mockOctokit.repos.getContent
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } });

    const result = await resolveBlock({ block_name: 'accordion' }); // default project = milo

    expect(result.source).toBe('milo-core');
    expect(result.owner_repo).toBe('adobecom/milo');
  });
});
