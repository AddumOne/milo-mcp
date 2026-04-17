import { describe, it, expect } from 'vitest';
import { classifyQuery } from '../src/rag/classifier.js';

describe('classifyQuery', () => {
  describe('LOOKUP', () => {
    it('matches "get the accordion block"', async () => {
      expect(await classifyQuery('get the accordion block')).toBe('LOOKUP');
    });
    it('matches "show me the aside block"', async () => {
      expect(await classifyQuery('show me the aside block')).toBe('LOOKUP');
    });
    it('matches "fetch the carousel block"', async () => {
      expect(await classifyQuery('fetch the carousel block')).toBe('LOOKUP');
    });
    it('matches "what is the marquee block"', async () => {
      expect(await classifyQuery('what is the marquee block used for')).toBe('LOOKUP');
    });
  });

  describe('MULTI_SOURCE', () => {
    it('matches queries mentioning figma', async () => {
      expect(await classifyQuery('scaffold a block from this figma design')).toBe('MULTI_SOURCE');
    });
    it('matches "create a page" phrasing', async () => {
      expect(await classifyQuery('create a page with marquee and cards')).toBe('MULTI_SOURCE');
    });
    it('matches "da page"', async () => {
      expect(await classifyQuery('create a da page for the product section')).toBe('MULTI_SOURCE');
    });
  });

  describe('COMPOSITIONAL', () => {
    it('classifies multi-keyword queries', async () => {
      expect(await classifyQuery('which blocks are stale and lag behind milo')).toBe('COMPOSITIONAL');
    });
    it('classifies audit queries', async () => {
      expect(await classifyQuery('audit all blocks that override milo')).toBe('COMPOSITIONAL');
    });
    it('classifies compare queries', async () => {
      expect(await classifyQuery('compare all carousel overrides across projects')).toBe('COMPOSITIONAL');
    });
  });

  describe('SEMANTIC', () => {
    it('classifies capability descriptions', async () => {
      expect(await classifyQuery('find a block for promotional content')).toBe('SEMANTIC');
    });
    it('classifies feature-based queries', async () => {
      expect(await classifyQuery('expandable sections with collapse')).toBe('SEMANTIC');
    });
    it('classifies single keyword queries', async () => {
      expect(await classifyQuery('navigation tabs')).toBe('SEMANTIC');
    });
  });
});
