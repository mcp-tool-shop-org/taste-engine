import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAction,
  previewAction,
  applyAction,
  rollbackAction,
  getActions,
  getActionHistory,
} from "../../src/org/org-actions.js";
import { savePolicy, loadPolicy } from "../../src/gate/policy.js";
import { DEFAULT_POLICY } from "../../src/gate/policy-types.js";
import { writeJson } from "../../src/util/json.js";

function setupRepoDir(portfolioDir: string, slug: string, surfaces: Array<{ artifact_type: string; mode: string }> = []) {
  const repoDir = join(portfolioDir, slug);
  const tasteDir = join(repoDir, ".taste");
  mkdirSync(tasteDir, { recursive: true });

  writeJson(join(tasteDir, "taste.json"), {
    projectSlug: slug, dbPath: ".taste/taste.db", canonDir: "canon",
    provider: { kind: "ollama", baseUrl: "http://127.0.0.1:11434", model: "test" },
  });

  const policy = {
    ...DEFAULT_POLICY,
    surfaces: surfaces.map((s) => ({ artifact_type: s.artifact_type, mode: s.mode, globs: [] })),
  };
  savePolicy(tasteDir, policy);
}

describe("org actions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "taste-actions-"));
    setupRepoDir(tempDir, "test-repo", [
      { artifact_type: "package_blurb", mode: "warn" },
      { artifact_type: "naming_proposal", mode: "warn" },
    ]);
  });

  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  describe("createAction", () => {
    it("creates a proposed action", () => {
      const action = createAction(tempDir, {
        kind: "promote", repo_slug: "test-repo", surface: "package_blurb",
        from_mode: "warn", to_mode: "required",
        reason: "Strong canon, 0 overrides", evidence: "Org queue",
      });
      expect(action.status).toBe("proposed");
      expect(action.id).toBeTruthy();
    });

    it("persists actions to file", () => {
      createAction(tempDir, {
        kind: "promote", repo_slug: "test-repo", surface: "package_blurb",
        from_mode: "warn", to_mode: "required", reason: "test", evidence: "test",
      });
      const actions = getActions(tempDir);
      expect(actions.length).toBe(1);
    });
  });

  describe("previewAction", () => {
    it("shows current and proposed mode", () => {
      const preview = previewAction(tempDir, "test-repo", "package_blurb", "required");
      expect(preview.current_policy_mode).toBe("warn");
      expect(preview.proposed_mode).toBe("required");
      expect(preview.policy_diff).toContain("warn → required");
    });

    it("warns when already at target mode", () => {
      const preview = previewAction(tempDir, "test-repo", "package_blurb", "warn");
      expect(preview.warnings.some((w) => w.includes("already"))).toBe(true);
    });
  });

  describe("applyAction", () => {
    it("applies promotion and updates policy", () => {
      const action = createAction(tempDir, {
        kind: "promote", repo_slug: "test-repo", surface: "package_blurb",
        from_mode: "warn", to_mode: "required", reason: "test", evidence: "test",
      });

      const result = applyAction(tempDir, action.id);
      expect(result.success).toBe(true);
      expect(result.receipt).not.toBeNull();

      // Verify policy was updated
      const policy = loadPolicy(join(tempDir, "test-repo", ".taste"));
      const surface = policy.surfaces.find((s) => s.artifact_type === "package_blurb");
      expect(surface?.mode).toBe("required");

      // Action is marked applied
      const actions = getActions(tempDir, { status: "applied" });
      expect(actions.length).toBe(1);
    });

    it("rejects already-applied action", () => {
      const action = createAction(tempDir, {
        kind: "promote", repo_slug: "test-repo", surface: "package_blurb",
        from_mode: "warn", to_mode: "required", reason: "test", evidence: "test",
      });
      applyAction(tempDir, action.id);
      const result = applyAction(tempDir, action.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not proposed");
    });
  });

  describe("rollbackAction", () => {
    it("reverts policy to previous mode", () => {
      const action = createAction(tempDir, {
        kind: "promote", repo_slug: "test-repo", surface: "package_blurb",
        from_mode: "warn", to_mode: "required", reason: "test", evidence: "test",
      });
      applyAction(tempDir, action.id);

      const result = rollbackAction(tempDir, action.id, "False positive pressure");
      expect(result.success).toBe(true);

      // Policy reverted
      const policy = loadPolicy(join(tempDir, "test-repo", ".taste"));
      const surface = policy.surfaces.find((s) => s.artifact_type === "package_blurb");
      expect(surface?.mode).toBe("warn");

      // Action marked rolled back
      const actions = getActions(tempDir, { status: "rolled_back" });
      expect(actions.length).toBe(1);
      expect(actions[0].rollback_reason).toBe("False positive pressure");
    });
  });

  describe("action history", () => {
    it("returns actions in reverse chronological order", () => {
      createAction(tempDir, { kind: "promote", repo_slug: "a", surface: "x", from_mode: "advisory", to_mode: "warn", reason: "first", evidence: "" });
      createAction(tempDir, { kind: "promote", repo_slug: "b", surface: "y", from_mode: "advisory", to_mode: "warn", reason: "second", evidence: "" });

      const history = getActionHistory(tempDir);
      expect(history.length).toBe(2);
    });
  });

  describe("enrichment actions", () => {
    it("creates enrichment task action", () => {
      const action = createAction(tempDir, {
        kind: "enrichment_task", repo_slug: "test-repo", surface: null,
        from_mode: null, to_mode: null,
        reason: "Missing voice/naming canon", evidence: "Org alert",
      });
      expect(action.kind).toBe("enrichment_task");
      expect(action.surface).toBeNull();
    });
  });
});
