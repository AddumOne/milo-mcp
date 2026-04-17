import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const RESULTS_PATH = join(__dirname, '../../../.cache/eval-results.json');

export interface EvalResults {
  timestamp: string;
  thresholds: Record<string, number>;
  aggregated: Record<string, number>;
  passed: boolean;
  queries: { query: string; faithfulness: number; answer_relevancy: number; context_precision: number; context_recall: number }[];
}

export function loadEvalResults(): EvalResults | null {
  try {
    if (!existsSync(RESULTS_PATH)) return null;
    return JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as EvalResults;
  } catch {
    return null;
  }
}
