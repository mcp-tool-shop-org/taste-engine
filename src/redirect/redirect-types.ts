export type GoalRedirectionBrief = {
  id: string;
  project_id: string;
  source_artifact_id: string;
  source_review_id: string;
  canon_version: string;

  preserved_goal: string;
  conflict_explanation: string;
  non_negotiable_constraints: string[];

  directions: RedirectionDirection[];
  recommended_next_brief: string;

  created_at: string;
};

export type RedirectionDirection = {
  title: string;
  summary: string;
  how_it_preserves_goal: string;
  canon_alignment: string;
  tradeoffs: string[];
};

// ── LLM output shapes ─────────────────────────────────────────

export type LlmRedirectionOutput = {
  preserved_goal: string;
  conflict_explanation: string;
  non_negotiable_constraints: string[];
  directions: Array<{
    title: string;
    summary: string;
    how_it_preserves_goal: string;
    canon_alignment: string;
    tradeoffs: string[];
  }>;
  recommended_next_brief: string;
};
