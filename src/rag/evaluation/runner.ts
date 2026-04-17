import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { searchBlocks } from '../../tools/search-blocks.js';
import {
  computeFaithfulness,
  computeAnswerRelevancy,
  computeContextPrecision,
  computeContextRecall,
  aggregateMetrics,
  type QueryResult,
} from './ragas.js';
import { buildAllIndexes } from '../../index/builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenQuery {
  query: string;
  type: string;
  expected_blocks: string[];
}

interface GoldenDataset {
  queries: GoldenQuery[];
}

const THRESHOLDS = {
  faithfulness: 0.85,
  answer_relevancy: 0.80,
  context_precision: 0.75,
  context_recall: 0.70,
};

import { RESULTS_PATH, type EvalResults } from './results.js';

function saveEvalResults(data: EvalResults): void {
  const dir = dirname(RESULTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2));
}

export async function runEvaluation(): Promise<void> {
  console.log('Building block index...');
  await buildAllIndexes();
  console.log('Index built. Running RAGAS evaluation...\n');

  const datasetPath = join(__dirname, '../../../eval/golden-dataset.json');
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as GoldenDataset;

  const results = await Promise.allSettled(
    dataset.queries.map(async (q): Promise<QueryResult> => {
      const retrieved = await searchBlocks({ query: q.query, limit: 5, explain: true });
      return {
        query: q.query,
        expected: q.expected_blocks,
        faithfulness: computeFaithfulness(retrieved.results, q.expected_blocks),
        answer_relevancy: computeAnswerRelevancy(q.query, retrieved.results[0], q.expected_blocks),
        context_precision: computeContextPrecision(retrieved.results, q.expected_blocks),
        context_recall: computeContextRecall(retrieved.results, q.expected_blocks),
      };
    }),
  );

  // Show per-query results
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<QueryResult> => r.status === 'fulfilled',
  );
  console.table(
    fulfilled.map((r) => ({
      query: r.value.query.slice(0, 50),
      faithfulness: r.value.faithfulness.toFixed(2),
      relevancy: r.value.answer_relevancy.toFixed(2),
      precision: r.value.context_precision.toFixed(2),
      recall: r.value.context_recall.toFixed(2),
    })),
  );

  const metrics = aggregateMetrics(results);
  console.log('\n--- Aggregated RAGAS Metrics ---');
  console.table({
    faithfulness: { score: metrics.faithfulness.toFixed(3), threshold: THRESHOLDS.faithfulness, pass: metrics.faithfulness >= THRESHOLDS.faithfulness ? '✓' : '✗' },
    answer_relevancy: { score: metrics.answer_relevancy.toFixed(3), threshold: THRESHOLDS.answer_relevancy, pass: metrics.answer_relevancy >= THRESHOLDS.answer_relevancy ? '✓' : '✗' },
    context_precision: { score: metrics.context_precision.toFixed(3), threshold: THRESHOLDS.context_precision, pass: metrics.context_precision >= THRESHOLDS.context_precision ? '✓' : '✗' },
    context_recall: { score: metrics.context_recall.toFixed(3), threshold: THRESHOLDS.context_recall, pass: metrics.context_recall >= THRESHOLDS.context_recall ? '✓' : '✗' },
  });

  const failed = (Object.entries(THRESHOLDS) as [keyof typeof THRESHOLDS, number][])
    .filter(([k, min]) => metrics[k] < min)
    .map(([k]) => k);

  // Save results to disk for the MCP eval-results resource
  saveEvalResults({
    timestamp: new Date().toISOString(),
    thresholds: THRESHOLDS,
    aggregated: { ...metrics },
    passed: failed.length === 0,
    queries: fulfilled.map((r) => ({
      query: r.value.query,
      faithfulness: r.value.faithfulness,
      answer_relevancy: r.value.answer_relevancy,
      context_precision: r.value.context_precision,
      context_recall: r.value.context_recall,
    })),
  });

  if (failed.length > 0) {
    console.error(`\nRAGAS gate FAILED: ${failed.join(', ')} below threshold`);
    process.exit(1);
  }
  console.log('\nRAGAS gate PASSED. Phase 2 may begin.');
}

// Run when executed directly
runEvaluation().catch((err) => {
  console.error(err);
  process.exit(1);
});
