import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject } from "../../src/canon/canon-store.js";
import { createExtractionRun, insertCandidate, getCandidates } from "../../src/extraction/extraction-store.js";
import { consolidateCandidates, areSimilar } from "../../src/extraction/consolidation.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function makeCandidate(db: Database.Database, projectId: string, runId: string, overrides: Partial<{
  text: string; statement_type: string; confidence: number; pass_type: string;
}> = {}) {
  return insertCandidate(db, {
    project_id: projectId,
    extraction_run_id: runId,
    pass_type: (overrides.pass_type as any) ?? "thesis",
    text: overrides.text ?? "Default text",
    statement_type: (overrides.statement_type as any) ?? "thesis",
    rationale: "test",
    confidence: overrides.confidence ?? 0.8,
    suggested_hardness: "strong",
    suggested_scope: ["product"],
    suggested_artifact_types: [],
    tags: [],
    evidence_refs: [],
    status: "proposed",
    merged_into_id: null,
  });
}

describe("consolidation", () => {
  let db: Database.Database;
  let projectId: string;
  let runId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test project").id;
    runId = createExtractionRun(db, {
      project_id: projectId,
      source_artifact_ids: [],
      provider: "ollama",
      model: "test",
      passes: ["thesis"],
    }).id;
  });

  afterEach(() => { db.close(); });

  describe("areSimilar", () => {
    it("detects near-duplicates", () => {
      expect(areSimilar(
        "Role-OS is a routing and execution operating system for roles",
        "Role-OS is a routing and execution operating system for managing roles",
      )).toBe(true);
    });

    it("rejects different statements", () => {
      expect(areSimilar(
        "Role-OS is an operating system",
        "The product should never become a prompt library",
      )).toBe(false);
    });

    it("handles empty strings", () => {
      expect(areSimilar("", "")).toBe(false);
      expect(areSimilar("test", "")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(areSimilar(
        "Role-OS IS A ROUTING SYSTEM",
        "role-os is a routing system",
      )).toBe(true);
    });

    it("ignores punctuation", () => {
      expect(areSimilar(
        "Role-OS is a routing system!",
        "Role OS is a routing system",
      )).toBe(true);
    });
  });

  describe("consolidateCandidates", () => {
    it("merges near-duplicate candidates of same type", () => {
      makeCandidate(db, projectId, runId, {
        text: "Role-OS is a routing and execution operating system",
        confidence: 0.9,
      });
      makeCandidate(db, projectId, runId, {
        text: "Role-OS is a routing and execution operating system for roles",
        confidence: 0.7,
      });

      const result = consolidateCandidates(db, runId);
      expect(result.merged_count).toBe(1);
      expect(result.total_after).toBe(1);

      // The higher-confidence one should survive
      const remaining = getCandidates(db, runId, { status: "proposed" });
      expect(remaining.length).toBe(1);
      expect(remaining[0].confidence).toBe(0.9);
    });

    it("does NOT merge different types", () => {
      makeCandidate(db, projectId, runId, {
        text: "Role-OS uses routing and execution patterns",
        statement_type: "pattern",
        confidence: 0.8,
      });
      makeCandidate(db, projectId, runId, {
        text: "Role-OS uses routing and execution patterns everywhere",
        statement_type: "anti_pattern",
        confidence: 0.8,
      });

      const result = consolidateCandidates(db, runId);
      expect(result.merged_count).toBe(0);
      expect(result.total_after).toBe(2);
    });

    it("preserves distinct candidates", () => {
      makeCandidate(db, projectId, runId, { text: "Role-OS is an operating system for roles" });
      makeCandidate(db, projectId, runId, { text: "Prompt library framing is rejected" });
      makeCandidate(db, projectId, runId, { text: "Adoption must be enforced through session spines" });

      const result = consolidateCandidates(db, runId);
      expect(result.merged_count).toBe(0);
      expect(result.total_after).toBe(3);
    });

    it("handles empty candidate set", () => {
      const result = consolidateCandidates(db, runId);
      expect(result.total_before).toBe(0);
      expect(result.total_after).toBe(0);
      expect(result.merged_count).toBe(0);
    });

    it("reports low-confidence candidates", () => {
      makeCandidate(db, projectId, runId, { text: "Some specific thesis", confidence: 0.9 });
      makeCandidate(db, projectId, runId, { text: "Another low confidence claim", confidence: 0.3 });
      makeCandidate(db, projectId, runId, { text: "Very uncertain observation here", confidence: 0.1 });

      const result = consolidateCandidates(db, runId);
      expect(result.low_confidence_count).toBe(2); // 0.3 and 0.1 are < 0.5
    });

    it("keeps higher-confidence candidate when merging", () => {
      const c1 = makeCandidate(db, projectId, runId, {
        text: "Role-OS is fundamentally a routing operating system",
        confidence: 0.6,
      });
      const c2 = makeCandidate(db, projectId, runId, {
        text: "Role-OS is fundamentally a routing operating system for roles",
        confidence: 0.95,
      });

      consolidateCandidates(db, runId);

      const proposed = getCandidates(db, runId, { status: "proposed" });
      expect(proposed.length).toBe(1);
      expect(proposed[0].id).toBe(c2.id); // Higher confidence survives
    });
  });
});
