import type Database from "better-sqlite3";
import type { EvidenceRef } from "../core/types.js";
import type { EvidenceRefRow } from "../db/schema.js";
import type { ExtractionMethod, LocatorKind } from "../core/enums.js";
import { newId } from "../core/ids.js";

export function insertEvidence(
  db: Database.Database,
  evidence: Omit<EvidenceRef, "id">,
): EvidenceRef {
  const id = newId();
  db.prepare(
    `INSERT INTO evidence_refs (id, statement_id, source_artifact_id, locator_kind, locator_value, note, extraction_method, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    evidence.statement_id,
    evidence.source_artifact_id,
    evidence.locator.kind,
    evidence.locator.value,
    evidence.note,
    evidence.extraction_method,
    evidence.confidence,
  );
  return { ...evidence, id };
}

export function getEvidenceForStatement(
  db: Database.Database,
  statementId: string,
): EvidenceRef[] {
  const rows = db
    .prepare("SELECT * FROM evidence_refs WHERE statement_id = ?")
    .all(statementId) as EvidenceRefRow[];
  return rows.map(rowToEvidence);
}

export function getEvidenceForSource(
  db: Database.Database,
  sourceArtifactId: string,
): EvidenceRef[] {
  const rows = db
    .prepare("SELECT * FROM evidence_refs WHERE source_artifact_id = ?")
    .all(sourceArtifactId) as EvidenceRefRow[];
  return rows.map(rowToEvidence);
}

function rowToEvidence(row: EvidenceRefRow): EvidenceRef {
  return {
    id: row.id,
    statement_id: row.statement_id,
    source_artifact_id: row.source_artifact_id,
    locator: {
      kind: row.locator_kind as LocatorKind,
      value: row.locator_value,
    },
    note: row.note,
    extraction_method: row.extraction_method as ExtractionMethod,
    confidence: row.confidence,
  };
}
