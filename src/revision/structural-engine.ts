import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type { CandidateArtifact } from "../core/types.js";
import type {
  StructuralRepairRun,
  GoalBrief,
  StructuralFaultBrief,
  RepairConcept,
  RepairDraft,
  RepairOutcome,
  IrreparableFinding,
  LlmGoalOutput,
  LlmFaultOutput,
  LlmRepairConceptsOutput,
  LlmRepairDraftOutput,
} from "./structural-types.js";
import { buildCanonPacket, formatPacketForPrompt } from "../review/canon-packet.js";
import { runReview } from "../review/review-engine.js";
import { getAlignmentReview, getObservations } from "../review/review-store.js";
import { insertCandidateArtifact } from "../artifacts/candidate-artifacts.js";
import {
  GOAL_EXTRACTION_SYSTEM, GOAL_EXTRACTION_PROMPT,
  FAULT_DIAGNOSIS_SYSTEM, FAULT_DIAGNOSIS_PROMPT,
  REPAIR_CONCEPTS_SYSTEM, REPAIR_CONCEPTS_PROMPT,
  REPAIR_DRAFT_SYSTEM, REPAIR_DRAFT_PROMPT,
} from "./structural-prompts.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";
import { z } from "zod";

const VERDICT_TIERS = ["contradiction", "hard_drift", "salvageable_drift", "mostly_aligned", "aligned"];

const GoalSchema = z.object({
  primary_goal: z.string().min(1),
  preserved_intent: z.array(z.string()),
  desired_user_outcomes: z.array(z.string()),
  constraints: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const FaultSchema = z.object({
  structural_fault: z.string().min(1),
  why_patch_is_insufficient: z.string().min(1),
  conflicting_canon_ids: z.array(z.string()),
  anti_pattern_ids: z.array(z.string()),
  goal_is_repairable: z.boolean(),
  notes: z.array(z.string()),
});

const ConceptsSchema = z.object({
  concepts: z.array(z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    preserved_goal: z.string().min(1),
    replacement_mechanism: z.string().min(1),
    tradeoffs: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })),
});

const DraftSchema = z.object({ body: z.string().min(1) });

export type StructuralRepairResult = {
  run: StructuralRepairRun;
  goal: GoalBrief | null;
  fault: StructuralFaultBrief | null;
  concepts: RepairConcept[];
  outcomes: RepairOutcome[];
  irreparable: IrreparableFinding | null;
  errors: string[];
};

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [k, v] of Object.entries(vars)) result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  return result;
}

