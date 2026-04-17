import { config } from '../config.js';

export interface CodeownersRule {
  pattern: string;
  handles: string[];
}

const CODEOWNERS_GRAPHQL = `
  query CodeownersFiles($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      root: object(expression: "HEAD:CODEOWNERS") {
        ... on Blob { text }
      }
      gh: object(expression: "HEAD:.github/CODEOWNERS") {
        ... on Blob { text }
      }
    }
  }
`;

interface GraphqlCodeownersResponse {
  data?: {
    repository: {
      root: { text?: string } | null;
      gh: { text?: string } | null;
    } | null;
  };
  errors?: { message: string }[];
}

/** Prefix / equality match (aligned with previous milo-mcp behavior). */
function blockDirMatchesPattern(blockDir: string, pattern: string): boolean {
  const raw = pattern.replace(/\*$/, '').trim();
  const prefix = raw.replace(/^\/+/, '').replace(/\/$/, '');
  const dir = blockDir.replace(/^\/+/, '');
  if (!prefix) return false;
  return dir === prefix || dir.startsWith(`${prefix}/`);
}

/**
 * Last matching rule in file order wins (GitHub CODEOWNERS semantics).
 */
export function ownersForBlockDirectory(blockDir: string, rules: CodeownersRule[]): string[] {
  let last: string[] = [];
  for (const rule of rules) {
    if (blockDirMatchesPattern(blockDir, rule.pattern)) {
      last = rule.handles;
    }
  }
  return last;
}

function parseCodeownersText(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(/\s+/);
    const pattern = parts[0];
    const handleParts = parts.slice(1);
    if (!pattern || handleParts.length === 0) continue;
    const handles = handleParts.map((h) => h.replace(/^@/, ''));
    rules.push({ pattern, handles });
  }
  return rules;
}

/**
 * Load CODEOWNERS via the GraphQL API so missing files do not trigger REST 404s
 * (Octokit request-log treats those as errors and clutters MCP output).
 */
export async function fetchCodeownersRules(owner: string, repo: string): Promise<CodeownersRule[]> {
  const token = config.githubToken;
  if (!token) return [];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'milo-mcp',
        },
        body: JSON.stringify({
          query: CODEOWNERS_GRAPHQL,
          variables: { owner, name: repo },
        }),
      });

      if (res.status === 429 || res.status === 403) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }

      if (!res.ok) return [];

      const json = (await res.json()) as GraphqlCodeownersResponse;
      if (json.errors?.length) return [];

      const repoData = json.data?.repository;
      if (!repoData) return [];

      const text = repoData.root?.text ?? repoData.gh?.text;
      if (!text) return [];

      return parseCodeownersText(text);
    } catch {
      return [];
    }
  }

  return [];
}

export function splitTeamsAndIndividuals(handles: string[]): {
  teams: string[];
  individuals: string[];
} {
  const teams: string[] = [];
  const individuals: string[] = [];
  for (const h of handles) {
    if (h.includes('/')) teams.push(h);
    else individuals.push(h);
  }
  return { teams, individuals };
}
