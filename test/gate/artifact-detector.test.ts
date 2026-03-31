import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectArtifacts } from "../../src/gate/artifact-detector.js";

describe("artifact detector", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "taste-detect-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects README as readme_section", () => {
    const path = join(tempDir, "README.md");
    writeFileSync(path, "# My Project\n\nDescription here.");
    const detected = detectArtifacts([path]);
    expect(detected.length).toBe(1);
    expect(detected[0].artifact_type).toBe("readme_section");
  });

  it("detects CHANGELOG as release_note", () => {
    const path = join(tempDir, "CHANGELOG.md");
    writeFileSync(path, "## v1.0.0\n\nInitial release.");
    const detected = detectArtifacts([path]);
    expect(detected.length).toBe(1);
    expect(detected[0].artifact_type).toBe("release_note");
  });

  it("detects package.json description as package_blurb", () => {
    const path = join(tempDir, "package.json");
    writeFileSync(path, JSON.stringify({ name: "test", description: "A test package" }));
    const detected = detectArtifacts([path]);
    expect(detected.length).toBe(1);
    expect(detected[0].artifact_type).toBe("package_blurb");
    expect(detected[0].body).toBe("A test package");
  });

  it("skips package.json without description", () => {
    const path = join(tempDir, "package.json");
    writeFileSync(path, JSON.stringify({ name: "test" }));
    const detected = detectArtifacts([path]);
    expect(detected.length).toBe(0);
  });

  it("detects feature-brief files", () => {
    const path = join(tempDir, "feature-brief.md");
    writeFileSync(path, "## Feature: Something\n\nDetails.");
    const detected = detectArtifacts([path]);
    expect(detected.length).toBe(1);
    expect(detected[0].artifact_type).toBe("feature_brief");
  });

  it("detects naming proposal files", () => {
    const path = join(tempDir, "naming-proposal.md");
    writeFileSync(path, "## Naming: Rename X\n\nRationale.");
    const detected = detectArtifacts([path]);
    expect(detected.length).toBe(1);
    expect(detected[0].artifact_type).toBe("naming_proposal");
  });

  it("ignores non-matching files", () => {
    writeFileSync(join(tempDir, "main.ts"), "console.log('hello')");
    writeFileSync(join(tempDir, "styles.css"), "body {}");
    writeFileSync(join(tempDir, "random.md"), "# Random\n\nNotes.");
    const detected = detectArtifacts([
      join(tempDir, "main.ts"),
      join(tempDir, "styles.css"),
      join(tempDir, "random.md"),
    ]);
    expect(detected.length).toBe(0);
  });

  it("ignores nonexistent files", () => {
    const detected = detectArtifacts([join(tempDir, "nonexistent.md")]);
    expect(detected.length).toBe(0);
  });

  it("detects multiple artifacts from a batch", () => {
    writeFileSync(join(tempDir, "README.md"), "# Project");
    writeFileSync(join(tempDir, "CHANGELOG.md"), "## v1.0");
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "x", description: "desc" }));
    writeFileSync(join(tempDir, "main.ts"), "code");

    const detected = detectArtifacts([
      join(tempDir, "README.md"),
      join(tempDir, "CHANGELOG.md"),
      join(tempDir, "package.json"),
      join(tempDir, "main.ts"),
    ]);
    expect(detected.length).toBe(3);
    const types = detected.map((d) => d.artifact_type).sort();
    expect(types).toEqual(["package_blurb", "readme_section", "release_note"]);
  });
});
