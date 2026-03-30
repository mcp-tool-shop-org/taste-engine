export type RevisionBrief = {
  artifact_id: string;
  review_id: string;
  preserve_intent: string;
  drift_points: string[];
  keep_strengths: string[];
};

export type RevisionOption = {
  id: string;
  revision_run_id: string;
  level: "minimal" | "strong";
  body: string;
  change_rationale: ChangeRationale[];
  preserved_intent: string;
  preserved_strengths: string[];
  unresolved_tradeoffs: string[];
};

export type ChangeRationale = {
  change: string;
  drift_fixed: string;
  canon_restored: string;
};

export type RevisionRun = {
  id: string;
  project_id: string;
  canon_version: string;
  candidate_artifact_id: string;
  source_review_id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
};

export type ScoredRevision = {
  option: RevisionOption;
  re_review_verdict: string;
  thesis_preservation: string;
  pattern_fidelity: string;
  anti_pattern_collision: string;
  voice_naming_fit: string;
  tier_improvement: number; // positive = improved
};

// ── LLM output shapes ─────────────────────────────────────────

export type LlmRevisionOutput = {
  preserved_intent: string;
  preserved_strengths: string[];
  minimal: {
    body: string;
    changes: Array<{ change: string; drift_fixed: string; canon_restored: string }>;
    unresolved_tradeoffs: string[];
  };
  strong: {
    body: string;
    changes: Array<{ change: string; drift_fixed: string; canon_restored: string }>;
    unresolved_tradeoffs: string[];
  };
};
