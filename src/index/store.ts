export interface BlockEntry {
  name: string;
  repo: string;
  owner: string;
  project: string;
  path: string;
  description: string;
  owners: string[];
  lastModified?: string;
  embedding?: Float32Array;
}

export class BlockStore {
  private blocks: Map<string, BlockEntry> = new Map();

  /** Key is `{project}:{name}` */
  private key(project: string, name: string): string {
    return `${project}:${name}`;
  }

  add(entry: BlockEntry): void {
    this.blocks.set(this.key(entry.project, entry.name), entry);
  }

  get(project: string, name: string): BlockEntry | undefined {
    return this.blocks.get(this.key(project, name));
  }

  getAll(project?: string): BlockEntry[] {
    const all = Array.from(this.blocks.values());
    return project ? all.filter((b) => b.project === project) : all;
  }

  has(project: string, name: string): boolean {
    return this.blocks.has(this.key(project, name));
  }

  size(): number {
    return this.blocks.size;
  }

  clear(project?: string): void {
    if (!project) {
      this.blocks.clear();
      return;
    }
    for (const [k, v] of this.blocks) {
      if (v.project === project) this.blocks.delete(k);
    }
  }
}

export const blockStore = new BlockStore();
