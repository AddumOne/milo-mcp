import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/llm/client.js', () => ({
  complete: vi.fn(),
  completeJSON: vi.fn(),
}));

vi.mock('../src/config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
    cragThreshold: 0.6,
    cosineGap: 0.20,
  },
}));

import { cragValidate } from '../src/rag/retrieval/corrective.js';
import { complete } from '../src/llm/client.js';
import type { BlockEntry } from '../src/index/store.js';

function makeBlock(name: string, description = ''): BlockEntry {
  return {
    name,
    repo: 'milo',
    owner: 'adobecom',
    project: 'milo',
    path: `libs/blocks/${name}/${name}.js`,
    description,
    owners: [],
  };
}

beforeEach(() => {
  vi.mocked(complete).mockReset();
});

describe('cragValidate', () => {
  it('returns passing candidates (YES responses) above threshold', async () => {
    const blocks = [
      makeBlock('accordion', 'expandable sections'),
      makeBlock('collapse', 'collapsible content'),
      makeBlock('carousel', 'rotating content'),
    ];

    // YES YES NO
    vi.mocked(complete)
      .mockResolvedValueOnce('YES')
      .mockResolvedValueOnce('YES')
      .mockResolvedValueOnce('NO');

    const result = await cragValidate('expandable content', blocks);

    expect(result.fallback_used).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].crag_score).toBe(0.85);
  });

  it('sets fallback_used when fewer than 2 candidates pass', async () => {
    const blocks = [makeBlock('accordion'), makeBlock('carousel'), makeBlock('tabs')];

    // YES NO NO
    vi.mocked(complete)
      .mockResolvedValueOnce('YES')
      .mockResolvedValueOnce('NO')
      .mockResolvedValueOnce('NO');

    const result = await cragValidate('something very specific', blocks);

    expect(result.fallback_used).toBe(true);
    expect(result.results).toHaveLength(1);
  });

  it('all YES responses return all candidates with score 0.85', async () => {
    const blocks = [makeBlock('accordion'), makeBlock('carousel'), makeBlock('tabs')];

    vi.mocked(complete).mockResolvedValue('YES');

    const result = await cragValidate('some query', blocks);

    expect(result.fallback_used).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].crag_score).toBe(0.85);
  });

  it('handles LLM errors gracefully by scoring 0 and triggering fallback', async () => {
    const blocks = [makeBlock('accordion')];

    vi.mocked(complete).mockRejectedValueOnce(new Error('LLM timeout'));

    const result = await cragValidate('accordion', blocks);

    expect(result.results).toHaveLength(0);
    expect(result.fallback_used).toBe(true);
  });
});
