/**
 * Database row types — these map directly to SQLite table shapes.
 * JSON arrays (scope, artifact_types, tags) are stored as TEXT and
 * parsed/serialized at the boundary.
 */

export type ProjectRow = {
  id: string;
  project_slug: string;
  name: string;
  summary: string;
  current_version: string | null;
  created_at: string;
  updated_at: string;
};

export type CanonVersionRow = {
  id: string;
  project_id: string;
  version_label: string;
  frozen_at: string | null;
  created_at: string;
};

export type CanonStatementRow = {
  id: string;
  project_id: string;
  canon_version: string | null;
  text: string;
  statement_type: string;
  lifecycle: string;
  hardness: string;
  scope: string; // JSON array
  artifact_types: string; // JSON array
  tags: string; // JSON array
  rationale: string | null;
  confidence: number | null;
  replacement_statement_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceArtifactRow = {
  id: string;
  project_id: string;
  title: string;
  artifact_type: string;
  path: string | null;
  content_hash: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type EvidenceRefRow = {
  id: string;
  statement_id: string | null;
  source_artifact_id: string;
  locator_kind: string;
  locator_value: string;
  note: string | null;
  extraction_method: string;
  confidence: number | null;
};

export type CandidateArtifactRow = {
  id: string;
  project_id: string;
  title: string;
  artifact_type: string;
  intended_purpose: string;
  body: string;
  created_at: string;
};

export type AlignmentReviewRow = {
  id: string;
  project_id: string;
  candidate_artifact_id: string;
  canon_version: string;
  verdict: string;
  thesis_preservation: string;
  pattern_fidelity: string;
  anti_pattern_collision: string;
  voice_naming_fit: string;
  summary: string;
  created_at: string;
};

export type ReviewObservationRow = {
  id: string;
  review_id: string;
  kind: string;
  text: string;
};

export type RevisionSuggestionRow = {
  id: string;
  review_id: string;
  action: string;
  target_excerpt: string | null;
  guidance: string;
};
