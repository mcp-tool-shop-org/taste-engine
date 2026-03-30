import type Database from "better-sqlite3";
import type {
  ReviewFeedback,
  DimensionFeedback,
  PacketFeedback,
  OverallRating,
  VerdictAgreement,
  DimensionAssessment,
  ProjectMetrics,
  StatementUtility,
  ArtifactTypeMetrics,
} from "./calibration-types.js";
import type { Dimension } from "../review/review-run-types.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";

// ── Review Feedback ────────────────────────────────────────────

export function insertReviewFeedback(
  db: Database.Database,
  fb: Omit<ReviewFeedback, "id" | "created_at">,
): ReviewFeedback {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO review_feedback (id, project_id, review_id, review_run_id,
     overall, verdict_agreement, false_rigidity, missed_drift, wrong_packet,
     weak_evidence, weak_revision_guidance, good_revision_guidance,
     uncertainty_was_helpful, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, fb.project_id, fb.review_id, fb.review_run_id,
    fb.overall, fb.verdict_agreement,
    fb.false_rigidity ? 1 : 0, fb.missed_drift ? 1 : 0,
    fb.wrong_packet ? 1 : 0, fb.weak_evidence ? 1 : 0,
    fb.weak_revision_guidance ? 1 : 0, fb.good_revision_guidance ? 1 : 0,
    fb.uncertainty_was_helpful ? 1 : 0, fb.notes, ts,
  );
  return { ...fb, id, created_at: ts };
}

export function getReviewFeedback(db: Database.Database, reviewId: string): ReviewFeedback | null {
  const row = db.prepare("SELECT * FROM review_feedback WHERE review_id = ?").get(reviewId) as any;
  if (!row) return null;
  return {
    ...row,
    false_rigidity: !!row.false_rigidity,
    missed_drift: !!row.missed_drift,
    wrong_packet: !!row.wrong_packet,
    weak_evidence: !!row.weak_evidence,
    weak_revision_guidance: !!row.weak_revision_guidance,
    good_revision_guidance: !!row.good_revision_guidance,
    uncertainty_was_helpful: !!row.uncertainty_was_helpful,
  };
}

