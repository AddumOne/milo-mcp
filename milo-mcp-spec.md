# Milo MCP — Build Specification
> **v2 — RAG strategy upgraded.** This revision incorporates the internal Adobe RAG Reasoning Techniques and RAG Evaluation POC wikis. The original naive cosine-similarity approach is replaced with Adaptive RAG routing, CRAG validation, Self-RAG scaffold grading, and a RAGAS evaluation harness built into Phase 1.

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [Expert Review — Gaps & Corrections](#2-expert-review--gaps--corrections)
3. [Revised Architecture](#3-revised-architecture)
4. [Repository & Codebase Topology](#4-repository--codebase-topology)
5. [MCP Design Decisions](#5-mcp-design-decisions)
6. [RAG Strategy](#6-rag-strategy)
7. [Tool Specification](#7-tool-specification)
8. [MCP Resources & Prompts](#8-mcp-resources--prompts)
9. [Block Convention Reference](#9-block-convention-reference)
10. [Build Phases](#10-build-phases)
11. [File & Folder Structure](#11-file--folder-structure)
12. [Implementation Notes](#12-implementation-notes)
13. [Open Questions](#13-open-questions)

---

## 1. What We Are Building

An MCP server (`milo-mcp`) that gives AI assistants (Claude, Cursor, etc.) a direct, context-aware interface to the Milo/EDS ecosystem. Once connected, Claude can:

- Browse and read blocks from both Milo core and child projects (e.g. `da-bacom`)
- Understand which repo owns a given block (inheritance resolution)
- Scaffold new blocks following Milo conventions, including tests
- Inspect Figma designs and map components to existing Milo blocks
- Generate block scaffolds from Figma designs and open PRs
- Author DA (Document Authoring) pages using correct block table syntax
- Generate AEM preview URLs for any branch

**Primary users:** Developers working on `adobecom/milo` or on child projects (`da-bacom`, `bacom`, `cc`, etc.)

**Consuming MCPs:**
- Figma MCP (`https://wiki.corp.adobe.com/spaces/WEM/pages/3614165009/Adobe+Figma+MCP+Server`) — design inspection
- DA MCP (`https://docs.da.live/about/early-access/da-mcp`) — content authoring

**Not needed:**
- ~~Corp GitHub MCP~~ — all `adobecom/*` repos are public; use GitHub REST API directly

---

## 2. Expert Review — Gaps & Corrections

### 2.1 Conflicting logic (v1 → v2)

| Issue | Where | Fix |
|---|---|---|
| "use public GitHub API — no MCP needed" | Phase 1 note | Contradicts the premise. GitHub API calls ARE the MCP tool implementations. |
| Corp GitHub MCP listed as a dependency | Architecture | Dropped. Not applicable to public `github.com/adobecom` repos. |
| Phase 1 read-only, Phase 3 writes, no auth model defined | Phases 1–3 | Auth model defined in §5.3. Read and write scopes separated from day one. |
| `project` param optional, "defaults to Milo core" | Key decisions | Ambiguous default causes wrong-repo writes. Explicit for reads, required for writes. |
| **RAG strategy was naive cosine similarity** | §11.1 (v1) | **Replaced with Adaptive RAG routing — see §6. Basic RAG fails on multi-step and compositional queries, which are the primary use cases here.** |

### 2.2 Gaps closed in v2

**Basic RAG falls short for this domain.** The v1 spec proposed embedding block metadata and ranking by cosine similarity. Per the internal Adobe RAG Reasoning Techniques wiki, basic/naive RAG fails specifically on:
- Multi-step questions ("which blocks are outdated in da-bacom vs Milo?")
- Compositional queries ("find a block that supports dark variant and has localization support")
- Queries requiring validation ("does this scaffold actually match Milo conventions?")

All three are core Milo MCP use cases. The fix is Adaptive RAG with technique routing — see §6.

**No RAG evaluation harness.** The internal RAG Evaluation POC wiki defines a RAGAS-based framework using Faithfulness, Answer Relevancy, Context Precision, and Context Recall. These must be built in from Phase 1, not retrofitted. Without evaluation, there is no signal on whether retrieval quality is improving or degrading as the block index grows.

**No MCP Resources or Prompts defined.** Added in §8.

**No Nala test scaffolding.** `create_block` now scaffolds Nala tests automatically.

**No `fstab.yaml` awareness.** Added via block resolution (`milo_version` on repo-owner output) and as a dynamic MCP Resource.

**No preview URL generation.** Added as `get_preview_url` tool.

**GitHub API rate limits unaddressed.** Token required from day one even for reads (60 req/hr unauthenticated is hit immediately at index build time).

**Multi-step GitHub write operations underspecified.** Atomic `commitFiles` helper defined in §12.5.

**DA block table syntax undefined.** Defined in §9.6 and published as a MCP Resource.

**Context window pressure from block code.** Tools return metadata-only by default; full source is opt-in.

### 2.3 Best practice deviations fixed

- Tool count reduced from 18+ to 14 (LLM tool selection degrades beyond ~12).
- Block scaffold template promoted from "system prompt note" to MCP Prompt resource.
- Read/write token scopes separated.
- Self-RAG grading added to `create_block` — scaffold is scored before being committed.

---

## 3. Revised Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        AI Assistant                           │
│              (Claude, Cursor, ChatGPT + MCP)                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ MCP protocol (stdio or SSE)
┌───────────────────────────▼──────────────────────────────────┐
│                         milo-mcp                              │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Tools (14) │  │ Resources (5)│  │    Prompts (3)      │  │
│  └──────┬──────┘  └──────────────┘  └─────────────────────┘  │
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │                     RAG Layer                            │  │
│  │                                                          │  │
│  │  ┌─────────────────┐    ┌──────────────────────────┐    │  │
│  │  │ Query Classifier │───▶│  Technique Router        │    │  │
│  │  │  LOOKUP          │    │  LOOKUP   → direct fetch │    │  │
│  │  │  SEMANTIC        │    │  SEMANTIC → cosine+CRAG  │    │  │
│  │  │  COMPOSITIONAL   │    │  COMP.    → Iterative    │    │  │
│  │  │  MULTI_SOURCE    │    │  MULTI    → Agentic      │    │  │
│  │  └─────────────────┘    └──────────────────────────┘    │  │
│  │                                                          │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │           Block Index (in-memory)                  │  │  │
│  │  │  name · repo · path · embedding · owner · score   │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │  RAGAS Evaluation Harness (dev/test mode)         │  │  │
│  │  │  Faithfulness · Relevancy · Precision · Recall    │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │  │
└───────┬────────────────────┬──────────────────┬─────────────┘
        │                    │                  │
        ▼                    ▼                  ▼
  GitHub REST API        Figma MCP           DA MCP
  api.github.com         (corp)              da.live
  adobecom/milo
  adobecom/da-bacom
  adobecom/bacom
  adobecom/cc  ...
```

### Block resolution order

```
1. {child-repo}/blocks/{block-name}/{block-name}.js        ← project override
2. adobecom/milo/libs/blocks/{block-name}/{block-name}.js  ← Milo core
3. EDS default decoration                                   ← no custom block
```

The `fstab.yaml` in the child repo determines which Milo branch/version is mounted.

---

## 4. Repository & Codebase Topology

### 4.1 Milo core — `adobecom/milo`

```
milo/
├── libs/
│   ├── blocks/          ← all core blocks (100–200)
│   │   ├── accordion/
│   │   │   ├── accordion.js    ← export default function decorate(block)
│   │   │   └── accordion.css
│   │   ├── aside/
│   │   ├── carousel/
│   │   ├── chart/
│   │   └── ...
│   ├── features/        ← non-block features (seotech, title-append, etc.)
│   ├── martech/
│   ├── scripts/         ← core EDS scripts
│   └── utils/
├── nala/                ← Playwright-based e2e tests
├── test/                ← unit tests
├── CODEOWNERS           ← maps every block path to its owner(s)
└── fstab.yaml           ← not present in milo itself; present in child projects
```

### 4.2 Child projects — e.g. `adobecom/da-bacom`

```
da-bacom/
├── blocks/              ← project-specific overrides (root level, not libs/)
│   └── custom-hero/
│       ├── custom-hero.js
│       └── custom-hero.css
├── fstab.yaml           ← mounts Milo libs from a specific branch
└── nala/
```

`fstab.yaml` example:
```yaml
mountpoints:
  /libs: https://main--milo--adobecom.aem.live/libs
```

### 4.3 AEM preview URL pattern

```
https://{branch}--{repo}--{owner}.aem.page           ← stage
https://{branch}--{repo}--{owner}.aem.live            ← prod CDN
https://main--da-bacom--adobecom.aem.page/?milolibs={milo-branch}
http://localhost:3000/?milolibs=local
```

### 4.4 Known child projects

| Repo | Purpose |
|---|---|
| `adobecom/da-bacom` | Business.adobe.com (DA-migrated) |
| `adobecom/bacom` | Business.adobe.com (legacy) |
| `adobecom/cc` | Creative Cloud |
| `adobecom/genuine` | Genuine Adobe |
| `adobecom/milo-purple` | Milo testing/staging |
| `adobecom/milo-pink` | Milo testing/staging |

---

## 5. MCP Design Decisions

### 5.1 Transport
Start with **stdio** (works immediately with Claude Code and Cursor). Add SSE transport later for browser-based agents.

### 5.2 Tool count
**11 read/query tools + 3 write tools = 14 total.** Discovery is handled by the RAG layer, not dedicated discovery tools.

### 5.3 Auth model

```
GITHUB_TOKEN           Required always (even reads). PAT, read:repo scope.
GITHUB_WRITE_TOKEN     Required for write tools only. PAT, repo scope.
                       If absent, write tools register but return a structured error on call.
FIGMA_API_KEY          Required for design-to-code tools.
DA_API_TOKEN           Required for DA authoring tools.
```

### 5.4 Project context
All tools accept an optional `project` parameter:
- `"milo"` (default for reads) — `adobecom/milo`, `libs/blocks/`
- `"da-bacom"` | `"bacom"` | `"cc"` | etc. — `adobecom/{project}`, `blocks/`
- Write tools require an explicit `project` value — no defaulting.

### 5.5 Response shape
Tools return metadata-only by default. Full source is opt-in via `include_source: true`. A single block summary is ~50 tokens; full source is ~500 tokens.

---

## 6. RAG Strategy

> This is the primary addition over v1. It replaces naive cosine similarity with a tiered RAG architecture informed by the internal Adobe RAG Reasoning Techniques and RAG Evaluation POC wikis.

### 6.1 Why basic RAG is insufficient here

The internal wiki identifies five failure modes of naive RAG that apply directly to Milo MCP:

| Basic RAG failure mode | Milo MCP query example | Impact |
|---|---|---|
| Retrieves irrelevant docs | "find a block for a promo banner" matches `promo` in 8 unrelated blocks | Wrong block recommended |
| Fails on multi-step questions | "which blocks in da-bacom override and lag behind Milo?" | Silently incomplete answer |
| No validation mechanism | Scaffold generated but violates Milo conventions | Unmergeable PR |
| Cannot handle compositional queries | "find a block that supports dark variant and has localization support" | Single-pass retrieval misses both constraints |
| Static retrieval doesn't self-correct | Same bad result on every search | No improvement signal |

### 6.2 Query classification

Every search query entering the RAG layer is first classified into one of four types. Classification uses a lightweight LLM call (~50 tokens) with fast-path pattern matching to avoid unnecessary inference:

```
LOOKUP         User knows the exact block name.
               "get the accordion block" / "show me the aside block"
               Action: bypass RAG entirely, direct GitHub API call.

SEMANTIC       User describes a capability, not a name.
               "find a block for a promotional banner"
               Action: cosine similarity over block index + CRAG validation.

COMPOSITIONAL  Multi-constraint or multi-step query.
               "which accordion variants exist and which child projects override it?"
               Action: Iterative RAG (up to 3 retrieval passes).

MULTI_SOURCE   Query spans Figma + blocks + DA.
               "scaffold a block from this Figma design and create a DA page using it"
               Action: Agentic RAG (orchestrated multi-tool sequence).
```

### 6.3 Technique selection per query type

Informed by the internal wiki's comparison matrix (Complexity / Latency / Cost / Accuracy):

#### LOOKUP → Direct fetch
No embedding involved. Parse block name from query, call `get_block_location` (or `get_block_repo_owner`) + `get_block`. Lowest latency, zero cost.

#### SEMANTIC → Cosine similarity + CRAG (Corrective RAG)
1. Embed the query using `all-MiniLM-L6-v2`.
2. Cosine similarity over block index → top-5 candidates.
3. **CRAG validation pass:** score each candidate's relevance against the original query using a short LLM prompt. Filter candidates below threshold (default: 0.6).
4. If fewer than 2 candidates survive CRAG, **fall back to external search** of `milo.adobe.com` docs — the corrective fallback the wiki describes.
5. Return survivors ranked by CRAG score, not raw cosine similarity.

```typescript
// CRAG relevance scoring prompt (one call per candidate)
`Does this block match the user's query?
Query: "${query}"
Block: "${block.name}: ${block.description}"
Score 0.0–1.0. JSON only: { "score": number, "reason": string }`
```

#### COMPOSITIONAL → Iterative RAG
Each retrieval pass uses results from the previous pass to refine the next query — the iterative pattern described in the wiki.

```
Pass 1: Semantic search → candidate blocks
Pass 2: For each candidate, retrieve related blocks (variants, overrides, related patterns)
Pass 3: Synthesise answer from accumulated context across both passes
```

Max 3 passes. Passes 2+ are parallelised with `p-limit(5)` to contain latency.

Used for: `list_blocks` with `include_child_overrides`, `prompt: audit-child-project-blocks`, and any query containing keywords: "all", "which", "compare", "override", "lag", "stale", "audit".

#### MULTI_SOURCE → Agentic RAG
The wiki describes this as "a system of systems to serve tools, web search, and answer decisions — most flexible, handles multi-source queries." This maps directly to the Figma-to-block pipeline.

The agent decomposes the goal into subtasks, routes each to the appropriate tool (Figma MCP, block index, GitHub API, DA MCP), and synthesises results across all tools. Self-RAG grading is applied to the final scaffold output before returning.

```typescript
// Agentic subtask decomposition prompt
`You have access to: figma_components, block_index, github_api, da_mcp.
Goal: "${goal}"
Break into ordered subtasks. For each: specify tool, input, and any dependencies.
JSON only: { "subtasks": [{ "tool": string, "input": object, "depends_on": number[] }] }`
```

### 6.4 Self-RAG scaffold validation

Applied after `create_block` generates a scaffold. The output is graded against Milo conventions before committing or returning to the user — using the SUPPORT / CRITIQUE / NO_SUPPORT grading model from the wiki.

```typescript
// Self-RAG grading prompt
`Grade this Milo block scaffold against each convention:
1. single-export: Single export default function decorate(block)
2. no-deps: No external dependencies — vanilla JS only
3. in-place: DOM manipulation in-place; does not replace the block element
4. lana-log: Uses window.lana.log not console
5. lazy-load: Lazy-loads heavy resources

Scaffold: [js source]

For each convention: SUPPORT | CRITIQUE | NO_SUPPORT.
JSON only: { "grade": "PASS"|"FAIL"|"PASS_WITH_WARNINGS", "violations": string[], "score": number }`
```

If `grade === "FAIL"`, the scaffold is regenerated with violations as additional constraints. Max 2 regeneration attempts. If still failing after 2 attempts, return with violations flagged for human review and do not open a PR.

### 6.5 RAG evaluation — RAGAS harness

Per the internal RAG Evaluation POC wiki, four metrics measure retrieval quality. These run in `npm run eval` mode (not on every live query):

| Metric | What it measures | Milo MCP definition |
|---|---|---|
| **Faithfulness** | Is the answer grounded in retrieved context? | Does the returned block actually match the query intent, or did the LLM hallucinate a match? |
| **Answer Relevancy** | Is the answer relevant to the question? | Is the top-returned block relevant to what was asked? |
| **Context Precision** | Are retrieved docs all relevant? (no noise) | What fraction of the top-5 retrieved blocks are genuinely useful for the query? |
| **Context Recall** | Were all relevant docs retrieved? (no misses) | Did the search miss any blocks a human would consider relevant? |

**Evaluation dataset:** A golden test set of 30 queries with known correct answers, stored in `eval/golden-dataset.json`:
- 10 LOOKUP queries (exact block names)
- 10 SEMANTIC queries (capability descriptions)
- 5 COMPOSITIONAL queries (multi-constraint)
- 5 edge cases (block doesn't exist, ambiguous names)

**Phase 1 gate — minimum thresholds before Phase 2 begins:**

| Metric | Minimum |
|---|---|
| Faithfulness | ≥ 0.85 |
| Answer Relevancy | ≥ 0.80 |
| Context Precision | ≥ 0.75 |
| Context Recall | ≥ 0.70 |

### 6.6 RAG technique routing summary

```
Query type    Technique         Latency    Cost    Accuracy
──────────────────────────────────────────────────────────
LOOKUP        Direct fetch      ~200ms     $0      Exact
SEMANTIC      Cosine + CRAG     ~800ms     Low     High
COMPOSITIONAL Iterative (3p)    ~2s        Medium  High
MULTI_SOURCE  Agentic           ~5–15s     High    Highest
```

Simple queries stay fast. Complex queries spend the budget where it matters.

---

## 7. Tool Specification

### Read tools

---

#### `get_block_repo_owner`
> Project key + GitHub org/repo from the shared resolver (`src/github/block-resolver.ts`).

```typescript
input: { block_name: string; project?: string }
output: {
  project: string
  org: string
  repo: string
  owner_repo: string
  source: "child-project" | "milo-core" | "not-found"
  milo_version: string | null
}
```

---

#### `get_block_codeowner`
> Declared CODEOWNERS (Milo root file when the block exists in core) plus commit activity on the resolved block directory.

```typescript
input: { block_name: string; project?: string }
output: {
  declared_teams: string[]
  declared_individuals: string[]
  active_contributors: { login: string; commit_count: number }[]
  recommended_contact: string | null
  note: string
  codeowners_repo: string
  commits_repo: string
  commits_path: string
}
```

---

#### `get_block_location`
> Physical `.js` path and GitHub blob URL.

```typescript
input: { block_name: string; project?: string }
output: {
  owner: string
  repo: string
  path: string
  block_directory: string
  branch: string
  source: "child-project" | "milo-core" | "not-found"
  github_url: string
}
```

---

#### `get_block`
> Fetch block source. Metadata-only by default; full source is opt-in.

```typescript
input: {
  block_name: string
  project?: string
  include_source?: boolean    // default false
  include_css?: boolean       // default false
  include_tests?: boolean     // default false
}
output: {
  name: string
  repo: string
  path: string
  owner: string[]
  last_modified: string
  source?: string
  css?: string
  tests?: string
  resolved_from: "child-project" | "milo-core"
}
```

---

#### `search_blocks`
> RAG-powered block discovery. Automatically classifies query and routes to the correct technique.

```typescript
input: {
  query: string
  project?: string
  limit?: number              // default 5
  explain?: boolean           // include CRAG scores and reasoning
}
output: {
  query_type: "LOOKUP" | "SEMANTIC" | "COMPOSITIONAL" | "MULTI_SOURCE"
  technique_used: "direct" | "cosine+crag" | "iterative" | "agentic"
  results: Array<{
    name: string
    description: string
    relevance_score: number   // CRAG-validated score, not raw cosine
    crag_reason?: string      // only if explain=true
    repo: string
    path: string
  }>
  fallback_used: boolean      // true if CRAG triggered external fallback
}
```

---

#### `list_blocks`
> List all blocks in a repo. Names and owners only — no source.

```typescript
input: {
  project?: string
  include_child_overrides?: boolean
}
output: {
  blocks: Array<{
    name: string
    repo: string
    path: string
    owner: string[]
    is_override: boolean
    override_lag_days?: number  // days child lags Milo (only with include_child_overrides)
  }>
  total: number
}
```

---

#### `get_block_history`

```typescript
input: {
  block_name: string
  project?: string
  limit?: number              // default 10
}
output: {
  commits: Array<{
    sha: string
    message: string
    author: string
    date: string
    url: string
  }>
}
```

---

#### `get_preview_url`

```typescript
input: {
  project: string
  branch?: string             // default "main"
  milo_branch?: string        // appends ?milolibs={milo_branch}
  path?: string
  env?: "stage" | "live"      // default "stage"
}
output: {
  url: string
  milo_override_url: string | null
  local_url: string
}
```

---

#### `identify_figma_components`
> List components in a Figma frame. CRAG-validates each suggested Milo block mapping.

```typescript
input: {
  figma_file_key: string
  node_id: string
  map_to_milo_blocks?: boolean
}
output: {
  components: Array<{
    name: string
    node_id: string
    type: string
    suggested_milo_block: string | null
    confidence: number | null
    crag_validated: boolean
  }>
}
```

---

#### `read_da_page`

```typescript
input: {
  project: string
  path: string
}
output: {
  path: string
  markdown: string
  last_modified: string
  url: string
}
```

---

### Write tools
> All require `GITHUB_WRITE_TOKEN`. Return a structured error if absent.

---

#### `create_block`
> Scaffold a new block. Self-RAG validates before committing. Refuses to open a PR if grade is FAIL.

```typescript
input: {
  block_name: string
  project: string             // REQUIRED — no default for writes
  description: string
  owner_github_handle: string
  figma_file_key?: string
  figma_node_id?: string
  open_pr?: boolean           // default true
  target_branch?: string      // default "stage"
}
output: {
  files_created: string[]
  pr_url: string | null       // null if self_rag_grade is FAIL
  preview_url: string
  self_rag_grade: {
    grade: "PASS" | "FAIL" | "PASS_WITH_WARNINGS"
    score: number
    violations: string[]
    regeneration_attempts: number
  }
  scaffold: {
    js: string
    css: string
    mock_doc: string
    nala_test: string
  }
}
```

Files created for `project: "milo"`:
```
libs/blocks/{block-name}/{block-name}.js
libs/blocks/{block-name}/{block-name}.css
nala/{block-name}/{block-name}.test.js
```

Files created for `project: "da-bacom"` (and other child projects):
```
blocks/{block-name}/{block-name}.js
blocks/{block-name}/{block-name}.css
nala/{block-name}/{block-name}.test.js
```

---

#### `create_da_page`

```typescript
input: {
  project: string
  path: string
  title: string
  blocks: Array<{
    block_name: string
    variant?: string
    rows: string[][]
  }>
  metadata?: Record<string, string>
}
output: {
  da_url: string
  preview_url: string
  markdown: string
}
```

---

#### `open_pull_request`

```typescript
input: {
  project: string
  head_branch: string
  base_branch?: string        // default "stage"
  title: string
  body?: string
}
output: {
  pr_url: string
  pr_number: number
}
```

---

## 8. MCP Resources & Prompts

### Resources

| Resource URI | Description |
|---|---|
| `milo://conventions/block-anatomy` | Canonical block structure: JS export, CSS BEM, mock doc |
| `milo://conventions/da-table-syntax` | DA markdown block table format |
| `milo://conventions/nala-test-pattern` | Standard Nala test file structure |
| `milo://rag/evaluation-results` | Latest RAGAS scores from most recent eval run |
| `milo://project/{project}/fstab` | Dynamic: `fstab.yaml` for a given child project |

### Prompts

#### `prompt: figma-to-block`
```
Agentic RAG — MULTI_SOURCE:
1. Call identify_figma_components (map_to_milo_blocks: true)
2. Separate components into: (a) mapped to existing blocks, (b) unmapped → need new blocks
3. For unmapped: call create_block with figma_file_key and figma_node_id
4. If self_rag_grade is FAIL on any scaffold, surface violations to user before proceeding
5. Return: existing blocks to use, new blocks created, PRs opened, preview URLs
```

#### `prompt: audit-child-project-blocks`
```
Iterative RAG — COMPOSITIONAL:
Pass 1: list_blocks (project, include_child_overrides: true) → get override list
Pass 2: For each override, get_block both child and Milo versions (parallel)
Pass 3: Compare last_modified dates; flag where override_lag_days > 90
Output: table with status (current / lagging / stale), diffs, recommendations
```

#### `prompt: new-page-from-design`
```
Agentic RAG — MULTI_SOURCE:
1. identify_figma_components (map_to_milo_blocks: true)
2. For unmapped: create_block (Figma-derived, Self-RAG validated)
3. Build block list from component mapping
4. create_da_page with resolved block list
5. Return DA preview URL and summary: created vs pre-existing
```

---

## 9. Block Convention Reference

> Also published as the `milo://conventions/block-anatomy` MCP Resource.

### 9.1 Standard block structure

```
libs/blocks/{block-name}/     ← Milo core
blocks/{block-name}/          ← child project
  {block-name}.js             ← required
  {block-name}.css            ← required (may be empty)
```

### 9.2 JavaScript template

```javascript
/**
 * {Block Name} block
 * @description {One sentence — this text is indexed by the RAG block index}
 * @author {GitHub handle}
 * @param {Element} block - The block element passed by EDS decoration
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  rows.forEach((row) => {
    const [label, content] = row.children;
    // transform DOM in-place
  });
}
```

**Self-RAG checklist (all 5 must pass before PR is opened):**
1. Single `export default function decorate(block)` — no other named exports as entry point
2. No external dependencies — vanilla JS only
3. DOM manipulation in-place — do not `replaceWith` or reparent the block element
4. `window.lana.log(message, { tags: 'error,{block-name}' })` not `console`
5. Lazy-load heavy resources (images, iframes)

### 9.3 CSS template

```css
.{block-name} { /* container */ }
.{block-name} > div { /* row styles */ }
.{block-name}.dark { /* variant: authored as "{Block Name} (dark)" in DA */ }
```

### 9.4 Nala test template

```javascript
import { expect, test } from '@playwright/test';
import { features } from './{block-name}.spec.js';
const { describe } = test;

describe('{Block Name} block', () => {
  features.forEach((props) => {
    describe(props.title, () => {
      test(`@${props.tag} ${props.title}`, async ({ page, baseURL }) => {
        await page.goto(`${baseURL}${props.path}`);
        await expect(page.locator('.{block-name}')).toBeVisible();
      });
    });
  });
});
```

### 9.5 Mock document

```markdown
# {Block Name}

| {Block Name}    |
|-----------------|
| Row 1 content   |
| Row 2 content   |
```

### 9.6 DA block table syntax

```
| My Block        |               |
|-----------------|---------------|
| Row 1 col 1     | Row 1 col 2   |

| My Block (dark) |
|-----------------|
| Row 1 content   |
```

First cell of row 1 = block name. Variant in parentheses = CSS class added automatically by EDS.

---

## 10. Build Phases

### Phase 1 — Foundation + RAG baseline
**Goal:** Claude can search and read blocks. RAGAS evaluation harness is green before Phase 2.

- [ ] MCP server skeleton (TypeScript, `@modelcontextprotocol/sdk`, stdio)
- [ ] GitHub API client with token auth and rate-limit handling
- [ ] Block index builder: tree fetch → JSDoc `@description` extraction → `all-MiniLM-L6-v2` embeddings
- [ ] Query classifier (LOOKUP / SEMANTIC / COMPOSITIONAL / MULTI_SOURCE)
- [ ] Technique router: LOOKUP → direct, SEMANTIC → cosine + CRAG
- [ ] Tools: `get_block_repo_owner`, `get_block_codeowner`, `get_block_location`, `get_block`, `search_blocks`, `list_blocks`, `get_block_history`, `get_preview_url`
- [ ] Resources: `milo://conventions/block-anatomy`, `milo://conventions/da-table-syntax`
- [ ] RAGAS evaluation harness + golden dataset (30 queries)
- [ ] Resource: `milo://rag/evaluation-results`
- [ ] Unit tests: block resolver (all 3 outcomes), `classifier`, `crag-validator`

**Phase 1 gate:** `npm run eval` — all four RAGAS thresholds met.

---

### Phase 2 — Child project awareness + Iterative RAG
**Goal:** Multi-project and COMPOSITIONAL query routing.

- [ ] `fstab.yaml` reader → `milo://project/{project}/fstab` resource
- [ ] `list_blocks` with `include_child_overrides` and `override_lag_days`
- [ ] Iterative RAG (3-pass) for COMPOSITIONAL queries
- [ ] `prompt: audit-child-project-blocks`
- [ ] p-limit concurrency for Pass 2 parallel retrievals

**Acceptance:** "What blocks does da-bacom override and which are stale?" → COMPOSITIONAL → Iterative RAG → override table with lag days.

---

### Phase 3 — Write: block scaffolding + Self-RAG
**Goal:** Mergeable block scaffolds, validated before committing.

- [ ] GitHub write client (atomic `commitFiles` — see §12.5)
- [ ] Block file generator from §9 templates
- [ ] Self-RAG grader (5-convention checklist, SUPPORT/CRITIQUE/NO_SUPPORT)
- [ ] Regeneration loop (max 2 attempts; hard block on FAIL — no PR opened)
- [ ] CODEOWNERS updater
- [ ] Tools: `create_block`, `open_pull_request`
- [ ] Resource: `milo://conventions/nala-test-pattern`

**Acceptance:** "Create promo-banner block in da-bacom" → scaffold → Self-RAG PASS → 3 files committed → PR opened.

---

### Phase 4 — Design-to-code + Agentic RAG
**Goal:** Figma → block pipeline using Agentic RAG.

- [ ] Figma MCP client wrapper (calls via MCP client, not HTTP)
- [ ] Agentic RAG subtask decomposer
- [ ] Tool: `identify_figma_components` (CRAG-validated block mapping)
- [ ] `prompt: figma-to-block`, `prompt: new-page-from-design`
- [ ] Expand RAGAS golden dataset with 10 Figma queries; re-run eval

**Acceptance:** Figma file key → 4 components → 2 map to existing blocks → 2 scaffolded (Self-RAG PASS) → PRs opened.

---

### Phase 5 — Content authoring (DA MCP)
**Goal:** Full end-to-end: Figma → blocks → DA page.

- [ ] DA MCP client wrapper
- [ ] DA markdown generator (block table syntax from §9.6)
- [ ] Tools: `read_da_page`, `create_da_page`
- [ ] `prompt: new-page-from-design` fully wired (Figma → blocks → DA page)

**Acceptance:** "Create /products/test with a marquee and cards grid" → DA page created → preview URL returned.

---

## 11. File & Folder Structure

```
milo-mcp/
├── src/
│   ├── server.ts
│   ├── config.ts
│   │
│   ├── tools/
│   │   ├── resolve-block.ts
│   │   ├── get-block.ts
│   │   ├── search-blocks.ts          ← calls RAG router
│   │   ├── list-blocks.ts
│   │   ├── get-block-history.ts
│   │   ├── get-preview-url.ts
│   │   ├── identify-figma-components.ts
│   │   ├── read-da-page.ts
│   │   ├── create-block.ts           ← write; invokes self-grader
│   │   ├── create-da-page.ts         ← write
│   │   └── open-pull-request.ts      ← write
│   │
│   ├── rag/
│   │   ├── classifier.ts             ← query type classification
│   │   ├── router.ts                 ← routes to correct technique
│   │   ├── retrieval/
│   │   │   ├── direct.ts             ← LOOKUP: bypass RAG
│   │   │   ├── semantic.ts           ← cosine similarity
│   │   │   ├── corrective.ts         ← CRAG: LLM scoring + fallback
│   │   │   ├── iterative.ts          ← 3-pass for COMPOSITIONAL
│   │   │   └── agentic.ts            ← subtask decomposer for MULTI_SOURCE
│   │   ├── self-grader.ts            ← Self-RAG scaffold validation
│   │   └── evaluation/
│   │       ├── ragas.ts              ← metric computation
│   │       ├── runner.ts             ← eval harness
│   │       └── golden-dataset.json  ← 30 labelled queries
│   │
│   ├── index/
│   │   ├── builder.ts                ← startup index construction
│   │   ├── embeddings.ts             ← all-MiniLM-L6-v2 + cosine search
│   │   └── store.ts                  ← in-memory store
│   │
│   ├── resources/
│   │   ├── block-anatomy.md
│   │   ├── da-table-syntax.md
│   │   ├── nala-test-pattern.md
│   │   └── fstab-reader.ts
│   │
│   ├── prompts/
│   │   ├── figma-to-block.ts
│   │   ├── audit-child-project.ts
│   │   └── new-page-from-design.ts
│   │
│   ├── github/
│   │   ├── client.ts
│   │   ├── file-writer.ts            ← atomic blob→tree→commit→PR
│   │   └── codeowners.ts
│   │
│   ├── figma/
│   │   └── client.ts                 ← Figma MCP caller via MCP client SDK
│   │
│   ├── da/
│   │   └── client.ts
│   │
│   └── templates/
│       ├── block-js.ts
│       ├── block-css.ts
│       ├── block-mock.ts
│       └── nala-test.ts
│
├── eval/
│   └── golden-dataset.json           ← 30 queries, expected block names, query types
│
├── test/
│   ├── resolve-block.test.ts
│   ├── rag-classifier.test.ts
│   ├── crag-validator.test.ts
│   ├── self-grader.test.ts
│   ├── search-blocks.test.ts
│   └── file-writer.test.ts
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 12. Implementation Notes

### 12.1 Query classifier

```typescript
// src/rag/classifier.ts
type QueryType = 'LOOKUP' | 'SEMANTIC' | 'COMPOSITIONAL' | 'MULTI_SOURCE';

const LOOKUP_PATTERNS = [
  /^(get|show|fetch|read)\s+the\s+\w+[\w-]*\s+block$/i,
  /^(what is|what does)\s+the\s+\w+[\w-]*\s+block/i,
];
const MULTI_SOURCE_KW = ['figma', 'design', 'create a page', 'da page', 'new page from'];
const COMPOSITIONAL_KW = ['all', 'which', 'compare', 'override', 'lag', 'stale', 'audit', 'outdated'];

export async function classifyQuery(query: string): Promise<QueryType> {
  if (LOOKUP_PATTERNS.some(p => p.test(query.trim()))) return 'LOOKUP';
  if (MULTI_SOURCE_KW.some(kw => query.toLowerCase().includes(kw))) return 'MULTI_SOURCE';
  const score = COMPOSITIONAL_KW.filter(kw => query.toLowerCase().includes(kw)).length;
  if (score >= 2) return 'COMPOSITIONAL';
  return 'SEMANTIC';
}
```

### 12.2 CRAG validation

```typescript
// src/rag/retrieval/corrective.ts
const CRAG_THRESHOLD = 0.6;

export async function cragValidate(
  query: string,
  candidates: BlockCandidate[],
  llm: LLMClient
): Promise<CRAGResult> {
  const scored = await Promise.all(candidates.map(async (c) => {
    const { score, reason } = JSON.parse(await llm.complete({
      prompt: `Does this block match the query?
Query: "${query}"
Block: "${c.name}: ${c.description}"
JSON only: { "score": number, "reason": string }`,
      max_tokens: 60,
    }));
    return { ...c, crag_score: score, crag_reason: reason };
  }));

  const passing = scored.filter(c => c.crag_score >= CRAG_THRESHOLD);
  if (passing.length < 2) {
    const webResults = await searchMiloDocs(query); // external corrective fallback
    return { results: passing, fallback_used: true, fallback_results: webResults };
  }
  return { results: passing.sort((a, b) => b.crag_score - a.crag_score), fallback_used: false };
}
```

### 12.3 Self-RAG scaffold grader

```typescript
// src/rag/self-grader.ts
const CONVENTIONS = [
  { id: 'single-export', check: 'Single export default function decorate(block)' },
  { id: 'no-deps',       check: 'No external dependencies — vanilla JS only' },
  { id: 'in-place',      check: 'DOM manipulation in-place; does not replace block element' },
  { id: 'lana-log',      check: 'Uses window.lana.log not console' },
  { id: 'lazy-load',     check: 'Lazy-loads heavy resources (images, iframes)' },
];

export async function gradeScaffold(js: string, llm: LLMClient): Promise<SelfRAGResult> {
  const { grades, violations } = JSON.parse(await llm.complete({
    prompt: `Grade this Milo block scaffold:
${CONVENTIONS.map(c => `- ${c.id}: ${c.check}`).join('\n')}

\`\`\`javascript
${js}
\`\`\`

SUPPORT | CRITIQUE | NO_SUPPORT per convention.
JSON only: { "grades": { [id]: string }, "violations": string[] }`,
    max_tokens: 300,
  }));

  const passCount = Object.values(grades).filter(g => g === 'SUPPORT').length;
  const score = passCount / CONVENTIONS.length;
  const grade = violations.length === 0 ? 'PASS'
    : violations.length === 1 ? 'PASS_WITH_WARNINGS'
    : 'FAIL';

  return { grade, score, violations, grades, regeneration_attempts: 0 };
}
```

### 12.4 RAGAS evaluation runner

```typescript
// src/rag/evaluation/runner.ts
import dataset from '../../eval/golden-dataset.json' assert { type: 'json' };

const THRESHOLDS = { faithfulness: 0.85, answer_relevancy: 0.80, context_precision: 0.75, context_recall: 0.70 };

export async function runEvaluation() {
  const results = await Promise.allSettled(dataset.queries.map(async (q) => {
    const retrieved = await searchBlocks({ query: q.query, limit: 5, explain: true });
    return {
      query: q.query,
      expected: q.expected_blocks,
      faithfulness:       computeFaithfulness(retrieved.results, q.expected_blocks),
      answer_relevancy:   computeAnswerRelevancy(q.query, retrieved.results[0]),
      context_precision:  computeContextPrecision(retrieved.results, q.expected_blocks),
      context_recall:     computeContextRecall(retrieved.results, q.expected_blocks),
    };
  }));

  const metrics = aggregateMetrics(results);
  console.table(metrics);

  const failed = Object.entries(THRESHOLDS).filter(([k, min]) => metrics[k] < min);
  if (failed.length > 0) {
    console.error(`RAGAS gate FAILED: ${failed.map(([k]) => k).join(', ')} below threshold`);
    process.exit(1);
  }
  console.log('RAGAS gate PASSED. Phase 2 may begin.');
}
```

### 12.5 GitHub API — atomic file write

```typescript
// src/github/file-writer.ts
export async function commitFiles(
  repo: string, branch: string,
  files: { path: string; content: string }[],
  message: string
): Promise<string> {
  const { data: ref } = await octokit.git.getRef({ owner: 'adobecom', repo, ref: `heads/${branch}` });
  const baseSha = ref.object.sha;

  const blobs = await Promise.all(files.map(f =>
    octokit.git.createBlob({ owner: 'adobecom', repo, content: btoa(f.content), encoding: 'base64' })
  ));
  const { data: baseCommit } = await octokit.git.getCommit({ owner: 'adobecom', repo, commit_sha: baseSha });
  const { data: tree } = await octokit.git.createTree({
    owner: 'adobecom', repo, base_tree: baseCommit.tree.sha,
    tree: blobs.map((blob, i) => ({ path: files[i].path, mode: '100644', type: 'blob', sha: blob.data.sha }))
  });
  const { data: commit } = await octokit.git.createCommit({
    owner: 'adobecom', repo, message, tree: tree.sha, parents: [baseSha]
  });
  await octokit.git.updateRef({ owner: 'adobecom', repo, ref: `heads/${branch}`, sha: commit.sha });
  return commit.sha;
}
// Always create a new feature branch. Never commit directly to stage or main.
```

### 12.6 Block index startup

```typescript
import pLimit from 'p-limit';
const limit = pLimit(10); // max 10 parallel GitHub API calls
const descriptions = await Promise.allSettled(blocks.map(b => limit(() => fetchBlockDescription(b))));
// Target: < 30 seconds for 200 blocks with GITHUB_TOKEN set
// Embed as: "{name}: {jsdoc @description}" → Float32Array (384 dims × 200 blocks ≈ 300KB)
```

---

## 13. Open Questions

1. **Write token ownership.** Service account vs user PAT? Recommendation: user PAT for correct commit attribution. Document in README.

2. **New block destination.** Milo core vs child project is a human decision. `create_block` with `project === "milo"` should surface a confirmation prompt (higher blast radius — 100+ consumers).

3. **`?milolibs=` branch naming convention.** Standard for naming a Milo branch that child projects test against? Affects `get_preview_url`.

4. **DA MCP auth.** IMS token or service credential? Confirm with DA team before Phase 5.

5. **MEP / experimentation tools.** Deferred. Add as Phase 6 after Phase 5 is stable.

6. **`refresh_index` strategy.** Expose as a tool call. Add a cheap GitHub tree ETag check to detect staleness without re-fetching all 200 blocks.

7. **RAGAS golden dataset maintenance.** Who owns the 30-query set as the block library grows? Recommended: use an LLM to generate candidate queries for new blocks; queue for human approval before adding to the dataset.

8. **Self-RAG hard block.** Currently: FAIL → no PR opened, violations returned. Should FAIL also block `create_block` from returning the scaffold at all? Recommendation: return the scaffold with violations clearly labelled so the user can manually fix and re-submit.

---

## Appendix A: Environment Variables

```bash
GITHUB_TOKEN=ghp_...                   # read:repo — required for all operations
GITHUB_WRITE_TOKEN=ghp_...             # repo — required for write tools
FIGMA_API_KEY=figd_...                 # required for design-to-code tools
DA_API_TOKEN=...                       # required for DA authoring tools

MILO_REPO_OWNER=adobecom
MILO_REPO_NAME=milo
MILO_DEFAULT_BRANCH=stage

EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
CRAG_THRESHOLD=0.6
SELF_RAG_MAX_ATTEMPTS=2
```

---

## Appendix B: `package.json`

```json
{
  "name": "milo-mcp",
  "version": "0.2.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "test": "vitest",
    "eval": "tsx src/rag/evaluation/runner.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@octokit/rest": "^21.0.0",
    "@xenova/transformers": "^2.17.0",
    "p-limit": "^6.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## Appendix C: RAG decision tree (quick reference)

```
Is the exact block name stated in the query?
  YES → LOOKUP → direct GitHub API, no embedding
  NO  ↓

Does the query mention Figma / design / "create a page"?
  YES → MULTI_SOURCE → Agentic RAG
  NO  ↓

Does the query contain 2+ of: all/which/compare/override/audit/lag/stale/outdated?
  YES → COMPOSITIONAL → Iterative RAG (max 3 passes)
  NO  ↓

Default → SEMANTIC → cosine similarity + CRAG
          CRAG survivors < 2 → external fallback (milo.adobe.com docs)
```

---

*v2 — For Claude Code / Cursor. Start at Phase 1, `src/server.ts`. All tool inputs use Zod schemas defined in each tool file. RAGAS gate (all four thresholds) must pass before Phase 2 begins.*
