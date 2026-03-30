import type Database from "better-sqlite3";
import type {
  ExtractionRun,
  ExtractionPassResult,
  ExtractedStatementCandidate,
  ContradictionFinding,
  ExemplarNomination,
  PassType,
  ExtractionStatus,
  PassStatus,
  CandidateStatus,
} from "./extraction-types.js";
import type { StatementType } from "../core/enums.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

// ── Extraction Run ─────────────────────────────────────────────

export function createExtractionRun(
  db: Database.Database,
  opts: {
    project_id: string;
    source_artifact_ids: string[];
    provider: string;
    model: string;
    passes: PassType[];
  },
): ExtractionRun {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO extraction_runs (id, project_id, source_artifact_ids, provider, model, passes, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
  ).run(id, opts.project_id, JSON.stringify(opts.source_artifact_ids), opts.provider, opts.model, JSON.stringify(opts.passes), ts);

  return {
    id,
    project_id: opts.project_id,
    source_artifact_ids: opts.source_artifact_ids,
    provider: opts.provider,
    model: opts.model,
    passes: opts.passes,
    status: "running",
    started_at: ts,
    completed_at: null,
    notes: null,
  };
}

export function completeExtractionRun(
  db: Database.Database,
  runId: string,
  status: ExtractionStatus,
  notes?: string,
): void {
  const ts = now();
  db.prepare(
    `UPDATE extraction_runs SET status = ?, completed_at = ?, notes = ? WHERE id = ?`,
  ).run(status, ts, notes ?? null, runId);
}

export function getExtractionRun(db: Database.Database, runId: string): ExtractionRun | null {
  const row = db.prepare("SELECT * FROM extraction_runs WHERE id = ?").get(runId) as any;
  if (!row) return null;
  return {
    ...row,
    source_artifact_ids: JSON.parse(row.source_artifact_ids),
    passes: JSON.parse(row.passes),
  };
}

export function getLatestExtractionRun(db: Database.Database, projectId: string): ExtractionRun | null {
  const row = db.prepare("SELECT * FROM extraction_runs WHERE project_id = ? ORDER BY rowid DESC LIMIT 1").get(projectId) as any;
  if (!row) return null;
  return {
    ...row,
    source_artifact_ids: JSON.parse(row.source_artifact_ids),
    passes: JSON.parse(row.passes),
  };
}

// ── Pass Results ───────────────────────────────────────────────

export function createPassResult(
  db: Database.Database,
  runId: string,
  passType: PassType,
): ExtractionPassResult {
  const id = newId();
  db.prepare(
    `INSERT INTO extraction_pass_results (id, extraction_run_id, pass_type, status, candidate_count, error_count)
     VALUES (?, ?, ?, 'pending', 0, 0)`,
  ).run(id, runId, passType);

  return {
    id,
    extraction_run_id: runId,
    pass_type: passType,
    status: "pending",
    candidate_count: 0,
    error_count: 0,
    started_at: null,
    completed_at: null,
    error_detail: null,
  };
}

