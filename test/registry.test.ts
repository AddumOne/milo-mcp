import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProjectRegistry } from '../src/registry.js';

const DEFAULTS = {
  milo: { owner: 'adobecom', repo: 'milo', blocksPath: 'libs/blocks' },
  bacom: { owner: 'adobecom', repo: 'bacom', blocksPath: 'blocks' },
};

let registry: ProjectRegistry;
let tmpDir: string;
let customPath: string;

beforeEach(() => {
  registry = new ProjectRegistry(DEFAULTS);
  tmpDir = join(tmpdir(), `milo-mcp-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  customPath = join(tmpDir, 'custom-projects.json');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe('ProjectRegistry', () => {
  describe('get', () => {
    it('returns a default project', () => {
      const proj = registry.get('milo');
      expect(proj.repo).toBe('milo');
      expect(proj.blocksPath).toBe('libs/blocks');
    });

    it('throws for unknown project with helpful message', () => {
      expect(() => registry.get('nope')).toThrow('Unknown project: "nope"');
      expect(() => registry.get('nope')).toThrow('milo');
    });

    it('returns custom project over default when shadowing', () => {
      registry.add('bacom', { owner: 'adobecom', repo: 'bacom', blocksPath: 'custom/blocks' });
      expect(registry.get('bacom').blocksPath).toBe('custom/blocks');
    });
  });

  describe('has', () => {
    it('returns true for defaults', () => {
      expect(registry.has('milo')).toBe(true);
    });

    it('returns true for custom', () => {
      registry.add('new-proj', { owner: 'org', repo: 'new-proj', blocksPath: 'blocks' });
      expect(registry.has('new-proj')).toBe(true);
    });

    it('returns false for unknown', () => {
      expect(registry.has('nope')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('merges defaults and custom with custom winning', () => {
      registry.add('bacom', { owner: 'adobecom', repo: 'bacom', blocksPath: 'override' });
      registry.add('new-proj', { owner: 'org', repo: 'new', blocksPath: 'b' });
      const all = registry.getAll();
      expect(all['milo'].blocksPath).toBe('libs/blocks');
      expect(all['bacom'].blocksPath).toBe('override');
      expect(all['new-proj'].blocksPath).toBe('b');
    });
  });

  describe('allKeys', () => {
    it('returns sorted union of defaults and custom', () => {
      registry.add('aaa', { owner: 'o', repo: 'r', blocksPath: 'b' });
      const keys = registry.allKeys();
      expect(keys[0]).toBe('aaa');
      expect(keys).toContain('milo');
      expect(keys).toContain('bacom');
    });
  });

  describe('add + remove', () => {
    it('adds a pure custom project and removes it', () => {
      registry.add('new-proj', { owner: 'o', repo: 'r', blocksPath: 'b' });
      expect(registry.has('new-proj')).toBe(true);
      expect(registry.remove('new-proj')).toBe('removed');
      expect(registry.has('new-proj')).toBe(false);
    });

    it('returns reverted_to_default when removing a shadow of a default', () => {
      registry.add('bacom', { owner: 'adobecom', repo: 'bacom', blocksPath: 'override' });
      expect(registry.source('bacom')).toBe('custom_override');
      expect(registry.remove('bacom')).toBe('reverted_to_default');
      expect(registry.has('bacom')).toBe(true);
      expect(registry.get('bacom').blocksPath).toBe('blocks'); // back to default
    });

    it('returns cannot_remove_default for a default-only project', () => {
      expect(registry.remove('milo')).toBe('cannot_remove_default');
      expect(registry.has('milo')).toBe(true);
    });

    it('returns not_found for an unknown project', () => {
      expect(registry.remove('nope')).toBe('not_found');
    });
  });

  describe('isCustom / isDefault / source', () => {
    it('identifies defaults correctly', () => {
      expect(registry.isDefault('milo')).toBe(true);
      expect(registry.isCustom('milo')).toBe(false);
      expect(registry.source('milo')).toBe('default');
    });

    it('identifies pure custom correctly', () => {
      registry.add('new-proj', { owner: 'o', repo: 'r', blocksPath: 'b' });
      expect(registry.isDefault('new-proj')).toBe(false);
      expect(registry.isCustom('new-proj')).toBe(true);
      expect(registry.source('new-proj')).toBe('custom');
    });

    it('identifies custom_override correctly', () => {
      registry.add('milo', { owner: 'adobecom', repo: 'milo', blocksPath: 'other' });
      expect(registry.isDefault('milo')).toBe(true);
      expect(registry.isCustom('milo')).toBe(true);
      expect(registry.source('milo')).toBe('custom_override');
    });
  });

  describe('persistence', () => {
    it('saves and loads custom projects', () => {
      registry.add('proj-a', { owner: 'o', repo: 'a', blocksPath: 'b' });
      registry.add('proj-b', { owner: 'o', repo: 'b', blocksPath: 'b2' });
      registry.saveCustom(customPath);

      const fresh = new ProjectRegistry(DEFAULTS);
      expect(fresh.has('proj-a')).toBe(false);
      fresh.loadCustom(customPath);
      expect(fresh.has('proj-a')).toBe(true);
      expect(fresh.get('proj-b').blocksPath).toBe('b2');
    });

    it('handles missing file gracefully', () => {
      registry.loadCustom(join(tmpDir, 'nonexistent.json'));
      // should not throw, just no custom projects loaded
      expect(registry.allKeys()).toEqual(['bacom', 'milo']);
    });

    it('handles corrupt file gracefully', () => {
      writeFileSync(customPath, 'not json');
      registry.loadCustom(customPath);
      expect(registry.allKeys()).toEqual(['bacom', 'milo']);
    });

    it('error message includes custom projects after load', () => {
      registry.add('zzz-proj', { owner: 'o', repo: 'r', blocksPath: 'b' });
      expect(() => registry.get('nope')).toThrow('zzz-proj');
    });
  });
});
