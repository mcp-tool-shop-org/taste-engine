import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initCommand } from "../../src/cli/commands/init.js";
import { isInitialized, loadConfig } from "../../src/cli/config.js";

describe("init --check", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), "taste-startup-")); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("initializes and runs doctor when --check is set", async () => {
    // This will initialize and then try to run doctor
    // Doctor will fail on Ollama (not running in test), but init should succeed
    await initCommand({ slug: "test-check", root: tempDir, check: true });

    expect(isInitialized(tempDir)).toBe(true);
    expect(existsSync(join(tempDir, ".taste", "taste.db"))).toBe(true);
  });

  it("shows next steps without --check", async () => {
    await initCommand({ slug: "test-steps", root: tempDir });
    expect(isInitialized(tempDir)).toBe(true);
  });
});
