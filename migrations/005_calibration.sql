-- Taste Engine: calibration tables

CREATE TABLE IF NOT EXISTS review_feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  review_id TEXT NOT NULL REFERENCES alignment_reviews(id),
  review_run_id TEXT NOT NULL REFERENCES review_runs(id),

  overall TEXT NOT NULL CHECK(overall IN ('correct','mostly_correct','mixed','mostly_wrong','wrong')),
  verdict_agreement TEXT NOT NULL CHECK(verdict_agreement IN ('agree','soft_disagree','hard_disagree')),

  false_rigidity INTEGER NOT NULL DEFAULT 0,
  missed_drift INTEGER NOT NULL DEFAULT 0,
  wrong_packet INTEGER NOT NULL DEFAULT 0,
  weak_evidence INTEGER NOT NULL DEFAULT 0,
  weak_revision_guidance INTEGER NOT NULL DEFAULT 0,
  good_revision_guidance INTEGER NOT NULL DEFAULT 0,
  uncertainty_was_helpful INTEGER NOT NULL DEFAULT 0,

  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_feedback (
  id TEXT PRIMARY KEY,
  review_feedback_id TEXT NOT NULL REFERENCES review_feedback(id),
  dimension TEXT NOT NULL CHECK(dimension IN ('thesis_preservation','pattern_fidelity','anti_pattern_collision','voice_naming_fit')),
  assessment TEXT NOT NULL CHECK(assessment IN ('correct','too_harsh','too_soft','wrong_focus','wrong')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS packet_feedback (
  id TEXT PRIMARY KEY,
  review_feedback_id TEXT NOT NULL REFERENCES review_feedback(id),
  should_have_included_ids TEXT NOT NULL DEFAULT '[]',
  should_not_have_included_ids TEXT NOT NULL DEFAULT '[]',
  noisy_statement_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS calibration_findings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  category TEXT NOT NULL CHECK(category IN ('retrieval','judgment','canon_gap','rigidity','softness','artifact_type_gap')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high')),
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  suggested_actions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_feedback_project ON review_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_review_feedback_review ON review_feedback(review_id);
CREATE INDEX IF NOT EXISTS idx_dim_feedback_parent ON dimension_feedback(review_feedback_id);
CREATE INDEX IF NOT EXISTS idx_packet_feedback_parent ON packet_feedback(review_feedback_id);
CREATE INDEX IF NOT EXISTS idx_cal_findings_project ON calibration_findings(project_id);

INSERT INTO _migrations (version, applied_at) VALUES (5, datetime('now'));
