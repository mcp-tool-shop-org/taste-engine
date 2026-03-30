export const CURATION_ACTIONS = [
  "accept",
  "accept_with_edits",
  "merge_into_existing",
  "reject",
  "defer",
  "resolve_contradiction",
  "accept_tension",
  "promote_exemplar",
] as const;
export type CurationAction = (typeof CURATION_ACTIONS)[number];

export const CANDIDATE_CURATION_STATUSES = [
  "proposed",
  "accepted",
  "merged",
  "rejected",
  "deferred",
] as const;
export type CandidateCurationStatus = (typeof CANDIDATE_CURATION_STATUSES)[number];

export type CurationDecision = {
  id: string;
  project_id: string;
  extraction_run_id: string | null;
  candidate_id: string | null;
  target_statement_id: string | null;

  action: CurationAction;
  reason: string | null;
  authored_text: string | null;

  created_at: string;
};

export type AcceptedTension = {
  id: string;
  project_id: string;
  canon_version: string;
  title: string;
  description: string;
  related_statement_ids: string[];
  evidence_refs: string[];
  resolution_note: string;
  severity: "low" | "medium" | "high";
  created_at: string;
};

export type CanonVersionSnapshot = {
  id: string;
  project_id: string;
  label: string;
  notes: string | null;
  extraction_run_ids: string[];
  statement_count: number;
  statement_counts_by_type: Record<string, number>;
  exemplar_count: number;
  tension_count: number;
  unresolved_contradiction_count: number;
  created_at: string;
};
