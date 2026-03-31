import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backupRepo, backupPortfolio, restoreBackup, exportState, importState } from "../../src/backup/backup-engine.js";
import type { StateExport } from "../../src/backup/backup-engine.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `taste-backup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("backup-engine", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  describe("backupRepo", () => {
    it("backs up .taste/ and canon/ files", () => {
      const repoDir = join(tempDir, "my-repo");
      const tasteDir = join(repoDir, ".taste");
      const canonDir = join(repoDir, "canon");
      mkdirSync(tasteDir, { recursive: true });
      mkdirSync(canonDir, { recursive: true });

      writeFileSync(join(tasteDir, "taste.json"), '{"projectSlug":"test"}');
      writeFileSync(join(tasteDir, "gate-policy.json"), '{"default_mode":"advisory"}');
      writeFileSync(join(canonDir, "statements.json"), '[{"id":"s1"}]');

      const outputDir = join(tempDir, "backups");
      const { manifest, backupDir } = backupRepo(repoDir, outputDir);

      expect(manifest.version).toBe("1");
      expect(manifest.contents.length).toBe(3);
      expect(existsSync(join(backupDir, "backup-manifest.json"))).toBe(true);
      expect(existsSync(join(backupDir, ".taste", "taste.json"))).toBe(true);
      expect(existsSync(join(backupDir, "canon", "statements.json"))).toBe(true);
    });

    it("throws if no .taste directory", () => {
      const repoDir = join(tempDir, "empty-repo");
      mkdirSync(repoDir, { recursive: true });
      const outputDir = join(tempDir, "backups");
      expect(() => backupRepo(repoDir, outputDir)).toThrow("No .taste directory");
    });
  });

  describe("backupPortfolio", () => {
    it("backs up portfolio-level files and per-repo state", () => {
      const portfolioDir = join(tempDir, "portfolio");
      mkdirSync(portfolioDir, { recursive: true });

      // Portfolio-level files
      writeFileSync(join(portfolioDir, "org-actions.json"), "[]");
      writeFileSync(join(portfolioDir, "watchtower-snapshots.json"), "[]");

      // Repo with .taste/
      const repoDir = join(portfolioDir, "repo-a");
      mkdirSync(join(repoDir, ".taste"), { recursive: true });
      writeFileSync(join(repoDir, ".taste", "taste.json"), '{}');

      const outputDir = join(tempDir, "backups");
      const { manifest } = backupPortfolio(portfolioDir, outputDir);

      expect(manifest.contents.length).toBeGreaterThanOrEqual(3);
      const kinds = manifest.contents.map((e) => e.kind);
      expect(kinds).toContain("actions");
      expect(kinds).toContain("snapshots");
      expect(kinds).toContain("config");
    });
  });

  describe("restoreBackup", () => {
    it("restores files from backup to target", () => {
      // Create source repo
      const repoDir = join(tempDir, "source");
      mkdirSync(join(repoDir, ".taste"), { recursive: true });
      writeFileSync(join(repoDir, ".taste", "taste.json"), '{"original":true}');

      // Back it up
      const outputDir = join(tempDir, "backups");
      const { backupDir } = backupRepo(repoDir, outputDir);

      // Modify original
      writeFileSync(join(repoDir, ".taste", "taste.json"), '{"modified":true}');

      // Restore
      const { restored, skipped } = restoreBackup(backupDir, repoDir);

      expect(restored.length).toBe(1);
      expect(skipped.length).toBe(0);

      const content = JSON.parse(readFileSync(join(repoDir, ".taste", "taste.json"), "utf-8"));
      expect(content.original).toBe(true);
    });

    it("supports dry run", () => {
      const repoDir = join(tempDir, "source");
      mkdirSync(join(repoDir, ".taste"), { recursive: true });
      writeFileSync(join(repoDir, ".taste", "taste.json"), '{"original":true}');

      const outputDir = join(tempDir, "backups");
      const { backupDir } = backupRepo(repoDir, outputDir);

      writeFileSync(join(repoDir, ".taste", "taste.json"), '{"modified":true}');

      const { restored } = restoreBackup(backupDir, repoDir, { dryRun: true });

      expect(restored.length).toBe(1);
      expect(restored[0]).toContain("overwrite");

      // File should NOT have been restored
      const content = JSON.parse(readFileSync(join(repoDir, ".taste", "taste.json"), "utf-8"));
      expect(content.modified).toBe(true);
    });
  });

  describe("exportState / importState", () => {
    it("round-trips portfolio state", () => {
      const portfolioDir = join(tempDir, "portfolio");
      mkdirSync(portfolioDir, { recursive: true });

      // Set up state
      writeFileSync(join(portfolioDir, "org-actions.json"), JSON.stringify([{ id: "a1", kind: "promote" }]));
      writeFileSync(join(portfolioDir, "watchtower-snapshots.json"), JSON.stringify([{ id: "s1" }]));

      const repoDir = join(portfolioDir, "repo-a");
      mkdirSync(join(repoDir, ".taste"), { recursive: true });
      writeFileSync(join(repoDir, ".taste", "gate-policy.json"), JSON.stringify({ default_mode: "warn" }));

      // Export
      const state = exportState(portfolioDir);
      expect(state.policies.length).toBe(1);
      expect(state.actions.length).toBe(1);
      expect(state.snapshots.length).toBe(1);

      // Clear state
      writeFileSync(join(portfolioDir, "org-actions.json"), "[]");
      writeFileSync(join(repoDir, ".taste", "gate-policy.json"), '{"default_mode":"advisory"}');

      // Import
      const { applied } = importState(portfolioDir, state);
      expect(applied.length).toBe(3);

      // Verify restored
      const restoredPolicy = JSON.parse(readFileSync(join(repoDir, ".taste", "gate-policy.json"), "utf-8"));
      expect(restoredPolicy.default_mode).toBe("warn");

      const restoredActions = JSON.parse(readFileSync(join(portfolioDir, "org-actions.json"), "utf-8"));
      expect(restoredActions.length).toBe(1);
    });

    it("supports dry run import", () => {
      const portfolioDir = join(tempDir, "portfolio");
      mkdirSync(portfolioDir, { recursive: true });
      writeFileSync(join(portfolioDir, "org-actions.json"), "[]");

      const state: StateExport = {
        version: "1",
        exported_at: new Date().toISOString(),
        source_dir: portfolioDir,
        policies: [],
        actions: [{ id: "a1" }],
        snapshots: [],
      };

      const { applied } = importState(portfolioDir, state, { dryRun: true });
      expect(applied.length).toBe(1);

      // File should NOT have changed
      const content = readFileSync(join(portfolioDir, "org-actions.json"), "utf-8");
      expect(content).toBe("[]");
    });
  });
});
