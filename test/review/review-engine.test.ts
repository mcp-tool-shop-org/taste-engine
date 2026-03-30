import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion, freezeCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { runReview } from "../../src/review/review-engine.js";
import {
  getDimensionEvals,
  getObservations,
  getSuggestions,
  getPacketItems,
} from "../../src/review/review-store.js";
import type { LlmProvider, HealthResult, CompletionInput, CompletionResult } from "../../src/providers/provider.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

class MockReviewProvider implements LlmProvider {
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
  createCanonVersion(db, projectId, "canon-v1");

  insertStatement(db, {
    project_id: projectId, canon_version: "canon-v1",
    text: "Role-OS is a routing and execution operating system, not a prompt library",
    statement_type: "thesis", lifecycle: "accepted", hardness: "hard",
    scope: ["product"], artifact_types: ["readme_section", "package_blurb"],
    tags: ["routing", "identity"], rationale: "Core thesis",
    confidence: 0.95, replacement_statement_id: null,
  });

  insertStatement(db, {
    project_id: projectId, canon_version: "canon-v1",
    text: "Prompt library framing is rejected",
    statement_type: "anti_pattern", lifecycle: "accepted", hardness: "hard",
    scope: ["product", "marketing"], artifact_types: ["readme_section", "package_blurb"],
    tags: ["drift", "framing"], rationale: "Anti-drift",
    confidence: 0.9, replacement_statement_id: null,
  });

  insertStatement(db, {
    project_id: projectId, canon_version: "canon-v1",
    text: "Use operational language: spine, doctor, route, mission, pack",
    statement_type: "voice", lifecycle: "accepted", hardness: "strong",
    scope: ["product", "docs"], artifact_types: [],
    tags: ["voice", "naming"], rationale: "Naming law",
    confidence: 0.85, replacement_statement_id: null,
  });

  insertStatement(db, {
    project_id: projectId, canon_version: "canon-v1",
    text: "Route cards and doctor checks are native architectural patterns",
    statement_type: "pattern", lifecycle: "accepted", hardness: "strong",
    scope: ["architecture"], artifact_types: [],
    tags: ["routing", "doctor"], rationale: "Architecture pattern",
    confidence: 0.85, replacement_statement_id: null,
  });

  freezeCanonVersion(db, projectId, "canon-v1");
}

function mockAlignedResponses(provider: MockReviewProvider) {
  provider.setResponse("review_thesis_preservation", {
    rating: "strong", judgment: "Preserves OS framing throughout",
    confidence: 0.9, evidence_statement_ids: [], notes: ["Strong thesis alignment"],
  });
  provider.setResponse("review_pattern_fidelity", {
    rating: "strong", judgment: "Uses native routing patterns",
    confidence: 0.85, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_anti_pattern_collision", {
    rating: "none", judgment: "No collision with anti-patterns",
    confidence: 0.9, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_voice_naming_fit", {
    rating: "strong", judgment: "Uses operational language correctly",
    confidence: 0.85, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_synthesis", {
    verdict: "aligned",
    summary: "This artifact preserves the operating-system thesis and uses native routing language.",
    preserved: [{ text: "OS framing is maintained", evidence_ids: [] }],
    drift_points: [],
    conflicts: [],
    uncertainties: [],
    suggestions: [{ action: "keep", target_excerpt: null, guidance: "Artifact is well-aligned" }],
  });
}

