import type {
  StatementType,
  LifecycleState,
  HardnessLevel,
  Scope,
  ArtifactType,
  SourceArtifactType,
  Verdict,
  DimensionRating,
  CollisionRating,
  ObservationKind,
  RevisionAction,
  LocatorKind,
  ExtractionMethod,
} from "./enums.js";

// ── Project Canon ──────────────────────────────────────────────

export type ProjectCanon = {
  id: string;
  project_slug: string;
  name: string;
  summary: string;
  current_version: string | null;
  created_at: string;
  updated_at: string;
};

// ── Canon Statement ────────────────────────────────────────────

export type CanonStatement = {
  id: string;
  project_id: string;
  canon_version: string | null;

  text: string;
  statement_type: StatementType;

  lifecycle: LifecycleState;
  hardness: HardnessLevel;

  scope: Scope[];
  artifact_types: ArtifactType[];

  tags: string[];
  rationale: string | null;
  confidence: number | null;

  replacement_statement_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Evidence ───────────────────────────────────────────────────

export type EvidenceLocator = {
  kind: LocatorKind;
  value: string;
};

export type EvidenceRef = {
  id: string;
  statement_id: string | null;
  source_artifact_id: string;

  locator: EvidenceLocator;

  note: string | null;
  extraction_method: ExtractionMethod;
  confidence: number | null;
};

// ── Source Artifacts ────────────────────────────────────────────

export type SourceArtifact = {
  id: string;
  project_id: string;

  title: string;
  artifact_type: SourceArtifactType;

  path: string | null;
  content_hash: string;
  body: string;

  created_at: string;
  updated_at: string;
};

// ── Candidate Artifacts ────────────────────────────────────────

export type CandidateArtifact = {
  id: string;
  project_id: string;

  title: string;
  artifact_type: ArtifactType;

  intended_purpose: string;
  body: string;
  created_at: string;
};

// ── Alignment Review ───────────────────────────────────────────

export type AlignmentReview = {
  id: string;
  project_id: string;
  candidate_artifact_id: string;
  canon_version: string;

  verdict: Verdict;

  thesis_preservation: DimensionRating;
  pattern_fidelity: DimensionRating;
  anti_pattern_collision: CollisionRating;
  voice_naming_fit: DimensionRating;

  summary: string;
  created_at: string;
};

// ── Review Observations ────────────────────────────────────────

export type ReviewObservation = {
  id: string;
  review_id: string;
  kind: ObservationKind;
  text: string;
};

// ── Revision Suggestions ───────────────────────────────────────

export type RevisionSuggestion = {
  id: string;
  review_id: string;
  action: RevisionAction;
  target_excerpt: string | null;
  guidance: string;
};

// ── Config ─────────────────────────────────────────────────────

export type TasteConfig = {
  projectSlug: string;
  dbPath: string;
  canonDir: string;
  provider: {
    kind: "ollama";
    baseUrl: string;
    model: string;
  };
};
