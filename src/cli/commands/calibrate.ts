import { resolve, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import {
  insertReviewFeedback,
  insertDimensionFeedback,
  insertPacketFeedback,
  getReviewFeedback,
  computeProjectMetrics,
  computeStatementUtility,
  computeArtifactTypeMetrics,
} from "../../calibration/calibration-store.js";
import { generateFindings, persistFindings, getFindings } from "../../calibration/findings-engine.js";
import type { OverallRating, VerdictAgreement, DimensionAssessment } from "../../calibration/calibration-types.js";
import type { Dimension } from "../../review/review-run-types.js";
import { DIMENSIONS } from "../../review/review-run-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

function setup(root: string) {
  if (!isInitialized(root)) {
    console.log("Not initialized. Run: taste init <slug>");
    process.exitCode = 1;
    return null;
  }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) {
    console.log(`Project "${config.projectSlug}" not found.`);
    closeDb();
    process.exitCode = 1;
    return null;
  }
  return { config, db, project };
}

// ── Review Feedback ────────────────────────────────────────────

export async function reviewFeedbackCommand(reviewId: string, opts: {
  root?: string;
  overall: string;
  verdict: string;
  falseRigidity?: boolean;
  missedDrift?: boolean;
  wrongPacket?: boolean;
  weakEvidence?: boolean;
  weakRevision?: boolean;
  goodRevision?: boolean;
  uncertaintyHelpful?: boolean;
  notes?: string;
  // dimension feedback (comma-separated: thesis=correct,pattern=too_harsh,...)
  dimensions?: string;
  // packet feedback
  noisyStatements?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  // Find the review
  const review = db.prepare(
    "SELECT ar.*, rr.id as run_id FROM alignment_reviews ar JOIN review_runs rr ON rr.candidate_artifact_id = ar.candidate_artifact_id AND rr.project_id = ar.project_id WHERE ar.id = ? OR ar.id LIKE ?",
  ).get(reviewId, `${reviewId}%`) as any;

  if (!review) {
    console.log(`Review not found: ${reviewId}`);
    closeDb();
    process.exitCode = 1;
    return;
  }

  const existing = getReviewFeedback(db, review.id);
  if (existing) {
    console.log(`Feedback already exists for review ${review.id}`);
    closeDb();
    return;
  }

  const fb = insertReviewFeedback(db, {
    project_id: project.id,
    review_id: review.id,
    review_run_id: review.run_id,
    overall: opts.overall as OverallRating,
    verdict_agreement: opts.verdict as VerdictAgreement,
    false_rigidity: opts.falseRigidity ?? false,
    missed_drift: opts.missedDrift ?? false,
    wrong_packet: opts.wrongPacket ?? false,
    weak_evidence: opts.weakEvidence ?? false,
    weak_revision_guidance: opts.weakRevision ?? false,
    good_revision_guidance: opts.goodRevision ?? false,
    uncertainty_was_helpful: opts.uncertaintyHelpful ?? false,
    notes: opts.notes ?? null,
  });

  // Dimension feedback
  if (opts.dimensions) {
    const parts = opts.dimensions.split(",").map((p) => p.trim());
    for (const part of parts) {
      const [dim, assessment] = part.split("=");
      if (dim && assessment && (DIMENSIONS as readonly string[]).includes(dim)) {
        insertDimensionFeedback(db, fb.id, dim as Dimension, assessment as DimensionAssessment);
      }
    }
  }

  // Packet feedback
  if (opts.noisyStatements) {
    insertPacketFeedback(db, fb.id, {
      should_have_included_ids: [],
      should_not_have_included_ids: [],
      noisy_statement_ids: opts.noisyStatements.split(",").map((s) => s.trim()),
      notes: null,
    });
  }

  console.log(`Feedback recorded for review ${review.id}`);
  console.log(`  Overall: ${opts.overall}`);
  console.log(`  Verdict agreement: ${opts.verdict}`);

  closeDb();
}

// ── Calibrate Summary ──────────────────────────────────────────

export async function calibrateSummaryCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const metrics = computeProjectMetrics(db, project.id);

  console.log(`=== Calibration Summary: ${project.name} ===`);
  console.log();
  console.log(`Reviews: ${metrics.review_count}`);
  console.log(`Feedback: ${metrics.feedback_count}`);

  if (metrics.feedback_count === 0) {
    console.log();
    console.log("No feedback yet. Use 'taste review feedback <id>' after reviews.");
    closeDb();
    return;
  }

  console.log();
  console.log(`Agreement rate:       ${(metrics.agreement_rate * 100).toFixed(0)}%`);
  console.log(`False rigidity rate:  ${(metrics.false_rigidity_rate * 100).toFixed(0)}%`);
  console.log(`Missed drift rate:    ${(metrics.missed_drift_rate * 100).toFixed(0)}%`);
  console.log(`Wrong packet rate:    ${(metrics.wrong_packet_rate * 100).toFixed(0)}%`);
  console.log(`Good revision rate:   ${(metrics.good_revision_rate * 100).toFixed(0)}%`);
  console.log(`Weak revision rate:   ${(metrics.weak_revision_rate * 100).toFixed(0)}%`);

  // Artifact type breakdown
  const typeMetrics = computeArtifactTypeMetrics(db, project.id);
  if (typeMetrics.length > 0) {
    console.log();
    console.log("=== By Artifact Type ===");
    for (const tm of typeMetrics) {
      console.log(`  ${tm.artifact_type} (${tm.review_count} reviews)`);
      if (tm.review_count > 0) {
        console.log(`    Agreement: ${(tm.agreement_rate * 100).toFixed(0)}% | Rigidity: ${(tm.rigidity_rate * 100).toFixed(0)}% | Missed: ${(tm.missed_drift_rate * 100).toFixed(0)}%`);
      }
    }
  }

  closeDb();
}

