import { describe, it, expect } from 'vitest';
import {
  ownersForBlockDirectory,
  splitTeamsAndIndividuals,
} from '../src/github/codeowners.js';

describe('codeowners', () => {
  it('last matching rule wins', () => {
    const rules = [
      { pattern: '/libs/blocks', handles: ['wide'] },
      { pattern: '/libs/blocks/accordion', handles: ['narrow'] },
    ];
    expect(ownersForBlockDirectory('libs/blocks/accordion', rules)).toEqual(['narrow']);
  });

  it('splitTeamsAndIndividuals separates org teams and users', () => {
    expect(splitTeamsAndIndividuals(['adobecom/milo-core', 'alice'])).toEqual({
      teams: ['adobecom/milo-core'],
      individuals: ['alice'],
    });
  });
});