function mockDriftResponses(provider: MockReviewProvider) {
  provider.setResponse("review_thesis_preservation", {
    rating: "weak", judgment: "Reframes product as a prompt collection",
    confidence: 0.9, evidence_statement_ids: [], notes: ["Thesis lost"],
  });
  provider.setResponse("review_pattern_fidelity", {
    rating: "weak", judgment: "Uses generic assistant patterns",
    confidence: 0.8, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_anti_pattern_collision", {
    rating: "major", judgment: "Direct collision with prompt library anti-pattern",
    confidence: 0.95, evidence_statement_ids: [], notes: ["Major collision"],
  });
  provider.setResponse("review_voice_naming_fit", {
    rating: "weak", judgment: "Generic helper language throughout",
    confidence: 0.85, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_synthesis", {
    verdict: "contradiction",
    summary: "This artifact directly contradicts the operating-system thesis by framing Role-OS as a prompt library.",
    preserved: [],
    drift_points: [{ text: "Prompt library framing throughout", evidence_ids: [] }],
    conflicts: [{ text: "Direct contradiction of hard thesis", evidence_ids: [] }],
    uncertainties: [],
    suggestions: [
      { action: "revise", target_excerpt: "helpful prompt collection", guidance: "Replace with operating-system framing" },
      { action: "cut", target_excerpt: null, guidance: "Remove all assistant-speak" },
    ],
  });
}

function mockSalvageableResponses(provider: MockReviewProvider) {
  provider.setResponse("review_thesis_preservation", {
    rating: "mixed", judgment: "Partially preserves OS framing but softens it",
    confidence: 0.7, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_pattern_fidelity", {
    rating: "strong", judgment: "Uses routing concepts correctly",
    confidence: 0.8, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_anti_pattern_collision", {
    rating: "minor", judgment: "Slight helper language creep",
    confidence: 0.7, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_voice_naming_fit", {
    rating: "strong", judgment: "Mostly operational language",
    confidence: 0.8, evidence_statement_ids: [], notes: [],
  });
  provider.setResponse("review_synthesis", {
    verdict: "salvageable_drift",
    summary: "Core routing concept preserved but thesis softened toward recommendation language.",
    preserved: [{ text: "Routing patterns used correctly", evidence_ids: [] }],
    drift_points: [{ text: "Thesis softened to recommendation framing", evidence_ids: [] }],
    conflicts: [],
    uncertainties: [],
    suggestions: [
      { action: "revise", target_excerpt: "helps you manage", guidance: "Strengthen to 'routes and executes'" },
    ],
  });
}

