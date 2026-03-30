import type { DimensionRating, CollisionRating, Verdict } from "../core/enums.js";

export const REVIEW_RUN_STATUSES = ["running", "completed", "failed"] as const;
export type ReviewRunStatus = (typeof REVIEW_RUN_STATUSES)[number];

export const DIMENSIONS = [
  "thesis_preservation",
  "pattern_fidelity",
  "anti_pattern_collision",
  "voice_naming_fit",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const PACKET_SOURCE_KINDS = ["statement", "tension", "exemplar"] as const;
export type PacketSourceKind = (typeof PACKET_SOURCE_KINDS)[number];

export const PACKET_SELECTION_REASONS = [
  "hard_thesis",
  "artifact_type_match",
  "scope_match",
  "tag_match",
  "lexical_match",
  "anti_pattern",
  "voice_naming",
  "tension",
  "exemplar",
] as const;
export type PacketSelectionReason = (typeof PACKET_SELECTION_REASONS)[number];

export type ReviewRun = {
  id: string;
  project_id: string;
  canon_version: string;
  candidate_artifact_id: string;
  status: ReviewRunStatus;
  provider: string;
  model: string;
  canon_packet_size: number;
  started_at: string;
  completed_at: string | null;
};

export type CanonPacketItem = {
  id: string;
  review_run_id: string;
  source_kind: PacketSourceKind;
  source_id: string;
  reason_selected: PacketSelectionReason;
  rank: number;
};

export type DimensionEvaluation = {
  id: string;
  review_run_id: string;
  dimension: Dimension;
  rating: string;
  judgment: string;
  confidence: number;
  evidence_statement_ids: string[];
  notes: string[];
};

// ── LLM output shapes ─────────────────────────────────────────

export type LlmDimensionOutput = {
  rating: string;
  judgment: string;
  confidence: number;
  evidence_statement_ids: string[];
  notes: string[];
};

export type LlmSynthesisOutput = {
  verdict: string;
  summary: string;
  preserved: Array<{ text: string; evidence_ids: string[] }>;
  drift_points: Array<{ text: string; evidence_ids: string[] }>;
  conflicts: Array<{ text: string; evidence_ids: string[] }>;
  uncertainties: string[];
  suggestions: Array<{
    action: "keep" | "cut" | "revise";
    target_excerpt: string | null;
    guidance: string;
  }>;
};