export function getAllFeedback(db: Database.Database, projectId: string): ReviewFeedback[] {
  const rows = db.prepare("SELECT * FROM review_feedback WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as any[];
  return rows.map((r) => ({
    ...r,
    false_rigidity: !!r.false_rigidity,
    missed_drift: !!r.missed_drift,
    wrong_packet: !!r.wrong_packet,
    weak_evidence: !!r.weak_evidence,
    weak_revision_guidance: !!r.weak_revision_guidance,
    good_revision_guidance: !!r.good_revision_guidance,
    uncertainty_was_helpful: !!r.uncertainty_was_helpful,
  }));
}

// ── Dimension Feedback ─────────────────────────────────────────

export function insertDimensionFeedback(
  db: Database.Database,
  feedbackId: string,
  dimension: Dimension,
  assessment: DimensionAssessment,
  notes?: string,
): DimensionFeedback {
  const id = newId();
  db.prepare(
    `INSERT INTO dimension_feedback (id, review_feedback_id, dimension, assessment, notes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, feedbackId, dimension, assessment, notes ?? null);
  return { id, review_feedback_id: feedbackId, dimension, assessment, notes: notes ?? null };
}

export function getDimensionFeedback(db: Database.Database, feedbackId: string): DimensionFeedback[] {
  return db.prepare("SELECT * FROM dimension_feedback WHERE review_feedback_id = ?").all(feedbackId) as DimensionFeedback[];
}

// ── Packet Feedback ────────────────────────────────────────────

export function insertPacketFeedback(
  db: Database.Database,
  feedbackId: string,
  pf: Omit<PacketFeedback, "id" | "review_feedback_id">,
): PacketFeedback {
  const id = newId();
  db.prepare(
    `INSERT INTO packet_feedback (id, review_feedback_id, should_have_included_ids, should_not_have_included_ids, noisy_statement_ids, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, feedbackId,
    JSON.stringify(pf.should_have_included_ids),
    JSON.stringify(pf.should_not_have_included_ids),
    JSON.stringify(pf.noisy_statement_ids),
    pf.notes,
  );
  return { id, review_feedback_id: feedbackId, ...pf };
}

export function getPacketFeedback(db: Database.Database, feedbackId: string): PacketFeedback | null {
  const row = db.prepare("SELECT * FROM packet_feedback WHERE review_feedback_id = ?").get(feedbackId) as any;
  if (!row) return null;
  return {
    ...row,
    should_have_included_ids: JSON.parse(row.should_have_included_ids),
    should_not_have_included_ids: JSON.parse(row.should_not_have_included_ids),
    noisy_statement_ids: JSON.parse(row.noisy_statement_ids),
  };
}

// ── Project Metrics ────────────────────────────────────────────

export function computeProjectMetrics(db: Database.Database, projectId: string): ProjectMetrics {
  const reviewCount = (db.prepare(
    "SELECT COUNT(*) as c FROM alignment_reviews WHERE project_id = ?",
  ).get(projectId) as { c: number }).c;

  const allFb = getAllFeedback(db, projectId);
  const n = allFb.length;

  if (n === 0) {
    return {
      review_count: reviewCount, feedback_count: 0,
      agreement_rate: 0, false_rigidity_rate: 0, missed_drift_rate: 0,
      wrong_packet_rate: 0, good_revision_rate: 0, weak_revision_rate: 0,
    };
  }

  const agreeing = allFb.filter((f) => f.overall === "correct" || f.overall === "mostly_correct").length;
  const rigidity = allFb.filter((f) => f.false_rigidity).length;
  const missed = allFb.filter((f) => f.missed_drift).length;
  const wrongPkt = allFb.filter((f) => f.wrong_packet).length;
  const goodRev = allFb.filter((f) => f.good_revision_guidance).length;
  const weakRev = allFb.filter((f) => f.weak_revision_guidance).length;

  return {
    review_count: reviewCount,
    feedback_count: n,
    agreement_rate: agreeing / n,
    false_rigidity_rate: rigidity / n,
    missed_drift_rate: missed / n,
    wrong_packet_rate: wrongPkt / n,
    good_revision_rate: goodRev / n,
    weak_revision_rate: weakRev / n,
  };
}

// ── Statement Utility ──────────────────────────────────────────

export function computeStatementUtility(db: Database.Database, projectId: string): StatementUtility[] {
  // Get all accepted statements
  const statements = db.prepare(
    "SELECT id, text, statement_type FROM canon_statements WHERE project_id = ? AND lifecycle = 'accepted'",
  ).all(projectId) as { id: string; text: string; statement_type: string }[];

  const results: StatementUtility[] = [];

  for (const stmt of statements) {
    // How many times selected in packets
    const selectedCount = (db.prepare(
      "SELECT COUNT(*) as c FROM canon_packet_items WHERE source_kind = 'statement' AND source_id = ?",
    ).get(stmt.id) as { c: number }).c;

    // How many times cited in dimension evaluations (evidence_statement_ids contains the ID)
    const citedCount = (db.prepare(
      "SELECT COUNT(*) as c FROM dimension_evaluations WHERE evidence_statement_ids LIKE ?",
    ).get(`%${stmt.id}%`) as { c: number }).c;

    // How many times flagged as noisy
    const noiseCount = (db.prepare(
      "SELECT COUNT(*) as c FROM packet_feedback WHERE noisy_statement_ids LIKE ?",
    ).get(`%${stmt.id}%`) as { c: number }).c;

    // False rigidity association: reviews where this statement was in packet AND feedback flagged rigidity
    const rigidityAssoc = (db.prepare(
      `SELECT COUNT(DISTINCT rf.id) as c FROM review_feedback rf
       JOIN canon_packet_items cpi ON cpi.review_run_id = rf.review_run_id
       WHERE cpi.source_id = ? AND cpi.source_kind = 'statement' AND rf.false_rigidity = 1`,
    ).get(stmt.id) as { c: number }).c;

    const citationRate = selectedCount > 0 ? citedCount / selectedCount : 0;
    const noiseRate = selectedCount > 0 ? noiseCount / selectedCount : 0;

    results.push({
      statement_id: stmt.id,
      statement_text: stmt.text,
      statement_type: stmt.statement_type,
      selected_count: selectedCount,
      cited_count: citedCount,
      citation_rate: citationRate,
      noise_count: noiseCount,
      noise_rate: noiseRate,
      false_rigidity_association: rigidityAssoc,
    });
  }

  return results.sort((a, b) => b.selected_count - a.selected_count);
}

// ── Artifact Type Metrics ──────────────────────────────────────

export function computeArtifactTypeMetrics(db: Database.Database, projectId: string): ArtifactTypeMetrics[] {
  // Get artifact types with reviews
  const types = db.prepare(
    `SELECT DISTINCT ca.artifact_type FROM alignment_reviews ar
     JOIN candidate_artifacts ca ON ca.id = ar.candidate_artifact_id
     WHERE ar.project_id = ?`,
  ).all(projectId) as { artifact_type: string }[];

  const results: ArtifactTypeMetrics[] = [];

  for (const { artifact_type } of types) {
    // Get reviews for this type
    const reviews = db.prepare(
      `SELECT ar.id FROM alignment_reviews ar
       JOIN candidate_artifacts ca ON ca.id = ar.candidate_artifact_id
       WHERE ar.project_id = ? AND ca.artifact_type = ?`,
    ).all(projectId, artifact_type) as { id: string }[];

    const reviewIds = reviews.map((r) => r.id);
    if (reviewIds.length === 0) continue;

    // Get feedback for these reviews
    const placeholders = reviewIds.map(() => "?").join(",");
    const feedback = db.prepare(
      `SELECT * FROM review_feedback WHERE review_id IN (${placeholders})`,
    ).all(...reviewIds) as any[];

    const n = feedback.length;
    if (n === 0) {
      results.push({ artifact_type, review_count: reviewIds.length, agreement_rate: 0, rigidity_rate: 0, missed_drift_rate: 0, wrong_packet_rate: 0 });
      continue;
    }

    results.push({
      artifact_type,
      review_count: reviewIds.length,
      agreement_rate: feedback.filter((f: any) => f.overall === "correct" || f.overall === "mostly_correct").length / n,
      rigidity_rate: feedback.filter((f: any) => f.false_rigidity).length / n,
      missed_drift_rate: feedback.filter((f: any) => f.missed_drift).length / n,
      wrong_packet_rate: feedback.filter((f: any) => f.wrong_packet).length / n,
    });
  }

  return results;
}
