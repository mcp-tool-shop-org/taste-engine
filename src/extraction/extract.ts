import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type { SourceArtifact } from "../core/types.js";
import type { PassType, ExtractionRun } from "./extraction-types.js";
import { PASS_TYPES } from "./extraction-types.js";
import {
  createExtractionRun,
  completeExtractionRun,
  getExtractionRun,
  createPassResult,
  getPassResults,
} from "./extraction-store.js";
import { runPass, type PassRunResult } from "./pass-runner.js";
import { consolidateCandidates, type ConsolidationResult } from "./consolidation.js";

export type ExtractionResult = {
  run: ExtractionRun;
  passResults: PassRunResult[];
  consolidation: ConsolidationResult;
  totalErrors: number;
};

/** Default pass set (all 8 passes). */
export const DEFAULT_PASSES: PassType[] = [...PASS_TYPES];

/** Minimum proving set (thesis + anti-pattern + pattern + contradiction). */
export const CORE_PASSES: PassType[] = [
  "thesis",
  "anti_pattern",
  "pattern",
  "contradiction",
];

/**
 * Run a full multi-pass extraction against source artifacts.
 */
export async function runExtraction(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    projectId: string;
    sources: SourceArtifact[];
    passes?: PassType[];
    retries?: number;
    onPassStart?: (passType: PassType) => void;
    onPassComplete?: (result: PassRunResult) => void;
  },
): Promise<ExtractionResult> {
  const passes = opts.passes ?? DEFAULT_PASSES;

  // Create the extraction run
  const run = createExtractionRun(db, {
    project_id: opts.projectId,
    source_artifact_ids: opts.sources.map((s) => s.id),
    provider: provider.name(),
    model: "configured",
    passes,
  });

  const passResults: PassRunResult[] = [];
  let totalErrors = 0;

  // Run each pass sequentially
  for (const passType of passes) {
    opts.onPassStart?.(passType);

    const passRecord = createPassResult(db, run.id, passType);
    const result = await runPass(db, provider, {
      passId: passRecord.id,
      passType,
      runId: run.id,
      projectId: opts.projectId,
      sources: opts.sources,
      retries: opts.retries,
    });

    passResults.push(result);
    totalErrors += result.errors.length;

    opts.onPassComplete?.(result);
  }

  // Consolidate candidates
  const consolidation = consolidateCandidates(db, run.id);

  // Complete the run
  const finalStatus = totalErrors > 0 && passResults.every((r) => r.errors.length > 0) ? "failed" : "completed";
  completeExtractionRun(db, run.id, finalStatus);

  // Re-fetch the run with updated status
  const completedRun = getExtractionRun(db, run.id)!;

  return { run: completedRun, passResults, consolidation, totalErrors };
}
