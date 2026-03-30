import type Database from "better-sqlite3";
import type { CanonVersionRow } from "../db/schema.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

export function createCanonVersion(
  db: Database.Database,
  projectId: string,
  versionLabel: string,
): CanonVersionRow {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO canon_versions (id, project_id, version_label, frozen_at, created_at)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run(id, projectId, versionLabel, ts);

  db.prepare(
    `UPDATE projects SET current_version = ?, updated_at = ? WHERE id = ?`,
  ).run(versionLabel, ts, projectId);

  return { id, project_id: projectId, version_label: versionLabel, frozen_at: null, created_at: ts };
}

export function freezeCanonVersion(
  db: Database.Database,
  projectId: string,
  versionLabel: string,
): void {
  const ts = now();
  db.prepare(
    `UPDATE canon_versions SET frozen_at = ? WHERE project_id = ? AND version_label = ?`,
  ).run(ts, projectId, versionLabel);
}

export function getCurrentVersion(
  db: Database.Database,
  projectId: string,
): CanonVersionRow | null {
  const row = db
    .prepare(
      `SELECT cv.* FROM canon_versions cv
       JOIN projects p ON p.id = cv.project_id AND p.current_version = cv.version_label
       WHERE cv.project_id = ?`,
    )
    .get(projectId) as CanonVersionRow | undefined;
  return row ?? null;
}

export function listVersions(
  db: Database.Database,
  projectId: string,
): CanonVersionRow[] {
  return db
    .prepare("SELECT * FROM canon_versions WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as CanonVersionRow[];
}
