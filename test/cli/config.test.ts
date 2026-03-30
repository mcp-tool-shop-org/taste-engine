import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isInitialized,
  saveConfig,
  loadConfig,
  defaultConfig,
  tasteDir,
} from "../../src/cli/config.js";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "taste-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("not initialized in fresh directory", () => {
    expect(isInitialized(tempDir)).toBe(false);
  });

  it("saves and loads config", () => {
    const config = defaultConfig("role-os");
    saveConfig(tempDir, config);

    expect(isInitialized(tempDir)).toBe(true);

    const loaded = loadConfig(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.projectSlug).toBe("role-os");
    expect(loaded!.provider.kind).toBe("ollama");
    expect(loaded!.provider.model).toBe("qwen3:14b");
  });

  it("taste dir is .taste under root", () => {
    const dir = tasteDir(tempDir);
    expect(dir).toBe(join(tempDir, ".taste"));
  });

  it("default config uses expected defaults", () => {
    const config = defaultConfig("test-project");
    expect(config.projectSlug).toBe("test-project");
    expect(config.dbPath).toBe(".taste/taste.db");
    expect(config.canonDir).toBe("canon");
    expect(config.provider.baseUrl).toBe("http://127.0.0.1:11434");
  });

  it("returns null for missing config", () => {
    expect(loadConfig(tempDir)).toBeNull();
  });
});
