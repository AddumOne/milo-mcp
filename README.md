# milo-mcp

MCP server for the Milo/EDS ecosystem. Gives AI assistants (Claude, Cursor) a context-aware interface to browse, search, and inspect Milo blocks (write/scaffold tools are planned for later phases).

## Phase 1 — Foundation (current)

Read-only tools for block discovery and inspection:

| Tool | Description |
|---|---|
| `get_block_repo_owner` | Project key + GitHub org/repo for the resolved block (same resolver as `get_block_location`) |
| `get_block_codeowner` | CODEOWNERS teams/individuals (Milo when block exists in core) + commit activity on the block directory |
| `get_block_location` | File path + GitHub blob URL for the block’s main `.js` |
| `get_block` | Fetch block metadata + optional source/CSS/tests |
| `search_blocks` | RAG-powered discovery (Adaptive RAG routing) |
| `list_blocks` | List blocks; optional `include_child_overrides` compares child overrides to Milo core and reports lag |
| `get_block_history` | Git commit history for a block |
| `get_preview_url` | AEM URLs: `env` is `stage` (default, `*.aem.page`) or `live` (`*.aem.live`); also returns `milo_override_url` and `local_url` |
| `refresh_index` | Rebuild the block index (one project or all) without restarting the server |
| `analyze_block_dependencies` | Inspect which blocks a block imports, and optionally the reverse direction (expensive) |
| `get_override_migration_guide` | For a child-project override, show what changed in Milo core since it was last updated; optional LLM-generated migration steps |
| `add_project` | Register a new GitHub repo at runtime (custom projects persist across restarts) |
| `remove_project` | Remove a custom project; cannot remove built-in defaults |
| `list_projects` | List registered projects with source (default/custom/custom_override) and indexed block count |
| `check_setup_status` | Diagnose setup: verify `GITHUB_TOKEN` / `ANTHROPIC_API_KEY` with live test calls, report index state and per-project block counts |

**Resources**

- `milo://conventions/block-anatomy` — canonical JS/CSS/test structure
- `milo://conventions/da-table-syntax` — DA markdown block tables
- `milo://conventions/nala-test-pattern` — Playwright test structure
- `milo://conventions/codeowners` — where Milo’s CODEOWNERS lives and how tools use it
- `milo://project/{project}/fstab` — child project `fstab.yaml` (e.g. `da-bacom`, `bacom`, `cc` are listed in MCP; any [known project](src/config.ts) can be read by URI)

**Prompts**

- `audit-child-project-blocks` — guided audit of stale overrides vs Milo core (uses `list_blocks` with `include_child_overrides=true`)

## Install

Two distribution channels. Pick whichever fits your client.

### Claude Desktop — one-click bundle

Download the latest `*.mcpb` file from the [Releases page](https://github.com/AddumOne/milo-mcp/releases) and double-click it. Claude Desktop opens an install dialog; fill in your `GITHUB_TOKEN` and optionally `ANTHROPIC_API_KEY`, then click Install. No local Node install needed — Claude Desktop ships its own runtime and the embedding model is pre-bundled in the file.

To uninstall, open Claude Desktop → Settings → Extensions, find milo-mcp, and click Remove.

### Any MCP client — npm package

Published as [`@addumone/milo-mcp`](https://www.npmjs.com/package/@addumone/milo-mcp) on the public npm registry. Configure your MCP client to invoke it via `npx`:

```json
{
  "mcpServers": {
    "milo": {
      "command": "npx",
      "args": ["-y", "@addumone/milo-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_...",
        "ANTHROPIC_API_KEY": "sk-ant-..."  // optional — enables CRAG; omit for cosine-only search
      }
    }
  }
}
```

No `.npmrc` setup needed — the package is on the public registry. The embedding model is downloaded from Hugging Face on first run and cached locally; subsequent starts are instant. To force the latest version: `npx --prefer-online @addumone/milo-mcp`.

### Local development

```bash
cp .env.example .env
# GITHUB_TOKEN is required; ANTHROPIC_API_KEY is optional (enables CRAG for search_blocks)
npm install
npm run dev
```

The server loads `.env` from the process working directory (`dotenv`) when you run `npm run dev` or `npm start`; set the same vars in your MCP host config if the cwd has no `.env`.

## Commands

```bash
npm run dev              # Development mode with hot reload
npm test                 # Run unit tests (Vitest)
npm run test:integration # Integration tests under test/integration/ (separate Vitest config)
npm run eval             # Run RAGAS evaluation (Phase 1 gate)
npm run build            # Compile TypeScript and copy convention markdown into dist/
npm start                # Run compiled server
```

## RAG Strategy

Queries are classified into four types and routed to the most appropriate technique:

| Type | Technique | Example |
|---|---|---|
| LOOKUP | Direct fetch | "get the accordion block" |
| SEMANTIC | Cosine + CRAG (1–2 word queries try a direct name match first) | "find a block for promotional content" |
| COMPOSITIONAL | Iterative (3-pass) | "which blocks override milo and are stale?" |
| MULTI_SOURCE | Semantic + CRAG (same path as SEMANTIC today; agentic multi-tool flow is Phase 4) | Queries mentioning Figma, DA, or “new page” |

## Environment Variables

See `.env.example` for all variables.

Required:
- `GITHUB_TOKEN` — read:repo scope (indexing + GitHub-backed tools)

Optional:
- `ANTHROPIC_API_KEY` — enables CRAG semantic validation in `search_blocks`. Without it, `search_blocks` still works but uses cosine-similarity ranking only, which produces lower-quality results. All other tools are unaffected. A warning is logged at startup when this key is not set.
- Optional tuning (see `.env.example`; defaults in `src/config.ts`): `MILO_REPO_*`, `EMBEDDING_MODEL`, `CRAG_THRESHOLD`, `SELF_RAG_MAX_ATTEMPTS`, `COSINE_GAP` (CRAG candidate band vs top cosine score, default `0.20`).

Required for write tools (Phase 3+):
- `GITHUB_WRITE_TOKEN` — repo scope

Future phases (documented in `.env.example`): `FIGMA_API_KEY`, `DA_API_TOKEN`.
