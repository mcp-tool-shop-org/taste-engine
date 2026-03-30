import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type { CandidateArtifact } from "../core/types.js";
import type {
  RevisionRun,
  RevisionOption,
  RevisionBrief,
  ScoredRevision,
  LlmRevisionOutput,
} from "./revision-types.js";
import { buildCanonPacket, formatPacketForPrompt } from "../review/canon-packet.js";
import { runReview } from "../review/review-engine.js";
import { getObservations, getSuggestions, getAlignmentReview } from "../review/review-store.js";
import { insertCandidateArtifact } from "../artifacts/candidate-artifacts.js";
import { REVISION_SYSTEM, REVISION_PROMPT_TEMPLATE } from "./revision-prompts.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";
import { z } from "zod";

const LlmRevisionSchema = z.object({
  preserved_intent: z.string().min(1),
  preserved_strengths: z.array(z.string()),
  minimal: z.object({
    body: z.string().min(1),
    changes: z.array(z.object({
      change: z.string(),
      drift_fixed: z.string(),
      canon_restored: z.string(),
    })),
    unresolved_tradeoffs: z.array(z.string()),
  }),
  strong: z.object({
    body: z.string().min(1),
    changes: z.array(z.object({
      change: z.string(),
      drift_fixed: z.string(),
      canon_restored: z.string(),
    })),
    unresolved_tradeoffs: z.array(z.string()),
  }),
});

const VERDICT_TIERS = ["contradiction", "hard_drift", "salvageable_drift", "mostly_aligned", "aligned"];

export type RevisionResult = {
  run: RevisionRun;
  brief: RevisionBrief;
  options: ScoredRevision[];
  errors: string[];
};

/**
 * Run revision mode on a reviewed artifact.
 *
 * Pipeline:
 * 1. Load the source review
 * 2. Build a revision brief from review findings
 * 3. Generate minimal + strong revision options
 * 4. Re-review each option against the same canon
 * 5. Score tier improvement
 */
