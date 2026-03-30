import type Database from "better-sqlite3";
import type { CandidateArtifact } from "../core/types.js";
import type { CandidateArtifactRow } from "../db/schema.js";
import type { ArtifactType } from "../core/enums.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

export function insertCandidateArtifact(
  db: Database.Database,
  projectId: string,
  title: string,
  artifactType: ArtifactType,
  intendedPurpose: string,
  body: string,
): CandidateArtifact {
  const id = newId();
  const ts = now();

  db.prepare(
    `INSERT INTO candidate_artifacts (id, project_id, title, artifact_type, intended_purpose, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, title, artifactType, intendedPurpose, body, ts);

  return {
    id,
    project_id: projectId,
    title,
    artifact_type: artifactType,
    intended_purpose: intendedPurpose,
    body,
    created_at: ts,
  };
}

export function getCandidateArtifacts(
  db: Database.Database,
  projectId: string,
): CandidateArtifact[] {
  const rows = db
    .prepare("SELECT * FROM candidate_artifacts WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as CandidateArtifactRow[];
  return rows.map((r) => ({
    ...r,
    artifact_type: r.artifact_type as ArtifactType,
  }));
}
