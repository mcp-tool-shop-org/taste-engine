import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type { CandidateArtifact, AlignmentReview } from "../core/types.js";
import type {
  Dimension,
  DimensionEvaluation,
  LlmDimensionOutput,
  LlmSynthesisOutput,
} from "./review-run-types.js";
import { DIMENSIONS } from "./review-run-types.js";
import type { DimensionRating, CollisionRating, ObservationKind, RevisionAction } from "../core/enums.js";
import { DIMENSION_RATINGS, COLLISION_RATINGS, VERDICTS } from "../core/enums.js";
import { buildCanonPacket, formatPacketForPrompt, type CanonPacket } from "./canon-packet.js";
import {
  getDimensionPrompt,
  fillPrompt,
  SYNTHESIS_SYSTEM,
  SYNTHESIS_PROMPT_TEMPLATE,
} from "./dimension-prompts.js";
import {
  createReviewRun,
  completeReviewRun,
  insertPacketItems,
  insertDimensionEval,
  insertAlignmentReview,
  insertObservations,
  insertSuggestions,
  getReviewRun,
} from "./review-store.js";
import { synthesizeVerdict, extractRatings, reconcileVerdict } from "./verdict-synthesis.js";
import { now } from "../util/timestamps.js";
import { z } from "zod";

const LlmDimensionSchema = z.object({
  rating: z.string(),
  judgment: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence_statement_ids: z.array(z.string()),
  notes: z.array(z.string()),
});

const LlmSynthesisSchema = z.object({
  verdict: z.string(),
  summary: z.string().min(1),
  preserved: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.string()) })),
  drift_points: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.string()) })),
  conflicts: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.string()) })),
  uncertainties: z.array(z.string()),
  suggestions: z.array(z.object({
    action: z.enum(["keep", "cut", "revise"]),
    target_excerpt: z.string().nullable(),
    guidance: z.string(),
  })),
});

export type ReviewResult = {
  reviewRun: ReturnType<typeof createReviewRun>;
  packet: CanonPacket;
  dimensionEvals: DimensionEvaluation[];
  alignmentReview: AlignmentReview;
  errors: string[];
};

/**
 * Run a full review of a candidate artifact against curated canon.
 */
