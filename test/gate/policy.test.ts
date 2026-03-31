import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/migrate.js";
import { createProject } from "../../src/canon/canon-store.js";
import { loadPolicy, savePolicy, getModeForArtifact, shouldSkip, recordOverride, getOverrides } from "../../src/gate/policy.js";
import { DEFAULT_POLICY } from "../../src/gate/policy-types.js";
import type { GatePolicy, SurfacePolicy } from "../../src/gate/policy-types.js";
import type { DetectedArtifact } from "../../src/gate/gate-types.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("gate policy", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), "taste-policy-")); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("returns default policy when file missing", () => {
    const policy = loadPolicy(tempDir);
    expect(policy.default_mode).toBe("advisory");
    expect(policy.surfaces).toEqual([]);
  });

  it("saves and loads policy", () => {
    const policy: GatePolicy = {
      canon_version: "canon-v1",
      default_mode: "warn",
      surfaces: [
        { artifact_type: "package_blurb", mode: "required", globs: [] },
      ],
      skip_globs: ["vendor/*"],
      require_override_receipts: true,
    };
    savePolicy(tempDir, policy);

    const loaded = loadPolicy(tempDir);
    expect(loaded.default_mode).toBe("warn");
    expect(loaded.surfaces.length).toBe(1);
    expect(loaded.surfaces[0].mode).toBe("required");
    expect(loaded.require_override_receipts).toBe(true);
  });

  it("getModeForArtifact returns surface override", () => {
    const policy: GatePolicy = {
      ...DEFAULT_POLICY,
      default_mode: "advisory",
      surfaces: [
        { artifact_type: "package_blurb", mode: "required", globs: [] },
        { artifact_type: "release_note", mode: "warn", globs: [] },
      ],
    };

    const blurb: DetectedArtifact = { path: "/pkg.json", title: "pkg", artifact_type: "package_blurb", body: "desc" };
    const release: DetectedArtifact = { path: "/CHANGELOG.md", title: "CL", artifact_type: "release_note", body: "v1" };
    const readme: DetectedArtifact = { path: "/README.md", title: "README", artifact_type: "readme_section", body: "hi" };

    expect(getModeForArtifact(policy, blurb)).toBe("required");
    expect(getModeForArtifact(policy, release)).toBe("warn");
    expect(getModeForArtifact(policy, readme)).toBe("advisory"); // falls through to default
  });

  it("shouldSkip matches skip globs", () => {
    const policy: GatePolicy = { ...DEFAULT_POLICY, skip_globs: ["vendor/", "dist/"] };
    expect(shouldSkip(policy, "vendor/README.md")).toBe(true);
    expect(shouldSkip(policy, "dist/bundle.md")).toBe(true);
    expect(shouldSkip(policy, "src/README.md")).toBe(false);
  });
});

describe("override receipts", () => {
  let db: Database.Database;
  let projectId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test").id;
  });
  afterEach(() => { db.close(); });

  it("records and retrieves override", () => {
    const override = recordOverride(db, {
      project_id: projectId,
      artifact_path: "README.md",
      artifact_type: "readme_section",
      original_verdict: "hard_drift",
      original_gate_result: "block",
      action: "bypass",
      reason: "Shipping under deadline pressure, will fix in next sprint",
      follow_up_artifact_id: null,
    });

    expect(override.id).toBeTruthy();
    expect(override.action).toBe("bypass");

    const all = getOverrides(db, projectId);
    expect(all.length).toBe(1);
    expect(all[0].reason).toContain("deadline");
  });

  it("records defer_repair action", () => {
    recordOverride(db, {
      project_id: projectId,
      artifact_path: "package.json",
      artifact_type: "package_blurb",
      original_verdict: "salvageable_drift",
      original_gate_result: "warn",
      action: "defer_repair",
      reason: "Will revise after canon update",
      follow_up_artifact_id: null,
    });

    const all = getOverrides(db, projectId);
    expect(all[0].action).toBe("defer_repair");
  });

  it("returns empty when no overrides exist", () => {
    const all = getOverrides(db, projectId);
    expect(all).toEqual([]);
  });
});
