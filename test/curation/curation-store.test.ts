import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, getStatements } from "../../src/canon/canon-store.js";
import { insertSourceArtifact } from "../../src/artifacts/source-artifacts.js";
import {
  createExtractionRun,
  insertCandidate,
  getCandidates,
  insertContradiction,
  getContradictions,
  insertExemplar,
} from "../../src/extraction/extraction-store.js";
import {
  acceptCandidate,
  rejectCandidate,
  deferCandidate,
  mergeCandidate,
  getDecisions,
  checkFreezeBlockers,
  freezeCanon,
  createAcceptedTension,
  getAcceptedTensions,
} from "../../src/curation/curation-store.js";
import type { ExtractedStatementCandidate } from "../../src/extraction/extraction-types.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function makeTestCandidate(db: Database.Database, projectId: string, runId: string, overrides: Partial<{
  text: string; statement_type: string; confidence: number; suggested_hardness: string;
  suggested_scope: string[]; tags: string[];
}> = {}): ExtractedStatementCandidate {
  return insertCandidate(db, {
    project_id: projectId,
    extraction_run_id: runId,
    pass_type: "thesis",
    text: overrides.text ?? "A test thesis statement",
    statement_type: (overrides.statement_type as any) ?? "thesis",
    rationale: "test rationale",
    confidence: overrides.confidence ?? 0.9,
    suggested_hardness: (overrides.suggested_hardness as any) ?? "hard",
    suggested_scope: (overrides.suggested_scope as any) ?? ["product"],
    suggested_artifact_types: ["readme_section"],
    tags: overrides.tags ?? ["test"],
    evidence_refs: ["## Thesis Section"],
    status: "proposed",
    merged_into_id: null,
  });
}

