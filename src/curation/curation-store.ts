import type Database from "better-sqlite3";
import type {
  CurationDecision,
  CurationAction,
  AcceptedTension,
  CanonVersionSnapshot,
} from "./curation-types.js";
import type { CanonStatement } from "../core/types.js";
import type { ExtractedStatementCandidate } from "../extraction/extraction-types.js";
import type { StatementType, HardnessLevel, Scope, ArtifactType } from "../core/enums.js";
import { insertStatement, getStatements } from "../canon/canon-store.js";
import { getCandidates, updateCandidateStatus } from "../extraction/extraction-store.js";
import { createCanonVersion, freezeCanonVersion } from "../canon/canon-version.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

// ── Curation Decisions ─────────────────────────────────────────

export function recordDecision(
  db: Database.Database,
  decision: Omit<CurationDecision, "id" | "created_at">,
): CurationDecision {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO curation_decisions (id, project_id, extraction_run_id, candidate_id, target_statement_id, action, reason, authored_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, decision.project_id, decision.extraction_run_id, decision.candidate_id, decision.target_statement_id, decision.action, decision.reason, decision.authored_text, ts);
  return { ...decision, id, created_at: ts };
}

export function getDecisions(
  db: Database.Database,
  projectId: string,
  filters?: { candidate_id?: string; action?: CurationAction },
): CurationDecision[] {
  let sql = "SELECT * FROM curation_decisions WHERE project_id = ?";
  const params: unknown[] = [projectId];
  if (filters?.candidate_id) { sql += " AND candidate_id = ?"; params.push(filters.candidate_id); }
  if (filters?.action) { sql += " AND action = ?"; params.push(filters.action); }
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params) as CurationDecision[];
}

// ── Candidate Curation Actions ─────────────────────────────────

export function acceptCandidate(
  db: Database.Database,
  candidate: ExtractedStatementCandidate,
  overrides?: {
    text?: string;
    hardness?: HardnessLevel;
    scope?: Scope[];
    artifact_types?: ArtifactType[];
    tags?: string[];
    rationale?: string;
  },
): { statement: CanonStatement; decision: CurationDecision } {
  const isEdit = overrides?.text !== undefined && overrides.text !== candidate.text;
  const finalText = overrides?.text ?? candidate.text;

  const statement = insertStatement(db, {
    project_id: candidate.project_id,
    canon_version: null,
    text: finalText,
    statement_type: candidate.statement_type,
    lifecycle: "accepted",
    hardness: overrides?.hardness ?? candidate.suggested_hardness,
    scope: overrides?.scope ?? candidate.suggested_scope,
    artifact_types: overrides?.artifact_types ?? candidate.suggested_artifact_types,
    tags: overrides?.tags ?? candidate.tags,
    rationale: overrides?.rationale ?? candidate.rationale,
    confidence: candidate.confidence,
    replacement_statement_id: null,
  });

  updateCandidateStatus(db, candidate.id, "accepted");

  const decision = recordDecision(db, {
    project_id: candidate.project_id,
    extraction_run_id: candidate.extraction_run_id,
    candidate_id: candidate.id,
    target_statement_id: statement.id,
    action: isEdit ? "accept_with_edits" : "accept",
    reason: null,
    authored_text: isEdit ? finalText : null,
  });

  return { statement, decision };
}

export function rejectCandidate(
  db: Database.Database,
  candidate: ExtractedStatementCandidate,
  reason: string,
): CurationDecision {
  updateCandidateStatus(db, candidate.id, "rejected");

  return recordDecision(db, {
    project_id: candidate.project_id,
    extraction_run_id: candidate.extraction_run_id,
    candidate_id: candidate.id,
    target_statement_id: null,
    action: "reject",
    reason,
    authored_text: null,
  });
}

export function deferCandidate(
  db: Database.Database,
  candidate: ExtractedStatementCandidate,
  reason?: string,
): CurationDecision {
  updateCandidateStatus(db, candidate.id, "deferred");

  return recordDecision(db, {
    project_id: candidate.project_id,
    extraction_run_id: candidate.extraction_run_id,
    candidate_id: candidate.id,
    target_statement_id: null,
    action: "defer",
    reason: reason ?? null,
    authored_text: null,
  });
}

export function mergeCandidate(
  db: Database.Database,
  candidate: ExtractedStatementCandidate,
  targetStatementId: string,
): CurationDecision {
  updateCandidateStatus(db, candidate.id, "merged", targetStatementId);

  return recordDecision(db, {
    project_id: candidate.project_id,
    extraction_run_id: candidate.extraction_run_id,
    candidate_id: candidate.id,
    target_statement_id: targetStatementId,
    action: "merge_into_existing",
    reason: null,
    authored_text: null,
  });
}

// ── Accepted Tensions ──────────────────────────────────────────

