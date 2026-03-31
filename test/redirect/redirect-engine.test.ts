import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion, freezeCanonVersion } from "../../src/canon/canon-version.js";
import { insertCandidateArtifact } from "../../src/artifacts/candidate-artifacts.js";
import { runReview } from "../../src/review/review-engine.js";
import { runRedirect } from "../../src/redirect/redirect-engine.js";
import type { LlmProvider, HealthResult, CompletionInput, CompletionResult } from "../../src/providers/provider.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

class MockRedirectProvider implements LlmProvider {
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
  insertStatement(db, { project_id: projectId, canon_version: "v1", text: "Product is an OS with lawful orchestration", statement_type: "thesis", lifecycle: "accepted", hardness: "hard", scope: ["product"], artifact_types: [], tags: [], rationale: "core", confidence: 0.95, replacement_statement_id: null });
  insertStatement(db, { project_id: projectId, canon_version: "v1", text: "Bypassing operator gates is rejected", statement_type: "anti_pattern", lifecycle: "accepted", hardness: "hard", scope: ["product"], artifact_types: [], tags: [], rationale: "anti", confidence: 0.9, replacement_statement_id: null });
  freezeCanonVersion(db, projectId, "v1");
}

function mockContradictionReview(provider: MockRedirectProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "weak", judgment: "Thesis broken", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "weak", judgment: "Generic", confidence: 0.8, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "major", judgment: "Major collision", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "weak", judgment: "Wrong voice", confidence: 0.8, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", {
    verdict: "contradiction", summary: "Contradicts core canon.",
    preserved: [], drift_points: [{ text: "Removes orchestration", evidence_ids: [] }],
    conflicts: [{ text: "Bypasses all governance", evidence_ids: [] }],
    uncertainties: [], suggestions: [],
  });
}

describe("redirect engine", () => {
  let db: Database.Database;
  let projectId: string;
  let provider: MockRedirectProvider;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
    setupCanon(db, projectId);
    provider = new MockRedirectProvider();
  });

  afterEach(() => { db.close(); });

  it("produces a goal redirection brief", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Auto-approve", "feature_brief", "Faster approvals",
      "Skip all operator gates automatically.",
    );

    mockContradictionReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("goal_redirection", {
      preserved_goal: "Reduce operator overhead on routine approvals",
      conflict_explanation: "Bypassing operator gates contradicts the governance canon that requires human approval in the control plane loop.",
      non_negotiable_constraints: ["Operator approval must remain in the loop", "Gates enforce governance truth"],
      directions: [
        {
          title: "Staged Approval Bundles",
          summary: "Group routine packets for batch approval instead of one-by-one.",
          how_it_preserves_goal: "Reduces click count while keeping operator in the loop.",
          canon_alignment: "Operator loop is preserved. Governance gates remain.",
          tradeoffs: ["Still requires human interaction, just less frequent"],
        },
        {
          title: "Prevalidated Fast Lanes",
          summary: "Define pre-approved patterns that skip to promote-check instead of full review.",
          how_it_preserves_goal: "Known-good patterns move faster while novel patterns still require full review.",
          canon_alignment: "Pre-validation is a form of upfront governance, not bypass.",
          tradeoffs: ["Requires upfront lane definition work"],
        },
      ],
      recommended_next_brief: "## Feature: Staged Approval Bundles\n\nWhen a run completes with all packets verified and fitness scores above threshold, group the approval into a single batch review. The operator sees a summary of all completed packets with their verdicts, then approves or rejects the batch. This preserves the governance loop while reducing per-packet approval overhead. Entry: `multi-claude console approve --batch`.",
    });

    const result = await runRedirect(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
    });

    expect(result.errors.length).toBe(0);
    expect(result.brief).not.toBeNull();
    expect(result.brief!.preserved_goal).toContain("overhead");
    expect(result.brief!.conflict_explanation).toContain("governance");
    expect(result.brief!.non_negotiable_constraints.length).toBeGreaterThan(0);
    expect(result.brief!.directions.length).toBe(2);
    expect(result.brief!.directions[0].title).toContain("Staged");
    expect(result.brief!.recommended_next_brief).toContain("batch");
  });

  it("preserves goal even when concept is fully blocked", async () => {
    const candidate = insertCandidateArtifact(db, projectId,
      "Remove governance", "feature_brief", "No more gates",
      "Delete all operator approval requirements entirely.",
    );

    mockContradictionReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("goal_redirection", {
      preserved_goal: "Minimize friction in the development workflow",
      conflict_explanation: "Removing governance entirely contradicts the core thesis. The operator loop is non-negotiable.",
      non_negotiable_constraints: ["Operator loop must exist", "Governance gates must fire"],
      directions: [
        {
          title: "Friction-Aware Governance",
          summary: "Measure and minimize governance overhead without removing it.",
          how_it_preserves_goal: "Reduces friction while preserving necessary governance.",
          canon_alignment: "Governance stays. Friction measurement is already part of the system.",
          tradeoffs: ["Governance still exists, just smoother"],
        },
      ],
      recommended_next_brief: "## Feature: Friction-Aware Governance\n\nAdd friction metrics to every governance gate. When overhead exceeds thresholds, surface optimization suggestions. Measure time-to-approve, review-rejection rate, and intervention frequency. Feed data into the calibration engine.",
    });

    const result = await runRedirect(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
    });

    expect(result.brief).not.toBeNull();
    expect(result.brief!.preserved_goal).toContain("friction");
    expect(result.brief!.directions.length).toBeGreaterThanOrEqual(1);
    // Goal preserved — not just "don't do this"
    expect(result.brief!.recommended_next_brief.length).toBeGreaterThan(50);
  });

  it("fails gracefully when no review exists", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Test", "feature_brief", "test", "body");

    const result = await runRedirect(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: "nonexistent",
    });

    expect(result.brief).toBeNull();
    expect(result.errors).toContain("Source review not found");
  });

  it("fails gracefully when LLM fails", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Test", "feature_brief", "test", "body");

    mockContradictionReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });
    // Don't set goal_redirection response

    const result = await runRedirect(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
    });

    expect(result.brief).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("directions include tradeoffs", async () => {
    const candidate = insertCandidateArtifact(db, projectId, "Swarm", "feature_brief", "Autonomous agents", "No operator needed.");

    mockContradictionReview(provider);
    const review = await runReview(db, provider, { projectId, canonVersion: "v1", candidate });

    provider.setResponse("goal_redirection", {
      preserved_goal: "Reduce operator involvement in routine parallel work",
      conflict_explanation: "Fully autonomous agents bypass the operator loop which is non-negotiable.",
      non_negotiable_constraints: ["Operator loop", "Gate enforcement"],
      directions: [
        {
          title: "Supervised Autonomy",
          summary: "Workers run autonomously within pre-approved boundaries, operator reviews at wave gates.",
          how_it_preserves_goal: "Most work runs without operator interaction. Only gate reviews require human.",
          canon_alignment: "Operator loop preserved at wave boundaries.",
          tradeoffs: ["Slightly slower than fully autonomous", "Requires boundary definition upfront"],
        },
      ],
      recommended_next_brief: "## Feature: Supervised Autonomy\n\nWorkers execute within pre-approved file boundaries. Wave gates require operator review. Budget alerts fire but don't auto-stop. Operator can trust-but-verify.",
    });

    const result = await runRedirect(db, provider, {
      projectId, canonVersion: "v1", candidate, reviewId: review.alignmentReview.id,
    });

    expect(result.brief!.directions[0].tradeoffs.length).toBeGreaterThan(0);
    expect(result.brief!.directions[0].tradeoffs[0]).toBeTruthy();
  });
});
