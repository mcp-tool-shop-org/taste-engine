import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { createReviewRun, insertAlignmentReview, insertPacketItems } from "../../src/review/review-store.js";
import { insertReviewFeedback, insertPacketFeedback } from "../../src/calibration/calibration-store.js";
import { generateFindings, persistFindings, getFindings } from "../../src/calibration/findings-engine.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function setupProjectWithCanon(db: Database.Database) {
  const project = createProject(db, "test", "Test", "Test");
  createCanonVersion(db, project.id, "v1");

  const stmt = insertStatement(db, {
    project_id: project.id, canon_version: "v1",
    text: "Core thesis statement", statement_type: "thesis",
    lifecycle: "accepted", hardness: "hard",
    scope: ["product"], artifact_types: [],
    tags: [], rationale: "test", confidence: 0.9,
    replacement_statement_id: null,
  });

  return { project, stmtId: stmt.id };
}

function createReviewWithFeedback(
  db: Database.Database,
  projectId: string,
  stmtId: string,
  overrides: {
    overall?: string;
    verdict?: string;
    falseRigidity?: boolean;
    missedDrift?: boolean;
    wrongPacket?: boolean;
    weakRevision?: boolean;
    goodRevision?: boolean;
    artifactType?: string;
    noisyIds?: string[];
  } = {},
) {
  const candidate = insertCandidateArtifact(db, projectId, "Test", (overrides.artifactType as any) ?? "readme_section", "test", "body");
  const run = createReviewRun(db, {
    project_id: projectId, canon_version: "v1",
    candidate_artifact_id: candidate.id,
    provider: "mock", model: "test", canon_packet_size: 3,
  });

  insertPacketItems(db, run.id, [
    { source_kind: "statement", source_id: stmtId, reason_selected: "hard_thesis", rank: 1 },
  ]);

  const review = insertAlignmentReview(db, {
    project_id: projectId, candidate_artifact_id: candidate.id,
    canon_version: "v1", verdict: "aligned",
    thesis_preservation: "strong", pattern_fidelity: "strong",
    anti_pattern_collision: "none", voice_naming_fit: "strong",
    summary: "Test",
  });

  const fb = insertReviewFeedback(db, {
    project_id: projectId, review_id: review.id, review_run_id: run.id,
    overall: (overrides.overall as any) ?? "correct",
    verdict_agreement: (overrides.verdict as any) ?? "agree",
    false_rigidity: overrides.falseRigidity ?? false,
    missed_drift: overrides.missedDrift ?? false,
    wrong_packet: overrides.wrongPacket ?? false,
    weak_evidence: false,
    weak_revision_guidance: overrides.weakRevision ?? false,
    good_revision_guidance: overrides.goodRevision ?? false,
    uncertainty_was_helpful: false,
    notes: null,
  });

  if (overrides.noisyIds) {
    insertPacketFeedback(db, fb.id, {
      should_have_included_ids: [],
      should_not_have_included_ids: [],
      noisy_statement_ids: overrides.noisyIds,
      notes: null,
    });
  }

  return { candidate, run, review, fb };
}

describe("findings engine", () => {
  let db: Database.Database;
  let projectId: string;
  let stmtId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    const setup = setupProjectWithCanon(db);
    projectId = setup.project.id;
    stmtId = setup.stmtId;
  });

  afterEach(() => { db.close(); });

  it("returns no findings with insufficient feedback", () => {
    createReviewWithFeedback(db, projectId, stmtId);
    const findings = generateFindings(db, projectId);
    expect(findings.length).toBe(0); // Needs 3+ feedback
  });

  it("detects system-wide rigidity", () => {
    // 4 reviews, 3 flagged as rigid
    for (let i = 0; i < 4; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        overall: i < 3 ? "mostly_wrong" : "correct",
        verdict: i < 3 ? "soft_disagree" : "agree",
        falseRigidity: i < 3,
      });
    }

    const findings = generateFindings(db, projectId);
    expect(findings.some((f) => f.category === "rigidity" && f.title.includes("System-wide"))).toBe(true);
  });

  it("detects system-wide missed drift", () => {
    for (let i = 0; i < 4; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        overall: i < 3 ? "mostly_wrong" : "correct",
        verdict: i < 3 ? "soft_disagree" : "agree",
        missedDrift: i < 3,
      });
    }

    const findings = generateFindings(db, projectId);
    expect(findings.some((f) => f.category === "softness")).toBe(true);
  });

  it("detects low agreement for artifact type", () => {
    // 3 package_blurb reviews, all wrong
    for (let i = 0; i < 3; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        overall: "wrong",
        verdict: "hard_disagree",
        artifactType: "package_blurb",
      });
    }

    const findings = generateFindings(db, projectId);
    expect(findings.some((f) =>
      f.category === "artifact_type_gap" && f.title.includes("package_blurb"),
    )).toBe(true);
  });

  it("detects over-rigid artifact type", () => {
    for (let i = 0; i < 4; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        overall: "mostly_wrong",
        verdict: "soft_disagree",
        falseRigidity: true,
        artifactType: "feature_brief",
      });
    }

    const findings = generateFindings(db, projectId);
    expect(findings.some((f) =>
      f.category === "rigidity" && f.title.includes("feature_brief"),
    )).toBe(true);
  });

  it("detects revision guidance quality issues", () => {
    for (let i = 0; i < 4; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        overall: "mostly_correct",
        verdict: "agree",
        weakRevision: true,
        goodRevision: false,
      });
    }

    const findings = generateFindings(db, projectId);
    expect(findings.some((f) => f.category === "judgment" && f.title.includes("Revision"))).toBe(true);
  });

  it("persists and retrieves findings", () => {
    for (let i = 0; i < 4; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        falseRigidity: true, overall: "mostly_wrong", verdict: "soft_disagree",
      });
    }

    const findings = generateFindings(db, projectId);
    for (const f of findings) f.project_id = projectId;
    persistFindings(db, projectId, findings);

    const retrieved = getFindings(db, projectId);
    expect(retrieved.length).toBe(findings.length);
    expect(retrieved[0].suggested_actions.length).toBeGreaterThan(0);
  });

  it("clears old findings on persist", () => {
    for (let i = 0; i < 4; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        falseRigidity: true, overall: "mostly_wrong", verdict: "soft_disagree",
      });
    }

    const f1 = generateFindings(db, projectId);
    for (const f of f1) f.project_id = projectId;
    persistFindings(db, projectId, f1);

    // Persist again — should replace, not duplicate
    const f2 = generateFindings(db, projectId);
    for (const f of f2) f.project_id = projectId;
    persistFindings(db, projectId, f2);

    const retrieved = getFindings(db, projectId);
    expect(retrieved.length).toBe(f2.length);
  });

  it("findings have severity and suggested actions", () => {
    for (let i = 0; i < 5; i++) {
      createReviewWithFeedback(db, projectId, stmtId, {
        falseRigidity: true, overall: "mostly_wrong", verdict: "soft_disagree",
      });
    }

    const findings = generateFindings(db, projectId);
    for (const f of findings) {
      expect(["low", "medium", "high"]).toContain(f.severity);
      expect(f.suggested_actions.length).toBeGreaterThan(0);
    }
  });
});
