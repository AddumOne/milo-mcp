#!/usr/bin/env node
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getBlockRepoOwner } from './tools/get-block-repo-owner.js';
import { getBlockCodeowner } from './tools/get-block-codeowner.js';
import { getBlockLocation } from './tools/get-block-location.js';
import { getBlock } from './tools/get-block.js';
import { searchBlocks } from './tools/search-blocks.js';
import { listBlocks } from './tools/list-blocks.js';
import { getBlockHistory } from './tools/get-block-history.js';
import { getPreviewUrl } from './tools/get-preview-url.js';
import { refreshIndex } from './tools/refresh-index.js';
import { analyzeBlockDependencies } from './tools/analyze-block-dependencies.js';
import { getOverrideMigrationGuide } from './tools/get-override-migration-guide.js';
import { addProject } from './tools/add-project.js';
import { removeProject } from './tools/remove-project.js';
import { listProjects } from './tools/list-projects.js';
import { checkSetupStatus } from './tools/check-setup-status.js';
import { readFstab } from './resources/fstab-reader.js';
import { buildAllIndexes } from './index/builder.js';
import { loadEvalResults } from './rag/evaluation/results.js';
import { registry } from './registry.js';
import { CUSTOM_PROJECTS_PATH, config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const GetBlockRepoOwnerSchema = z.object({
  block_name: z.string(),
  project: z.string().optional(),
});

const GetBlockCodeownerSchema = z.object({
  block_name: z.string(),
  project: z.string().optional(),
});

const GetBlockLocationSchema = z.object({
  block_name: z.string(),
  project: z.string().optional(),
});

const GetBlockSchema = z.object({
  block_name: z.string(),
  project: z.string().optional(),
  include_source: z.boolean().optional(),
  include_css: z.boolean().optional(),
  include_tests: z.boolean().optional(),
});

const SearchBlocksSchema = z.object({
  query: z.string(),
  project: z.string().optional(),
  limit: z.number().int().positive().optional(),
  explain: z.boolean().optional(),
});

const ListBlocksSchema = z.object({
  project: z.string().optional(),
  include_child_overrides: z.boolean().optional(),
});

const GetBlockHistorySchema = z.object({
  block_name: z.string(),
  project: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

const GetPreviewUrlSchema = z.object({
  project: z.string(),
  branch: z.string().optional(),
  milo_branch: z.string().optional(),
  path: z.string().optional(),
  env: z.enum(['stage', 'live']).optional(),
});

const RefreshIndexSchema = z.object({
  project: z.string().optional(),
});

const AnalyzeBlockDependenciesSchema = z.object({
  block_name: z.string(),
  project: z.string().optional(),
  include_reverse: z.boolean().optional(),
});

const GetOverrideMigrationGuideSchema = z.object({
  block_name: z.string(),
  project: z.string(),
  include_diff: z.boolean().optional(),
  summarize: z.boolean().optional(),
});

const AddProjectSchema = z.object({
  name: z.string(),
  owner: z.string().optional(),
  repo: z.string(),
  blocks_path: z.string().optional(),
});

const RemoveProjectSchema = z.object({
  name: z.string(),
});

const ListProjectsSchema = z.object({});

const CheckSetupStatusSchema = z.object({});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_block_repo_owner',
    description:
      'Which Milo ecosystem project key and GitHub org/repo the resolver maps to (same resolution as get_block_location). Use for org/repo context; prefer get_block_location when you need a file path or blob URL.',
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string', description: 'Block name (e.g. "accordion")' },
        project: { type: 'string', description: 'Project name. Default: "milo"' },
      },
      required: ['block_name'],
    },
  },
  {
    name: 'get_block_codeowner',
    description:
      'Declared CODEOWNERS teams/individuals (from adobecom/milo when the block exists in core) plus active human contributors from recent commits on the block directory. Use for contact/review routing.',
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string', description: 'Block name (e.g. "accordion")' },
        project: { type: 'string', description: 'Project name. Default: "milo"' },
      },
      required: ['block_name'],
    },
  },
  {
    name: 'get_block_location',
    description:
      'Physical path to the block main `.js` file and GitHub blob URL. Same resolver as get_block_repo_owner; use when opening or linking to source.',
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string', description: 'Block name (e.g. "accordion")' },
        project: { type: 'string', description: 'Project name. Default: "milo"' },
      },
      required: ['block_name'],
    },
  },
  {
    name: 'get_block',
    description: 'Fetch block metadata and optionally full source. Metadata-only by default.',
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string' },
        project: { type: 'string' },
        include_source: { type: 'boolean', description: 'Include JS source. Default false.' },
        include_css: { type: 'boolean', description: 'Include CSS source. Default false.' },
        include_tests: { type: 'boolean', description: 'Include Nala test file. Default false.' },
      },
      required: ['block_name'],
    },
  },
  {
    name: 'search_blocks',
    description: 'RAG-powered block discovery. Classifies the query and routes to the best technique (direct/cosine+CRAG/iterative/agentic).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query or block name' },
        project: { type: 'string', description: 'Limit search to a specific project' },
        limit: { type: 'number', description: 'Max results. Default 5.' },
        explain: { type: 'boolean', description: 'Include CRAG scores and reasoning. Default false.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_blocks',
    description: 'List all blocks in a project. With include_child_overrides=true, compares each block against Milo core and reports lag days.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name. Default: "milo"' },
        include_child_overrides: {
          type: 'boolean',
          description: 'For child projects: detect which blocks override Milo and compute override_lag_days. Default false.',
        },
      },
    },
  },
  {
    name: 'get_block_history',
    description: 'Get git commit history for a block.',
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string' },
        project: { type: 'string' },
        limit: { type: 'number', description: 'Max commits. Default 10.' },
      },
      required: ['block_name'],
    },
  },
  {
    name: 'get_preview_url',
    description: 'Generate AEM preview URLs for a branch/project combination.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name (required)' },
        branch: { type: 'string', description: 'Branch name. Default: "main"' },
        milo_branch: { type: 'string', description: 'Append ?milolibs={branch} to URL' },
        path: { type: 'string', description: 'Page path, e.g. "/products/test"' },
        env: { type: 'string', enum: ['stage', 'live'], description: 'Default: "stage"' },
      },
      required: ['project'],
    },
  },
  {
    name: 'refresh_index',
    description: 'Rebuild the block index without restarting the server. Optionally refresh a single project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Refresh only this project. Omit to rebuild all projects.' },
      },
    },
  },
  {
    name: 'analyze_block_dependencies',
    description:
      'Analyze code-level dependencies of a block — which other blocks it imports or references, and optionally which blocks depend on it. Note: include_reverse is expensive (fetches source for every block in the project).',
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string', description: 'Block name (e.g. "marquee")' },
        project: { type: 'string', description: 'Project name. Default: "milo"' },
        include_reverse: {
          type: 'boolean',
          description: 'Also find blocks that depend on this block. Expensive — scans all blocks in the project. Default false.',
        },
      },
      required: ['block_name'],
    },
  },
  {
    name: 'get_override_migration_guide',
    description:
      "For a child project's block override, show what changed in Milo core since the override was last updated. Optionally includes source comparison and LLM-generated migration steps.",
    inputSchema: {
      type: 'object',
      properties: {
        block_name: { type: 'string', description: 'Block name (e.g. "accordion")' },
        project: { type: 'string', description: 'Child project name (e.g. "da-bacom"). Must not be "milo".' },
        include_diff: {
          type: 'boolean',
          description: 'Include source code of both child and Milo versions for comparison. Default false.',
        },
        summarize: {
          type: 'boolean',
          description: 'Use LLM to classify changes and generate migration steps. Default true.',
        },
      },
      required: ['block_name', 'project'],
    },
  },
  {
    name: 'add_project',
    description:
      'Register a new project (GitHub repo) at runtime. Validates the repo and blocks path exist, then indexes all blocks. Custom projects persist across server restarts.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project key (e.g. "my-project"). Lowercase alphanumeric + hyphens.' },
        owner: { type: 'string', description: 'GitHub org. Default: "adobecom"' },
        repo: { type: 'string', description: 'GitHub repo name' },
        blocks_path: { type: 'string', description: 'Relative path to blocks directory. Default: "blocks"' },
      },
      required: ['name', 'repo'],
    },
  },
  {
    name: 'remove_project',
    description:
      'Remove a custom project. Cannot remove built-in defaults. If a custom entry shadows a default, removing it reverts to the default config.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project key to remove' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_projects',
    description:
      'List all registered projects with their source (default/custom/custom_override) and indexed block count.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_setup_status',
    description:
      'Diagnose milo-mcp setup: verify GITHUB_TOKEN and ANTHROPIC_API_KEY are valid (makes one test call each), report index state and per-project block counts, and surface human-readable notes for any problems.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const STATIC_RESOURCES = [
  {
    uri: 'milo://conventions/block-anatomy',
    name: 'Milo Block Anatomy',
    description: 'Canonical block structure: JS export, CSS BEM, Nala test, mock doc',
    mimeType: 'text/markdown',
  },
  {
    uri: 'milo://conventions/da-table-syntax',
    name: 'DA Table Syntax',
    description: 'Document Authoring block table format',
    mimeType: 'text/markdown',
  },
  {
    uri: 'milo://conventions/nala-test-pattern',
    name: 'Nala Test Pattern',
    description: 'Standard Nala (Playwright) test file structure',
    mimeType: 'text/markdown',
  },
  {
    uri: 'milo://conventions/codeowners',
    name: 'CODEOWNERS in Milo',
    description:
      "Where Milo's CODEOWNERS file lives, how GitHub/milo-mcp use it, and which tools expose owner data (get_block, get_block_codeowner, list_blocks)",
    mimeType: 'text/markdown',
  },
  // Dynamic fstab resources — one entry per known child project
  {
    uri: 'milo://project/da-bacom/fstab',
    name: 'da-bacom fstab.yaml',
    description: 'fstab.yaml for adobecom/da-bacom — shows which Milo branch is mounted',
    mimeType: 'text/plain',
  },
  {
    uri: 'milo://project/bacom/fstab',
    name: 'bacom fstab.yaml',
    description: 'fstab.yaml for adobecom/bacom',
    mimeType: 'text/plain',
  },
  {
    uri: 'milo://project/cc/fstab',
    name: 'cc fstab.yaml',
    description: 'fstab.yaml for adobecom/cc',
    mimeType: 'text/plain',
  },
  {
    uri: 'milo://rag/evaluation-results',
    name: 'RAGAS Evaluation Results',
    description: 'Last RAGAS eval run: aggregated metrics, per-query scores, pass/fail status. Run `npm run eval` to refresh.',
    mimeType: 'text/markdown',
  },
];