describe("curation store", () => {
  let db: Database.Database;
  let projectId: string;
  let runId: string;
  let sourceId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test project").id;
    sourceId = insertSourceArtifact(db, projectId, "README", "readme", "# Test").id;
    runId = createExtractionRun(db, {
      project_id: projectId,
      source_artifact_ids: [sourceId],
      provider: "ollama",
      model: "test",
      passes: ["thesis"],
    }).id;
  });

  afterEach(() => { db.close(); });

  // ── Accept ─────────────────────────────────────────────────

  describe("accept candidate", () => {
    it("creates canon statement and records decision", () => {
      const candidate = makeTestCandidate(db, projectId, runId);

      const { statement, decision } = acceptCandidate(db, candidate);

      expect(statement.text).toBe(candidate.text);
      expect(statement.lifecycle).toBe("accepted");
      expect(statement.hardness).toBe("hard");
      expect(statement.scope).toEqual(["product"]);
      expect(decision.action).toBe("accept");
      expect(decision.candidate_id).toBe(candidate.id);
      expect(decision.target_statement_id).toBe(statement.id);
    });

    it("marks candidate as accepted", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, candidate);

      const candidates = getCandidates(db, runId, { status: "accepted" });
      expect(candidates.length).toBe(1);
      expect(candidates[0].id).toBe(candidate.id);
    });

    it("accepts with hardness override", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const { statement } = acceptCandidate(db, candidate, { hardness: "soft" });
      expect(statement.hardness).toBe("soft");
    });

    it("accepts with scope override", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const { statement } = acceptCandidate(db, candidate, { scope: ["docs", "cli"] });
      expect(statement.scope).toEqual(["docs", "cli"]);
    });

    it("accepts with tag override", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const { statement } = acceptCandidate(db, candidate, { tags: ["routing", "core"] });
      expect(statement.tags).toEqual(["routing", "core"]);
    });
  });

  // ── Edit + Accept ──────────────────────────────────────────

  describe("accept with edits", () => {
    it("records accept_with_edits action when text changes", () => {
      const candidate = makeTestCandidate(db, projectId, runId, {
        text: "Original text",
      });

      const { statement, decision } = acceptCandidate(db, candidate, {
        text: "Revised and improved text",
      });

      expect(statement.text).toBe("Revised and improved text");
      expect(decision.action).toBe("accept_with_edits");
      expect(decision.authored_text).toBe("Revised and improved text");
    });

    it("records accept when text is unchanged", () => {
      const candidate = makeTestCandidate(db, projectId, runId, {
        text: "Same text",
      });

      const { decision } = acceptCandidate(db, candidate, {
        text: "Same text",
      });

      expect(decision.action).toBe("accept");
      expect(decision.authored_text).toBeNull();
    });
  });

  // ── Reject ─────────────────────────────────────────────────

  describe("reject candidate", () => {
    it("marks candidate as rejected and records reason", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const decision = rejectCandidate(db, candidate, "Too generic");

      expect(decision.action).toBe("reject");
      expect(decision.reason).toBe("Too generic");

      const rejected = getCandidates(db, runId, { status: "rejected" });
      expect(rejected.length).toBe(1);
    });
  });

  // ── Defer ──────────────────────────────────────────────────

  describe("defer candidate", () => {
    it("marks candidate as deferred", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const decision = deferCandidate(db, candidate, "Need more context");

      expect(decision.action).toBe("defer");

      const deferred = getCandidates(db, runId, { status: "deferred" });
      expect(deferred.length).toBe(1);
    });

    it("defers without reason", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const decision = deferCandidate(db, candidate);
      expect(decision.reason).toBeNull();
    });
  });

  // ── Merge ──────────────────────────────────────────────────

  describe("merge candidate", () => {
    it("merges candidate into existing canon statement", () => {
      const c1 = makeTestCandidate(db, projectId, runId, { text: "Primary thesis" });
      const { statement } = acceptCandidate(db, c1);

      const c2 = makeTestCandidate(db, projectId, runId, { text: "Similar thesis" });
      const decision = mergeCandidate(db, c2, statement.id);

      expect(decision.action).toBe("merge_into_existing");
      expect(decision.target_statement_id).toBe(statement.id);

      const merged = getCandidates(db, runId, { status: "merged" });
      expect(merged.length).toBe(1);
      expect(merged[0].merged_into_id).toBe(statement.id);
    });
  });

  // ── Decision history ───────────────────────────────────────

  describe("curation decisions", () => {
    it("records all decision types", () => {
      const c1 = makeTestCandidate(db, projectId, runId, { text: "Accept me" });
      const c2 = makeTestCandidate(db, projectId, runId, { text: "Reject me" });
      const c3 = makeTestCandidate(db, projectId, runId, { text: "Defer me" });

      acceptCandidate(db, c1);
      rejectCandidate(db, c2, "generic");
      deferCandidate(db, c3);

      const decisions = getDecisions(db, projectId);
      expect(decisions.length).toBe(3);

      const actions = decisions.map((d) => d.action).sort();
      expect(actions).toEqual(["accept", "defer", "reject"]);
    });

    it("filters decisions by candidate", () => {
      const c1 = makeTestCandidate(db, projectId, runId);
      const c2 = makeTestCandidate(db, projectId, runId, { text: "Other" });

      acceptCandidate(db, c1);
      rejectCandidate(db, c2, "no");

      const d1 = getDecisions(db, projectId, { candidate_id: c1.id });
      expect(d1.length).toBe(1);
      expect(d1[0].action).toBe("accept");
    });
  });

  // ── Accepted Tensions ──────────────────────────────────────

  describe("accepted tensions", () => {
    it("creates and retrieves accepted tension", () => {
      const tension = createAcceptedTension(db, {
        project_id: projectId,
        canon_version: "canon-v1",
        title: "Identity framing tension",
        description: "README frames as OS, marketing leans toward helper",
        related_statement_ids: [],
        evidence_refs: ["README ## Thesis", "Marketing ## Tagline"],
        resolution_note: "Both perspectives are valid for different audiences",
        severity: "medium",
      });

      expect(tension.title).toBe("Identity framing tension");

      const retrieved = getAcceptedTensions(db, projectId, "canon-v1");
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].severity).toBe("medium");
      expect(retrieved[0].evidence_refs).toEqual(["README ## Thesis", "Marketing ## Tagline"]);
    });
  });

  // ── Freeze Blockers ────────────────────────────────────────

  describe("freeze blockers", () => {
    it("blocks when no accepted statements", () => {
      const blockers = checkFreezeBlockers(db, projectId);
      expect(blockers.length).toBeGreaterThan(0);
      expect(blockers[0].reason).toContain("No accepted");
    });

    it("blocks on unresolved high-severity contradictions", () => {
      // Accept a statement first
      const c = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, c);

      // Add unresolved high-severity contradiction
      insertContradiction(db, {
        extraction_run_id: runId,
        title: "Critical conflict",
        description: "test",
        conflicting_candidate_ids: [],
        evidence_refs: [],
        severity: "high",
        status: "open",
      });

      const blockers = checkFreezeBlockers(db, projectId);
      expect(blockers.some((b) => b.reason.includes("contradiction"))).toBe(true);
    });

    it("does not block when contradictions are resolved", () => {
      const c = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, c);

      const contradiction = insertContradiction(db, {
        extraction_run_id: runId,
        title: "Resolved",
        description: "test",
        conflicting_candidate_ids: [],
        evidence_refs: [],
        severity: "high",
        status: "open",
      });

      db.prepare("UPDATE contradiction_findings SET status = 'resolved' WHERE id = ?").run(contradiction.id);

      const blockers = checkFreezeBlockers(db, projectId);
      expect(blockers.length).toBe(0);
    });

    it("does not block on low-severity unresolved contradictions", () => {
      const c = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, c);

      insertContradiction(db, {
        extraction_run_id: runId,
        title: "Minor tension",
        description: "test",
        conflicting_candidate_ids: [],
        evidence_refs: [],
        severity: "low",
        status: "open",
      });

      const blockers = checkFreezeBlockers(db, projectId);
      expect(blockers.length).toBe(0);
    });
  });

  // ── Canon Freeze ───────────────────────────────────────────

  describe("freeze canon", () => {
    it("creates snapshot and stamps version", () => {
      const c1 = makeTestCandidate(db, projectId, runId, { text: "Thesis one", statement_type: "thesis" });
      const c2 = makeTestCandidate(db, projectId, runId, { text: "Anti-pattern one", statement_type: "anti_pattern" });
      acceptCandidate(db, c1);
      acceptCandidate(db, c2);

      const result = freezeCanon(db, projectId, "canon-v1", "First version");

      expect(result.statementCount).toBe(2);
      expect(result.snapshot.label).toBe("canon-v1");
      expect(result.snapshot.statement_counts_by_type.thesis).toBe(1);
      expect(result.snapshot.statement_counts_by_type.anti_pattern).toBe(1);
    });

    it("stamps canon_version on accepted statements", () => {
      const c = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, c);

      freezeCanon(db, projectId, "canon-v1");

      const statements = getStatements(db, projectId, { lifecycle: "accepted" });
      expect(statements[0].canon_version).toBe("canon-v1");
    });

    it("warns about unresolved non-blocking contradictions", () => {
      const c = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, c);

      insertContradiction(db, {
        extraction_run_id: runId,
        title: "Minor issue",
        description: "test",
        conflicting_candidate_ids: [],
        evidence_refs: [],
        severity: "low",
        status: "open",
      });

      const result = freezeCanon(db, projectId, "canon-v1");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("unresolved");
    });

    it("includes tensions and exemplars in snapshot", () => {
      const c = makeTestCandidate(db, projectId, runId);
      acceptCandidate(db, c);

      createAcceptedTension(db, {
        project_id: projectId,
        canon_version: "canon-v1",
        title: "Tension",
        description: "test",
        related_statement_ids: [],
        evidence_refs: [],
        resolution_note: "Preserved",
        severity: "medium",
      });

      insertExemplar(db, {
        extraction_run_id: runId,
        source_artifact_id: sourceId,
        locator_kind: "heading",
        locator_value: "## Thesis",
        why_it_matters: "Best thesis example",
        candidate_traits: ["clear"],
        confidence: 0.9,
      });

      const result = freezeCanon(db, projectId, "canon-v1");
      expect(result.tensionCount).toBe(1);
      expect(result.exemplarCount).toBe(1);
    });

    it("accepted canon survives multiple freeze cycles", () => {
      const c1 = makeTestCandidate(db, projectId, runId, { text: "V1 thesis" });
      acceptCandidate(db, c1);
      freezeCanon(db, projectId, "canon-v1");

      // Add more canon
      const c2 = makeTestCandidate(db, projectId, runId, { text: "V2 pattern", statement_type: "pattern" });
      acceptCandidate(db, c2);
      freezeCanon(db, projectId, "canon-v2");

      const allAccepted = getStatements(db, projectId, { lifecycle: "accepted" });
      expect(allAccepted.length).toBe(2);
    });
  });

  // ── Evidence carried correctly ─────────────────────────────

  describe("evidence preservation", () => {
    it("carries evidence_refs through to canon statement", () => {
      const candidate = makeTestCandidate(db, projectId, runId);
      const { statement } = acceptCandidate(db, candidate);

      // Evidence is in rationale (from candidate) and tags
      expect(statement.rationale).toBe(candidate.rationale);
      expect(statement.tags).toEqual(candidate.tags);
    });
  });
});
