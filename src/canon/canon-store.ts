import type Database from "better-sqlite3";
import type { ProjectCanon, CanonStatement } from "../core/types.js";
import type { CanonStatementRow, ProjectRow } from "../db/schema.js";
import type { LifecycleState, HardnessLevel, StatementType } from "../core/enums.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

// ── Project operations ─────────────────────────────────────────

export function createProject(
  db: Database.Database,
  slug: string,
  name: string,
  summary: string,
): ProjectCanon {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO projects (id, project_slug, name, summary, current_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  ).run(id, slug, name, summary, ts, ts);
  return { id, project_slug: slug, name, summary, current_version: null, created_at: ts, updated_at: ts };
}

export function getProject(db: Database.Database, slug: string): ProjectCanon | null {
  const row = db.prepare("SELECT * FROM projects WHERE project_slug = ?").get(slug) as ProjectRow | undefined;
  return row ?? null;
}

// ── Statement operations ───────────────────────────────────────

function rowToStatement(row: CanonStatementRow): CanonStatement {
  return {
    ...row,
    statement_type: row.statement_type as StatementType,
    lifecycle: row.lifecycle as LifecycleState,
    hardness: row.hardness as HardnessLevel,
    scope: JSON.parse(row.scope),
    artifact_types: JSON.parse(row.artifact_types),
    tags: JSON.parse(row.tags),
  };
}

export function insertStatement(
  db: Database.Database,
  stmt: Omit<CanonStatement, "id" | "created_at" | "updated_at">,
): CanonStatement {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO canon_statements
     (id, project_id, canon_version, text, statement_type, lifecycle, hardness,
      scope, artifact_types, tags, rationale, confidence, replacement_statement_id,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    stmt.project_id,
    stmt.canon_version,
    stmt.text,
    stmt.statement_type,
    stmt.lifecycle,
    stmt.hardness,
    JSON.stringify(stmt.scope),
    JSON.stringify(stmt.artifact_types),
    JSON.stringify(stmt.tags),
    stmt.rationale,
    stmt.confidence,
    stmt.replacement_statement_id,
    ts,
    ts,
  );
  return { ...stmt, id, created_at: ts, updated_at: ts };
}

export function getStatements(
  db: Database.Database,
  projectId: string,
  filters?: {
    lifecycle?: LifecycleState;
    hardness?: HardnessLevel;
    statement_type?: StatementType;
  },
): CanonStatement[] {
  let sql = "SELECT * FROM canon_statements WHERE project_id = ?";
  const params: unknown[] = [projectId];

  if (filters?.lifecycle) {
    sql += " AND lifecycle = ?";
    params.push(filters.lifecycle);
  }
  if (filters?.hardness) {
    sql += " AND hardness = ?";
    params.push(filters.hardness);
  }
  if (filters?.statement_type) {
    sql += " AND statement_type = ?";
    params.push(filters.statement_type);
  }

  sql += " ORDER BY created_at ASC";

  const rows = db.prepare(sql).all(...params) as CanonStatementRow[];
  return rows.map(rowToStatement);
}

export function updateStatementLifecycle(
  db: Database.Database,
  statementId: string,
  lifecycle: LifecycleState,
  replacementId?: string,
): void {
  const ts = now();
  db.prepare(
    `UPDATE canon_statements
     SET lifecycle = ?, replacement_statement_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(lifecycle, replacementId ?? null, ts, statementId);
}

export function updateStatementHardness(
  db: Database.Database,
  statementId: string,
  hardness: HardnessLevel,
): void {
  const ts = now();
  db.prepare(
    `UPDATE canon_statements SET hardness = ?, updated_at = ? WHERE id = ?`,
  ).run(hardness, ts, statementId);
}

// ── Counts ─────────────────────────────────────────────────────

export type StatementCounts = {
  total: number;
  by_lifecycle: Record<string, number>;
  by_hardness: Record<string, number>;
  by_type: Record<string, number>;
};

export function getStatementCounts(
  db: Database.Database,
  projectId: string,
): StatementCounts {
  const total = (
    db.prepare("SELECT COUNT(*) as c FROM canon_statements WHERE project_id = ?").get(projectId) as { c: number }
  ).c;

  const byLifecycle = db
    .prepare("SELECT lifecycle, COUNT(*) as c FROM canon_statements WHERE project_id = ? GROUP BY lifecycle")
    .all(projectId) as { lifecycle: string; c: number }[];

  const byHardness = db
    .prepare("SELECT hardness, COUNT(*) as c FROM canon_statements WHERE project_id = ? GROUP BY hardness")
    .all(projectId) as { hardness: string; c: number }[];

  const byType = db
    .prepare("SELECT statement_type, COUNT(*) as c FROM canon_statements WHERE project_id = ? GROUP BY statement_type")
    .all(projectId) as { statement_type: string; c: number }[];

  return {
    total,
    by_lifecycle: Object.fromEntries(byLifecycle.map((r) => [r.lifecycle, r.c])),
    by_hardness: Object.fromEntries(byHardness.map((r) => [r.hardness, r.c])),
    by_type: Object.fromEntries(byType.map((r) => [r.statement_type, r.c])),
  };
}
