import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/github/client.js', () => ({
  getOctokit: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { listBlocks } from '../src/tools/list-blocks.js';
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
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { repository: { root: null, gh: null } } }),
    }),
  );
});

// Helper: encode directory listing response
function dirListing(names: string[]) {
  return { data: names.map((name) => ({ name, path: `blocks/${name}`, type: 'dir' })) };
}

function miloDirListing(names: string[]) {
  return { data: names.map((name) => ({ name, path: `libs/blocks/${name}`, type: 'dir' })) };
}

function commitResponse(date: string) {
  return { data: [{ commit: { committer: { date }, author: { date } } }] };
}

describe('listBlocks', () => {
  it('returns blocks without override info when include_child_overrides is false', async () => {
    mockOctokit.repos.getContent.mockResolvedValueOnce(dirListing(['custom-hero', 'accordion']));

    const result = await listBlocks({ project: 'da-bacom' });

    expect(result.total).toBe(2);
    expect(result.blocks[0].is_override).toBe(false);
    expect(result.blocks[0].override_lag_days).toBeUndefined();
  });

  it('detects override blocks and computes lag_days when child is behind milo', async () => {
    // Call order: 1) da-bacom blocks, 2) milo blocks, then commit dates (CODEOWNERS via GraphQL fetch)
    mockOctokit.repos.getContent
      .mockResolvedValueOnce(dirListing(['accordion', 'custom-hero']))    // 1: da-bacom blocks
      .mockResolvedValueOnce(miloDirListing(['accordion', 'marquee']));  // 2: milo blocks

    // Commit dates for accordion in da-bacom and milo
    const childDate = '2024-01-01T00:00:00Z';
    const miloDate  = '2024-06-01T00:00:00Z'; // 152 days later
    mockOctokit.repos.listCommits
      .mockResolvedValueOnce(commitResponse(childDate))  // child accordion
      .mockResolvedValueOnce(commitResponse(miloDate));  // milo accordion

    const result = await listBlocks({ project: 'da-bacom', include_child_overrides: true });

    const accordion = result.blocks.find((b) => b.name === 'accordion');
    const customHero = result.blocks.find((b) => b.name === 'custom-hero');

    expect(accordion?.is_override).toBe(true);
    expect(accordion?.override_lag_days).toBe(152);
    expect(accordion?.child_last_modified).toBe(childDate);

    expect(customHero?.is_override).toBe(false);
    expect(customHero?.override_lag_days).toBeUndefined();
  });

  it('reports lag_days=0 when child override is newer than milo', async () => {
    mockOctokit.repos.getContent
      .mockResolvedValueOnce(dirListing(['accordion']))          // 1: da-bacom blocks
      .mockResolvedValueOnce(miloDirListing(['accordion']));     // 2: milo blocks

    const childDate = '2024-06-01T00:00:00Z'; // child is NEWER
    const miloDate  = '2024-01-01T00:00:00Z';
    mockOctokit.repos.listCommits
      .mockResolvedValueOnce(commitResponse(childDate))
      .mockResolvedValueOnce(commitResponse(miloDate));

    const result = await listBlocks({ project: 'da-bacom', include_child_overrides: true });

    expect(result.blocks[0].is_override).toBe(true);
    expect(result.blocks[0].override_lag_days).toBe(0);
  });

  it('returns empty list when project has no blocks directory', async () => {
    mockOctokit.repos.getContent.mockRejectedValueOnce({ status: 404 });

    const result = await listBlocks({ project: 'da-bacom', include_child_overrides: true });

    expect(result.blocks).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('does not fetch override data when project is milo', async () => {
    mockOctokit.repos.getContent.mockResolvedValueOnce(miloDirListing(['accordion', 'carousel']));

    const result = await listBlocks({ project: 'milo', include_child_overrides: true });

    expect(result.total).toBe(2);
    expect(result.blocks.every((b) => !b.is_override)).toBe(true);
    // Should NOT call listCommits — no override comparison for milo itself
    expect(mockOctokit.repos.listCommits).not.toHaveBeenCalled();
  });
});
