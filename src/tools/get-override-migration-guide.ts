import { getOctokit, withRetry } from '../github/client.js';
import { fetchFileContent, getLastCommitDate, lagDays } from '../github/file-utils.js';
import { registry } from '../registry.js';
import { completeJSON } from '../llm/client.js';
import { config } from '../config.js';
import type { CommitSummary } from './get-block-history.js';

export interface GetOverrideMigrationGuideInput {
  block_name: string;
  project: string;
  include_diff?: boolean;
  summarize?: boolean;
}

interface MigrationSummary {
  breaking_changes: string[];
  non_breaking_changes: string[];
  migration_steps: string[];
  risk_level: 'low' | 'medium' | 'high';
}

export interface GetOverrideMigrationGuideOutput {
  block_name: string;
  project: string;
  child_last_modified: string;
  milo_last_modified: string;
  lag_days: number;
  milo_commits_since: CommitSummary[];
  truncated?: boolean;
  diff?: {
    child_js: string;
    milo_js: string;
    child_css?: string;
    milo_css?: string;
  };
  summary?: MigrationSummary;
  warning?: string;
}

async function fetchCommitsSince(
  owner: string,
  repo: string,
  path: string,
  since: string,
): Promise<{ commits: CommitSummary[]; truncated: boolean }> {
  try {
    const { data } = await withRetry(() =>
      getOctokit().repos.listCommits({ owner, repo, path, since, per_page: 50 }),
    );

    const commits: CommitSummary[] = data.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author?.name ?? c.commit.committer?.name ?? '',
      date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
      url: c.html_url,
    }));

    return { commits, truncated: data.length === 50 };
  } catch {
    return { commits: [], truncated: false };
  }
}

export async function getOverrideMigrationGuide(
  input: GetOverrideMigrationGuideInput,
): Promise<GetOverrideMigrationGuideOutput> {
  const blockName = input.block_name.toLowerCase();
  const project = input.project;
  const shouldSummarize = input.summarize ?? true;

  if (project === 'milo') {
    throw new Error('Migration guides only apply to child project overrides, not "milo" itself.');
  }

  const proj = registry.get(project);
  const milo = registry.get('milo');

  const childJsPath = `${proj.blocksPath}/${blockName}/${blockName}.js`;
  const miloJsPath = `${milo.blocksPath}/${blockName}/${blockName}.js`;
  const childCssPath = `${proj.blocksPath}/${blockName}/${blockName}.css`;
  const miloCssPath = `${milo.blocksPath}/${blockName}/${blockName}.css`;

  // Verify block exists in both repos
  const [childExists, miloExists] = await Promise.all([
    fetchFileContent(proj.owner, proj.repo, childJsPath).then((c) => c !== null),
    fetchFileContent(milo.owner, milo.repo, miloJsPath).then((c) => c !== null),
  ]);

  if (!childExists) {
    throw new Error(`Block "${blockName}" not found in ${project} at ${childJsPath}`);
  }
  if (!miloExists) {
    throw new Error(
      `Block "${blockName}" does not exist in Milo core — it is not an override.`,
    );
  }

  // Get last commit dates
  const [childDate, miloDate] = await Promise.all([
    getLastCommitDate(proj.owner, proj.repo, childJsPath),
    getLastCommitDate(milo.owner, milo.repo, miloJsPath),
  ]);

  const lag = lagDays(childDate, miloDate);

  // Fetch Milo commits since child was last updated (JS + CSS, deduped)
  let allCommits: CommitSummary[] = [];
  let truncated = false;

  if (childDate) {
    const [jsResult, cssResult] = await Promise.all([
      fetchCommitsSince(milo.owner, milo.repo, miloJsPath, childDate),
      fetchCommitsSince(milo.owner, milo.repo, miloCssPath, childDate),
    ]);

    // Merge and dedupe by sha
    const seen = new Set<string>();
    for (const c of [...jsResult.commits, ...cssResult.commits]) {
      if (!seen.has(c.sha)) {
        seen.add(c.sha);
        allCommits.push(c);
      }
    }
    // Sort by date descending
    allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    truncated = jsResult.truncated || cssResult.truncated;
  }

  const output: GetOverrideMigrationGuideOutput = {
    block_name: blockName,
    project,
    child_last_modified: childDate,
    milo_last_modified: miloDate,
    lag_days: lag,
    milo_commits_since: allCommits,
  };

  if (truncated) {
    output.truncated = true;
  }

  // Optional: include source files for comparison
  if (input.include_diff) {
    const [childJs, miloJs, childCss, miloCss] = await Promise.all([
      fetchFileContent(proj.owner, proj.repo, childJsPath),
      fetchFileContent(milo.owner, milo.repo, miloJsPath),
      fetchFileContent(proj.owner, proj.repo, childCssPath),
      fetchFileContent(milo.owner, milo.repo, miloCssPath),
    ]);

    output.diff = {
      child_js: childJs ?? '',
      milo_js: miloJs ?? '',
    };
    if (childCss || miloCss) {
      output.diff.child_css = childCss ?? '';
      output.diff.milo_css = miloCss ?? '';
    }
  }

  // Optional: LLM-generated migration summary
  if (shouldSummarize && allCommits.length > 0 && config.anthropicApiKey) {
    try {
      const commitList = allCommits
        .slice(0, 30) // cap context for LLM
        .map((c) => `- ${c.date}: ${c.message} (${c.author})`)
        .join('\n');

      const prompt = `You are analyzing changes to a Milo block ("${blockName}") in adobecom/milo.

A child project ("${project}") overrides this block. The child's override was last updated on ${childDate}.
Since then, Milo core has had these commits:

${commitList}

Classify each change as breaking or non-breaking and produce migration steps for updating the child's override.

Respond as JSON with this exact structure:
{
  "breaking_changes": ["description of each breaking change"],
  "non_breaking_changes": ["description of each non-breaking change"],
  "migration_steps": ["step 1", "step 2", ...],
  "risk_level": "low" | "medium" | "high"
}

Guidelines:
- Breaking: renamed exports, changed function signatures, removed features, restructured DOM
- Non-breaking: bug fixes, performance improvements, new optional features, style tweaks
- Risk is "high" if there are breaking changes, "medium" if many non-breaking changes, "low" otherwise`;

      output.summary = await completeJSON<MigrationSummary>(prompt, 1024);
    } catch {
      output.warning = 'LLM summarization failed — returning raw commit data only.';
    }
  } else if (shouldSummarize && !config.anthropicApiKey) {
    output.warning = 'ANTHROPIC_API_KEY not set — skipping LLM summarization.';
  }

  return output;
}
