import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { KNOWN_PROJECTS, type ProjectConfig } from './config.js';

interface CustomProjectsFile {
  version: string;
  projects: Record<string, ProjectConfig>;
}

export class ProjectRegistry {
  private defaults: Readonly<Record<string, ProjectConfig>>;
  private custom: Map<string, ProjectConfig> = new Map();

  constructor(defaults: Record<string, ProjectConfig>) {
    this.defaults = Object.freeze({ ...defaults });
  }

  get(name: string): ProjectConfig {
    const custom = this.custom.get(name);
    if (custom) return custom;
    const def = this.defaults[name];
    if (def) return def;
    throw new Error(
      `Unknown project: "${name}". Known projects: ${this.allKeys().join(', ')}`,
    );
  }

  has(name: string): boolean {
    return this.custom.has(name) || name in this.defaults;
  }

  getAll(): Record<string, ProjectConfig> {
    const merged: Record<string, ProjectConfig> = { ...this.defaults };
    for (const [k, v] of this.custom) {
      merged[k] = v;
    }
    return merged;
  }

  allKeys(): string[] {
    const keys = new Set([
      ...Object.keys(this.defaults),
      ...this.custom.keys(),
    ]);
    return [...keys].sort();
  }

  add(name: string, config: ProjectConfig): void {
    this.custom.set(name, config);
  }

  /**
   * Remove a custom project entry.
   * Returns 'removed' for pure custom, 'reverted_to_default' when a default
   * re-emerges, 'cannot_remove_default' for default-only, 'not_found' otherwise.
   */
  remove(name: string): 'removed' | 'reverted_to_default' | 'cannot_remove_default' | 'not_found' {
    const wasCustom = this.custom.has(name);
    const isDefault = name in this.defaults;

    if (!wasCustom && !isDefault) return 'not_found';
    if (!wasCustom && isDefault) return 'cannot_remove_default';

    this.custom.delete(name);
    return isDefault ? 'reverted_to_default' : 'removed';
  }

  isCustom(name: string): boolean {
    return this.custom.has(name);
  }

  isDefault(name: string): boolean {
    return name in this.defaults;
  }

  /** Source label for list_projects display. */
  source(name: string): 'default' | 'custom' | 'custom_override' {
    const custom = this.custom.has(name);
    const def = name in this.defaults;
    if (custom && def) return 'custom_override';
    if (custom) return 'custom';
    return 'default';
  }

  customKeys(): string[] {
    return [...this.custom.keys()];
  }

  loadCustom(path: string): void {
    try {
      if (!existsSync(path)) return;
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw) as CustomProjectsFile;
      if (data.version !== '1') return;
      for (const [name, config] of Object.entries(data.projects)) {
        this.custom.set(name, config);
      }
    } catch {
      // Silently ignore corrupt/missing file — start with defaults only
    }
  }

  saveCustom(path: string): void {
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const data: CustomProjectsFile = {
        version: '1',
        projects: Object.fromEntries(this.custom),
      };
      writeFileSync(path, JSON.stringify(data, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[milo-mcp] Failed to save custom projects: ${msg}\n`);
    }
  }
}

export const registry = new ProjectRegistry(KNOWN_PROJECTS);
