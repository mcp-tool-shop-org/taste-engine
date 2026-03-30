import { describe, it, expect } from "vitest";
import {
  LlmPassOutputSchema,
  LlmContradictionOutputSchema,
  LlmExemplarOutputSchema,
  ExtractedStatementCandidateSchema,
  ContradictionFindingSchema,
  ExemplarNominationSchema,
  ExtractionRunSchema,
} from "../../src/extraction/extraction-validate.js";

const TS = "2026-03-30T00:00:00+00:00";

describe("extraction validation", () => {
  describe("LlmPassOutput", () => {
    it("accepts valid output", () => {
      const result = LlmPassOutputSchema.safeParse({
        candidates: [
          {
            text: "Role-OS is a routing OS, not a prompt library",
            rationale: "Stated explicitly in README",
            confidence: 0.95,
            suggested_hardness: "hard",
            suggested_scope: ["product"],
            tags: ["routing", "identity"],
            evidence_section: "## Product Thesis",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty candidates", () => {
      expect(LlmPassOutputSchema.safeParse({ candidates: [] }).success).toBe(true);
    });

    it("rejects missing text", () => {
      const result = LlmPassOutputSchema.safeParse({
        candidates: [{ rationale: "test", confidence: 0.5 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects confidence out of range", () => {
      const result = LlmPassOutputSchema.safeParse({
        candidates: [{
          text: "test", rationale: "test", confidence: 1.5,
          suggested_hardness: "hard", suggested_scope: ["product"],
          tags: [], evidence_section: "test",
        }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("LlmContradictionOutput", () => {
    it("accepts valid contradictions", () => {
      const result = LlmContradictionOutputSchema.safeParse({
        contradictions: [{
          title: "Framing conflict",
          description: "README says OS, marketing says helper",
          severity: "high",
          evidence_sections: ["README ## Thesis", "Marketing ## Tagline"],
        }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty contradictions", () => {
      expect(LlmContradictionOutputSchema.safeParse({ contradictions: [] }).success).toBe(true);
    });
  });

  describe("LlmExemplarOutput", () => {
    it("accepts valid exemplars", () => {
      const result = LlmExemplarOutputSchema.safeParse({
        exemplars: [{
          source_title: "README",
          locator_kind: "heading",
          locator_value: "## Product Thesis",
          why_it_matters: "Clearest statement of identity",
          candidate_traits: ["thesis-defining", "operational"],
          confidence: 0.9,
        }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ExtractedStatementCandidate", () => {
    it("accepts valid candidate", () => {
      const result = ExtractedStatementCandidateSchema.safeParse({
        id: "c1",
        project_id: "p1",
        extraction_run_id: "r1",
        pass_type: "thesis",
        text: "Role-OS is an operating system",
        statement_type: "thesis",
        rationale: "Stated in README",
        confidence: 0.9,
        suggested_hardness: "hard",
        suggested_scope: ["product"],
        suggested_artifact_types: ["readme_section"],
        tags: ["identity"],
        evidence_refs: ["## Thesis"],
        status: "proposed",
        merged_into_id: null,
        created_at: TS,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid pass_type", () => {
      const result = ExtractedStatementCandidateSchema.safeParse({
        id: "c1", project_id: "p1", extraction_run_id: "r1",
        pass_type: "invalid_pass",
        text: "test", statement_type: "thesis", rationale: "test",
        confidence: 0.5, suggested_hardness: "soft",
        suggested_scope: ["product"], suggested_artifact_types: [],
        tags: [], evidence_refs: [], status: "proposed",
        merged_into_id: null, created_at: TS,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ContradictionFinding", () => {
    it("accepts valid finding", () => {
      const result = ContradictionFindingSchema.safeParse({
        id: "cf1",
        extraction_run_id: "r1",
        title: "Framing tension",
        description: "README vs marketing copy",
        conflicting_candidate_ids: ["c1", "c2"],
        evidence_refs: ["section A", "section B"],
        severity: "high",
        status: "open",
        created_at: TS,
      });
      expect(result.success).toBe(true);
    });

    it("accepts accepted_tension status", () => {
      const result = ContradictionFindingSchema.safeParse({
        id: "cf1", extraction_run_id: "r1",
        title: "test", description: "test",
        conflicting_candidate_ids: [], evidence_refs: [],
        severity: "low", status: "accepted_tension",
        created_at: TS,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ExtractionRun", () => {
    it("accepts valid run", () => {
      const result = ExtractionRunSchema.safeParse({
        id: "r1",
        project_id: "p1",
        source_artifact_ids: ["sa1", "sa2"],
        provider: "ollama",
        model: "qwen3:14b",
        passes: ["thesis", "anti_pattern"],
        status: "completed",
        started_at: TS,
        completed_at: TS,
        notes: null,
      });
      expect(result.success).toBe(true);
    });
  });
});
