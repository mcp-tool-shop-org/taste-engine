import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type { CandidateArtifact } from "../core/types.js";
import type { GoalRedirectionBrief, LlmRedirectionOutput } from "./redirect-types.js";
import { buildCanonPacket, formatPacketForPrompt } from "../review/canon-packet.js";
import { getAlignmentReview, getObservations } from "../review/review-store.js";
import { REDIRECT_SYSTEM, REDIRECT_PROMPT } from "./redirect-prompts.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";
import { z } from "zod";

const RedirectionSchema = z.object({
  preserved_goal: z.string().min(1),
  conflict_explanation: z.string().min(1),
  non_negotiable_constraints: z.array(z.string()),
  directions: z.array(z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    how_it_preserves_goal: z.string().min(1),
    canon_alignment: z.string().min(1),
    tradeoffs: z.array(z.string()),
  })).min(1),
  recommended_next_brief: z.string().min(1),
});

export type RedirectResult = {
  brief: GoalRedirectionBrief | null;
  errors: string[];
};

export async function runRedirect(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    projectId: string;
    canonVersion: string;
    candidate: CandidateArtifact;
    reviewId: string;
    onStep?: (step: string) => void;
  },
): Promise<RedirectResult> {
  const { projectId, canonVersion, candidate, reviewId } = opts;
  const errors: string[] = [];

  // Load review
  opts.onStep?.("Loading review");
  const review = getAlignmentReview(db, candidate.id);
  if (!review) {
    return { brief: null, errors: ["Source review not found"] };
  }

  const observations = getObservations(db, review.id);
  const driftPoints = observations.filter((o) => o.kind === "drift").map((o) => o.text);
  const conflicts = observations.filter((o) => o.kind === "conflict").map((o) => o.text);

  // Build canon packet
  opts.onStep?.("Building canon context");
  const packet = buildCanonPacket(db, projectId, canonVersion, candidate.artifact_type, ["product"], candidate.body);
  const packetText = formatPacketForPrompt(packet);

  // Generate redirection brief
  opts.onStep?.("Generating redirection brief");
  const prompt = REDIRECT_PROMPT
    .replace("{{artifactType}}", candidate.artifact_type)
    .replace("{{purpose}}", candidate.intended_purpose)
    .replace("{{candidateBody}}", candidate.body)
    .replace("{{verdict}}", review.verdict)
    .replace("{{reviewSummary}}", review.summary)
    .replace("{{driftPoints}}", driftPoints.length > 0 ? driftPoints.map((d) => `- ${d}`).join("\n") : "- (none)")
    .replace("{{conflicts}}", conflicts.length > 0 ? conflicts.map((c) => `- ${c}`).join("\n") : "- (none)")
    .replace("{{canonPacket}}", packetText);

  const result = await provider.completeJson<LlmRedirectionOutput>({
    task: "goal_redirection",
    system: REDIRECT_SYSTEM,
    prompt,
    schemaName: "LlmRedirectionOutput",
  });

  if (!result.ok) {
    return { brief: null, errors: [`Redirection failed: ${result.error}`] };
  }

  const parsed = RedirectionSchema.safeParse(result.data);
  if (!parsed.success) {
    return { brief: null, errors: [`Invalid redirection output: ${parsed.error.message}`] };
  }

  const data = parsed.data;
  const brief: GoalRedirectionBrief = {
    id: newId(),
    project_id: projectId,
    source_artifact_id: candidate.id,
    source_review_id: review.id,
    canon_version: canonVersion,
    preserved_goal: data.preserved_goal,
    conflict_explanation: data.conflict_explanation,
    non_negotiable_constraints: data.non_negotiable_constraints,
    directions: data.directions,
    recommended_next_brief: data.recommended_next_brief,
    created_at: now(),
  };

  return { brief, errors };
}