const STATIC_RESOURCE_MAP: Record<string, string> = {
  'milo://conventions/block-anatomy': join(__dirname, 'resources/block-anatomy.md'),
  'milo://conventions/da-table-syntax': join(__dirname, 'resources/da-table-syntax.md'),
  'milo://conventions/nala-test-pattern': join(__dirname, 'resources/nala-test-pattern.md'),
  'milo://conventions/codeowners': join(__dirname, 'resources/codeowners.md'),
};

const FSTAB_URI_RE = /^milo:\/\/project\/([\w-]+)\/fstab$/;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const PROMPTS = [
  {
    name: 'audit-child-project-blocks',
    description: 'Audit a child project for stale block overrides vs Milo core. Produces a status table with lag days and recommendations.',
    arguments: [
      {
        name: 'project',
        description: 'Child project to audit (e.g. da-bacom, bacom, cc)',
        required: true,
      },
    ],
  },
];

function getAuditPromptMessages(project: string) {
  return [
    {
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Audit the **${project}** project for stale Milo block overrides.

Follow these steps using the available tools:

1. Call \`list_blocks\` with \`project="${project}"\` and \`include_child_overrides=true\`.
   This returns every block in ${project} with \`is_override: true/false\` and \`override_lag_days\` for overrides.

2. For any block where \`is_override=true\`, optionally call \`get_block\` for both the child and Milo versions to surface the owner and last_modified date (already included in the list_blocks response as \`child_last_modified\` and \`milo_last_modified\`).

3. Classify each override block:
   - **CURRENT** — \`override_lag_days\` ≤ 30
   - **LAGGING** — 31–90 days
   - **STALE** — > 90 days
   - **AHEAD** — \`override_lag_days\` = 0 (child is newer or same age as Milo)

4. Output a markdown table:

   | Block | Status | Lag Days | Child Modified | Milo Modified | Recommendation |
   |---|---|---|---|---|---|
   | ... | ... | ... | ... | ... | ... |

5. For STALE blocks: recommend reviewing recent Milo commits (\`get_block_history\` with \`project="milo"\`) and updating the override.

6. Finish with a summary: total overrides, breakdown by status, highest-risk blocks.`,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function main() {
  const server = new Server(
    { name: 'milo-mcp', version: '0.2.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  // List resources — static entries plus dynamic fstab for custom projects
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const customFstabResources = registry.customKeys()
      .filter((name) => name !== 'milo')
      .map((name) => ({
        uri: `milo://project/${name}/fstab`,
        name: `${name} fstab.yaml`,
        description: `fstab.yaml for ${registry.get(name).owner}/${registry.get(name).repo}`,
        mimeType: 'text/plain',
      }));
    return { resources: [...STATIC_RESOURCES, ...customFstabResources] };
  });

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;

    // Static file resources
    const filePath = STATIC_RESOURCE_MAP[uri];
    if (filePath) {
      const text = readFileSync(filePath, 'utf-8');
      return { contents: [{ uri, mimeType: 'text/markdown', text }] };
    }

    // Eval results resource
    if (uri === 'milo://rag/evaluation-results') {
      const results = loadEvalResults();
      if (!results) {
        const text = '# RAGAS Evaluation Results\n\nNo evaluation results found. Run `npm run eval` to generate.';
        return { contents: [{ uri, mimeType: 'text/markdown', text }] };
      }
      const lines = [
        `# RAGAS Evaluation Results`,
        ``,
        `**Last run:** ${results.timestamp}`,
        `**Status:** ${results.passed ? 'PASSED' : 'FAILED'}`,
        ``,
        `## Aggregated Metrics`,
        ``,
        `| Metric | Score | Threshold | Pass |`,
        `|--------|-------|-----------|------|`,
      ];
      for (const [key, threshold] of Object.entries(results.thresholds)) {
        const score = results.aggregated[key] ?? 0;
        const pass = score >= threshold ? 'yes' : 'no';
        lines.push(`| ${key} | ${score.toFixed(3)} | ${threshold} | ${pass} |`);
      }
      lines.push('', '## Per-Query Scores', '', '| Query | Faith | Relev | Prec | Recall |', '|-------|-------|-------|------|--------|');
      for (const q of results.queries) {
        lines.push(`| ${q.query.slice(0, 45)} | ${q.faithfulness.toFixed(2)} | ${q.answer_relevancy.toFixed(2)} | ${q.context_precision.toFixed(2)} | ${q.context_recall.toFixed(2)} |`);
      }
      return { contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }] };
    }

    // Dynamic fstab resources — milo://project/{project}/fstab
    const fstabMatch = FSTAB_URI_RE.exec(uri);
    if (fstabMatch) {
      const project = fstabMatch[1];
      try {
        const data = await readFstab(project);
        const text = `# fstab.yaml — ${project}\n\n\`\`\`yaml\n${data.raw}\n\`\`\`\n\nMilo version mounted: **${data.milo_branch ?? 'not set'}**`;
        return { contents: [{ uri, mimeType: 'text/markdown', text }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Could not read fstab for ${project}: ${msg}`);
      }
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // List prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

  // Get prompt
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (name === 'audit-child-project-blocks') {
      const project = (args?.project as string) ?? 'da-bacom';
      return {
        description: PROMPTS[0].description,
        messages: getAuditPromptMessages(project),
      };
    }
    throw new Error(`Unknown prompt: ${name}`);
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    try {
      let result: unknown;

      switch (name) {
        case 'get_block_repo_owner':
          result = await getBlockRepoOwner(GetBlockRepoOwnerSchema.parse(args));
          break;
        case 'get_block_codeowner':
          result = await getBlockCodeowner(GetBlockCodeownerSchema.parse(args));
          break;
        case 'get_block_location':
          result = await getBlockLocation(GetBlockLocationSchema.parse(args));
          break;
        case 'get_block':
          result = await getBlock(GetBlockSchema.parse(args));
          break;
        case 'search_blocks':
          result = await searchBlocks(SearchBlocksSchema.parse(args));
          break;
        case 'list_blocks':
          result = await listBlocks(ListBlocksSchema.parse(args));
          break;
        case 'get_block_history':
          result = await getBlockHistory(GetBlockHistorySchema.parse(args));
          break;
        case 'get_preview_url':
          result = getPreviewUrl(GetPreviewUrlSchema.parse(args));
          break;
        case 'refresh_index':
          result = await refreshIndex(RefreshIndexSchema.parse(args));
          break;
        case 'analyze_block_dependencies':
          result = await analyzeBlockDependencies(AnalyzeBlockDependenciesSchema.parse(args));
          break;
        case 'get_override_migration_guide':
          result = await getOverrideMigrationGuide(GetOverrideMigrationGuideSchema.parse(args));
          break;
        case 'add_project':
          result = await addProject(AddProjectSchema.parse(args));
          break;
        case 'remove_project':
          result = await removeProject(RemoveProjectSchema.parse(args));
          break;
        case 'list_projects':
          ListProjectsSchema.parse(args);
          result = listProjects();
          break;
        case 'check_setup_status':
          CheckSetupStatusSchema.parse(args);
          result = await checkSetupStatus();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  // Load custom projects before building the index
  registry.loadCustom(CUSTOM_PROJECTS_PATH);

  if (!config.anthropicApiKey) {
    process.stderr.write(
      '[milo-mcp] WARNING: ANTHROPIC_API_KEY is not set. search_blocks will use ' +
      'cosine similarity only — search quality will be lower. Set ANTHROPIC_API_KEY ' +
      'to enable CRAG semantic validation for better results.\n',
    );
  }

  // Build block index in the background on startup
  buildAllIndexes().catch((err) => {
    process.stderr.write(`[milo-mcp] Index build failed: ${err.message}\n`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[milo-mcp] Server started on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[milo-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
