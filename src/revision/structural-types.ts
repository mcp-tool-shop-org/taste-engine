export type StructuralRepairRun = {
  id: string;
  project_id: string;
  canon_version: string;
  source_candidate_artifact_id: string;
  source_review_id: string;
  source_revision_review_id: string | null;
  status: "running" | "completed" | "failed";
  escalation_reason: string;
  started_at: string;
  completed_at: string | null;
};

export type GoalBrief = {
  id: string;
  repair_run_id: string;
  primary_goal: string;
  preserved_intent: string[];
  desired_user_outcomes: string[];
  constraints: string[];
  confidence: number;
};

export type StructuralFaultBrief = {
  id: string;
  repair_run_id: string;
  structural_fault: string;
  why_patch_is_insufficient: string;
  conflicting_statement_ids: string[];
  anti_pattern_statement_ids: string[];
  goal_is_repairable: boolean;
  notes: string[];
};

export type RepairConcept = {
  id: string;
  repair_run_id: string;
  title: string;
  summary: string;
  preserved_goal: string;
  replacement_mechanism: string;
  tradeoffs: string[];
  confidence: number;
};

export type RepairDraft = {
  id: string;
  repair_concept_id: string;
  body: string;
};

export type RepairOutcome = {
  option_index: number;
  concept: RepairConcept;
  draft: RepairDraft;
  re_review_verdict: string;
  tier_improvement: number;
  thesis_preservation: string;
  pattern_fidelity: string;
  anti_pattern_collision: string;
  voice_naming_fit: string;
};

export type IrreparableFinding = {
  reason: string;
  conflicting_statement_ids: string[];
  suggested_reframe: string | null;
};

// ── LLM output shapes ─────────────────────────────────────────

export type LlmGoalOutput = {
  primary_goal: string;
  preserved_intent: string[];
  desired_user_outcomes: string[];
  constraints: string[];
  confidence: number;
};

export type LlmFaultOutput = {
  structural_fault: string;
  why_patch_is_insufficient: string;
  conflicting_canon_ids: string[];
  anti_pattern_ids: string[];
  goal_is_repairable: boolean;
  notes: string[];
};

export type LlmRepairConceptsOutput = {
  concepts: Array<{
    title: string;
    summary: string;
    preserved_goal: string;
    replacement_mechanism: string;
    tradeoffs: string[];
    confidence: number;
  }>;
};

export type LlmRepairDraftOutput = {
  body: string;
};
