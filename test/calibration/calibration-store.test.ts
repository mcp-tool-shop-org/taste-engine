import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { createReviewRun, insertAlignmentReview, insertPacketItems, insertDimensionEval } from "../../src/review/review-store.js";
import {
  insertReviewFeedback,
  getReviewFeedback,
  getAllFeedback,
  insertDimensionFeedback,
  getDimensionFeedback,
  insertPacketFeedback,
  getPacketFeedback,
  computeProjectMetrics,
  computeStatementUtility,
  computeArtifactTypeMetrics,
} from "../../src/calibration/calibration-store.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function setupProject(db: Database.Database) {
  const project = createProject(db, "test", "Test", "Test");
  createCanonVersion(db, project.id, "v1");
  return project;
}

function setupReview(db: Database.Database, projectId: string, artifactType: string = "readme_section") {
  const candidate = insertCandidateArtifact(db, projectId, "Test", artifactType as any, "test", "body");
  const run = createReviewRun(db, {
    project_id: projectId, canon_version: "v1",
    candidate_artifact_id: candidate.id,
    provider: "mock", model: "test", canon_packet_size: 3,
  });
  const review = insertAlignmentReview(db, {
    project_id: projectId, candidate_artifact_id: candidate.id,
    canon_version: "v1", verdict: "aligned",
    thesis_preservation: "strong", pattern_fidelity: "strong",
    anti_pattern_collision: "none", voice_naming_fit: "strong",
    summary: "Test review",
  });
  return { candidate, run, review };
}

