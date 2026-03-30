import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate, currentVersion } from "../../src/db/migrate.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("migrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
  });

  it("applies migrations cleanly", () => {
    const count = migrate(db, MIGRATIONS_DIR);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(currentVersion(db)).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent", () => {
    migrate(db, MIGRATIONS_DIR);
    const count = migrate(db, MIGRATIONS_DIR);
    expect(count).toBe(0);
    expect(currentVersion(db)).toBeGreaterThanOrEqual(1);
  });

  it("creates all expected tables", () => {
    migrate(db, MIGRATIONS_DIR);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);

    expect(tables).toContain("projects");
    expect(tables).toContain("canon_versions");
    expect(tables).toContain("canon_statements");
    expect(tables).toContain("source_artifacts");
    expect(tables).toContain("evidence_refs");
    expect(tables).toContain("candidate_artifacts");
    expect(tables).toContain("alignment_reviews");
    expect(tables).toContain("review_observations");
    expect(tables).toContain("revision_suggestions");
    expect(tables).toContain("_migrations");
  });

  it("currentVersion returns 0 for fresh db", () => {
    expect(currentVersion(db)).toBe(0);
  });
});
