# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An MCP (Model Context Protocol) server that gives AI assistants context-aware access to the Milo/EDS ecosystem — a design system for Adobe web projects (adobecom/*). It enables AI to discover, inspect, and scaffold blocks (reusable web components) across Milo core and child projects.

## Commands

```bash
npm run build       # TypeScript compilation → dist/
npm run dev         # Development mode with hot reload (tsx watch)
npm start           # Run compiled server from dist/
npm test            # Run all unit tests (vitest)
npm run eval        # Run RAGAS evaluation harness (Phase 1 quality gate)
npm run pack:mcpb   # Build Claude Desktop bundle (.mcpb) via @anthropic-ai/mcpb
```

Run a single test file:
```bash
npx vitest run test/rag-classifier.test.ts
```

## Architecture

### Request Flow

```
AI Assistant (Claude, Cursor)
    ↓ MCP protocol (stdio)
src/server.ts  — registers tools, resources, prompts
    ↓
src/tools/     — 8 read-only tools
    ↓
src/rag/       — query routing + retrieval
    ↓
src/index/     — in-memory block index (built at startup from GitHub)
    ↓
GitHub API     — adobecom/* repos
```

### Block Index (built at startup)

`src/index/builder.ts` fetches all block directories from configured repos via GitHub API, extracts JSDoc descriptions from source files, and computes embeddings using `@xenova/transformers` (Xenova/all-MiniLM-L6-v2, lazy-loaded). The index lives in `src/index/store.ts` as an in-memory map keyed by `project:blockName`.

### RAG Layer (`src/rag/`)

The search path through the RAG layer:
1. **Classifier** (`classifier.ts`) — Fast-path pattern matching determines query type: `LOOKUP` | `SEMANTIC` | `COMPOSITIONAL` | `MULTI_SOURCE`
2. **Router** (`router.ts`) — Dispatches to the appropriate retrieval technique
3. **Retrieval techniques** (`src/rag/retrieval/`):
   - `direct.ts` — Exact name match (LOOKUP)
   - `semantic.ts` — Cosine similarity over embeddings (SEMANTIC)
   - `corrective.ts` — CRAG: Claude Haiku validates candidates with YES/NO scoring (threshold: `CRAG_THRESHOLD`, default 0.6)
   - `iterative.ts` — 3-pass search: semantic → expand related blocks → CRAG rank (COMPOSITIONAL)

### Tools (`src/tools/`)

| Tool | Purpose |
|------|---------|
| `get_block_repo_owner` | Project key + org/repo from the shared block resolver |
| `get_block_codeowner` | CODEOWNERS + recent commit authors (Milo CODEOWNERS when block exists in core) |
| `get_block_location` | Physical `.js` path + `github_url` |
| `get_block` | Fetch block metadata + optional source/CSS/tests |
| `search_blocks` | RAG-powered discovery |
| `list_blocks` | List all blocks in a project with override lag analysis |
| `get_block_history` | Git commit history for a block |
| `get_preview_url` | Generate AEM preview/stage/live URLs |

### Block Inheritance Model

Child projects (`da-bacom`, `bacom`, `cc`, etc.) can override Milo core blocks. The shared resolver in `src/github/block-resolver.ts` checks the child project first, then falls back to `adobecom/milo/libs/blocks/`. The known projects are defined in `src/config.ts`.

### LLM Usage

`src/llm/client.ts` wraps the Anthropic SDK and is used **only** for CRAG validation (corrective retrieval). It uses Claude Haiku for fast YES/NO scoring of block candidates. Without `ANTHROPIC_API_KEY`, semantic/compositional queries fall back to cosine-similarity ranking automatically.

## Environment Variables

Required:
- `GITHUB_TOKEN` — GitHub PAT with `read:repo` scope

Optional (have defaults):
- `ANTHROPIC_API_KEY` — Enables CRAG validation in search. Without it, semantic/compositional queries fall back to cosine-similarity ranking.
- `MILO_REPO_OWNER` / `MILO_REPO_NAME` / `MILO_DEFAULT_BRANCH`
- `EMBEDDING_MODEL` (default: `Xenova/all-MiniLM-L6-v2`)
- `CRAG_THRESHOLD` (default: `0.6`)
- `SELF_RAG_MAX_ATTEMPTS` (default: `2`)

Future phases only:
- `GITHUB_WRITE_TOKEN` — Phase 3 write operations
- `FIGMA_API_KEY` — Phase 4 design-to-code
- `DA_API_TOKEN` — Phase 5 DA authoring

See `.env.example` for the full list.

## Key Files

- `src/server.ts` — MCP server entry point; all tool/resource/prompt registration
- `src/config.ts` — All env vars and the project catalog (7 repos)
- `src/index/builder.ts` — Startup indexing logic; source of block metadata
- `src/rag/classifier.ts` — Query classification; change here affects all search routing
- `milo-mcp-spec.md` — Full specification: architecture, RAG strategy, block conventions, build phases

## Resources Served via MCP

The server exposes three convention docs as MCP resources (in `src/resources/`):
- `block-anatomy.md` — JS/CSS/test file structure for blocks
- `da-table-syntax.md` — Document Authoring block table format
- `nala-test-pattern.md` — Playwright test structure

## Releasing

Published to two channels:
- **npm** (`@addumone/milo-mcp` on public npmjs.org) — consumed via `npx @addumone/milo-mcp`
- **Claude Desktop bundle** (`.mcpb`) — attached to each GitHub Release at https://github.com/AddumOne/milo-mcp/releases

To cut a release:
```bash
npm version patch   # or minor / major — bumps package.json + manifest.json, creates git tag
git push && git push --tags
```

Pushing the tag triggers `.github/workflows/release.yml`, which builds, packs the bundle, publishes to npm via OIDC Trusted Publishing (no `NPM_TOKEN` secret needed), and creates the GitHub Release. The release workflow only runs when the tag is on `main`.

Semver convention: `patch` for bug fixes, `minor` for new tools/params, `major` for renamed or removed tools (breaking for AI clients that reference tool names).

## Testing

Unit tests cover: RAG classifier, block resolution, CRAG validator, list-blocks override logic. Tests use vitest with a Node environment. The eval harness (`npm run eval`) measures retrieval quality using RAGAS metrics and serves as the Phase 1 acceptance gate.
