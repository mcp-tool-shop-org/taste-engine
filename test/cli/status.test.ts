import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { statusCommand } from "../../src/cli/commands/status.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `taste-status-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("status command", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("reports on an empty portfolio without crashing", async () => {
    // Status should handle empty portfolios gracefully
    await statusCommand({ dir: tempDir });
    // If we get here without throwing, it works
    expect(true).toBe(true);
  });

  it("reports on a portfolio with a repo", async () => {
    // Create a minimal repo with .taste/
    const repoDir = join(tempDir, "test-repo");
    const tasteDir = join(repoDir, ".taste");
    mkdirSync(tasteDir, { recursive: true });
    writeFileSync(join(tasteDir, "taste.json"), JSON.stringify({
      projectSlug: "test-repo",
      dbPath: ".taste/taste.db",
      canonDir: "canon",
      provider: { kind: "ollama", baseUrl: "http://127.0.0.1:11434", model: "test" },
    }));

    await statusCommand({ dir: tempDir });
    expect(true).toBe(true);
  });
});