// ── Calibrate Statements ───────────────────────────────────────

export async function calibrateStatementsCommand(opts: {
  root?: string;
  type?: string;
  noisy?: boolean;
  underused?: boolean;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  let utils = computeStatementUtility(db, project.id);

  if (opts.type) {
    utils = utils.filter((u) => u.statement_type === opts.type);
  }
  if (opts.noisy) {
    utils = utils.filter((u) => u.noise_rate > 0.1);
  }
  if (opts.underused) {
    utils = utils.filter((u) => u.selected_count > 0 && u.citation_rate < 0.15);
  }

  if (utils.length === 0) {
    console.log("No matching statements.");
    closeDb();
    return;
  }

  console.log("=== Statement Utility ===");
  console.log();
  for (const u of utils) {
    console.log(`[${u.statement_type}] ${u.statement_text.slice(0, 70)}`);
    console.log(`  Selected: ${u.selected_count} | Cited: ${u.cited_count} (${(u.citation_rate * 100).toFixed(0)}%)`);
    if (u.noise_count > 0) console.log(`  Noise: ${u.noise_count} (${(u.noise_rate * 100).toFixed(0)}%)`);
    if (u.false_rigidity_association > 0) console.log(`  Rigidity assoc: ${u.false_rigidity_association}`);
    console.log(`  ID: ${u.statement_id}`);
    console.log();
  }

  closeDb();
}

// ── Calibrate Findings ─────────────────────────────────────────

export async function calibrateFindingsCommand(opts: {
  root?: string;
  refresh?: boolean;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  if (opts.refresh) {
    const findings = generateFindings(db, project.id);
    // Set project_id on all findings
    for (const f of findings) f.project_id = project.id;
    persistFindings(db, project.id, findings);
    console.log(`Generated ${findings.length} finding(s).`);
    console.log();
  }

  const findings = getFindings(db, project.id);

  if (findings.length === 0) {
    console.log("No calibration findings. Use --refresh to generate from current feedback.");
    closeDb();
    return;
  }

  console.log("=== Calibration Findings ===");
  console.log();
  for (const f of findings) {
    console.log(`[${f.severity}] [${f.category}] ${f.title}`);
    console.log(`  ${f.description}`);
    if (f.suggested_actions.length > 0) {
      console.log("  Suggested:");
      for (const a of f.suggested_actions) console.log(`    - ${a}`);
    }
    console.log();
  }

  console.log(`${findings.length} finding(s).`);
  closeDb();
}
