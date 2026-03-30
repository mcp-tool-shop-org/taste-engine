import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initCommand } from "../../src/cli/commands/init.js";
import { ingestCommand } from "../../src/cli/commands/ingest.js";
import { openDb, closeDb } from "../../src/db/sqlite.js";
import { getProject } from "../../src/canon/canon-store.js";
import { getSourceArtifacts } from "../../src/artifacts/source-artifacts.js";

describe("ingest command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "taste-ingest-"));
    await initCommand({ slug: "test-project", root: tempDir });
  });

  afterEach(() => {
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ingests a markdown file", async () => {
    const readmePath = join(tempDir, "README.md");
    writeFileSync(readmePath, "# Test Project\n\nA routing OS.");

    await ingestCommand({ paths: [readmePath], root: tempDir });

    const db = openDb(join(tempDir, ".taste", "taste.db"));
    const project = getProject(db, "test-project")!;
    const artifacts = getSourceArtifacts(db, project.id);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].artifact_type).toBe("readme");
    expect(artifacts[0].body).toContain("routing OS");
    closeDb();
  });

  it("skips duplicate files", async () => {
    const readmePath = join(tempDir, "README.md");
    writeFileSync(readmePath, "# Test\n\nSame content.");

    await ingestCommand({ paths: [readmePath], root: tempDir });
    closeDb();
    await ingestCommand({ paths: [readmePath], root: tempDir });

    const db = openDb(join(tempDir, ".taste", "taste.db"));
    const project = getProject(db, "test-project")!;
    const artifacts = getSourceArtifacts(db, project.id);
    expect(artifacts.length).toBe(1);
    closeDb();
  });

  it("ingests a directory of markdown files", async () => {
    const docsDir = join(tempDir, "docs");
    require("node:fs").mkdirSync(docsDir);
    writeFileSync(join(docsDir, "arch.md"), "# Architecture\n\nStrict core.");
    writeFileSync(join(docsDir, "help.md"), "# CLI Help\n\nUsage info.");

    await ingestCommand({ paths: [docsDir], root: tempDir });

    const db = openDb(join(tempDir, ".taste", "taste.db"));
    const project = getProject(db, "test-project")!;
    const artifacts = getSourceArtifacts(db, project.id);
    expect(artifacts.length).toBe(2);
    closeDb();
  });

  it("infers artifact type from filename", async () => {
    writeFileSync(join(tempDir, "CHANGELOG.md"), "# Changelog\n\nv1.0.0");
    writeFileSync(join(tempDir, "architecture.md"), "# Architecture\n\nDesign.");
    writeFileSync(join(tempDir, "general.md"), "# General\n\nDocs.");

    await ingestCommand({
      paths: [
        join(tempDir, "CHANGELOG.md"),
        join(tempDir, "architecture.md"),
        join(tempDir, "general.md"),
      ],
      root: tempDir,
    });

    const db = openDb(join(tempDir, ".taste", "taste.db"));
    const project = getProject(db, "test-project")!;
    const artifacts = getSourceArtifacts(db, project.id);

    const types = new Map(artifacts.map((a) => [a.title, a.artifact_type]));
    expect(types.get("CHANGELOG")).toBe("release_note");
    expect(types.get("architecture")).toBe("architecture_note");
    expect(types.get("general")).toBe("doc");
    closeDb();
  });
});
