import { describe, it, expect } from "vitest";
import {
  CanonStatementSchema,
  ProjectCanonSchema,
  EvidenceRefSchema,
  SourceArtifactSchema,
  CandidateArtifactSchema,
  AlignmentReviewSchema,
  ReviewObservationSchema,
  RevisionSuggestionSchema,
  TasteConfigSchema,
  CanonFileSchema,
} from "../../src/core/validate.js";

const TS = "2026-03-30T00:00:00+00:00";

describe("schema validation", () => {
  describe("ProjectCanon", () => {
    it("accepts valid project", () => {
      const result = ProjectCanonSchema.safeParse({
        id: "p1",
        project_slug: "role-os",
        name: "Role-OS",
        summary: "An operating system for roles",
        current_version: "canon-v1",
        created_at: TS,
        updated_at: TS,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty slug", () => {
      const result = ProjectCanonSchema.safeParse({
        id: "p1",
        project_slug: "",
        name: "Role-OS",
        summary: "desc",
        current_version: null,
        created_at: TS,
        updated_at: TS,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CanonStatement", () => {
    const validStatement = {
      id: "s1",
      project_id: "p1",
      canon_version: "canon-v1",
      text: "Role-OS is a routing and execution OS, not a prompt library",
      statement_type: "thesis",
      lifecycle: "accepted",
      hardness: "hard",
      scope: ["product"],
      artifact_types: ["readme_section"],
      tags: ["routing", "identity"],
      rationale: "Core product thesis from README",
      confidence: 0.95,
      replacement_statement_id: null,
      created_at: TS,
      updated_at: TS,
    };

    it("accepts valid statement", () => {
      expect(CanonStatementSchema.safeParse(validStatement).success).toBe(true);
    });

    it("lifecycle and hardness are independent", () => {
      // accepted + experimental is valid
      const experimental = { ...validStatement, hardness: "experimental" };
      expect(CanonStatementSchema.safeParse(experimental).success).toBe(true);

      // disputed + hard is valid
      const disputed = { ...validStatement, lifecycle: "disputed", hardness: "hard" };
      expect(CanonStatementSchema.safeParse(disputed).success).toBe(true);
    });

    it("rejects invalid statement type", () => {
      const bad = { ...validStatement, statement_type: "opinion" };
      expect(CanonStatementSchema.safeParse(bad).success).toBe(false);
    });

    it("rejects invalid lifecycle", () => {
      const bad = { ...validStatement, lifecycle: "pending" };
      expect(CanonStatementSchema.safeParse(bad).success).toBe(false);
    });

    it("rejects invalid hardness", () => {
      const bad = { ...validStatement, hardness: "medium" };
      expect(CanonStatementSchema.safeParse(bad).success).toBe(false);
    });

    it("requires at least one scope", () => {
      const bad = { ...validStatement, scope: [] };
      expect(CanonStatementSchema.safeParse(bad).success).toBe(false);
    });

    it("allows empty artifact_types", () => {
      const ok = { ...validStatement, artifact_types: [] };
      expect(CanonStatementSchema.safeParse(ok).success).toBe(true);
    });

    it("confidence must be 0-1", () => {
      expect(CanonStatementSchema.safeParse({ ...validStatement, confidence: 1.5 }).success).toBe(false);
      expect(CanonStatementSchema.safeParse({ ...validStatement, confidence: -0.1 }).success).toBe(false);
      expect(CanonStatementSchema.safeParse({ ...validStatement, confidence: 0 }).success).toBe(true);
      expect(CanonStatementSchema.safeParse({ ...validStatement, confidence: 1 }).success).toBe(true);
    });

    it("allows replacement_statement_id for superseded", () => {
      const superseded = {
        ...validStatement,
        lifecycle: "superseded",
        replacement_statement_id: "s2",
      };
      expect(CanonStatementSchema.safeParse(superseded).success).toBe(true);
    });
  });

  describe("EvidenceRef", () => {
    it("accepts valid evidence", () => {
      const result = EvidenceRefSchema.safeParse({
        id: "e1",
        statement_id: "s1",
        source_artifact_id: "sa1",
        locator: { kind: "heading", value: "## Product Thesis" },
        note: "First thesis paragraph",
        extraction_method: "human",
        confidence: 0.9,
      });
      expect(result.success).toBe(true);
    });

    it("allows null statement_id for unlinked evidence", () => {
      const result = EvidenceRefSchema.safeParse({
        id: "e2",
        statement_id: null,
        source_artifact_id: "sa1",
        locator: { kind: "excerpt", value: "some text" },
        note: null,
        extraction_method: "ollama",
        confidence: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid locator kind", () => {
      const result = EvidenceRefSchema.safeParse({
        id: "e3",
        statement_id: "s1",
        source_artifact_id: "sa1",
        locator: { kind: "paragraph", value: "text" },
        note: null,
        extraction_method: "human",
        confidence: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("AlignmentReview", () => {
    it("accepts valid review", () => {
      const result = AlignmentReviewSchema.safeParse({
        id: "r1",
        project_id: "p1",
        candidate_artifact_id: "ca1",
        canon_version: "canon-v1",
        verdict: "mostly_aligned",
        thesis_preservation: "strong",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "minor",
        voice_naming_fit: "strong",
        summary: "Mostly on-thesis but uses generic language in section 3",
        created_at: TS,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid verdict", () => {
      const result = AlignmentReviewSchema.safeParse({
        id: "r1",
        project_id: "p1",
        candidate_artifact_id: "ca1",
        canon_version: "canon-v1",
        verdict: "okay",
        thesis_preservation: "strong",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
        summary: "test",
        created_at: TS,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("TasteConfig", () => {
    it("accepts valid config", () => {
      const result = TasteConfigSchema.safeParse({
        projectSlug: "role-os",
        dbPath: ".taste/taste.db",
        canonDir: "canon",
        provider: {
          kind: "ollama",
          baseUrl: "http://127.0.0.1:11434",
          model: "qwen3:14b",
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid provider kind", () => {
      const result = TasteConfigSchema.safeParse({
        projectSlug: "test",
        dbPath: ".taste/taste.db",
        canonDir: "canon",
        provider: {
          kind: "openai",
          baseUrl: "http://localhost",
          model: "gpt-4",
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid base URL", () => {
      const result = TasteConfigSchema.safeParse({
        projectSlug: "test",
        dbPath: ".taste/taste.db",
        canonDir: "canon",
        provider: {
          kind: "ollama",
          baseUrl: "not-a-url",
          model: "qwen3:14b",
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CanonFile", () => {
    it("accepts valid empty canon file", () => {
      const result = CanonFileSchema.safeParse({
        project: { slug: "role-os", name: "Role-OS", version: "canon-v1" },
        statements: [],
        evidence: [],
        metadata: { generated_at: TS, source_count: 0 },
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative source count", () => {
      const result = CanonFileSchema.safeParse({
        project: { slug: "role-os", name: "Role-OS", version: "canon-v1" },
        statements: [],
        evidence: [],
        metadata: { generated_at: TS, source_count: -1 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ReviewObservation", () => {
    it("accepts valid observation", () => {
      const result = ReviewObservationSchema.safeParse({
        id: "o1",
        review_id: "r1",
        kind: "drift",
        text: "Uses 'helper' language instead of 'operator' language",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("RevisionSuggestion", () => {
    it("accepts valid suggestion", () => {
      const result = RevisionSuggestionSchema.safeParse({
        id: "rs1",
        review_id: "r1",
        action: "revise",
        target_excerpt: "your helpful AI assistant",
        guidance: "Replace with operational framing: 'routing execution engine'",
      });
      expect(result.success).toBe(true);
    });

    it("allows null target_excerpt for cut", () => {
      const result = RevisionSuggestionSchema.safeParse({
        id: "rs2",
        review_id: "r1",
        action: "cut",
        target_excerpt: null,
        guidance: "Remove the entire onboarding section",
      });
      expect(result.success).toBe(true);
    });
  });
});
