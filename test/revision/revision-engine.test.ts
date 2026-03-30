import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion, freezeCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { runReview } from "../../src/review/review-engine.js";
import { runRevision } from "../../src/revision/revision-engine.js";
import type { LlmProvider, HealthResult, CompletionInput, CompletionResult } from "../../src/providers/provider.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

class MockRevisionProvider implements LlmProvider {
  private responses: Map<string, unknown> = new Map();
  name() { return "mock"; }
  async healthCheck(): Promise<HealthResult> { return { ok: true, provider: "mock" }; }
  setResponse(task: string, data: unknown) { this.responses.set(task, data); }
  async completeJson<T>(input: CompletionInput): Promise<CompletionResult<T>> {
    const data = this.responses.get(input.task);
    if (!data) return { ok: false, error: `No mock for ${input.task}`, model: "mock", elapsed_ms: 0 };
    return { ok: true, data: data as T, model: "mock", elapsed_ms: 5 };
  }
}

function setupCanon(db: Database.Database, projectId: string) {
  createCanonVersion(db, projectId, "v1");
  insertStatement(db, {
    project_id: projectId, canon_version: "v1",
    text: "Product is an operating system, not a prompt library",
    statement_type: "thesis", lifecycle: "accepted", hardness: "hard",
    scope: ["product"], artifact_types: ["package_blurb"],
    tags: ["identity"], rationale: "Core thesis",
    confidence: 0.95, replacement_statement_id: null,
  });
  insertStatement(db, {
    project_id: projectId, canon_version: "v1",
    text: "Prompt library framing is rejected",
    statement_type: "anti_pattern", lifecycle: "accepted", hardness: "hard",
    scope: ["product"], artifact_types: ["package_blurb"],
    tags: ["drift"], rationale: "Anti-drift",
    confidence: 0.9, replacement_statement_id: null,
  });
  freezeCanonVersion(db, projectId, "v1");
}

function mockDriftReviewResponses(provider: MockRevisionProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "mixed", judgment: "Partially preserved", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "weak", judgment: "Generic patterns", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "minor", judgment: "Slight collision", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "mixed", judgment: "Some generic language", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", {
    verdict: "salvageable_drift",
    summary: "Drifted but salvageable.",
    preserved: [{ text: "Core concept present", evidence_ids: [] }],
    drift_points: [{ text: "Uses prompt library language", evidence_ids: [] }],
    conflicts: [],
    uncertainties: [],
    suggestions: [{ action: "revise", target_excerpt: "prompt management", guidance: "Use OS framing" }],
  });
}

function mockAlignedReviewResponses(provider: MockRevisionProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "strong", judgment: "Thesis preserved", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "strong", judgment: "Native patterns", confidence: 0.85, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "none", judgment: "No collision", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "strong", judgment: "Correct voice", confidence: 0.85, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", {
    verdict: "aligned",
    summary: "Well aligned.",
    preserved: [{ text: "OS framing maintained", evidence_ids: [] }],
    drift_points: [],
    conflicts: [],
    uncertainties: [],
    suggestions: [],
  });
}