export function updatePassResult(
  db: Database.Database,
  passId: string,
  updates: {
    status?: PassStatus;
    candidate_count?: number;
    error_count?: number;
    started_at?: string;
    completed_at?: string;
    error_detail?: string;
  },
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.candidate_count !== undefined) { fields.push("candidate_count = ?"); values.push(updates.candidate_count); }
  if (updates.error_count !== undefined) { fields.push("error_count = ?"); values.push(updates.error_count); }
  if (updates.started_at !== undefined) { fields.push("started_at = ?"); values.push(updates.started_at); }
  if (updates.completed_at !== undefined) { fields.push("completed_at = ?"); values.push(updates.completed_at); }
  if (updates.error_detail !== undefined) { fields.push("error_detail = ?"); values.push(updates.error_detail); }

  if (fields.length === 0) return;
  values.push(passId);
  db.prepare(`UPDATE extraction_pass_results SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function getPassResults(db: Database.Database, runId: string): ExtractionPassResult[] {
  return db.prepare("SELECT * FROM extraction_pass_results WHERE extraction_run_id = ? ORDER BY rowid").all(runId) as ExtractionPassResult[];
}

// ── Extracted Candidates ───────────────────────────────────────

export function insertCandidate(
  db: Database.Database,
  candidate: Omit<ExtractedStatementCandidate, "id" | "created_at">,
): ExtractedStatementCandidate {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO extracted_candidates
     (id, project_id, extraction_run_id, pass_type, text, statement_type,
      rationale, confidence, suggested_hardness, suggested_scope,
      suggested_artifact_types, tags, evidence_refs, status, merged_into_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, candidate.project_id, candidate.extraction_run_id, candidate.pass_type,
    candidate.text, candidate.statement_type,
    candidate.rationale, candidate.confidence,
    candidate.suggested_hardness, JSON.stringify(candidate.suggested_scope),
    JSON.stringify(candidate.suggested_artifact_types), JSON.stringify(candidate.tags),
    JSON.stringify(candidate.evidence_refs), candidate.status, candidate.merged_into_id, ts,
  );

  return { ...candidate, id, created_at: ts };
}

export function getCandidates(
  db: Database.Database,
  runId: string,
  filters?: {
    statement_type?: StatementType;
    status?: CandidateStatus;
    pass_type?: PassType;
    min_confidence?: number;
  },
): ExtractedStatementCandidate[] {
  let sql = "SELECT * FROM extracted_candidates WHERE extraction_run_id = ?";
  const params: unknown[] = [runId];

  if (filters?.statement_type) { sql += " AND statement_type = ?"; params.push(filters.statement_type); }
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }
  if (filters?.pass_type) { sql += " AND pass_type = ?"; params.push(filters.pass_type); }
  if (filters?.min_confidence !== undefined) { sql += " AND confidence >= ?"; params.push(filters.min_confidence); }

  sql += " ORDER BY confidence DESC, created_at ASC";

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(rowToCandidate);
}

export function updateCandidateStatus(
  db: Database.Database,
  candidateId: string,
  status: CandidateStatus,
  mergedIntoId?: string,
): void {
  db.prepare(
    `UPDATE extracted_candidates SET status = ?, merged_into_id = ? WHERE id = ?`,
  ).run(status, mergedIntoId ?? null, candidateId);
}

function rowToCandidate(row: any): ExtractedStatementCandidate {
  return {
    ...row,
    suggested_scope: JSON.parse(row.suggested_scope),
    suggested_artifact_types: JSON.parse(row.suggested_artifact_types),
    tags: JSON.parse(row.tags),
    evidence_refs: JSON.parse(row.evidence_refs),
  };
}

// ── Contradiction Findings ─────────────────────────────────────

export function insertContradiction(
  db: Database.Database,
  finding: Omit<ContradictionFinding, "id" | "created_at">,
): ContradictionFinding {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO contradiction_findings
     (id, extraction_run_id, title, description, conflicting_candidate_ids,
      evidence_refs, severity, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, finding.extraction_run_id, finding.title, finding.description,
    JSON.stringify(finding.conflicting_candidate_ids),
    JSON.stringify(finding.evidence_refs),
    finding.severity, finding.status, ts,
  );

  return { ...finding, id, created_at: ts };
}

export function getContradictions(
  db: Database.Database,
  runId: string,
): ContradictionFinding[] {
  const rows = db.prepare("SELECT * FROM contradiction_findings WHERE extraction_run_id = ? ORDER BY severity DESC").all(runId) as any[];
  return rows.map((r) => ({
    ...r,
    conflicting_candidate_ids: JSON.parse(r.conflicting_candidate_ids),
    evidence_refs: JSON.parse(r.evidence_refs),
  }));
}

// ── Exemplar Nominations ───────────────────────────────────────

export function insertExemplar(
  db: Database.Database,
  exemplar: Omit<ExemplarNomination, "id" | "created_at">,
): ExemplarNomination {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO exemplar_nominations
     (id, extraction_run_id, source_artifact_id, locator_kind, locator_value,
      why_it_matters, candidate_traits, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, exemplar.extraction_run_id, exemplar.source_artifact_id,
    exemplar.locator_kind, exemplar.locator_value,
    exemplar.why_it_matters, JSON.stringify(exemplar.candidate_traits),
    exemplar.confidence, ts,
  );

  return { ...exemplar, id, created_at: ts };
}

export function getExemplars(
  db: Database.Database,
  runId: string,
): ExemplarNomination[] {
  const rows = db.prepare("SELECT * FROM exemplar_nominations WHERE extraction_run_id = ? ORDER BY confidence DESC").all(runId) as any[];
  return rows.map((r) => ({
    ...r,
    candidate_traits: JSON.parse(r.candidate_traits),
  }));
}

// ── Candidate counts ───────────────────────────────────────────

export type CandidateCounts = {
  total: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  by_pass: Record<string, number>;
};

export function getCandidateCounts(db: Database.Database, runId: string): CandidateCounts {
  const total = (db.prepare("SELECT COUNT(*) as c FROM extracted_candidates WHERE extraction_run_id = ?").get(runId) as { c: number }).c;

  const byType = db.prepare("SELECT statement_type, COUNT(*) as c FROM extracted_candidates WHERE extraction_run_id = ? GROUP BY statement_type").all(runId) as { statement_type: string; c: number }[];
  const byStatus = db.prepare("SELECT status, COUNT(*) as c FROM extracted_candidates WHERE extraction_run_id = ? GROUP BY status").all(runId) as { status: string; c: number }[];
  const byPass = db.prepare("SELECT pass_type, COUNT(*) as c FROM extracted_candidates WHERE extraction_run_id = ? GROUP BY pass_type").all(runId) as { pass_type: string; c: number }[];

  return {
    total,
    by_type: Object.fromEntries(byType.map((r) => [r.statement_type, r.c])),
    by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.c])),
    by_pass: Object.fromEntries(byPass.map((r) => [r.pass_type, r.c])),
  };
}
