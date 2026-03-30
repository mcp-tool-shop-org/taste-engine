import type Database from "better-sqlite3";
import type { SourceArtifact } from "../core/types.js";
import type { SourceArtifactRow } from "../db/schema.js";
import type { SourceArtifactType } from "../core/enums.js";
import { newId } from "../core/ids.js";
import { sha256 } from "../util/hashing.js";
import { now } from "../util/timestamps.js";

export function insertSourceArtifact(
  db: Database.Database,
  projectId: string,
  title: string,
  artifactType: SourceArtifactType,
  body: string,
  path?: string,
): SourceArtifact {
  const id = newId();
  const ts = now();
  const hash = sha256(body);

  db.prepare(
    `INSERT INTO source_artifacts (id, project_id, title, artifact_type, path, content_hash, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, title, artifactType, path ?? null, hash, body, ts, ts);

  return {
    id,
    project_id: projectId,
    title,
    artifact_type: artifactType,
    path: path ?? null,
    content_hash: hash,
    body,
    created_at: ts,
    updated_at: ts,
  };
}

export function getSourceArtifacts(
  db: Database.Database,
  projectId: string,
): SourceArtifact[] {
  const rows = db
    .prepare("SELECT * FROM source_artifacts WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as SourceArtifactRow[];
  return rows.map((r) => ({
    ...r,
    artifact_type: r.artifact_type as SourceArtifactType,
  }));
}

export function getSourceArtifactByHash(
  db: Database.Database,
  projectId: string,
  contentHash: string,
): SourceArtifact | null {
  const row = db
    .prepare("SELECT * FROM source_artifacts WHERE project_id = ? AND content_hash = ?")
    .get(projectId, contentHash) as SourceArtifactRow | undefined;
  if (!row) return null;
  return { ...row, artifact_type: row.artifact_type as SourceArtifactType };
}
