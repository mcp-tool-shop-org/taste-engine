import type Database from "better-sqlite3";
import type {
  ReviewRun,
  CanonPacketItem,
  DimensionEvaluation,
  Dimension,
  ReviewRunStatus,
} from "./review-run-types.js";
import type { AlignmentReview, ReviewObservation, RevisionSuggestion } from "../core/types.js";
import type { Verdict, DimensionRating, CollisionRating, ObservationKind, RevisionAction } from "../core/enums.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

// ── Review Runs ────────────────────────────────────────────────

export function createReviewRun(
  db: Database.Database,
  opts: {
    project_id: string;
    canon_version: string;
    candidate_artifact_id: string;
    provider: string;
    model: string;
    canon_packet_size: number;
  },
): ReviewRun {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO review_runs (id, project_id, canon_version, candidate_artifact_id, status, provider, model, canon_packet_size, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
  ).run(id, opts.project_id, opts.canon_version, opts.candidate_artifact_id, opts.provider, opts.model, opts.canon_packet_size, ts);
  return { id, ...opts, status: "running", started_at: ts, completed_at: null };
}

export function completeReviewRun(db: Database.Database, runId: string, status: ReviewRunStatus): void {
  db.prepare("UPDATE review_runs SET status = ?, completed_at = ? WHERE id = ?").run(status, now(), runId);
}

export function getReviewRun(db: Database.Database, runId: string): ReviewRun | null {
  return db.prepare("SELECT * FROM review_runs WHERE id = ?").get(runId) as ReviewRun | undefined ?? null;
}

export function getLatestReviewRun(db: Database.Database, projectId: string): ReviewRun | null {
  return db.prepare("SELECT * FROM review_runs WHERE project_id = ? ORDER BY rowid DESC LIMIT 1").get(projectId) as ReviewRun | undefined ?? null;
}

export function listReviewRuns(
  db: Database.Database,
  projectId: string,
  filters?: { canon_version?: string; status?: ReviewRunStatus },
): ReviewRun[] {
  let sql = "SELECT * FROM review_runs WHERE project_id = ?";
  const params: unknown[] = [projectId];
  if (filters?.canon_version) { sql += " AND canon_version = ?"; params.push(filters.canon_version); }
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }
  sql += " ORDER BY rowid DESC";
  return db.prepare(sql).all(...params) as ReviewRun[];
}

// ── Canon Packet Items ─────────────────────────────────────────

export function insertPacketItems(db: Database.Database, runId: string, items: Omit<CanonPacketItem, "id" | "review_run_id">[]): void {
  const stmt = db.prepare(
    `INSERT INTO canon_packet_items (id, review_run_id, source_kind, source_id, reason_selected, rank)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const item of items) {
    stmt.run(newId(), runId, item.source_kind, item.source_id, item.reason_selected, item.rank);
  }
}

export function getPacketItems(db: Database.Database, runId: string): CanonPacketItem[] {
  return db.prepare("SELECT * FROM canon_packet_items WHERE review_run_id = ? ORDER BY rank").all(runId) as CanonPacketItem[];
}

// ── Dimension Evaluations ──────────────────────────────────────

export function insertDimensionEval(
  db: Database.Database,
  eval_: Omit<DimensionEvaluation, "id">,
): DimensionEvaluation {
  const id = newId();
  db.prepare(
    `INSERT INTO dimension_evaluations (id, review_run_id, dimension, rating, judgment, confidence, evidence_statement_ids, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, eval_.review_run_id, eval_.dimension, eval_.rating, eval_.judgment, eval_.confidence,
    JSON.stringify(eval_.evidence_statement_ids), JSON.stringify(eval_.notes));
  return { id, ...eval_ };
}

export function getDimensionEvals(db: Database.Database, runId: string): DimensionEvaluation[] {
  const rows = db.prepare("SELECT * FROM dimension_evaluations WHERE review_run_id = ?").all(runId) as any[];
  return rows.map((r) => ({
    ...r,
    evidence_statement_ids: JSON.parse(r.evidence_statement_ids),
    notes: JSON.parse(r.notes),
  }));
}

// ── Alignment Review (final synthesis) ─────────────────────────

export function insertAlignmentReview(
  db: Database.Database,
  review: Omit<AlignmentReview, "id" | "created_at">,
): AlignmentReview {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO alignment_reviews (id, project_id, candidate_artifact_id, canon_version, verdict,
     thesis_preservation, pattern_fidelity, anti_pattern_collision, voice_naming_fit, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, review.project_id, review.candidate_artifact_id, review.canon_version,
    review.verdict, review.thesis_preservation, review.pattern_fidelity,
    review.anti_pattern_collision, review.voice_naming_fit, review.summary, ts);
  return { id, ...review, created_at: ts };
}

export function getAlignmentReview(db: Database.Database, candidateId: string): AlignmentReview | null {
  return db.prepare("SELECT * FROM alignment_reviews WHERE candidate_artifact_id = ? ORDER BY rowid DESC LIMIT 1").get(candidateId) as AlignmentReview | undefined ?? null;
}

export function getAlignmentReviewByRun(db: Database.Database, projectId: string, runId: string): AlignmentReview | null {
  // Find via candidate_artifact_id from the review run
  const run = getReviewRun(db, runId);
  if (!run) return null;
  return getAlignmentReview(db, run.candidate_artifact_id);
}

// ── Observations & Suggestions ─────────────────────────────────

export function insertObservations(db: Database.Database, reviewId: string, observations: Array<{ kind: ObservationKind; text: string }>): void {
  const stmt = db.prepare("INSERT INTO review_observations (id, review_id, kind, text) VALUES (?, ?, ?, ?)");
  for (const obs of observations) {
    stmt.run(newId(), reviewId, obs.kind, obs.text);
  }
}

export function getObservations(db: Database.Database, reviewId: string): ReviewObservation[] {
  return db.prepare("SELECT * FROM review_observations WHERE review_id = ?").all(reviewId) as ReviewObservation[];
}

export function insertSuggestions(db: Database.Database, reviewId: string, suggestions: Array<{ action: RevisionAction; target_excerpt: string | null; guidance: string }>): void {
  const stmt = db.prepare("INSERT INTO revision_suggestions (id, review_id, action, target_excerpt, guidance) VALUES (?, ?, ?, ?, ?)");
  for (const sug of suggestions) {
    stmt.run(newId(), reviewId, sug.action, sug.target_excerpt, sug.guidance);
  }
}

export function getSuggestions(db: Database.Database, reviewId: string): RevisionSuggestion[] {
  return db.prepare("SELECT * FROM revision_suggestions WHERE review_id = ?").all(reviewId) as RevisionSuggestion[];
}
