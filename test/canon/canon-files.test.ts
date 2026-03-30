import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeCanonFile, readCanonFile, listCanonFiles } from "../../src/canon/canon-files.js";

describe("canon files", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "taste-canon-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and reads a valid canon file", () => {
    writeCanonFile(tempDir, "role-os", "Role-OS", "canon-v1", [], [], 0);
    const file = readCanonFile(tempDir, "role-os", "canon-v1");
    expect(file).not.toBeNull();
    expect(file!.project.slug).toBe("role-os");
    expect(file!.project.version).toBe("canon-v1");
    expect(file!.statements).toEqual([]);
    expect(file!.evidence).toEqual([]);
    expect(file!.metadata.source_count).toBe(0);
  });

  it("returns null for missing file", () => {
    const file = readCanonFile(tempDir, "nonexistent", "v1");
    expect(file).toBeNull();
  });

  it("rejects malformed canon file on read", () => {
    // Write garbage
    const { writeFileSync } = require("node:fs");
    writeFileSync(join(tempDir, "bad-v1.json"), JSON.stringify({ garbage: true }));

    expect(() => readCanonFile(tempDir, "bad", "v1")).toThrow();
  });

  it("lists canon files", () => {
    writeCanonFile(tempDir, "a", "A", "v1", [], [], 0);
    writeCanonFile(tempDir, "b", "B", "v2", [], [], 0);
    const files = listCanonFiles(tempDir);
    expect(files.length).toBe(2);
    expect(files).toContain("a-v1.json");
    expect(files).toContain("b-v2.json");
  });

  it("returns empty list for missing directory", () => {
    const files = listCanonFiles(join(tempDir, "nonexistent"));
    expect(files).toEqual([]);
  });

  it("creates directory if it does not exist", () => {
    const nested = join(tempDir, "deep", "nested");
    writeCanonFile(nested, "test", "Test", "v1", [], [], 0);
    const file = readCanonFile(nested, "test", "v1");
    expect(file).not.toBeNull();
  });
});
