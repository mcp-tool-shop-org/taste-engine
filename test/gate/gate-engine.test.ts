import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement } from "../../src/canon/canon-store.js";
import { createCanonVersion, freezeCanonVersion } from "../../src/canon/canon-version.js";
import { runGate, gateResultToJson } from "../../src/gate/gate-engine.js";
import type { DetectedArtifact } from "../../src/gate/gate-types.js";
import type { LlmProvider, HealthResult, CompletionInput, CompletionResult } from "../../src/providers/provider.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

class MockGateProvider implements LlmProvider {
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
  insertStatement(db, { project_id: projectId, canon_version: "v1", text: "OS thesis", statement_type: "thesis", lifecycle: "accepted", hardness: "hard", scope: ["product"], artifact_types: [], tags: [], rationale: "core", confidence: 0.95, replacement_statement_id: null });
  freezeCanonVersion(db, projectId, "v1");
}

function mockAligned(provider: MockGateProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "strong", judgment: "Good", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "strong", judgment: "Good", confidence: 0.85, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "none", judgment: "None", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "strong", judgment: "Good", confidence: 0.85, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", { verdict: "aligned", summary: "Aligned.", preserved: [], drift_points: [], conflicts: [], uncertainties: [], suggestions: [] });
}

function mockDrift(provider: MockGateProvider) {
  provider.setResponse("review_thesis_preservation", { rating: "weak", judgment: "Lost", confidence: 0.8, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_pattern_fidelity", { rating: "weak", judgment: "Generic", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_anti_pattern_collision", { rating: "major", judgment: "Major", confidence: 0.9, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_voice_naming_fit", { rating: "weak", judgment: "Wrong", confidence: 0.7, evidence_statement_ids: [], notes: [] });
  provider.setResponse("review_synthesis", { verdict: "contradiction", summary: "Contradiction.", preserved: [], drift_points: [{ text: "Thesis broken", evidence_ids: [] }], conflicts: [{ text: "Major collision", evidence_ids: [] }], uncertainties: [], suggestions: [] });
}

describe("gate engine", () => {
  let db: Database.Database;
  let projectId: string;
  let provider: MockGateProvider;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
    setupCanon(db, projectId);
    provider = new MockGateProvider();
  });

  afterEach(() => { db.close(); });

  it("passes aligned artifacts", async () => {
    mockAligned(provider);
    const artifacts: DetectedArtifact[] = [
      { path: "/test/README.md", title: "README", artifact_type: "readme_section", body: "# Good content" },
    ];

    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts, mode: "required" });
    expect(result.overall).toBe("pass");
    expect(result.artifacts_passed).toBe(1);
  });

  it("blocks contradiction in required mode", async () => {
    mockDrift(provider);
    const artifacts: DetectedArtifact[] = [
      { path: "/test/README.md", title: "README", artifact_type: "readme_section", body: "# Bad content" },
    ];

    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts, mode: "required" });
    expect(result.overall).toBe("block");
    expect(result.artifacts_blocked).toBe(1);
    expect(result.results[0].repair_path).toBe("irreparable");
  });

  it("warns on contradiction in advisory mode", async () => {
    mockDrift(provider);
    const artifacts: DetectedArtifact[] = [
      { path: "/test/README.md", title: "README", artifact_type: "readme_section", body: "# Bad content" },
    ];

    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts, mode: "advisory" });
    expect(result.overall).toBe("warn");
    expect(result.artifacts_warned).toBe(1);
  });

  it("handles mixed results across multiple artifacts", async () => {
    // First call aligned, second call drifted
    let callCount = 0;
    const origComplete = provider.completeJson.bind(provider);
    provider.completeJson = async function<T>(input: CompletionInput): Promise<CompletionResult<T>> {
      // Switch responses based on call count
      if (input.task === "review_thesis_preservation") callCount++;
      if (callCount <= 1) {
        mockAligned(provider);
      } else {
        mockDrift(provider);
      }
      return origComplete(input);
    };

    mockAligned(provider); // Start with aligned

    const artifacts: DetectedArtifact[] = [
      { path: "/test/README.md", title: "README", artifact_type: "readme_section", body: "# Good" },
      { path: "/test/CHANGELOG.md", title: "CHANGELOG", artifact_type: "release_note", body: "# Bad" },
    ];

    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts, mode: "warn" });
    expect(result.artifacts_checked).toBe(2);
  });

  it("produces valid JSON output", async () => {
    mockAligned(provider);
    const artifacts: DetectedArtifact[] = [
      { path: "/test/README.md", title: "README", artifact_type: "readme_section", body: "# Content" },
    ];

    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts, mode: "advisory" });
    const json = gateResultToJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.overall).toBe("pass");
    expect(parsed.summary.checked).toBe(1);
    expect(parsed.artifacts).toHaveLength(1);
    expect(parsed.artifacts[0].verdict).toBe("aligned");
    expect(parsed.artifacts[0].gate).toBe("pass");
  });

  it("includes repair path in results", async () => {
    // Mock salvageable
    provider.setResponse("review_thesis_preservation", { rating: "mixed", judgment: "Partial", confidence: 0.7, evidence_statement_ids: [], notes: [] });
    provider.setResponse("review_pattern_fidelity", { rating: "weak", judgment: "Weak", confidence: 0.6, evidence_statement_ids: [], notes: [] });
    provider.setResponse("review_anti_pattern_collision", { rating: "minor", judgment: "Minor", confidence: 0.7, evidence_statement_ids: [], notes: [] });
    provider.setResponse("review_voice_naming_fit", { rating: "mixed", judgment: "Mixed", confidence: 0.6, evidence_statement_ids: [], notes: [] });
    provider.setResponse("review_synthesis", { verdict: "salvageable_drift", summary: "Salvageable.", preserved: [], drift_points: [{ text: "Drift", evidence_ids: [] }], conflicts: [], uncertainties: [], suggestions: [] });

    const artifacts: DetectedArtifact[] = [
      { path: "/test/README.md", title: "README", artifact_type: "readme_section", body: "# Drifted" },
    ];

    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts, mode: "required" });
    expect(result.results[0].repair_path).toBe("patch");
    expect(result.results[0].repair_available).toBe(true);
  });

  it("handles empty artifact list", async () => {
    const result = await runGate(db, provider, { projectId, canonVersion: "v1", artifacts: [], mode: "advisory" });
    expect(result.overall).toBe("pass");
    expect(result.artifacts_checked).toBe(0);
  });
});
