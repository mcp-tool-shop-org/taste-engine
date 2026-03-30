import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion, freezeCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { runReview } from "../../src/review/review-engine.js";
import { runStructuralRepair } from "../../src/revision/structural-engine.js";
import type { LlmProvider, HealthResult, CompletionInput, CompletionResult } from "../../src/providers/provider.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

class MockRepairProvider implements LlmProvider {
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
  insertStatement(db, { project_id: projectId, canon_version: "v1", text: "Product is an OS with lawful orchestration", statement_type: "thesis", lifecycle: "accepted", hardness: "hard", scope: ["product"], artifact_types: [], tags: ["identity"], rationale: "Core", confidence: 0.95, replacement_statement_id: null });
  insertStatement(db, { project_id: projectId, canon_version: "v1", text: "Bypassing operator gates is rejected", statement_type: "anti_pattern", lifecycle: "accepted", hardness: "hard", scope: ["product"], artifact_types: [], tags: ["governance"], rationale: "Anti", confidence: 0.9, replacement_statement_id: null });
  freezeCanonVersion(db, projectId, "v1");
}

function mockDriftReview(provider: MockRepairProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "mixed", judgment: "Partially preserved", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "weak", judgment: "Generic", confidence: 0.6, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "minor", judgment: "Slight", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "mixed", judgment: "Some drift", confidence: 0.6, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", { verdict: "salvageable_drift", summary: "Concept drifts.", preserved: [{ text: "Goal is valid", evidence_ids: [] }], drift_points: [{ text: "Bypasses governance", evidence_ids: [] }], conflicts: [], uncertainties: [], suggestions: [] });
}

function mockAlignedReview(provider: MockRepairProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "strong", judgment: "Strong", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "strong", judgment: "Native", confidence: 0.85, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "none", judgment: "None", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "strong", judgment: "Correct", confidence: 0.85, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", { verdict: "aligned", summary: "Aligned.", preserved: [], drift_points: [], conflicts: [], uncertainties: [], suggestions: [] });
}

describe("structural repair engine", () => {
  let db: Database.Database;
  let projectId: string;
  let provider: MockRepairProvider;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
    setupCanon(db, projectId);
    provider = new MockRepairProvider();
  });

  afterEach(() => { db.close(); });

  it("completes full repair pipeline with improved verdict", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Auto-approve", "feature_brief", "Faster approvals", "Skip operator approval gates automatically.");

    mockDriftReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    // Set up structural repair responses
    provider.setResponse("structural_goal_extraction", {
      primary_goal: "Reduce operator overhead on routine approvals",
      preserved_intent: ["Faster approval flow"],
      desired_user_outcomes: ["Less time on approval clicks"],
      constraints: ["Must preserve governance truth"],
      confidence: 0.9,
    });
    provider.setResponse("structural_fault_diagnosis", {
      structural_fault: "Bypasses operator approval gates, which are a governance requirement",
      why_patch_is_insufficient: "The mechanism itself violates governance, not just the wording",
      conflicting_canon_ids: [],
      anti_pattern_ids: [],
      goal_is_repairable: true,
      notes: [],
    });
    provider.setResponse("structural_repair_concepts", {
      concepts: [
        { title: "Staged Approval Bundles", summary: "Group routine packets for batch approval", preserved_goal: "Reduce approval overhead", replacement_mechanism: "Batch operator approval instead of bypass", tradeoffs: ["Still requires human click"], confidence: 0.85 },
        { title: "Prevalidated Promotion Lanes", summary: "Pre-approved promotion paths for known-good patterns", preserved_goal: "Faster routine approvals", replacement_mechanism: "Pre-validation replaces post-hoc approval for qualifying runs", tradeoffs: ["Requires lane definition upfront"], confidence: 0.8 },
      ],
    });
    provider.setResponse("structural_repair_draft", { body: "## Feature: Staged Approval Bundles\n\nGroup routine run outcomes for batch operator approval." });

    // Re-review produces aligned
    mockAlignedReview(provider);

    const result = await runStructuralRepair(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
      escalationReason: "Patch revision did not improve",
    });

    expect(result.run.status).toBe("completed");
    expect(result.goal).not.toBeNull();
    expect(result.goal!.primary_goal).toContain("approval");
    expect(result.fault).not.toBeNull();
    expect(result.fault!.goal_is_repairable).toBe(true);
    expect(result.concepts.length).toBeGreaterThanOrEqual(1);
    expect(result.outcomes.length).toBeGreaterThanOrEqual(1);
    expect(result.outcomes[0].tier_improvement).toBeGreaterThan(0);
  });

  it("handles irreparable goals honestly", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Remove governance", "feature_brief", "Remove all gates", "Delete all operator approval requirements.");

    mockDriftReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("structural_goal_extraction", {
      primary_goal: "Remove all governance requirements",
      preserved_intent: [],
      desired_user_outcomes: ["No approval overhead"],
      constraints: [],
      confidence: 0.7,
    });
    provider.setResponse("structural_fault_diagnosis", {
      structural_fault: "The goal itself contradicts governance canon",
      why_patch_is_insufficient: "The intent is to remove what canon requires",
      conflicting_canon_ids: [],
      anti_pattern_ids: [],
      goal_is_repairable: false,
      notes: ["Consider reframing toward reducing friction while preserving governance"],
    });

    const result = await runStructuralRepair(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
      escalationReason: "Goal contradicts canon",
    });

    expect(result.run.status).toBe("completed");
    expect(result.irreparable).not.toBeNull();
    expect(result.irreparable!.reason).toContain("contradicts");
    expect(result.irreparable!.suggested_reframe).toContain("friction");
    expect(result.concepts.length).toBe(0);
    expect(result.outcomes.length).toBe(0);
  });

  it("fails gracefully when goal extraction fails", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Test", "feature_brief", "test", "content");

    mockDriftReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    // Don't set goal extraction response

    const result = await runStructuralRepair(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
      escalationReason: "test",
    });

    expect(result.run.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("separates goal from mechanism", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Smart suggest", "feature_brief", "Easier routing", "Users pick roles they like from a list.");

    mockDriftReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("structural_goal_extraction", {
      primary_goal: "Make role selection easier for new users",
      preserved_intent: ["Reduce learning curve", "Guide users to right roles"],
      desired_user_outcomes: ["Faster task start", "Less confusion"],
      constraints: ["Must preserve routing architecture"],
      confidence: 0.85,
    });
    provider.setResponse("structural_fault_diagnosis", {
      structural_fault: "Replaces algorithmic routing with manual browsing, weakening OS identity",
      why_patch_is_insufficient: "The selection mechanism itself is wrong, not the words",
      conflicting_canon_ids: [], anti_pattern_ids: [],
      goal_is_repairable: true, notes: [],
    });
    provider.setResponse("structural_repair_concepts", {
      concepts: [{ title: "Guided Entry", summary: "Route through missions/packs first", preserved_goal: "Easier start", replacement_mechanism: "Mission/pack auto-selection with explanation", tradeoffs: ["Less browsing freedom"], confidence: 0.85 }],
    });
    provider.setResponse("structural_repair_draft", { body: "## Feature: Guided Entry\n\nNew users describe their task. Role OS auto-selects the mission or pack and explains why." });
    mockAlignedReview(provider);

    const result = await runStructuralRepair(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
      escalationReason: "Patch insufficient",
    });

    expect(result.goal!.primary_goal).toContain("easier");
    expect(result.fault!.structural_fault).toContain("browsing");
    expect(result.concepts[0].replacement_mechanism).toContain("auto-selection");
  });
});
