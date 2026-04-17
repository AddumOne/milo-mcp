import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/github/client.js', () => ({
  getOctokit: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { getBlockRepoOwner } from '../src/tools/get-block-repo-owner.js';
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

describe('getBlockRepoOwner', () => {
  it('maps resolved repo to project key', async () => {
    mockOctokit.repos.getContent
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } })
      .mockResolvedValueOnce({
        data: {
          type: 'file',
          content: Buffer.from('mountpoints:\n  /libs: https://main--milo--adobecom.aem.live/libs').toString('base64'),
        },
      });

    const result = await getBlockRepoOwner({ block_name: 'custom-hero', project: 'da-bacom' });

    expect(result.source).toBe('child-project');
    expect(result.project).toBe('da-bacom');
    expect(result.owner_repo).toBe('adobecom/da-bacom');
  });

  it('uses milo project key when resolution falls back to milo core', async () => {
    mockOctokit.repos.getContent
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } });

    const result = await getBlockRepoOwner({ block_name: 'accordion', project: 'da-bacom' });

    expect(result.source).toBe('milo-core');
    expect(result.project).toBe('milo');
    expect(result.owner_repo).toBe('adobecom/milo');
  });
});
