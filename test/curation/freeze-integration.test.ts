import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate } from "../../src/db/migrate.js";
import { createProject, getStatements } from "../../src/canon/canon-store.js";
import { insertSourceArtifact } from "../../src/artifacts/source-artifacts.js";
import {
  createExtractionRun,
  insertCandidate,
  insertContradiction,
} from "../../src/extraction/extraction-store.js";
import {
  acceptCandidate,
  checkFreezeBlockers,
  freezeCanon,
} from "../../src/curation/curation-store.js";
import { readCanonFile } from "../../src/canon/canon-files.js";
import { writeCanonFile } from "../../src/canon/canon-files.js";
import type { ExtractedStatementCandidate } from "../../src/extraction/extraction-types.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("freeze integration", () => {
  let db: Database.Database;
  let tempDir: string;
  let projectId: string;
  let runId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    tempDir = mkdtempSync(join(tmpdir(), "taste-freeze-"));
    projectId = createProject(db, "role-os", "Role-OS", "OS for roles").id;
    const sourceId = insertSourceArtifact(db, projectId, "README", "readme", "# Role-OS").id;
    runId = createExtractionRun(db, {
      project_id: projectId,
      source_artifact_ids: [sourceId],
      provider: "ollama",
      model: "test",
      passes: ["thesis"],
    }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("produces a valid canon JSON file after freeze", () => {
    // Accept several candidates
    const candidates = [
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "Role-OS is a routing and execution OS, not a prompt library",
        statement_type: "thesis", rationale: "Core thesis", confidence: 0.95,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: ["readme_section"], tags: ["routing", "identity"],
        evidence_refs: ["## Product Thesis"], status: "proposed", merged_into_id: null,
      }),
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "anti_pattern",
        text: "Prompt library framing is rejected",
        statement_type: "anti_pattern", rationale: "Anti-drift", confidence: 0.9,
        suggested_hardness: "hard", suggested_scope: ["product", "marketing"],
        suggested_artifact_types: ["readme_section", "package_blurb"], tags: ["drift"],
        evidence_refs: ["## Anti-patterns"], status: "proposed", merged_into_id: null,
      }),
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "pattern",
        text: "Route cards, doctor checks, and thin surfaces over strict cores",
        statement_type: "pattern", rationale: "Recurring structures", confidence: 0.85,
        suggested_hardness: "strong", suggested_scope: ["architecture"],
        suggested_artifact_types: [], tags: ["routing", "doctor", "architecture"],
        evidence_refs: ["## Architecture"], status: "proposed", merged_into_id: null,
      }),
    ];

    for (const c of candidates) {
      acceptCandidate(db, c);
    }

    // Freeze
    const result = freezeCanon(db, projectId, "canon-v1", "First curated version");
    expect(result.statementCount).toBe(3);

    // Write and read canon file
    const statements = getStatements(db, projectId, { lifecycle: "accepted" });
    writeCanonFile(tempDir, "role-os", "Role-OS", "canon-v1", statements, [], 1);

    const canonFile = readCanonFile(tempDir, "role-os", "canon-v1");
    expect(canonFile).not.toBeNull();
    expect(canonFile!.statements.length).toBe(3);
    expect(canonFile!.project.version).toBe("canon-v1");

    // Verify statement content
    const thesis = canonFile!.statements.find((s) => s.statement_type === "thesis");
    expect(thesis).toBeDefined();
    expect(thesis!.text).toContain("routing");
    expect(thesis!.hardness).toBe("hard");
    expect(thesis!.lifecycle).toBe("accepted");

    const antiPattern = canonFile!.statements.find((s) => s.statement_type === "anti_pattern");
    expect(antiPattern).toBeDefined();
    expect(antiPattern!.text).toContain("Prompt library");
  });

  it("freeze JSON has accurate statement counts", () => {
    // Accept 2 thesis, 1 pattern
    for (const text of ["Thesis A", "Thesis B"]) {
      const c = insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text, statement_type: "thesis", rationale: "t", confidence: 0.8,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });
      acceptCandidate(db, c);
    }
    const p = insertCandidate(db, {
      project_id: projectId, extraction_run_id: runId, pass_type: "pattern",
      text: "Pattern A", statement_type: "pattern", rationale: "t", confidence: 0.8,
      suggested_hardness: "strong", suggested_scope: ["architecture"],
      suggested_artifact_types: [], tags: [], evidence_refs: [],
      status: "proposed", merged_into_id: null,
    });
    acceptCandidate(db, p);

    const result = freezeCanon(db, projectId, "canon-v1");
    expect(result.snapshot.statement_counts_by_type.thesis).toBe(2);
    expect(result.snapshot.statement_counts_by_type.pattern).toBe(1);
    expect(result.snapshot.statement_count).toBe(3);
  });

  it("rejected and deferred candidates do not appear in frozen canon", () => {
    const accept = insertCandidate(db, {
      project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
      text: "Accepted", statement_type: "thesis", rationale: "t", confidence: 0.9,
      suggested_hardness: "hard", suggested_scope: ["product"],
      suggested_artifact_types: [], tags: [], evidence_refs: [],
      status: "proposed", merged_into_id: null,
    });
    acceptCandidate(db, accept);

    // These should not appear
    insertCandidate(db, {
      project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
      text: "Rejected", statement_type: "thesis", rationale: "t", confidence: 0.3,
      suggested_hardness: "soft", suggested_scope: ["product"],
      suggested_artifact_types: [], tags: [], evidence_refs: [],
      status: "rejected", merged_into_id: null,
    });
    insertCandidate(db, {
      project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
      text: "Deferred", statement_type: "thesis", rationale: "t", confidence: 0.5,
      suggested_hardness: "soft", suggested_scope: ["product"],
      suggested_artifact_types: [], tags: [], evidence_refs: [],
      status: "deferred", merged_into_id: null,
    });

    const result = freezeCanon(db, projectId, "canon-v1");
    expect(result.statementCount).toBe(1);
  });
});