export function createAcceptedTension(
  db: Database.Database,
  tension: Omit<AcceptedTension, "id" | "created_at">,
): AcceptedTension {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO accepted_tensions (id, project_id, canon_version, title, description, related_statement_ids, evidence_refs, resolution_note, severity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tension.project_id, tension.canon_version, tension.title, tension.description,
    JSON.stringify(tension.related_statement_ids), JSON.stringify(tension.evidence_refs),
    tension.resolution_note, tension.severity, ts);
  return { ...tension, id, created_at: ts };
}

export function getAcceptedTensions(
  db: Database.Database,
  projectId: string,
  canonVersion?: string,
): AcceptedTension[] {
  let sql = "SELECT * FROM accepted_tensions WHERE project_id = ?";
  const params: unknown[] = [projectId];
  if (canonVersion) { sql += " AND canon_version = ?"; params.push(canonVersion); }
  sql += " ORDER BY severity DESC, created_at ASC";
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map((r) => ({
    ...r,
    related_statement_ids: JSON.parse(r.related_statement_ids),
    evidence_refs: JSON.parse(r.evidence_refs),
  }));
}

// ── Canon Freeze ───────────────────────────────────────────────

export type FreezeResult = {
  snapshot: CanonVersionSnapshot;
  statementCount: number;
  tensionCount: number;
  exemplarCount: number;
  warnings: string[];
};

export type FreezeBlocker = {
  reason: string;
  details: string[];
};

export function checkFreezeBlockers(
  db: Database.Database,
  projectId: string,
): FreezeBlocker[] {
  const blockers: FreezeBlocker[] = [];

  // Check for accepted statements
  const statements = getStatements(db, projectId, { lifecycle: "accepted" });
  if (statements.length === 0) {
    blockers.push({ reason: "No accepted canon statements", details: ["Accept at least one candidate before freezing."] });
  }

  // Check for unresolved high-severity contradictions
  const rows = db.prepare(
    `SELECT * FROM contradiction_findings cf
     JOIN extraction_runs er ON er.id = cf.extraction_run_id
     WHERE er.project_id = ? AND cf.status = 'open' AND cf.severity = 'high'`,
  ).all(projectId) as any[];

  if (rows.length > 0) {
    blockers.push({
      reason: "Unresolved high-severity contradictions",
      details: rows.map((r: any) => `[${r.severity}] ${r.title}`),
    });
  }

  return blockers;
}

export function freezeCanon(
  db: Database.Database,
  projectId: string,
  label: string,
  notes?: string,
): FreezeResult {
  const warnings: string[] = [];

  // Get accepted statements
  const statements = getStatements(db, projectId, { lifecycle: "accepted" });

  // Stamp canon_version on all accepted statements
  const ts = now();
  db.prepare(
    `UPDATE canon_statements SET canon_version = ?, updated_at = ? WHERE project_id = ? AND lifecycle = 'accepted' AND canon_version IS NULL`,
  ).run(label, ts, projectId);

  // Create version
  createCanonVersion(db, projectId, label);
  freezeCanonVersion(db, projectId, label);

  // Count by type
  const countsByType: Record<string, number> = {};
  for (const s of statements) {
    countsByType[s.statement_type] = (countsByType[s.statement_type] ?? 0) + 1;
  }

  // Get tensions
  const tensions = getAcceptedTensions(db, projectId, label);

  // Get exemplars (from latest run)
  const exemplarCount = (db.prepare(
    `SELECT COUNT(*) as c FROM exemplar_nominations en
     JOIN extraction_runs er ON er.id = en.extraction_run_id
     WHERE er.project_id = ?`,
  ).get(projectId) as { c: number }).c;

  // Get unresolved contradictions
  const unresolvedCount = (db.prepare(
    `SELECT COUNT(*) as c FROM contradiction_findings cf
     JOIN extraction_runs er ON er.id = cf.extraction_run_id
     WHERE er.project_id = ? AND cf.status = 'open'`,
  ).get(projectId) as { c: number }).c;

  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} unresolved contradiction(s) remain.`);
  }

  // Get extraction run IDs
  const runIds = (db.prepare(
    `SELECT id FROM extraction_runs WHERE project_id = ? ORDER BY started_at`,
  ).all(projectId) as { id: string }[]).map((r) => r.id);

  // Create snapshot
  const snapshotId = newId();
  db.prepare(
    `INSERT INTO canon_version_snapshots (id, project_id, label, notes, extraction_run_ids, statement_count, statement_counts_by_type, exemplar_count, tension_count, unresolved_contradiction_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(snapshotId, projectId, label, notes ?? null, JSON.stringify(runIds),
    statements.length, JSON.stringify(countsByType), exemplarCount,
    tensions.length, unresolvedCount, ts);

  const snapshot: CanonVersionSnapshot = {
    id: snapshotId,
    project_id: projectId,
    label,
    notes: notes ?? null,
    extraction_run_ids: runIds,
    statement_count: statements.length,
    statement_counts_by_type: countsByType,
    exemplar_count: exemplarCount,
    tension_count: tensions.length,
    unresolved_contradiction_count: unresolvedCount,
    created_at: ts,
  };

  return {
    snapshot,
    statementCount: statements.length,
    tensionCount: tensions.length,
    exemplarCount,
    warnings,
  };
}
