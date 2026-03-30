-- Taste Engine: initial schema

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  current_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canon_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  version_label TEXT NOT NULL,
  frozen_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, version_label)
);

CREATE TABLE IF NOT EXISTS canon_statements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  canon_version TEXT,

  text TEXT NOT NULL,
  statement_type TEXT NOT NULL CHECK(statement_type IN ('thesis','pattern','anti_pattern','boundary','voice','naming','decision')),

  lifecycle TEXT NOT NULL DEFAULT 'proposed' CHECK(lifecycle IN ('proposed','accepted','superseded','retired','disputed')),
  hardness TEXT NOT NULL DEFAULT 'soft' CHECK(hardness IN ('hard','strong','soft','experimental')),

  scope TEXT NOT NULL DEFAULT '[]',
  artifact_types TEXT NOT NULL DEFAULT '[]',

  tags TEXT NOT NULL DEFAULT '[]',
  rationale TEXT,
  confidence REAL,

  replacement_statement_id TEXT REFERENCES canon_statements(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),

  title TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('readme','doc','architecture_note','release_note','cli_help','example_output','negative_example')),

  path TEXT,
  content_hash TEXT NOT NULL,
  body TEXT NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_refs (
  id TEXT PRIMARY KEY,
  statement_id TEXT REFERENCES canon_statements(id),
  source_artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),

  locator_kind TEXT NOT NULL CHECK(locator_kind IN ('line_range','section','heading','excerpt')),
  locator_value TEXT NOT NULL,

  note TEXT,
  extraction_method TEXT NOT NULL CHECK(extraction_method IN ('human','ollama')),
  confidence REAL
);

CREATE TABLE IF NOT EXISTS candidate_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),

  title TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('readme_section','package_blurb','feature_brief','cli_help','release_note','naming_proposal')),

  intended_purpose TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alignment_reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  candidate_artifact_id TEXT NOT NULL REFERENCES candidate_artifacts(id),
  canon_version TEXT NOT NULL,

  verdict TEXT NOT NULL CHECK(verdict IN ('aligned','mostly_aligned','salvageable_drift','hard_drift','contradiction')),

  thesis_preservation TEXT NOT NULL CHECK(thesis_preservation IN ('strong','mixed','weak')),
  pattern_fidelity TEXT NOT NULL CHECK(pattern_fidelity IN ('strong','mixed','weak')),
  anti_pattern_collision TEXT NOT NULL CHECK(anti_pattern_collision IN ('none','minor','major')),
  voice_naming_fit TEXT NOT NULL CHECK(voice_naming_fit IN ('strong','mixed','weak')),

  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_observations (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES alignment_reviews(id),
  kind TEXT NOT NULL CHECK(kind IN ('preserved','drift','conflict','uncertainty')),
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revision_suggestions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES alignment_reviews(id),
  action TEXT NOT NULL CHECK(action IN ('keep','cut','revise')),
  target_excerpt TEXT,
  guidance TEXT NOT NULL
);

-- Indices for retrieval
CREATE INDEX IF NOT EXISTS idx_statements_project ON canon_statements(project_id);
CREATE INDEX IF NOT EXISTS idx_statements_version ON canon_statements(canon_version);
CREATE INDEX IF NOT EXISTS idx_statements_type ON canon_statements(statement_type);
CREATE INDEX IF NOT EXISTS idx_statements_lifecycle ON canon_statements(lifecycle);
CREATE INDEX IF NOT EXISTS idx_statements_hardness ON canon_statements(hardness);
CREATE INDEX IF NOT EXISTS idx_evidence_statement ON evidence_refs(statement_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence_refs(source_artifact_id);
CREATE INDEX IF NOT EXISTS idx_source_artifacts_project ON source_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_candidate_artifacts_project ON candidate_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON alignment_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_candidate ON alignment_reviews(candidate_artifact_id);
CREATE INDEX IF NOT EXISTS idx_observations_review ON review_observations(review_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_review ON revision_suggestions(review_id);

-- Migration tracking
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT INTO _migrations (version, applied_at) VALUES (1, datetime('now'));
