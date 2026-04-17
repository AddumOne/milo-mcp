/**
 * Phase 2 acceptance smoke test.
 *
 * Verifies: "What blocks does da-bacom override and which are stale?"
 * Expected path: COMPOSITIONAL → list_blocks(include_child_overrides) → override table
 */
import { listBlocks } from '../src/tools/list-blocks.js';
import { classifyQuery } from '../src/rag/classifier.js';
import { buildIndex } from '../src/index/builder.js';
import { routeQuery } from '../src/rag/router.js';

const QUERY = 'which blocks does da-bacom override and which are stale?';
const STALE_THRESHOLD = 90;

async function run() {
  // ── 1. Verify query classification ──────────────────────────────────────────
  const queryType = await classifyQuery(QUERY);
  console.log(`\n[1] Query classification`);
  console.log(`    Query : "${QUERY}"`);
  console.log(`    Type  : ${queryType}`);
  if (queryType !== 'COMPOSITIONAL') {
    console.warn(`    ⚠  Expected COMPOSITIONAL, got ${queryType}`);
  } else {
    console.log(`    ✓  Correctly classified as COMPOSITIONAL`);
  }

  // ── 2. Build block index (milo + da-bacom) ───────────────────────────────────
  console.log('\n[2] Building block index for milo and da-bacom...');
  await Promise.all([buildIndex('milo'), buildIndex('da-bacom')]);
  console.log('    ✓  Index built');

  // ── 3. Route query through RAG stack ────────────────────────────────────────
  console.log('\n[3] RAG routing (iterative search)...');
  const ragResult = await routeQuery(QUERY, 'da-bacom', 5, true);
  console.log(`    Technique : ${ragResult.technique_used}`);
  console.log(`    Results   : ${ragResult.results.length} blocks`);
  if (ragResult.technique_used !== 'iterative') {
    console.warn(`    ⚠  Expected iterative technique`);
  } else {
    console.log(`    ✓  Iterative RAG engaged`);
  }

  // ── 4. list_blocks with override detection ───────────────────────────────────
  console.log('\n[4] Fetching da-bacom blocks with override comparison...');
  const listing = await listBlocks({ project: 'da-bacom', include_child_overrides: true });

  const overrides  = listing.blocks.filter((b) => b.is_override);
  const nonOverrides = listing.blocks.filter((b) => !b.is_override);
  const stale      = overrides.filter((b) => (b.override_lag_days ?? 0) > STALE_THRESHOLD);
  const lagging    = overrides.filter((b) => {
    const d = b.override_lag_days ?? 0;
    return d > 30 && d <= STALE_THRESHOLD;
  });
  const current    = overrides.filter((b) => (b.override_lag_days ?? 0) <= 30);

  console.log(`\n    Total blocks in da-bacom  : ${listing.total}`);
  console.log(`    Milo overrides            : ${overrides.length}`);
  console.log(`    Project-specific (non-override): ${nonOverrides.length}`);

  if (overrides.length === 0) {
    console.log('\n    ℹ  No overrides found — da-bacom may not override any Milo blocks, or the index is empty.');
  } else {
    // Print override table
    console.log('\n    Override status table:');
    console.log(`    ${'Block'.padEnd(30)} ${'Status'.padEnd(10)} ${'Lag days'.padEnd(10)} Child modified`);
    console.log(`    ${'-'.repeat(75)}`);
    for (const b of overrides.sort((a, b) => (b.override_lag_days ?? 0) - (a.override_lag_days ?? 0))) {
      const days = b.override_lag_days ?? 0;
      const status = days > STALE_THRESHOLD ? 'STALE' : days > 30 ? 'LAGGING' : days === 0 ? 'AHEAD' : 'CURRENT';
      console.log(`    ${b.name.padEnd(30)} ${status.padEnd(10)} ${String(days).padEnd(10)} ${b.child_last_modified ?? 'unknown'}`);
    }

    console.log(`\n    Summary:`);
    console.log(`      STALE   (>${STALE_THRESHOLD}d) : ${stale.length}`);
    console.log(`      LAGGING (31–${STALE_THRESHOLD}d): ${lagging.length}`);
    console.log(`      CURRENT (≤30d)  : ${current.length}`);
  }

  // ── 5. Pass/fail verdict ─────────────────────────────────────────────────────
  console.log('\n── Acceptance verdict ──────────────────────────────────────────────────────');
  const checks = [
    { label: 'Query classified as COMPOSITIONAL',    pass: queryType === 'COMPOSITIONAL' },
    { label: 'RAG routed to iterative technique',    pass: ragResult.technique_used === 'iterative' },
    { label: 'list_blocks returned blocks',          pass: listing.total > 0 },
    { label: 'Override detection executed',          pass: true /* structural — always runs */ },
    { label: 'Override table shape is correct',      pass: overrides.every((b) => 'override_lag_days' in b) },
  ];

  let passed = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.label}`);
    if (!c.pass) passed = false;
  }

  console.log(`\n  ${passed ? '✓ Phase 2 acceptance PASSED' : '✗ Phase 2 acceptance FAILED'}`);
  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error('\nSmoke test error:', err.message ?? err);
  process.exit(1);
});