export async function runReview(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    projectId: string;
    canonVersion: string;
    candidate: CandidateArtifact;
    onDimensionStart?: (dim: Dimension) => void;
    onDimensionComplete?: (dim: Dimension, rating: string) => void;
  },
): Promise<ReviewResult> {
  const { projectId, canonVersion, candidate } = opts;
  const errors: string[] = [];

  // Step 1: Build canon packet
  const packet = buildCanonPacket(
    db, projectId, canonVersion,
    candidate.artifact_type,
    ["product"], // default scope
    candidate.body,
  );

  // Step 2: Create review run
  const reviewRun = createReviewRun(db, {
    project_id: projectId,
    canon_version: canonVersion,
    candidate_artifact_id: candidate.id,
    provider: provider.name(),
    model: "configured",
    canon_packet_size: packet.statements.length + packet.tensions.length,
  });

  // Persist packet composition
  insertPacketItems(db, reviewRun.id, packet.items);

  // Step 3: Dimension evaluations
  const packetText = formatPacketForPrompt(packet);
  const dimensionEvals: DimensionEvaluation[] = [];

  for (const dim of DIMENSIONS) {
    opts.onDimensionStart?.(dim);

    const promptConfig = getDimensionPrompt(dim);
    const prompt = fillPrompt(promptConfig.promptTemplate, {
      artifactType: candidate.artifact_type,
      purpose: candidate.intended_purpose,
      candidateBody: candidate.body,
      canonPacket: packetText,
    });

    const result = await provider.completeJson<LlmDimensionOutput>({
      task: `review_${dim}`,
      system: promptConfig.system,
      prompt,
      schemaName: "LlmDimensionOutput",
    });

    if (!result.ok) {
      errors.push(`${dim}: ${result.error}`);
      // Insert a default "mixed" evaluation on failure
      const fallback = insertDimensionEval(db, {
        review_run_id: reviewRun.id,
        dimension: dim,
        rating: dim === "anti_pattern_collision" ? "minor" : "mixed",
        judgment: `Evaluation failed: ${result.error}`,
        confidence: 0,
        evidence_statement_ids: [],
        notes: [`Error: ${result.error}`],
      });
      dimensionEvals.push(fallback);
      opts.onDimensionComplete?.(dim, "error");
      continue;
    }

    const parsed = LlmDimensionSchema.safeParse(result.data);
    if (!parsed.success) {
      errors.push(`${dim}: invalid output — ${parsed.error.message}`);
      const fallback = insertDimensionEval(db, {
        review_run_id: reviewRun.id,
        dimension: dim,
        rating: dim === "anti_pattern_collision" ? "minor" : "mixed",
        judgment: "Invalid model output",
        confidence: 0,
        evidence_statement_ids: [],
        notes: [`Parse error: ${parsed.error.message}`],
      });
      dimensionEvals.push(fallback);
      opts.onDimensionComplete?.(dim, "error");
      continue;
    }

    // Normalize rating
    const normalizedRating = normalizeRating(dim, parsed.data.rating);

    const eval_ = insertDimensionEval(db, {
      review_run_id: reviewRun.id,
      dimension: dim,
      rating: normalizedRating,
      judgment: parsed.data.judgment,
      confidence: parsed.data.confidence,
      evidence_statement_ids: parsed.data.evidence_statement_ids,
      notes: parsed.data.notes,
    });
    dimensionEvals.push(eval_);
    opts.onDimensionComplete?.(dim, normalizedRating);
  }

  // Step 4: Deterministic verdict synthesis
  const ratings = extractRatings(dimensionEvals);
  const ruleVerdict = synthesizeVerdict(ratings);

  // Step 5: Model synthesis for summary/observations/suggestions
  const dimResultsText = dimensionEvals.map((e) =>
    `${e.dimension}: ${e.rating} (${(e.confidence * 100).toFixed(0)}%)\n  ${e.judgment}`,
  ).join("\n\n");

  const synthesisPrompt = fillPrompt(SYNTHESIS_PROMPT_TEMPLATE, {
    artifactType: candidate.artifact_type,
    purpose: candidate.intended_purpose,
    candidateBody: candidate.body,
    dimensionResults: dimResultsText,
  });

  let summary = `Verdict: ${ruleVerdict}. Dimension ratings: thesis=${ratings.thesis_preservation}, pattern=${ratings.pattern_fidelity}, anti-pattern=${ratings.anti_pattern_collision}, voice=${ratings.voice_naming_fit}.`;
  let observations: Array<{ kind: ObservationKind; text: string }> = [];
  let suggestions: Array<{ action: RevisionAction; target_excerpt: string | null; guidance: string }> = [];
  let modelVerdict: string | undefined;

  const synthResult = await provider.completeJson<LlmSynthesisOutput>({
    task: "review_synthesis",
    system: SYNTHESIS_SYSTEM,
    prompt: synthesisPrompt,
    schemaName: "LlmSynthesisOutput",
  });

  if (synthResult.ok) {
    const synthParsed = LlmSynthesisSchema.safeParse(synthResult.data);
    if (synthParsed.success) {
      const synth = synthParsed.data;
      summary = synth.summary;
      modelVerdict = synth.verdict;

      observations = [
        ...synth.preserved.map((p) => ({ kind: "preserved" as const, text: p.text })),
        ...synth.drift_points.map((d) => ({ kind: "drift" as const, text: d.text })),
        ...synth.conflicts.map((c) => ({ kind: "conflict" as const, text: c.text })),
        ...synth.uncertainties.map((u) => ({ kind: "uncertainty" as const, text: u })),
      ];

      suggestions = synth.suggestions.map((s) => ({
        action: s.action,
        target_excerpt: s.target_excerpt,
        guidance: s.guidance,
      }));
    } else {
      errors.push(`Synthesis parse error: ${synthParsed.error.message}`);
    }
  } else {
    errors.push(`Synthesis failed: ${synthResult.error}`);
  }

  // Reconcile verdict
  const { verdict, uncertainty } = reconcileVerdict(ruleVerdict, modelVerdict);
  if (uncertainty) {
    observations.push({ kind: "uncertainty", text: uncertainty });
  }

  // Step 6: Persist final review
  const alignmentReview = insertAlignmentReview(db, {
    project_id: projectId,
    candidate_artifact_id: candidate.id,
    canon_version: canonVersion,
    verdict,
    thesis_preservation: ratings.thesis_preservation,
    pattern_fidelity: ratings.pattern_fidelity,
    anti_pattern_collision: ratings.anti_pattern_collision,
    voice_naming_fit: ratings.voice_naming_fit,
    summary,
  });

  if (observations.length > 0) {
    insertObservations(db, alignmentReview.id, observations);
  }
  if (suggestions.length > 0) {
    insertSuggestions(db, alignmentReview.id, suggestions);
  }

  completeReviewRun(db, reviewRun.id, errors.length > 0 && dimensionEvals.every((e) => e.confidence === 0) ? "failed" : "completed");

  // Re-fetch run with updated status
  const completedRun = getReviewRun(db, reviewRun.id)!;

  return {
    reviewRun: completedRun as any,
    packet,
    dimensionEvals,
    alignmentReview,
    errors,
  };
}

function normalizeRating(dim: Dimension, raw: string): string {
  const lower = raw.toLowerCase();
  if (dim === "anti_pattern_collision") {
    if ((COLLISION_RATINGS as readonly string[]).includes(lower)) return lower;
    return "minor";
  }
  if ((DIMENSION_RATINGS as readonly string[]).includes(lower)) return lower;
  return "mixed";
}
