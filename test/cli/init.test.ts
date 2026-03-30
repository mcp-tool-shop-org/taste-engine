import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initCommand } from "../../src/cli/commands/init.js";
import { isInitialized, loadConfig } from "../../src/cli/config.js";

describe("init command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "taste-init-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("initializes a fresh project", async () => {
    await initCommand({ slug: "role-os", name: "Role-OS", root: tempDir });

    expect(isInitialized(tempDir)).toBe(true);
    expect(existsSync(join(tempDir, ".taste", "taste.db"))).toBe(true);
    expect(existsSync(join(tempDir, "canon"))).toBe(true);

    const config = loadConfig(tempDir);
    expect(config!.projectSlug).toBe("role-os");
  });

  it("is idempotent", async () => {
    await initCommand({ slug: "test", root: tempDir });
    // Should not throw or error on second run
    await initCommand({ slug: "test", root: tempDir });
    expect(isInitialized(tempDir)).toBe(true);
  });

  it("uses slug as name when name not provided", async () => {
    await initCommand({ slug: "my-project", root: tempDir });
    const config = loadConfig(tempDir);
    expect(config!.projectSlug).toBe("my-project");
  });
});