describe("review engine", () => {
  let db: Database.Database;
  let projectId: string;
  let provider: MockReviewProvider;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "role-os", "Role-OS", "OS for roles").id;
    setupCanon(db, projectId);
    provider = new MockReviewProvider();
  });

  afterEach(() => { db.close(); });

  // === Aligned ===

  it("produces aligned verdict for on-thesis artifact", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Package blurb", "package_blurb", "npm package description",
      "Role-OS is a routing and execution operating system that manages role selection, task matching, and runtime enforcement through spines and doctor checks.",
    );
    mockAlignedResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    expect(result.alignmentReview.verdict).toBe("aligned");
    expect(result.alignmentReview.thesis_preservation).toBe("strong");
    expect(result.alignmentReview.anti_pattern_collision).toBe("none");
  });

  // === Contradiction ===

  it("produces contradiction for hard-drift artifact", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Bad blurb", "package_blurb", "npm package description",
      "Role-OS is a helpful prompt collection that lets you pick from curated AI personas to enhance your chat experience.",
    );
    mockDriftResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    expect(result.alignmentReview.verdict).toBe("contradiction");
    expect(result.alignmentReview.thesis_preservation).toBe("weak");
    expect(result.alignmentReview.anti_pattern_collision).toBe("major");
  });

  // === Salvageable drift ===

  it("produces salvageable_drift for softened artifact", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Soft blurb", "package_blurb", "npm package description",
      "Role-OS helps you manage roles through intelligent routing and selection. It recommends the best role for your task.",
    );
    mockSalvageableResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    expect(result.alignmentReview.verdict).toBe("salvageable_drift");
  });

  // === Dimension evaluations stored ===

  it("stores all 4 dimension evaluations", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "readme_section", "test", "Test body",
    );
    mockAlignedResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    const evals = getDimensionEvals(db, result.reviewRun.id);
    expect(evals.length).toBe(4);
    const dims = evals.map((e) => e.dimension).sort();
    expect(dims).toEqual(["anti_pattern_collision", "pattern_fidelity", "thesis_preservation", "voice_naming_fit"]);
  });

  // === Canon packet stored ===

  it("stores canon packet for auditability", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "readme_section", "test", "Test body",
    );
    mockAlignedResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    const items = getPacketItems(db, result.reviewRun.id);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.reason_selected === "hard_thesis")).toBe(true);
  });

  // === Observations and suggestions stored ===

  it("stores observations and suggestions from synthesis", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Bad", "package_blurb", "test",
      "A helpful prompt collection for AI personas.",
    );
    mockDriftResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    const observations = getObservations(db, result.alignmentReview.id);
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.some((o) => o.kind === "drift")).toBe(true);
    expect(observations.some((o) => o.kind === "conflict")).toBe(true);

    const suggestions = getSuggestions(db, result.alignmentReview.id);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.action === "revise")).toBe(true);
  });

  // === Handles dimension pass failure ===

  it("handles dimension pass failure gracefully", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "readme_section", "test", "Test body",
    );
    // Only provide thesis response — others fail
    provider.setResponse("review_thesis_preservation", {
      rating: "strong", judgment: "Good", confidence: 0.9,
      evidence_statement_ids: [], notes: [],
    });
    provider.setResponse("review_synthesis", {
      verdict: "mostly_aligned",
      summary: "Partial evaluation due to errors.",
      preserved: [], drift_points: [], conflicts: [],
      uncertainties: ["Incomplete evaluation"], suggestions: [],
    });

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.alignmentReview).toBeDefined();
    // Should still produce a verdict (with fallback ratings)
    expect(result.dimensionEvals.length).toBe(4);
  });

  // === Verdict reconciliation ===

  it("trusts rule-based verdict over model suggestion", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "readme_section", "test", "Test body",
    );
    // Model says all is good but rules see mixed thesis
    provider.setResponse("review_thesis_preservation", {
      rating: "mixed", judgment: "Partially preserved",
      confidence: 0.7, evidence_statement_ids: [], notes: [],
    });
    provider.setResponse("review_pattern_fidelity", {
      rating: "strong", judgment: "Good",
      confidence: 0.8, evidence_statement_ids: [], notes: [],
    });
    provider.setResponse("review_anti_pattern_collision", {
      rating: "none", judgment: "No collision",
      confidence: 0.8, evidence_statement_ids: [], notes: [],
    });
    provider.setResponse("review_voice_naming_fit", {
      rating: "strong", judgment: "Good voice",
      confidence: 0.8, evidence_statement_ids: [], notes: [],
    });
    provider.setResponse("review_synthesis", {
      verdict: "aligned", // Model says aligned
      summary: "Looks good.",
      preserved: [], drift_points: [], conflicts: [],
      uncertainties: [], suggestions: [],
    });

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    // Rules should produce mostly_aligned (mixed thesis),
    // NOT aligned as the model suggested
    expect(result.alignmentReview.verdict).toBe("mostly_aligned");
  });

  // === Packet always has hard thesis ===

  it("canon packet always includes hard thesis regardless of artifact type", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "CLI help", "cli_help", "CLI documentation", "taste review --help",
    );
    mockAlignedResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    const items = getPacketItems(db, result.reviewRun.id);
    expect(items.some((i) => i.reason_selected === "hard_thesis")).toBe(true);
  });

  // === Review run completed status ===

  it("marks review run as completed", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Test", "readme_section", "test", "Test body",
    );
    mockAlignedResponses(provider);

    const result = await runReview(db, provider, {
      projectId, canonVersion: "canon-v1", candidate,
    });

    expect(result.reviewRun.status).toBe("completed");
    expect(result.reviewRun.completed_at).not.toBeNull();
  });
});
