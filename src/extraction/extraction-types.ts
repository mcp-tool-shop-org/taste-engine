import type {
  StatementType,
  HardnessLevel,
  Scope,
  ArtifactType,
} from "../core/enums.js";

// ── Extraction Run ─────────────────────────────────────────────

export const EXTRACTION_STATUSES = ["running", "completed", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const PASS_TYPES = [
  "thesis",
  "pattern",
  "anti_pattern",
  "voice_naming",
  "decision",
  "boundary",
  "contradiction",
  "exemplar",
] as const;
export type PassType = (typeof PASS_TYPES)[number];

export type ExtractionRun = {
  id: string;
  project_id: string;
  source_artifact_ids: string[];
  provider: string;
  model: string;
  passes: PassType[];
  status: ExtractionStatus;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
};

// ── Pass Result ────────────────────────────────────────────────

export const PASS_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

export type ExtractionPassResult = {
  id: string;
  extraction_run_id: string;
  pass_type: PassType;
  status: PassStatus;
  candidate_count: number;
  error_count: number;
  started_at: string | null;
  completed_at: string | null;
  error_detail: string | null;
};

// ── Extracted Statement Candidate ──────────────────────────────

export const CANDIDATE_STATUSES = ["proposed", "merged", "rejected"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type ExtractedStatementCandidate = {
  id: string;
  project_id: string;
  extraction_run_id: string;
  pass_type: PassType;

  text: string;
  statement_type: StatementType;

  rationale: string;
  confidence: number;

  suggested_hardness: HardnessLevel;
  suggested_scope: Scope[];
  suggested_artifact_types: ArtifactType[];

  tags: string[];
  evidence_refs: string[];

  status: CandidateStatus;
  merged_into_id: string | null;
  created_at: string;
};

// ── Contradiction Finding ──────────────────────────────────────

export const CONTRADICTION_SEVERITIES = ["low", "medium", "high"] as const;
export type ContradictionSeverity = (typeof CONTRADICTION_SEVERITIES)[number];

export const CONTRADICTION_STATUSES = ["open", "resolved", "accepted_tension"] as const;
export type ContradictionStatus = (typeof CONTRADICTION_STATUSES)[number];

export type ContradictionFinding = {
  id: string;
  extraction_run_id: string;
  title: string;
  description: string;
  conflicting_candidate_ids: string[];
  evidence_refs: string[];
  severity: ContradictionSeverity;
  status: ContradictionStatus;
  created_at: string;
};

// ── Exemplar Nomination ────────────────────────────────────────

export type ExemplarNomination = {
  id: string;
  extraction_run_id: string;
  source_artifact_id: string;
  locator_kind: string;
  locator_value: string;
  why_it_matters: string;
  candidate_traits: string[];
  confidence: number;
  created_at: string;
};

// ── LLM Output Shapes (what the model returns) ────────────────

export type LlmStatementCandidate = {
  text: string;
  rationale: string;
  confidence: number;
  suggested_hardness: string;
  suggested_scope: string[];
  tags: string[];
  evidence_section: string;
};

export type LlmPassOutput = {
  candidates: LlmStatementCandidate[];
};

export type LlmContradictionOutput = {
  contradictions: Array<{
    title: string;
    description: string;
    severity: string;
    evidence_sections: string[];
  }>;
};

export type LlmExemplarOutput = {
  exemplars: Array<{
    source_title: string;
    locator_kind: string;
    locator_value: string;
    why_it_matters: string;
    candidate_traits: string[];
    confidence: number;
  }>;
};