describe("calibration store", () => {
  let db: Database.Database;
  let projectId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = setupProject(db).id;
  });

  afterEach(() => { db.close(); });

  // ── Feedback CRUD ────────────────────────────────────────

  describe("review feedback", () => {
    it("inserts and retrieves feedback", () => {
      const { run, review } = setupReview(db, projectId);

      const fb = insertReviewFeedback(db, {
        project_id: projectId, review_id: review.id, review_run_id: run.id,
        overall: "correct", verdict_agreement: "agree",
        false_rigidity: false, missed_drift: false, wrong_packet: false,
        weak_evidence: false, weak_revision_guidance: false,
        good_revision_guidance: true, uncertainty_was_helpful: false,
        notes: "Good review",
      });

      expect(fb.overall).toBe("correct");
      expect(fb.good_revision_guidance).toBe(true);

      const fetched = getReviewFeedback(db, review.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.overall).toBe("correct");
      expect(fetched!.good_revision_guidance).toBe(true);
      expect(fetched!.false_rigidity).toBe(false);
    });

    it("stores boolean flags correctly", () => {
      const { run, review } = setupReview(db, projectId);

      insertReviewFeedback(db, {
        project_id: projectId, review_id: review.id, review_run_id: run.id,
        overall: "mostly_wrong", verdict_agreement: "hard_disagree",
        false_rigidity: true, missed_drift: true, wrong_packet: true,
        weak_evidence: true, weak_revision_guidance: true,
        good_revision_guidance: false, uncertainty_was_helpful: false,
        notes: null,
      });

      const fetched = getReviewFeedback(db, review.id)!;
      expect(fetched.false_rigidity).toBe(true);
      expect(fetched.missed_drift).toBe(true);
      expect(fetched.wrong_packet).toBe(true);
      expect(fetched.weak_evidence).toBe(true);
    });

    it("allows null notes", () => {
      const { run, review } = setupReview(db, projectId);
      const fb = insertReviewFeedback(db, {
        project_id: projectId, review_id: review.id, review_run_id: run.id,
        overall: "correct", verdict_agreement: "agree",
        false_rigidity: false, missed_drift: false, wrong_packet: false,
        weak_evidence: false, weak_revision_guidance: false,
        good_revision_guidance: false, uncertainty_was_helpful: false,
        notes: null,
      });
      expect(fb.notes).toBeNull();
    });
  });

  describe("dimension feedback", () => {
    it("inserts and retrieves per-dimension feedback", () => {
      const { run, review } = setupReview(db, projectId);
      const fb = insertReviewFeedback(db, {
        project_id: projectId, review_id: review.id, review_run_id: run.id,
        overall: "mixed", verdict_agreement: "soft_disagree",
        false_rigidity: true, missed_drift: false, wrong_packet: false,
        weak_evidence: false, weak_revision_guidance: false,
        good_revision_guidance: false, uncertainty_was_helpful: false,
        notes: null,
      });

      insertDimensionFeedback(db, fb.id, "thesis_preservation", "correct");
      insertDimensionFeedback(db, fb.id, "pattern_fidelity", "too_harsh", "Patterns were valid");
      insertDimensionFeedback(db, fb.id, "anti_pattern_collision", "correct");
      insertDimensionFeedback(db, fb.id, "voice_naming_fit", "wrong_focus");

      const dims = getDimensionFeedback(db, fb.id);
      expect(dims.length).toBe(4);
      expect(dims.find((d) => d.dimension === "pattern_fidelity")?.assessment).toBe("too_harsh");
      expect(dims.find((d) => d.dimension === "pattern_fidelity")?.notes).toBe("Patterns were valid");
    });
  });

  describe("packet feedback", () => {
    it("inserts and retrieves packet feedback", () => {
      const { run, review } = setupReview(db, projectId);
      const fb = insertReviewFeedback(db, {
        project_id: projectId, review_id: review.id, review_run_id: run.id,
        overall: "mixed", verdict_agreement: "soft_disagree",
        false_rigidity: false, missed_drift: false, wrong_packet: true,
        weak_evidence: false, weak_revision_guidance: false,
        good_revision_guidance: false, uncertainty_was_helpful: false,
        notes: null,
      });

      insertPacketFeedback(db, fb.id, {
        should_have_included_ids: ["stmt-1", "stmt-2"],
        should_not_have_included_ids: ["stmt-3"],
        noisy_statement_ids: ["stmt-4"],
        notes: "Missing key anti-pattern",
      });

      const pf = getPacketFeedback(db, fb.id);
      expect(pf).not.toBeNull();
      expect(pf!.should_have_included_ids).toEqual(["stmt-1", "stmt-2"]);
      expect(pf!.noisy_statement_ids).toEqual(["stmt-4"]);
      expect(pf!.notes).toBe("Missing key anti-pattern");
    });
  });

  // ── Metrics ──────────────────────────────────────────────

  describe("project metrics", () => {
    it("computes rates from feedback", () => {
      // 3 reviews, 3 feedbacks: 2 correct, 1 wrong
      for (let i = 0; i < 3; i++) {
        const { run, review } = setupReview(db, projectId);
        insertReviewFeedback(db, {
          project_id: projectId, review_id: review.id, review_run_id: run.id,
          overall: i < 2 ? "correct" : "wrong",
          verdict_agreement: i < 2 ? "agree" : "hard_disagree",
          false_rigidity: i === 2,
          missed_drift: i === 2,
          wrong_packet: false,
          weak_evidence: false,
          weak_revision_guidance: i === 2,
          good_revision_guidance: i < 2,
          uncertainty_was_helpful: false,
          notes: null,
        });
      }

      const metrics = computeProjectMetrics(db, projectId);
      expect(metrics.review_count).toBe(3);
      expect(metrics.feedback_count).toBe(3);
      expect(metrics.agreement_rate).toBeCloseTo(2 / 3);
      expect(metrics.false_rigidity_rate).toBeCloseTo(1 / 3);
      expect(metrics.missed_drift_rate).toBeCloseTo(1 / 3);
      expect(metrics.good_revision_rate).toBeCloseTo(2 / 3);
    });

    it("returns zeros when no feedback", () => {
      const metrics = computeProjectMetrics(db, projectId);
      expect(metrics.feedback_count).toBe(0);
      expect(metrics.agreement_rate).toBe(0);
    });
  });

  describe("statement utility", () => {
    it("tracks selected and cited counts", () => {
      // Insert a canon statement
      const stmt = insertStatement(db, {
        project_id: projectId, canon_version: "v1",
        text: "Core thesis", statement_type: "thesis",
        lifecycle: "accepted", hardness: "hard",
        scope: ["product"], artifact_types: [],
        tags: [], rationale: "test", confidence: 0.9,
        replacement_statement_id: null,
      });

      // Create a review run with this statement in packet
      const { run } = setupReview(db, projectId);
      insertPacketItems(db, run.id, [
        { source_kind: "statement", source_id: stmt.id, reason_selected: "hard_thesis", rank: 1 },
      ]);

      // Cite it in a dimension eval
      insertDimensionEval(db, {
        review_run_id: run.id, dimension: "thesis_preservation",
        rating: "strong", judgment: "Good", confidence: 0.9,
        evidence_statement_ids: [stmt.id], notes: [],
      });

      const utils = computeStatementUtility(db, projectId);
      const u = utils.find((s) => s.statement_id === stmt.id);
      expect(u).toBeDefined();
      expect(u!.selected_count).toBe(1);
      expect(u!.cited_count).toBeGreaterThanOrEqual(1);
      expect(u!.citation_rate).toBeGreaterThan(0);
    });
  });

  describe("artifact type metrics", () => {
    it("computes per-type breakdowns", () => {
      // 2 readme reviews (both correct), 1 blurb review (wrong)
      for (let i = 0; i < 2; i++) {
        const { run, review } = setupReview(db, projectId, "readme_section");
        insertReviewFeedback(db, {
          project_id: projectId, review_id: review.id, review_run_id: run.id,
          overall: "correct", verdict_agreement: "agree",
          false_rigidity: false, missed_drift: false, wrong_packet: false,
          weak_evidence: false, weak_revision_guidance: false,
          good_revision_guidance: true, uncertainty_was_helpful: false,
          notes: null,
        });
      }

      const { run: r3, review: rev3 } = setupReview(db, projectId, "package_blurb");
      insertReviewFeedback(db, {
        project_id: projectId, review_id: rev3.id, review_run_id: r3.id,
        overall: "wrong", verdict_agreement: "hard_disagree",
        false_rigidity: true, missed_drift: false, wrong_packet: true,
        weak_evidence: false, weak_revision_guidance: false,
        good_revision_guidance: false, uncertainty_was_helpful: false,
        notes: null,
      });

      const typeMetrics = computeArtifactTypeMetrics(db, projectId);
      expect(typeMetrics.length).toBe(2);

      const readme = typeMetrics.find((t) => t.artifact_type === "readme_section");
      expect(readme).toBeDefined();
      expect(readme!.agreement_rate).toBe(1);

      const blurb = typeMetrics.find((t) => t.artifact_type === "package_blurb");
      expect(blurb).toBeDefined();
      expect(blurb!.agreement_rate).toBe(0);
      expect(blurb!.rigidity_rate).toBe(1);
    });
  });
});
