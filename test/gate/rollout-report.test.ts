import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject } from "../../src/canon/canon-store.js";
import { createCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { insertAlignmentReview } from "../../src/review/review-store.js";
import { recordOverride } from "../../src/gate/policy.js";
import { computeRolloutReport } from "../../src/gate/rollout-report.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function addReview(db: Database.Database, projectId: string, verdict: string, artifactType: string = "readme_section") {
  const candidate = insertCandidateArtifact(db, projectId, "test", artifactType as any, "test", "body");
  insertAlignmentReview(db, {
    project_id: projectId, candidate_artifact_id: candidate.id,
    canon_version: "v1", verdict: verdict as any,
    thesis_preservation: "strong", pattern_fidelity: "strong",
    anti_pattern_collision: "none", voice_naming_fit: "strong",
    summary: "test",
  });
}

describe("rollout report", () => {
  let db: Database.Database;
  let projectId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
    createCanonVersion(db, projectId, "v1");
  });

  afterEach(() => { db.close(); });

  it("computes empty report with no data", () => {
    const report = computeRolloutReport(db, projectId, "test", "v1");
    expect(report.total_gate_runs).toBe(0);
    expect(report.pass_count).toBe(0);
  });

  it("counts verdicts correctly", () => {
    addReview(db, projectId, "aligned");
    addReview(db, projectId, "mostly_aligned");
    addReview(db, projectId, "salvageable_drift");
    addReview(db, projectId, "hard_drift");
    addReview(db, projectId, "contradiction");

    const report = computeRolloutReport(db, projectId, "test", "v1");
    expect(report.total_gate_runs).toBe(5);
    expect(report.pass_count).toBe(2); // aligned + mostly_aligned
    expect(report.warn_count).toBe(1); // salvageable_drift
    expect(report.block_count).toBe(2); // hard_drift + contradiction
  });

  it("breaks down by artifact type", () => {
    addReview(db, projectId, "aligned", "readme_section");
    addReview(db, projectId, "aligned", "readme_section");
    addReview(db, projectId, "hard_drift", "package_blurb");

    const report = computeRolloutReport(db, projectId, "test", "v1");
    expect(report.by_artifact_type["readme_section"].checked).toBe(2);
    expect(report.by_artifact_type["readme_section"].passed).toBe(2);
    expect(report.by_artifact_type["package_blurb"].blocked).toBe(1);
  });

  it("includes override counts", () => {
    addReview(db, projectId, "hard_drift");
    recordOverride(db, {
      project_id: projectId, artifact_path: "test.md", artifact_type: "readme_section",
      original_verdict: "hard_drift", original_gate_result: "block",
      action: "bypass", reason: "deadline", follow_up_artifact_id: null,
    });

    const report = computeRolloutReport(db, projectId, "test", "v1");
    expect(report.override_count).toBe(1);
  });

  it("detects hot spots", () => {
    // 3 hard_drift on package_blurb = high block rate
    for (let i = 0; i < 3; i++) {
      addReview(db, projectId, "hard_drift", "package_blurb");
    }

    const report = computeRolloutReport(db, projectId, "test", "v1");
    expect(report.hot_spots.length).toBeGreaterThan(0);
    expect(report.hot_spots[0].artifact_type).toBe("package_blurb");
  });

  it("computes promotion readiness", () => {
    // 5 aligned readme reviews = ready for required
    for (let i = 0; i < 5; i++) {
      addReview(db, projectId, "aligned", "readme_section");
    }

    const report = computeRolloutReport(db, projectId, "test", "v1");
    const readme = report.promotion_readiness["readme_section"];
    expect(readme).toBeDefined();
    expect(readme.recommended_mode).toBe("required");
  });

  it("recommends advisory for noisy types", () => {
    addReview(db, projectId, "hard_drift", "feature_brief");
    addReview(db, projectId, "salvageable_drift", "feature_brief");
    addReview(db, projectId, "aligned", "feature_brief");

    const report = computeRolloutReport(db, projectId, "test", "v1");
    const fb = report.promotion_readiness["feature_brief"];
    expect(fb).toBeDefined();
    expect(fb.recommended_mode).toBe("advisory");
  });
});
