import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject } from "../../src/canon/canon-store.js";
import { insertSourceArtifact } from "../../src/artifacts/source-artifacts.js";
import { getCandidates, getContradictions, getExemplars } from "../../src/extraction/extraction-store.js";
import { runExtraction, CORE_PASSES } from "../../src/extraction/extract.js";
import type { LlmProvider, HealthResult, CompletionInput, CompletionResult } from "../../src/providers/provider.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

/**
 * Mock LLM provider that returns controlled responses for each pass.
 */
class MockProvider implements LlmProvider {
  private responses: Map<string, unknown> = new Map();

  name() { return "mock"; }
  async healthCheck(): Promise<HealthResult> { return { ok: true, provider: "mock" }; }

  setResponse(task: string, data: unknown) {
    this.responses.set(task, data);
  }

  async completeJson<T>(input: CompletionInput): Promise<CompletionResult<T>> {
    const data = this.responses.get(input.task);
    if (data === undefined) {
      return { ok: false, error: `No mock response for task: ${input.task}`, model: "mock", elapsed_ms: 0 };
    }
    return { ok: true, data: data as T, model: "mock", elapsed_ms: 10 };
  }
}

describe("extraction integration", () => {
  let db: Database.Database;
  let projectId: string;
  let provider: MockProvider;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "role-os", "Role-OS", "OS for roles").id;
    provider = new MockProvider();
  });

  afterEach(() => { db.close(); });

  it("runs core passes with mock provider", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme",
      "# Role-OS\n\nRole-OS is a routing and execution operating system for roles, not a prompt library.\n\n## Anti-patterns\n\nDo not frame as a simple helper tool.");

    // Set up mock responses
    provider.setResponse("thesis_extraction", {
      candidates: [
        {
          text: "Role-OS is a routing and execution operating system for roles, not a prompt library",
          rationale: "Stated explicitly in README opening",
          confidence: 0.95,
          suggested_hardness: "hard",
          suggested_scope: ["product"],
          tags: ["routing", "identity"],
          evidence_section: "## Role-OS",
        },
      ],
    });

    provider.setResponse("anti_pattern_extraction", {
      candidates: [
        {
          text: "Framing Role-OS as a simple helper tool is rejected",
          rationale: "Explicitly stated in Anti-patterns section",
          confidence: 0.9,
          suggested_hardness: "hard",
          suggested_scope: ["product", "marketing"],
          tags: ["framing", "drift"],
          evidence_section: "## Anti-patterns",
        },
      ],
    });

    provider.setResponse("pattern_extraction", {
      candidates: [
        {
          text: "Routing and execution are first-class architectural patterns",
          rationale: "Central to the OS framing",
          confidence: 0.85,
          suggested_hardness: "strong",
          suggested_scope: ["architecture"],
          tags: ["routing", "execution"],
          evidence_section: "## Role-OS",
        },
      ],
    });

    provider.setResponse("contradiction_detection", {
      contradictions: [],
    });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: CORE_PASSES,
    });

    expect(result.run.status).toBe("completed");
    expect(result.passResults.length).toBe(4);
    expect(result.totalErrors).toBe(0);

    // Check candidates
    const candidates = getCandidates(db, result.run.id);
    expect(candidates.length).toBe(3);

    const thesisCandidates = candidates.filter((c) => c.statement_type === "thesis");
    expect(thesisCandidates.length).toBe(1);
    expect(thesisCandidates[0].confidence).toBe(0.95);

    const antiPatterns = candidates.filter((c) => c.statement_type === "anti_pattern");
    expect(antiPatterns.length).toBe(1);
  });

  it("handles pass failure gracefully", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Test");

    // Only set thesis response — others will fail
    provider.setResponse("thesis_extraction", {
      candidates: [{
        text: "A test thesis",
        rationale: "test",
        confidence: 0.5,
        suggested_hardness: "soft",
        suggested_scope: ["product"],
        tags: [],
        evidence_section: "# Test",
      }],
    });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: CORE_PASSES,
    });

    // Should complete with errors, not crash
    expect(result.run.status).toBe("completed");
    expect(result.totalErrors).toBeGreaterThan(0);

    // Thesis pass should still have succeeded
    const candidates = getCandidates(db, result.run.id);
    expect(candidates.length).toBe(1);
  });

  it("penalizes generic statements", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Test");

    provider.setResponse("thesis_extraction", {
      candidates: [
        {
          text: "The tool is powerful and flexible",
          rationale: "generic fluff",
          confidence: 0.8,
          suggested_hardness: "strong",
          suggested_scope: ["product"],
          tags: [],
          evidence_section: "# Test",
        },
        {
          text: "Role-OS routes roles through a strict execution spine",
          rationale: "specific product identity",
          confidence: 0.8,
          suggested_hardness: "hard",
          suggested_scope: ["product"],
          tags: ["routing"],
          evidence_section: "# Test",
        },
      ],
    });

    // Minimal mocks for other core passes
    provider.setResponse("anti_pattern_extraction", { candidates: [] });
    provider.setResponse("pattern_extraction", { candidates: [] });
    provider.setResponse("contradiction_detection", { contradictions: [] });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: CORE_PASSES,
    });

    const candidates = getCandidates(db, result.run.id);
    expect(candidates.length).toBe(2);

    // Generic statement should have lower confidence
    const generic = candidates.find((c) => c.text.includes("powerful"));
    const specific = candidates.find((c) => c.text.includes("spine"));

    expect(generic).toBeDefined();
    expect(specific).toBeDefined();
    expect(generic!.confidence).toBeLessThan(specific!.confidence);
  });

  it("handles contradiction findings", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Test\n\nConflicting content.");

    provider.setResponse("thesis_extraction", { candidates: [] });
    provider.setResponse("anti_pattern_extraction", { candidates: [] });
    provider.setResponse("pattern_extraction", { candidates: [] });
    provider.setResponse("contradiction_detection", {
      contradictions: [{
        title: "Identity framing conflict",
        description: "README opening says OS, later section implies helper tool",
        severity: "high",
        evidence_sections: ["## Identity", "## Getting Started"],
      }],
    });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: CORE_PASSES,
    });

    const contradictions = getContradictions(db, result.run.id);
    expect(contradictions.length).toBe(1);
    expect(contradictions[0].severity).toBe("high");
    expect(contradictions[0].status).toBe("open");
  });

  it("handles exemplar nominations", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Test");

    provider.setResponse("exemplar_nomination", {
      exemplars: [{
        source_title: "README",
        locator_kind: "heading",
        locator_value: "## Product Thesis",
        why_it_matters: "Best statement of identity in the repo",
        candidate_traits: ["thesis-defining", "operational"],
        confidence: 0.92,
      }],
    });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: ["exemplar"],
    });

    const exemplars = getExemplars(db, result.run.id);
    expect(exemplars.length).toBe(1);
    expect(exemplars[0].confidence).toBe(0.92);
  });

  it("handles unknown source title in exemplar gracefully", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Test");

    provider.setResponse("exemplar_nomination", {
      exemplars: [{
        source_title: "NONEXISTENT",
        locator_kind: "heading",
        locator_value: "## Thesis",
        why_it_matters: "test",
        candidate_traits: [],
        confidence: 0.5,
      }],
    });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: ["exemplar"],
    });

    // Should log error but not crash
    expect(result.totalErrors).toBeGreaterThan(0);
    const exemplars = getExemplars(db, result.run.id);
    expect(exemplars.length).toBe(0);
  });

  it("consolidation merges duplicates across passes", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Test");

    // Thesis and pattern passes both emit similar statements
    provider.setResponse("thesis_extraction", {
      candidates: [{
        text: "Role-OS routes roles through execution spines",
        rationale: "thesis",
        confidence: 0.9,
        suggested_hardness: "hard",
        suggested_scope: ["product"],
        tags: ["routing"],
        evidence_section: "# Test",
      }],
    });
    provider.setResponse("anti_pattern_extraction", { candidates: [] });
    provider.setResponse("pattern_extraction", {
      candidates: [{
        text: "Role-OS routes roles through the execution spines pattern",
        rationale: "pattern",
        confidence: 0.7,
        suggested_hardness: "strong",
        suggested_scope: ["architecture"],
        tags: ["routing"],
        evidence_section: "# Test",
      }],
    });
    provider.setResponse("contradiction_detection", { contradictions: [] });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
      passes: CORE_PASSES,
    });

    // Different types should NOT merge
    expect(result.consolidation.total_after).toBe(2);
  });

  it("runs with no source artifacts", async () => {
    provider.setResponse("thesis_extraction", { candidates: [] });
    provider.setResponse("anti_pattern_extraction", { candidates: [] });
    provider.setResponse("pattern_extraction", { candidates: [] });
    provider.setResponse("contradiction_detection", { contradictions: [] });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [],
      passes: CORE_PASSES,
    });

    expect(result.run.status).toBe("completed");
    expect(result.consolidation.total_after).toBe(0);
  });

  it("runs all 8 passes without error", async () => {
    const source = insertSourceArtifact(db, projectId, "README", "readme", "# Role-OS");

    provider.setResponse("thesis_extraction", { candidates: [] });
    provider.setResponse("anti_pattern_extraction", { candidates: [] });
    provider.setResponse("pattern_extraction", { candidates: [] });
    provider.setResponse("voice_naming_extraction", { candidates: [] });
    provider.setResponse("decision_extraction", { candidates: [] });
    provider.setResponse("boundary_extraction", { candidates: [] });
    provider.setResponse("contradiction_detection", { contradictions: [] });
    provider.setResponse("exemplar_nomination", { exemplars: [] });

    const result = await runExtraction(db, provider, {
      projectId,
      sources: [source],
    });

    expect(result.passResults.length).toBe(8);
    expect(result.run.status).toBe("completed");
  });
});
