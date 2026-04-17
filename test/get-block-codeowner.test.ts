import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/github/client.js', () => ({
  getOctokit: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { getBlockCodeowner } from '../src/tools/get-block-codeowner.js';
import { getOctokit } from '../src/github/client.js';

const mockOctokit = {
  repos: {
    getContent: vi.fn(),
    listCommits: vi.fn(),
  },
};

beforeEach(() => {
  vi.mocked(getOctokit).mockReturnValue(mockOctokit as never);
  mockOctokit.repos.getContent.mockReset();
  mockOctokit.repos.listCommits.mockReset();
});

describe('getBlockCodeowner', () => {
  it('uses Milo CODEOWNERS when block exists in milo and ranks human commits', async () => {
    const codeownersText = '/libs/blocks/accordion @adobecom/milo-core @human-dev\n';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              root: { text: codeownersText },
              gh: null,
            },
          },
        }),
      }),
    );

    mockOctokit.repos.getContent
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } })
      .mockResolvedValueOnce({ data: { type: 'file', content: '' } });

    mockOctokit.repos.listCommits.mockResolvedValue({
      data: [
        { author: { login: 'dependabot[bot]' }, committer: { login: 'dependabot[bot]' } },
        { author: { login: 'human-dev' }, committer: { login: 'human-dev' } },
        { author: { login: 'human-dev' }, committer: { login: 'human-dev' } },
        { author: { login: 'human-dev' }, committer: { login: 'human-dev' } },
      ],
    });

    const result = await getBlockCodeowner({ block_name: 'accordion', project: 'da-bacom' });

    expect(result.codeowners_repo).toBe('adobecom/milo');
    expect(result.declared_teams).toContain('adobecom/milo-core');
    expect(result.declared_individuals).toContain('human-dev');
    expect(result.active_contributors[0]?.login).toBe('human-dev');
    expect(result.active_contributors[0]?.commit_count).toBe(3);
    expect(result.recommended_contact).toBe('human-dev');
  });
});