describe("revision engine", () => {
  let db: Database.Database;
  let projectId: string;
  let provider: MockRevisionProvider;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
    setupCanon(db, projectId);
    provider = new MockRevisionProvider();
  });

  afterEach(() => { db.close(); });

  it("produces minimal and strong revision options", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Drifted blurb", "package_blurb", "npm description",
      "A prompt management system that helps organize AI helpers.",
    );

    // First review
    mockDriftReviewResponses(provider);
    const reviewResult = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    // Set up revision response
    provider.setResponse("revision_generate", {
      preserved_intent: "Describe the product for npm",
      preserved_strengths: ["Mentions organizing roles"],
      minimal: {
        body: "An operating system that organizes AI role contracts for structured execution.",
        changes: [{ change: "Replaced prompt management with operating system", drift_fixed: "prompt library language", canon_restored: "OS thesis" }],
        unresolved_tradeoffs: [],
      },
      strong: {
        body: "A multi-agent operating system that staffs, routes, and validates work through role contracts with structured evidence.",
        changes: [
          { change: "Full OS framing", drift_fixed: "prompt library language", canon_restored: "OS thesis" },
          { change: "Added evidence language", drift_fixed: "generic helper framing", canon_restored: "Evidence requirements" },
        ],
        unresolved_tradeoffs: [],
      },
    });

    // Mock aligned re-review for revised versions
    mockAlignedReviewResponses(provider);

    const result = await runRevision(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: reviewResult.alignmentReview.id,
    });

    expect(result.run.status).toBe("completed");
    expect(result.options.length).toBe(2);

    const minimal = result.options.find((o) => o.option.level === "minimal");
    const strong = result.options.find((o) => o.option.level === "strong");

    expect(minimal).toBeDefined();
    expect(strong).toBeDefined();
    expect(minimal!.option.body).toContain("operating system");
    expect(strong!.option.body).toContain("evidence");
  });

  it("re-reviews revisions and scores tier improvement", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "package_blurb", "test", "A prompt pack.",
    );

    mockDriftReviewResponses(provider);
    const reviewResult = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("revision_generate", {
      preserved_intent: "test",
      preserved_strengths: [],
      minimal: { body: "Revised minimal", changes: [{ change: "x", drift_fixed: "y", canon_restored: "z" }], unresolved_tradeoffs: [] },
      strong: { body: "Revised strong", changes: [{ change: "x", drift_fixed: "y", canon_restored: "z" }], unresolved_tradeoffs: [] },
    });

    // Re-review produces aligned
    mockAlignedReviewResponses(provider);

    const result = await runRevision(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: reviewResult.alignmentReview.id,
    });

    // Original was salvageable_drift (tier 2), revised should be aligned (tier 4)
    for (const scored of result.options) {
      expect(scored.tier_improvement).toBeGreaterThan(0);
      expect(scored.re_review_verdict).toBe("aligned");
    }
  });

  it("preserves change rationale", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "package_blurb", "test", "Generic helper tool.",
    );

    mockDriftReviewResponses(provider);
    const reviewResult = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("revision_generate", {
      preserved_intent: "Describe the product",
      preserved_strengths: ["Brevity"],
      minimal: {
        body: "Operating system for role contracts.",
        changes: [{ change: "OS framing", drift_fixed: "helper language", canon_restored: "thesis statement" }],
        unresolved_tradeoffs: ["Lost some brevity"],
      },
      strong: {
        body: "Multi-agent OS with evidence and routing.",
        changes: [
          { change: "Full OS identity", drift_fixed: "helper language", canon_restored: "thesis" },
          { change: "Added routing", drift_fixed: "generic coordination", canon_restored: "pattern" },
        ],
        unresolved_tradeoffs: [],
      },
    });

    mockAlignedReviewResponses(provider);

    const result = await runRevision(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: reviewResult.alignmentReview.id,
    });

    const minimal = result.options.find((o) => o.option.level === "minimal")!;
    expect(minimal.option.change_rationale.length).toBe(1);
    expect(minimal.option.change_rationale[0].drift_fixed).toBe("helper language");
    expect(minimal.option.preserved_intent).toBe("Describe the product");
    expect(minimal.option.unresolved_tradeoffs).toContain("Lost some brevity");
  });

  it("fails gracefully when revision generation fails", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "package_blurb", "test", "Something.",
    );

    mockDriftReviewResponses(provider);
    const reviewResult = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    // Don't set revision_generate response — it will fail

    const result = await runRevision(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: reviewResult.alignmentReview.id,
    });

    expect(result.run.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.options.length).toBe(0);
  });

  it("fails gracefully when no review exists", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "package_blurb", "test", "No review.",
    );

    const result = await runRevision(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: "nonexistent",
    });

    expect(result.run.status).toBe("failed");
    expect(result.errors).toContain("Source review not found");
  });
});
