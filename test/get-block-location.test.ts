import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/github/client.js', () => ({
  getOctokit: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { getBlockLocation } from '../src/tools/get-block-location.js';
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

describe('getBlockLocation', () => {
  it('returns github_url and block_directory for milo-core block', async () => {
    mockOctokit.repos.getContent.mockResolvedValueOnce({ data: { type: 'file', content: '' } });

    const result = await getBlockLocation({ block_name: 'accordion' });

    expect(result.source).toBe('milo-core');
    expect(result.path).toBe('libs/blocks/accordion/accordion.js');
    expect(result.block_directory).toBe('libs/blocks/accordion');
    expect(result.github_url).toContain('github.com/adobecom/milo/blob/');
    expect(result.github_url).toContain('libs/blocks/accordion/accordion.js');
  });
});