export async function runRevision(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    projectId: string;
    canonVersion: string;
    candidate: CandidateArtifact;
    reviewId: string;
    onStep?: (step: string) => void;
  },
): Promise<RevisionResult> {
  const { projectId, canonVersion, candidate, reviewId } = opts;
  const errors: string[] = [];
  const ts = now();

  // Create revision run
  const runId = newId();
  const run: RevisionRun = {
    id: runId,
    project_id: projectId,
    canon_version: canonVersion,
    candidate_artifact_id: candidate.id,
    source_review_id: reviewId,
    status: "running",
    started_at: ts,
    completed_at: null,
  };

  // Step 1: Load source review
  opts.onStep?.("Loading review findings");
  const review = getAlignmentReview(db, candidate.id);
  if (!review) {
    errors.push("Source review not found");
    run.status = "failed";
    run.completed_at = now();
    return { run, brief: { artifact_id: candidate.id, review_id: reviewId, preserve_intent: "", drift_points: [], keep_strengths: [] }, options: [], errors };
  }

  const observations = getObservations(db, review.id);
  const suggestions = getSuggestions(db, review.id);

  // Step 2: Build revision brief
  const driftPoints = observations
    .filter((o) => o.kind === "drift" || o.kind === "conflict")
    .map((o) => o.text);
  const keepStrengths = observations
    .filter((o) => o.kind === "preserved")
    .map((o) => o.text);

  // Add suggestion guidance to drift points
  for (const s of suggestions) {
    if (s.action === "revise" || s.action === "cut") {
      driftPoints.push(`[${s.action}] ${s.guidance}${s.target_excerpt ? ` (target: "${s.target_excerpt}")` : ""}`);
    }
  }

  const brief: RevisionBrief = {
    artifact_id: candidate.id,
    review_id: reviewId,
    preserve_intent: candidate.intended_purpose,
    drift_points: driftPoints,
    keep_strengths: keepStrengths,
  };

  // Step 3: Build canon packet for revision context
  opts.onStep?.("Building canon context");
  const packet = buildCanonPacket(
    db, projectId, canonVersion,
    candidate.artifact_type,
    ["product"],
    candidate.body,
  );

  // Step 4: Generate revisions
  opts.onStep?.("Generating revision options");
  const prompt = REVISION_PROMPT_TEMPLATE
    .replace("{{artifactType}}", candidate.artifact_type)
    .replace("{{purpose}}", candidate.intended_purpose)
    .replace("{{candidateBody}}", candidate.body)
    .replace("{{verdict}}", review.verdict)
    .replace("{{thesis}}", review.thesis_preservation)
    .replace("{{pattern}}", review.pattern_fidelity)
    .replace("{{antiPattern}}", review.anti_pattern_collision)
    .replace("{{voice}}", review.voice_naming_fit)
    .replace("{{driftPoints}}", driftPoints.map((d) => `- ${d}`).join("\n"))
    .replace("{{keepStrengths}}", keepStrengths.length > 0 ? keepStrengths.map((s) => `- ${s}`).join("\n") : "- (none identified)")
    .replace("{{canonPacket}}", formatPacketForPrompt(packet));

  const result = await provider.completeJson<LlmRevisionOutput>({
    task: "revision_generate",
    system: REVISION_SYSTEM,
    prompt,
    schemaName: "LlmRevisionOutput",
  });

  if (!result.ok) {
    errors.push(`Revision generation failed: ${result.error}`);
    run.status = "failed";
    run.completed_at = now();
    return { run, brief, options: [], errors };
  }

  const parsed = LlmRevisionSchema.safeParse(result.data);
  if (!parsed.success) {
    errors.push(`Invalid revision output: ${parsed.error.message}`);
    run.status = "failed";
    run.completed_at = now();
    return { run, brief, options: [], errors };
  }

  const revData = parsed.data;

  // Build revision options
  const minimalOption: RevisionOption = {
    id: newId(),
    revision_run_id: runId,
    level: "minimal",
    body: revData.minimal.body,
    change_rationale: revData.minimal.changes,
    preserved_intent: revData.preserved_intent,
    preserved_strengths: revData.preserved_strengths,
    unresolved_tradeoffs: revData.minimal.unresolved_tradeoffs,
  };

  const strongOption: RevisionOption = {
    id: newId(),
    revision_run_id: runId,
    level: "strong",
    body: revData.strong.body,
    change_rationale: revData.strong.changes,
    preserved_intent: revData.preserved_intent,
    preserved_strengths: revData.preserved_strengths,
    unresolved_tradeoffs: revData.strong.unresolved_tradeoffs,
  };

  // Step 5: Re-review each option
  const scoredOptions: ScoredRevision[] = [];
  const sourceVerdict = review.verdict;
  const sourceTier = VERDICT_TIERS.indexOf(sourceVerdict);

  for (const option of [minimalOption, strongOption]) {
    opts.onStep?.(`Re-reviewing ${option.level} revision`);

    // Create a candidate artifact for the revision
    const revCandidate = insertCandidateArtifact(
      db, projectId,
      `${candidate.title} (${option.level} revision)`,
      candidate.artifact_type,
      candidate.intended_purpose,
      option.body,
    );

    try {
      const reReview = await runReview(db, provider, {
        projectId,
        canonVersion,
        candidate: revCandidate,
      });

      const newTier = VERDICT_TIERS.indexOf(reReview.alignmentReview.verdict);

      scoredOptions.push({
        option,
        re_review_verdict: reReview.alignmentReview.verdict,
        thesis_preservation: reReview.alignmentReview.thesis_preservation,
        pattern_fidelity: reReview.alignmentReview.pattern_fidelity,
        anti_pattern_collision: reReview.alignmentReview.anti_pattern_collision,
        voice_naming_fit: reReview.alignmentReview.voice_naming_fit,
        tier_improvement: newTier - sourceTier,
      });
    } catch (err) {
      errors.push(`Re-review of ${option.level} failed: ${err}`);
      scoredOptions.push({
        option,
        re_review_verdict: "unknown",
        thesis_preservation: "mixed",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "minor",
        voice_naming_fit: "mixed",
        tier_improvement: 0,
      });
    }
  }

  run.status = "completed";
  run.completed_at = now();

  return { run, brief, options: scoredOptions, errors };
}
