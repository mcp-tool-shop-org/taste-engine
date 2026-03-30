-- Taste Engine: review tables

CREATE TABLE IF NOT EXISTS review_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  canon_version TEXT NOT NULL,
  candidate_artifact_id TEXT NOT NULL REFERENCES candidate_artifacts(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  canon_packet_size INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS canon_packet_items (
  id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL REFERENCES review_runs(id),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('statement','tension','exemplar')),
  source_id TEXT NOT NULL,
  reason_selected TEXT NOT NULL,
  rank INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_evaluations (
  id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL REFERENCES review_runs(id),
  dimension TEXT NOT NULL CHECK(dimension IN ('thesis_preservation','pattern_fidelity','anti_pattern_collision','voice_naming_fit')),
  rating TEXT NOT NULL,
  judgment TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_statement_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_review_runs_project ON review_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_review_runs_candidate ON review_runs(candidate_artifact_id);
CREATE INDEX IF NOT EXISTS idx_packet_items_run ON canon_packet_items(review_run_id);
CREATE INDEX IF NOT EXISTS idx_dim_evals_run ON dimension_evaluations(review_run_id);

INSERT INTO _migrations (version, applied_at) VALUES (4, datetime('now'));