export async function runStructuralRepair(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    projectId: string;
    canonVersion: string;
    candidate: CandidateArtifact;
    reviewId: string;
    escalationReason: string;
    maxConcepts?: number;
    onStep?: (step: string) => void;
  },
): Promise<StructuralRepairResult> {
  const { projectId, canonVersion, candidate, reviewId, escalationReason } = opts;
  const maxConcepts = opts.maxConcepts ?? 3;
  const errors: string[] = [];

  const run: StructuralRepairRun = {
    id: newId(), project_id: projectId, canon_version: canonVersion,
    source_candidate_artifact_id: candidate.id, source_review_id: reviewId,
    source_revision_review_id: null, status: "running",
    escalation_reason: escalationReason, started_at: now(), completed_at: null,
  };

  // Load source review
  const review = getAlignmentReview(db, candidate.id);
  if (!review) {
    errors.push("Source review not found");
    run.status = "failed"; run.completed_at = now();
    return { run, goal: null, fault: null, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const observations = getObservations(db, review.id);
  const driftPoints = observations.filter((o) => o.kind === "drift" || o.kind === "conflict").map((o) => o.text);

  // Build canon packet
  const packet = buildCanonPacket(db, projectId, canonVersion, candidate.artifact_type, ["product"], candidate.body);
  const packetText = formatPacketForPrompt(packet);

  // ── Step 1: Goal Extraction ────────────────────────────────
  opts.onStep?.("Extracting goal");
  const goalResult = await provider.completeJson<LlmGoalOutput>({
    task: "structural_goal_extraction",
    system: GOAL_EXTRACTION_SYSTEM,
    prompt: fillTemplate(GOAL_EXTRACTION_PROMPT, {
      artifactType: candidate.artifact_type, purpose: candidate.intended_purpose,
      candidateBody: candidate.body, verdict: review.verdict,
      summary: review.summary, driftPoints: driftPoints.map((d) => `- ${d}`).join("\n"),
    }),
    schemaName: "LlmGoalOutput",
  });

  if (!goalResult.ok) {
    errors.push(`Goal extraction failed: ${goalResult.error}`);
    run.status = "failed"; run.completed_at = now();
    return { run, goal: null, fault: null, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const goalParsed = GoalSchema.safeParse(goalResult.data);
  if (!goalParsed.success) {
    errors.push(`Goal parse error: ${goalParsed.error.message}`);
    run.status = "failed"; run.completed_at = now();
    return { run, goal: null, fault: null, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const goal: GoalBrief = { id: newId(), repair_run_id: run.id, ...goalParsed.data };

  // ── Step 2: Fault Diagnosis ────────────────────────────────
  opts.onStep?.("Diagnosing structural fault");
  const faultResult = await provider.completeJson<LlmFaultOutput>({
    task: "structural_fault_diagnosis",
    system: FAULT_DIAGNOSIS_SYSTEM,
    prompt: fillTemplate(FAULT_DIAGNOSIS_PROMPT, {
      artifactType: candidate.artifact_type, candidateBody: candidate.body,
      primaryGoal: goal.primary_goal, canonPacket: packetText,
      driftPoints: driftPoints.map((d) => `- ${d}`).join("\n"),
    }),
    schemaName: "LlmFaultOutput",
  });

  if (!faultResult.ok) {
    errors.push(`Fault diagnosis failed: ${faultResult.error}`);
    run.status = "failed"; run.completed_at = now();
    return { run, goal, fault: null, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const faultParsed = FaultSchema.safeParse(faultResult.data);
  if (!faultParsed.success) {
    errors.push(`Fault parse error: ${faultParsed.error.message}`);
    run.status = "failed"; run.completed_at = now();
    return { run, goal, fault: null, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const fault: StructuralFaultBrief = {
    id: newId(), repair_run_id: run.id,
    structural_fault: faultParsed.data.structural_fault,
    why_patch_is_insufficient: faultParsed.data.why_patch_is_insufficient,
    conflicting_statement_ids: faultParsed.data.conflicting_canon_ids,
    anti_pattern_statement_ids: faultParsed.data.anti_pattern_ids,
    goal_is_repairable: faultParsed.data.goal_is_repairable,
    notes: faultParsed.data.notes,
  };

  // ── Irreparable check ──────────────────────────────────────
  if (!fault.goal_is_repairable) {
    opts.onStep?.("Goal marked irreparable");
    const irreparable: IrreparableFinding = {
      reason: fault.structural_fault,
      conflicting_statement_ids: fault.conflicting_statement_ids,
      suggested_reframe: fault.notes.length > 0 ? fault.notes[0] : null,
    };
    run.status = "completed"; run.completed_at = now();
    return { run, goal, fault, concepts: [], outcomes: [], irreparable, errors };
  }

  // ── Step 3: Repair Concept Generation ──────────────────────
  opts.onStep?.("Generating repair concepts");
  const conceptsResult = await provider.completeJson<LlmRepairConceptsOutput>({
    task: "structural_repair_concepts",
    system: REPAIR_CONCEPTS_SYSTEM,
    prompt: fillTemplate(REPAIR_CONCEPTS_PROMPT, {
      primaryGoal: goal.primary_goal,
      structuralFault: fault.structural_fault,
      canonPacket: packetText,
      constraints: goal.constraints.length > 0 ? goal.constraints.map((c) => `- ${c}`).join("\n") : "- None specified",
    }),
    schemaName: "LlmRepairConceptsOutput",
  });

  if (!conceptsResult.ok) {
    errors.push(`Concept generation failed: ${conceptsResult.error}`);
    run.status = "failed"; run.completed_at = now();
    return { run, goal, fault, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const conceptsParsed = ConceptsSchema.safeParse(conceptsResult.data);
  if (!conceptsParsed.success) {
    errors.push(`Concepts parse error: ${conceptsParsed.error.message}`);
    run.status = "failed"; run.completed_at = now();
    return { run, goal, fault, concepts: [], outcomes: [], irreparable: null, errors };
  }

  const concepts: RepairConcept[] = conceptsParsed.data.concepts.slice(0, maxConcepts).map((c) => ({
    id: newId(), repair_run_id: run.id, ...c,
  }));

  // ── Step 4+5+6: Draft, Re-review, Rank ────────────────────
  const sourceTier = VERDICT_TIERS.indexOf(review.verdict);
  const outcomes: RepairOutcome[] = [];

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    opts.onStep?.(`Drafting + reviewing concept ${i + 1}: ${concept.title}`);

    // Draft
    const draftResult = await provider.completeJson<LlmRepairDraftOutput>({
      task: "structural_repair_draft",
      system: REPAIR_DRAFT_SYSTEM,
      prompt: fillTemplate(REPAIR_DRAFT_PROMPT, {
        conceptTitle: concept.title, conceptSummary: concept.summary,
        preservedGoal: concept.preserved_goal,
        replacementMechanism: concept.replacement_mechanism,
        artifactType: candidate.artifact_type, canonPacket: packetText,
      }),
      schemaName: "LlmRepairDraftOutput",
    });

    if (!draftResult.ok) {
      errors.push(`Draft failed for concept "${concept.title}": ${draftResult.error}`);
      continue;
    }

    const draftParsed = DraftSchema.safeParse(draftResult.data);
    if (!draftParsed.success) {
      errors.push(`Draft parse error for "${concept.title}"`);
      continue;
    }

    const draft: RepairDraft = { id: newId(), repair_concept_id: concept.id, body: draftParsed.data.body };

    // Re-review
    const revCandidate = insertCandidateArtifact(
      db, projectId,
      `${candidate.title} (structural: ${concept.title})`,
      candidate.artifact_type, candidate.intended_purpose, draft.body,
    );

    try {
      const reReview = await runReview(db, provider, { projectId, canonVersion, candidate: revCandidate });
      const newTier = VERDICT_TIERS.indexOf(reReview.alignmentReview.verdict);

      outcomes.push({
        option_index: i,
        concept, draft,
        re_review_verdict: reReview.alignmentReview.verdict,
        tier_improvement: newTier - sourceTier,
        thesis_preservation: reReview.alignmentReview.thesis_preservation,
        pattern_fidelity: reReview.alignmentReview.pattern_fidelity,
        anti_pattern_collision: reReview.alignmentReview.anti_pattern_collision,
        voice_naming_fit: reReview.alignmentReview.voice_naming_fit,
      });
    } catch (err) {
      errors.push(`Re-review failed for "${concept.title}": ${err}`);
    }
  }

  // Sort by: tier improvement desc, then thesis, then minimal change
  outcomes.sort((a, b) => {
    if (b.tier_improvement !== a.tier_improvement) return b.tier_improvement - a.tier_improvement;
    const tierA = VERDICT_TIERS.indexOf(a.re_review_verdict);
    const tierB = VERDICT_TIERS.indexOf(b.re_review_verdict);
    return tierB - tierA;
  });

  run.status = "completed";
  run.completed_at = now();

  return { run, goal, fault, concepts, outcomes, irreparable: null, errors };
}
