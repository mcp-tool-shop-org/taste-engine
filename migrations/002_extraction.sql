-- Taste Engine: extraction tables

CREATE TABLE IF NOT EXISTS extraction_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_artifact_ids TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  passes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS extraction_pass_results (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
  pass_type TEXT NOT NULL CHECK(pass_type IN ('thesis','pattern','anti_pattern','voice_naming','decision','boundary','contradiction','exemplar')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  candidate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  error_detail TEXT
);

CREATE TABLE IF NOT EXISTS extracted_candidates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
  pass_type TEXT NOT NULL,

  text TEXT NOT NULL,
  statement_type TEXT NOT NULL CHECK(statement_type IN ('thesis','pattern','anti_pattern','boundary','voice','naming','decision')),

  rationale TEXT NOT NULL,
  confidence REAL NOT NULL,

  suggested_hardness TEXT NOT NULL DEFAULT 'soft' CHECK(suggested_hardness IN ('hard','strong','soft','experimental')),
  suggested_scope TEXT NOT NULL DEFAULT '[]',
  suggested_artifact_types TEXT NOT NULL DEFAULT '[]',

  tags TEXT NOT NULL DEFAULT '[]',
  evidence_refs TEXT NOT NULL DEFAULT '[]',

  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','merged','rejected')),
  merged_into_id TEXT REFERENCES extracted_candidates(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contradiction_findings (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  conflicting_candidate_ids TEXT NOT NULL DEFAULT '[]',
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','accepted_tension')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exemplar_nominations (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
  source_artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),
  locator_kind TEXT NOT NULL,
  locator_value TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  candidate_traits TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_extraction_runs_project ON extraction_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_pass_results_run ON extraction_pass_results(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_candidates_run ON extracted_candidates(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_candidates_project ON extracted_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_candidates_type ON extracted_candidates(statement_type);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON extracted_candidates(status);
CREATE INDEX IF NOT EXISTS idx_contradictions_run ON contradiction_findings(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_exemplars_run ON exemplar_nominations(extraction_run_id);

INSERT INTO _migrations (version, applied_at) VALUES (2, datetime('now'));
