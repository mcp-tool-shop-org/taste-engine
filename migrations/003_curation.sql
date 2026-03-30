-- Taste Engine: curation tables

CREATE TABLE IF NOT EXISTS curation_decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  extraction_run_id TEXT REFERENCES extraction_runs(id),
  candidate_id TEXT REFERENCES extracted_candidates(id),
  target_statement_id TEXT REFERENCES canon_statements(id),

  action TEXT NOT NULL CHECK(action IN ('accept','accept_with_edits','merge_into_existing','reject','defer','resolve_contradiction','accept_tension','promote_exemplar')),
  reason TEXT,
  authored_text TEXT,

  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accepted_tensions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  canon_version TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  related_statement_ids TEXT NOT NULL DEFAULT '[]',
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  resolution_note TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canon_version_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  label TEXT NOT NULL,
  notes TEXT,
  extraction_run_ids TEXT NOT NULL DEFAULT '[]',
  statement_count INTEGER NOT NULL DEFAULT 0,
  statement_counts_by_type TEXT NOT NULL DEFAULT '{}',
  exemplar_count INTEGER NOT NULL DEFAULT 0,
  tension_count INTEGER NOT NULL DEFAULT 0,
  unresolved_contradiction_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, label)
);

-- Expand extracted_candidates status to include 'accepted' and 'deferred'.
-- We drop the old CHECK by recreating the table with foreign keys temporarily off.
PRAGMA foreign_keys = OFF;

CREATE TABLE _ec_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  extraction_run_id TEXT NOT NULL,
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
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','merged','rejected','deferred')),
  merged_into_id TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO _ec_new SELECT * FROM extracted_candidates;
DROP TABLE extracted_candidates;
ALTER TABLE _ec_new RENAME TO extracted_candidates;

CREATE INDEX IF NOT EXISTS idx_candidates_run ON extracted_candidates(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_candidates_project ON extracted_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_candidates_type ON extracted_candidates(statement_type);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON extracted_candidates(status);

PRAGMA foreign_keys = ON;

-- Indices
CREATE INDEX IF NOT EXISTS idx_curation_decisions_project ON curation_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_curation_decisions_candidate ON curation_decisions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_accepted_tensions_project ON accepted_tensions(project_id);
CREATE INDEX IF NOT EXISTS idx_accepted_tensions_version ON accepted_tensions(canon_version);
CREATE INDEX IF NOT EXISTS idx_version_snapshots_project ON canon_version_snapshots(project_id);

INSERT INTO _migrations (version, applied_at) VALUES (3, datetime('now'));
