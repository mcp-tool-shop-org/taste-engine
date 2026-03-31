import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type {
  EnforcementMode,
  DetectedArtifact,
  ArtifactGateResult,
  GateRunResult,
} from "./gate-types.js";
import { verdictToGateResult, verdictToRepairPath, computeOverallResult } from "./gate-types.js";
import { insertCandidateArtifact } from "../artifacts/candidate-artifacts.js";
import { runReview } from "../review/review-engine.js";
import { getObservations, getSuggestions } from "../review/review-store.js";

export type GateCallbacks = {
  onArtifactStart?: (artifact: DetectedArtifact, index: number, total: number) => void;
  onArtifactComplete?: (result: ArtifactGateResult, index: number) => void;
};

/**
 * Run the workflow gate on a set of detected artifacts.
 */
export async function runGate(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    projectId: string;
    canonVersion: string;
    artifacts: DetectedArtifact[];
    mode: EnforcementMode;
    callbacks?: GateCallbacks;
  },
): Promise<GateRunResult> {
  const { projectId, canonVersion, artifacts, mode, callbacks } = opts;
  const errors: string[] = [];
  const results: ArtifactGateResult[] = [];

  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    callbacks?.onArtifactStart?.(artifact, i, artifacts.length);

    try {
      // Create candidate artifact
      const candidate = insertCandidateArtifact(
        db, projectId,
        artifact.title,
        artifact.artifact_type,
        `Gate review of ${artifact.path}`,
        artifact.body,
      );

      // Run review
      const reviewResult = await runReview(db, provider, {
        projectId,
        canonVersion,
        candidate,
      });

      const verdict = reviewResult.alignmentReview.verdict;
      const gateResult = verdictToGateResult(verdict as any, mode);
      const repairPath = verdictToRepairPath(verdict as any);

      // Build summary from observations
      const observations = getObservations(db, reviewResult.alignmentReview.id);
      const driftObs = observations.filter((o) => o.kind === "drift" || o.kind === "conflict");
      const summary = driftObs.length > 0
        ? driftObs.map((o) => o.text).join("; ")
        : reviewResult.alignmentReview.summary;

      const artifactResult: ArtifactGateResult = {
        artifact,
        verdict: verdict as any,
        gate_result: gateResult,
        summary,
        repair_available: repairPath !== null,
        repair_path: repairPath,
      };

      results.push(artifactResult);
      callbacks?.onArtifactComplete?.(artifactResult, i);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${artifact.path}: ${msg}`);
      results.push({
        artifact,
        verdict: "salvageable_drift" as any,
        gate_result: "warn",
        summary: `Review failed: ${msg}`,
        repair_available: false,
        repair_path: null,
      });
    }
  }

  const overall = computeOverallResult(results);

  return {
    overall,
    mode,
    canon_version: canonVersion,
    artifacts_checked: results.length,
    artifacts_passed: results.filter((r) => r.gate_result === "pass").length,
    artifacts_warned: results.filter((r) => r.gate_result === "warn").length,
    artifacts_blocked: results.filter((r) => r.gate_result === "block").length,
    results,
    errors,
  };
}

/**
 * Format gate result as JSON for machine consumption.
 */
export function gateResultToJson(result: GateRunResult): string {
  return JSON.stringify({
    overall: result.overall,
    mode: result.mode,
    canon_version: result.canon_version,
    summary: {
      checked: result.artifacts_checked,
      passed: result.artifacts_passed,
      warned: result.artifacts_warned,
      blocked: result.artifacts_blocked,
    },
    artifacts: result.results.map((r) => ({
      path: r.artifact.path,
      type: r.artifact.artifact_type,
      verdict: r.verdict,
      gate: r.gate_result,
      repair: r.repair_path,
      summary: r.summary,
    })),
    errors: result.errors,
  }, null, 2);
}
