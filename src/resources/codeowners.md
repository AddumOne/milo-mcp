# CODEOWNERS in Milo and milo-mcp

> Published as `milo://conventions/codeowners`

## Where the file lives (Milo core)

In **adobecom/milo**, the active CODEOWNERS file is at the **repository root**:

- Path in repo: `CODEOWNERS`
- Default branch is usually `main` (confirm on GitHub if needed).

GitHub also allows CODEOWNERS under `.github/CODEOWNERS` or `docs/CODEOWNERS`. The Milo core repo uses the **root** file, not `.github/CODEOWNERS`.

## What it does

CODEOWNERS assigns GitHub teams or users to path patterns (for example `libs/blocks/` subtrees). It drives review routing and documents who owns each area of the codebase.

## How milo-mcp uses it

The server reads CODEOWNERS **only from the repo root** via the GitHub Contents API, path **`CODEOWNERS`** (no `.github/` prefix). That matches Milo core today.

Used when:

- Building the block index (owners attached to block metadata).
- **`get_block`** — response field `owner` is the list of GitHub handles from CODEOWNERS for that block’s directory.
- **`list_blocks`** — each row includes `owner` resolved the same way.
- **`get_block_codeowner`** — declared teams/individuals from Milo’s `CODEOWNERS` when the block exists in Milo core (even if the resolved file is in a child repo), plus active contributors from commits on the block directory.

If the file is missing or only exists at `.github/CODEOWNERS`, milo-mcp will **not** load it and `owner` arrays will be empty for that repository.

## Getting answers without guessing

| Question | What to use |
|----------|-------------|
| Where is Milo’s CODEOWNERS file? | This resource (`milo://conventions/codeowners`) — root `CODEOWNERS` on **adobecom/milo**. |
| Who owns block X (declared handles)? | **`get_block`** or **`list_blocks`** for the relevant `project` — use the `owner` field (live GitHub + CODEOWNERS). |
| Who owns block X (teams vs individuals + recent commit activity)? | **`get_block_codeowner`** — combines Milo `CODEOWNERS` when applicable with commit counts on the resolved block path. |
| Full file contents / line-by-line rules | Open the file on GitHub or clone the repo — it is not duplicated inside milo-mcp (would go stale). |
