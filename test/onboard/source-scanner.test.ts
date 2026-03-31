import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanForSources } from "../../src/onboard/source-scanner.js";

describe("source scanner", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), "taste-scan-")); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("finds README as high priority", () => {
    writeFileSync(join(tempDir, "README.md"), "# Project");
    const sources = scanForSources(tempDir);
    const readme = sources.find((s) => s.path.includes("README.md"));
    expect(readme).toBeDefined();
    expect(readme!.priority).toBe("high");
    expect(readme!.inferred_type).toBe("readme");
  });

  it("finds CHANGELOG as medium priority", () => {
    writeFileSync(join(tempDir, "CHANGELOG.md"), "## v1.0");
    const sources = scanForSources(tempDir);
    expect(sources.some((s) => s.inferred_type === "release_note")).toBe(true);
  });

  it("finds anti-patterns doc as high priority", () => {
    writeFileSync(join(tempDir, "ANTI-PATTERNS.md"), "# Anti-Patterns");
    const sources = scanForSources(tempDir);
    const ap = sources.find((s) => s.inferred_type === "negative_example");
    expect(ap).toBeDefined();
    expect(ap!.priority).toBe("high");
  });

  it("finds architecture doc as high priority", () => {
    writeFileSync(join(tempDir, "architecture.md"), "# Architecture");
    const sources = scanForSources(tempDir);
    expect(sources.some((s) => s.priority === "high" && s.inferred_type === "architecture_note")).toBe(true);
  });

  it("scans docs/ directory", () => {
    mkdirSync(join(tempDir, "docs"));
    writeFileSync(join(tempDir, "docs", "FITNESS-CONSTITUTION.md"), "# Constitution");
    writeFileSync(join(tempDir, "docs", "PACKET-LAW.md"), "# Law");
    const sources = scanForSources(tempDir);
    expect(sources.filter((s) => s.path.includes("docs")).length).toBe(2);
  });

  it("skips translation READMEs", () => {
    writeFileSync(join(tempDir, "README.md"), "# Project");
    writeFileSync(join(tempDir, "README.ja.md"), "# Japanese");
    writeFileSync(join(tempDir, "README.zh.md"), "# Chinese");
    const sources = scanForSources(tempDir);
    expect(sources.length).toBe(1); // Only main README
  });

  it("sorts by priority", () => {
    writeFileSync(join(tempDir, "README.md"), "# Main");
    writeFileSync(join(tempDir, "CHANGELOG.md"), "## v1");
    writeFileSync(join(tempDir, "notes.md"), "# Notes");
    const sources = scanForSources(tempDir);
    expect(sources[0].priority).toBe("high");
  });

  it("returns empty for empty directory", () => {
    expect(scanForSources(tempDir)).toEqual([]);
  });

  it("detects package.json description", () => {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test", description: "A test tool" }));
    const sources = scanForSources(tempDir);
    expect(sources.some((s) => s.inferred_type === "package_description")).toBe(true);
  });
});
