import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject } from "../../src/canon/canon-store.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import {
  createReviewRun,
  completeReviewRun,
  getReviewRun,
  getLatestReviewRun,
  listReviewRuns,
  insertPacketItems,
  getPacketItems,
  insertDimensionEval,
  getDimensionEvals,
  insertAlignmentReview,
  getAlignmentReview,
  insertObservations,
  getObservations,
  insertSuggestions,
  getSuggestions,
} from "../../src/review/review-store.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("review store", () => {
  let db: Database.Database;
  let projectId: string;
  let candidateId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
    candidateId = insertCandidateArtifact(db, projectId, "Test", "readme_section", "test", "body").id;
  });

  afterEach(() => { db.close(); });

  describe("review runs", () => {
    it("creates and retrieves run", () => {
      const run = createReviewRun(db, {
        project_id: projectId,
        canon_version: "canon-v1",
        candidate_artifact_id: candidateId,
        provider: "ollama",
        model: "qwen3:14b",
        canon_packet_size: 5,
      });
      expect(run.status).toBe("running");

      const fetched = getReviewRun(db, run.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.canon_version).toBe("canon-v1");
    });

    it("completes a run", () => {
      const run = createReviewRun(db, {
        project_id: projectId, canon_version: "v1",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "test", canon_packet_size: 3,
      });
      completeReviewRun(db, run.id, "completed");
      const fetched = getReviewRun(db, run.id)!;
      expect(fetched.status).toBe("completed");
      expect(fetched.completed_at).not.toBeNull();
    });

    it("lists runs with filters", () => {
      createReviewRun(db, {
        project_id: projectId, canon_version: "v1",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "test", canon_packet_size: 3,
      });
      createReviewRun(db, {
        project_id: projectId, canon_version: "v2",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "test", canon_packet_size: 3,
      });

      const all = listReviewRuns(db, projectId);
      expect(all.length).toBe(2);

      const v1 = listReviewRuns(db, projectId, { canon_version: "v1" });
      expect(v1.length).toBe(1);
    });

    it("gets latest run", () => {
      createReviewRun(db, {
        project_id: projectId, canon_version: "v1",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "a", canon_packet_size: 1,
      });
      const r2 = createReviewRun(db, {
        project_id: projectId, canon_version: "v1",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "b", canon_packet_size: 2,
      });

      const latest = getLatestReviewRun(db, projectId);
      expect(latest!.id).toBe(r2.id);
    });
  });

  describe("packet items", () => {
    it("inserts and retrieves items in order", () => {
      const run = createReviewRun(db, {
        project_id: projectId, canon_version: "v1",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "test", canon_packet_size: 2,
      });

      insertPacketItems(db, run.id, [
        { source_kind: "statement", source_id: "s1", reason_selected: "hard_thesis", rank: 1 },
        { source_kind: "statement", source_id: "s2", reason_selected: "anti_pattern", rank: 2 },
        { source_kind: "tension", source_id: "t1", reason_selected: "tension", rank: 3 },
      ]);

      const items = getPacketItems(db, run.id);
      expect(items.length).toBe(3);
      expect(items[0].rank).toBe(1);
      expect(items[0].reason_selected).toBe("hard_thesis");
      expect(items[2].source_kind).toBe("tension");
    });
  });

  describe("dimension evaluations", () => {
    it("inserts and retrieves evaluations", () => {
      const run = createReviewRun(db, {
        project_id: projectId, canon_version: "v1",
        candidate_artifact_id: candidateId,
        provider: "mock", model: "test", canon_packet_size: 1,
      });

      insertDimensionEval(db, {
        review_run_id: run.id,
        dimension: "thesis_preservation",
        rating: "strong",
        judgment: "Thesis fully preserved",
        confidence: 0.9,
        evidence_statement_ids: ["s1", "s2"],
        notes: ["Good framing"],
      });

      const evals = getDimensionEvals(db, run.id);
      expect(evals.length).toBe(1);
      expect(evals[0].dimension).toBe("thesis_preservation");
      expect(evals[0].evidence_statement_ids).toEqual(["s1", "s2"]);
      expect(evals[0].notes).toEqual(["Good framing"]);
    });
  });

  describe("alignment reviews", () => {
    it("inserts and retrieves review", () => {
      const review = insertAlignmentReview(db, {
        project_id: projectId,
        candidate_artifact_id: candidateId,
        canon_version: "v1",
        verdict: "mostly_aligned",
        thesis_preservation: "strong",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "minor",
        voice_naming_fit: "strong",
        summary: "Mostly on-thesis but uses generic language in section 3",
      });

      const fetched = getAlignmentReview(db, candidateId);
      expect(fetched).not.toBeNull();
      expect(fetched!.verdict).toBe("mostly_aligned");
    });
  });

  describe("observations and suggestions", () => {
    it("stores and retrieves observations", () => {
      const review = insertAlignmentReview(db, {
        project_id: projectId, candidate_artifact_id: candidateId,
        canon_version: "v1", verdict: "aligned",
        thesis_preservation: "strong", pattern_fidelity: "strong",
        anti_pattern_collision: "none", voice_naming_fit: "strong",
        summary: "Good",
      });

      insertObservations(db, review.id, [
        { kind: "preserved", text: "OS framing maintained" },
        { kind: "drift", text: "Slight softening in paragraph 2" },
      ]);

      const obs = getObservations(db, review.id);
      expect(obs.length).toBe(2);
      expect(obs[0].kind).toBe("preserved");
    });

    it("stores and retrieves suggestions", () => {
      const review = insertAlignmentReview(db, {
        project_id: projectId, candidate_artifact_id: candidateId,
        canon_version: "v1", verdict: "salvageable_drift",
        thesis_preservation: "mixed", pattern_fidelity: "strong",
        anti_pattern_collision: "minor", voice_naming_fit: "mixed",
        summary: "Needs revision",
      });

      insertSuggestions(db, review.id, [
        { action: "revise", target_excerpt: "helps you manage", guidance: "Change to 'routes and executes'" },
        { action: "keep", target_excerpt: null, guidance: "Routing concept is correct" },
        { action: "cut", target_excerpt: "simple AI tool", guidance: "Remove generic framing" },
      ]);

      const sug = getSuggestions(db, review.id);
      expect(sug.length).toBe(3);
      expect(sug.find((s) => s.action === "revise")?.target_excerpt).toBe("helps you manage");
    });
  });
});
