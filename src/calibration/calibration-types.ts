import type { Dimension } from "../review/review-run-types.js";

export const OVERALL_RATINGS = ["correct", "mostly_correct", "mixed", "mostly_wrong", "wrong"] as const;
export type OverallRating = (typeof OVERALL_RATINGS)[number];

export const VERDICT_AGREEMENTS = ["agree", "soft_disagree", "hard_disagree"] as const;
export type VerdictAgreement = (typeof VERDICT_AGREEMENTS)[number];

export const DIMENSION_ASSESSMENTS = ["correct", "too_harsh", "too_soft", "wrong_focus", "wrong"] as const;
export type DimensionAssessment = (typeof DIMENSION_ASSESSMENTS)[number];

export const FINDING_CATEGORIES = [
  "retrieval",
  "judgment",
  "canon_gap",
  "rigidity",
  "softness",
  "artifact_type_gap",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ["low", "medium", "high"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export type ReviewFeedback = {
  id: string;
  project_id: string;
  review_id: string;
  review_run_id: string;

  overall: OverallRating;
  verdict_agreement: VerdictAgreement;

  false_rigidity: boolean;
  missed_drift: boolean;
  wrong_packet: boolean;
  weak_evidence: boolean;
  weak_revision_guidance: boolean;
  good_revision_guidance: boolean;
  uncertainty_was_helpful: boolean;

  notes: string | null;
  created_at: string;
};

export type DimensionFeedback = {
  id: string;
  review_feedback_id: string;
  dimension: Dimension;
  assessment: DimensionAssessment;
  notes: string | null;
};

export type PacketFeedback = {
  id: string;
  review_feedback_id: string;
  should_have_included_ids: string[];
  should_not_have_included_ids: string[];
  noisy_statement_ids: string[];
  notes: string | null;
};

export type CalibrationFinding = {
  id: string;
  project_id: string;
  category: FindingCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  evidence_refs: string[];
  suggested_actions: string[];
  created_at: string;
};

// ── Computed metrics ───────────────────────────────────────────

export type ProjectMetrics = {
  review_count: number;
  feedback_count: number;
  agreement_rate: number;
  false_rigidity_rate: number;
  missed_drift_rate: number;
  wrong_packet_rate: number;
  good_revision_rate: number;
  weak_revision_rate: number;
};

export type StatementUtility = {
  statement_id: string;
  statement_text: string;
  statement_type: string;
  selected_count: number;
  cited_count: number;
  citation_rate: number;
  noise_count: number;
  noise_rate: number;
  false_rigidity_association: number;
};

export type ArtifactTypeMetrics = {
  artifact_type: string;
  review_count: number;
  agreement_rate: number;
  rigidity_rate: number;
  missed_drift_rate: number;
  wrong_packet_rate: number;
};
