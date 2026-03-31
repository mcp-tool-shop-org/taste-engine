import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { generateOnboardReport } from "../../src/onboard/onboard-report.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("onboard report", () => {
  let db: Database.Database;
  let projectId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
  });

  afterEach(() => { db.close(); });

  it("reports empty canon correctly", () => {
    const report = generateOnboardReport(db, projectId, "test", []);
    expect(report.canon_confidence).toBe("empty");
    expect(report.ready_for_gate).toBe(false);
    expect(report.sparse_warnings.length).toBe(4); // thesis, anti-pattern, voice, pattern
    expect(report.next_steps.length).toBeGreaterThan(0);
  });

  it("reports sparse canon", () => {
    insertStatement(db, {
      project_id: projectId, canon_version: null,
      text: "Thesis", statement_type: "thesis", lifecycle: "accepted",
      hardness: "hard", scope: ["product"], artifact_types: [],
      tags: [], rationale: "t", confidence: 0.9, replacement_statement_id: null,
    });

    const report = generateOnboardReport(db, projectId, "test", []);
    expect(report.canon_confidence).toBe("sparse");
    expect(report.ready_for_gate).toBe(false);
    expect(report.sparse_warnings.length).toBe(3); // anti-pattern, voice, pattern still missing
  });

  it("reports moderate canon", () => {
    for (const type of ["thesis", "thesis", "anti_pattern", "anti_pattern", "pattern"]) {
      insertStatement(db, {
        project_id: projectId, canon_version: null,
        text: `${type} statement`, statement_type: type as any, lifecycle: "accepted",
        hardness: "hard", scope: ["product"], artifact_types: [],
        tags: [], rationale: "t", confidence: 0.9, replacement_statement_id: null,
      });
    }

    const report = generateOnboardReport(db, projectId, "test", []);
    expect(report.canon_confidence).toBe("moderate");
    expect(report.ready_for_gate).toBe(true);
  });

  it("reports strong canon", () => {
    for (let i = 0; i < 12; i++) {
      const types = ["thesis", "anti_pattern", "pattern", "voice"];
      insertStatement(db, {
        project_id: projectId, canon_version: null,
        text: `Statement ${i}`, statement_type: types[i % 4] as any, lifecycle: "accepted",
        hardness: "hard", scope: ["product"], artifact_types: i < 3 ? ["readme_section"] : [],
        tags: [], rationale: "t", confidence: 0.9, replacement_statement_id: null,
      });
    }

    const report = generateOnboardReport(db, projectId, "test", []);
    expect(report.canon_confidence).toBe("strong");
    expect(report.ready_for_gate).toBe(true);
    expect(report.sparse_warnings.length).toBe(0);
    // readme_section should have targeted coverage
    expect(report.surface_readiness["readme_section"].has_canon_coverage).toBe(true);
  });

  it("recommends first surfaces based on coverage", () => {
    insertStatement(db, {
      project_id: projectId, canon_version: null,
      text: "Thesis", statement_type: "thesis", lifecycle: "accepted",
      hardness: "hard", scope: ["product"], artifact_types: ["package_blurb"],
      tags: [], rationale: "t", confidence: 0.9, replacement_statement_id: null,
    });
    insertStatement(db, {
      project_id: projectId, canon_version: null,
      text: "Anti", statement_type: "anti_pattern", lifecycle: "accepted",
      hardness: "hard", scope: ["product"], artifact_types: [],
      tags: [], rationale: "t", confidence: 0.9, replacement_statement_id: null,
    });

    const report = generateOnboardReport(db, projectId, "test", []);
    expect(report.recommended_first_surfaces).toContain("package_blurb");
  });
});
