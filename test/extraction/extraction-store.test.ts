import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject } from "../../src/canon/canon-store.js";
import { insertSourceArtifact } from "../../src/artifacts/source-artifacts.js";
import {
  createExtractionRun,
  completeExtractionRun,
  getExtractionRun,
  getLatestExtractionRun,
  createPassResult,
  updatePassResult,
  getPassResults,
  insertCandidate,
  getCandidates,
  updateCandidateStatus,
  getCandidateCounts,
  insertContradiction,
  getContradictions,
  insertExemplar,
  getExemplars,
} from "../../src/extraction/extraction-store.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("extraction store", () => {
  let db: Database.Database;
  let projectId: string;
  let sourceId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test project").id;
    sourceId = insertSourceArtifact(db, projectId, "README", "readme", "# Test").id;
  });

  afterEach(() => { db.close(); });

  describe("extraction runs", () => {
    it("creates and retrieves run", () => {
      const run = createExtractionRun(db, {
        project_id: projectId,
        source_artifact_ids: [sourceId],
        provider: "ollama",
        model: "qwen3:14b",
        passes: ["thesis", "anti_pattern"],
      });
      expect(run.status).toBe("running");

      const fetched = getExtractionRun(db, run.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.source_artifact_ids).toEqual([sourceId]);
      expect(fetched!.passes).toEqual(["thesis", "anti_pattern"]);
    });

    it("completes a run", () => {
      const run = createExtractionRun(db, {
        project_id: projectId,
        source_artifact_ids: [sourceId],
        provider: "ollama", model: "test",
        passes: ["thesis"],
      });
      completeExtractionRun(db, run.id, "completed", "All good");
      const fetched = getExtractionRun(db, run.id)!;
      expect(fetched.status).toBe("completed");
      expect(fetched.completed_at).not.toBeNull();
      expect(fetched.notes).toBe("All good");
    });

    it("gets latest run", () => {
      createExtractionRun(db, { project_id: projectId, source_artifact_ids: [], provider: "ollama", model: "a", passes: ["thesis"] });
      const run2 = createExtractionRun(db, { project_id: projectId, source_artifact_ids: [], provider: "ollama", model: "b", passes: ["thesis"] });

      const latest = getLatestExtractionRun(db, projectId);
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe(run2.id);
    });

    it("returns null for missing run", () => {
      expect(getExtractionRun(db, "nonexistent")).toBeNull();
    });
  });

  describe("pass results", () => {
    it("creates and updates pass results", () => {
      const run = createExtractionRun(db, { project_id: projectId, source_artifact_ids: [], provider: "ollama", model: "test", passes: ["thesis"] });
      const pass = createPassResult(db, run.id, "thesis");
      expect(pass.status).toBe("pending");

      updatePassResult(db, pass.id, { status: "completed", candidate_count: 5, completed_at: "2026-03-30T00:00:00+00:00" });

      const results = getPassResults(db, run.id);
      expect(results.length).toBe(1);
      expect(results[0].status).toBe("completed");
      expect(results[0].candidate_count).toBe(5);
    });
  });

  describe("extracted candidates", () => {
    let runId: string;

    beforeEach(() => {
      runId = createExtractionRun(db, { project_id: projectId, source_artifact_ids: [], provider: "ollama", model: "test", passes: ["thesis"] }).id;
    });

    it("inserts and retrieves candidates", () => {
      insertCandidate(db, {
        project_id: projectId,
        extraction_run_id: runId,
        pass_type: "thesis",
        text: "This is a routing OS",
        statement_type: "thesis",
        rationale: "From README",
        confidence: 0.9,
        suggested_hardness: "hard",
        suggested_scope: ["product"],
        suggested_artifact_types: ["readme_section"],
        tags: ["routing"],
        evidence_refs: ["## Thesis"],
        status: "proposed",
        merged_into_id: null,
      });

      const candidates = getCandidates(db, runId);
      expect(candidates.length).toBe(1);
      expect(candidates[0].text).toBe("This is a routing OS");
      expect(candidates[0].suggested_scope).toEqual(["product"]);
      expect(candidates[0].tags).toEqual(["routing"]);
    });

    it("filters by statement_type", () => {
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "Thesis", statement_type: "thesis", rationale: "test", confidence: 0.9,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "anti_pattern",
        text: "Anti-pattern", statement_type: "anti_pattern", rationale: "test", confidence: 0.8,
        suggested_hardness: "strong", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });

      const thesis = getCandidates(db, runId, { statement_type: "thesis" });
      expect(thesis.length).toBe(1);
      expect(thesis[0].text).toBe("Thesis");
    });

    it("filters by min_confidence", () => {
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "High", statement_type: "thesis", rationale: "test", confidence: 0.9,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "Low", statement_type: "thesis", rationale: "test", confidence: 0.2,
        suggested_hardness: "soft", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });

      const high = getCandidates(db, runId, { min_confidence: 0.5 });
      expect(high.length).toBe(1);
      expect(high[0].text).toBe("High");
    });

    it("updates candidate status with merge", () => {
      const c1 = insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "Original", statement_type: "thesis", rationale: "test", confidence: 0.9,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });
      const c2 = insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "Duplicate", statement_type: "thesis", rationale: "test", confidence: 0.7,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });

      updateCandidateStatus(db, c2.id, "merged", c1.id);

      const proposed = getCandidates(db, runId, { status: "proposed" });
      const merged = getCandidates(db, runId, { status: "merged" });
      expect(proposed.length).toBe(1);
      expect(merged.length).toBe(1);
      expect(merged[0].merged_into_id).toBe(c1.id);
    });

    it("counts candidates by type, status, and pass", () => {
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "thesis",
        text: "T1", statement_type: "thesis", rationale: "t", confidence: 0.9,
        suggested_hardness: "hard", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });
      insertCandidate(db, {
        project_id: projectId, extraction_run_id: runId, pass_type: "anti_pattern",
        text: "A1", statement_type: "anti_pattern", rationale: "t", confidence: 0.8,
        suggested_hardness: "strong", suggested_scope: ["product"],
        suggested_artifact_types: [], tags: [], evidence_refs: [],
        status: "proposed", merged_into_id: null,
      });

      const counts = getCandidateCounts(db, runId);
      expect(counts.total).toBe(2);
      expect(counts.by_type.thesis).toBe(1);
      expect(counts.by_type.anti_pattern).toBe(1);
      expect(counts.by_pass.thesis).toBe(1);
      expect(counts.by_pass.anti_pattern).toBe(1);
    });
  });

  describe("contradiction findings", () => {
    it("inserts and retrieves contradictions", () => {
      const run = createExtractionRun(db, { project_id: projectId, source_artifact_ids: [], provider: "ollama", model: "test", passes: ["contradiction"] });

      insertContradiction(db, {
        extraction_run_id: run.id,
        title: "Framing conflict",
        description: "README says OS, marketing says helper tool",
        conflicting_candidate_ids: ["c1", "c2"],
        evidence_refs: ["README ## Thesis", "Marketing ## Tagline"],
        severity: "high",
        status: "open",
      });

      const findings = getContradictions(db, run.id);
      expect(findings.length).toBe(1);
      expect(findings[0].title).toBe("Framing conflict");
      expect(findings[0].severity).toBe("high");
      expect(findings[0].conflicting_candidate_ids).toEqual(["c1", "c2"]);
    });
  });

  describe("exemplar nominations", () => {
    it("inserts and retrieves exemplars", () => {
      const run = createExtractionRun(db, { project_id: projectId, source_artifact_ids: [], provider: "ollama", model: "test", passes: ["exemplar"] });

      insertExemplar(db, {
        extraction_run_id: run.id,
        source_artifact_id: sourceId,
        locator_kind: "heading",
        locator_value: "## Product Thesis",
        why_it_matters: "Clearest statement of product identity",
        candidate_traits: ["thesis-defining", "operational"],
        confidence: 0.9,
      });

      const exemplars = getExemplars(db, run.id);
      expect(exemplars.length).toBe(1);
      expect(exemplars[0].why_it_matters).toBe("Clearest statement of product identity");
      expect(exemplars[0].candidate_traits).toEqual(["thesis-defining", "operational"]);
    });
  });
});
