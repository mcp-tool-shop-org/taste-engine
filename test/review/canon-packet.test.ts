import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import { createProject, insertStatement, updateStatementLifecycle } from "../../src/canon/canon-store.js";
import { createCanonVersion } from "../../src/canon/canon-version.js";
import { createAcceptedTension } from "../../src/curation/curation-store.js";
import { buildCanonPacket, formatPacketForPrompt } from "../../src/review/canon-packet.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

function insertAcceptedStatement(db: Database.Database, projectId: string, overrides: Partial<{
  text: string; statement_type: string; hardness: string; scope: string[];
  artifact_types: string[]; tags: string[]; canon_version: string;
}> = {}) {
  return insertStatement(db, {
    project_id: projectId,
    canon_version: overrides.canon_version ?? "canon-v1",
    text: overrides.text ?? "Test statement",
    statement_type: (overrides.statement_type as any) ?? "thesis",
    lifecycle: "accepted",
    hardness: (overrides.hardness as any) ?? "hard",
    scope: (overrides.scope as any) ?? ["product"],
    artifact_types: (overrides.artifact_types as any) ?? [],
    tags: overrides.tags ?? [],
    rationale: "test",
    confidence: 0.9,
    replacement_statement_id: null,
  });
}

describe("canon packet builder", () => {
  let db: Database.Database;
  let projectId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
    projectId = createProject(db, "test", "Test", "Test project").id;
    createCanonVersion(db, projectId, "canon-v1");
  });

  afterEach(() => { db.close(); });

  it("always includes hard thesis statements", () => {
    const thesis = insertAcceptedStatement(db, projectId, {
      text: "This is the core thesis",
      statement_type: "thesis",
      hardness: "hard",
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    expect(packet.statements.length).toBe(1);
    expect(packet.statements[0].id).toBe(thesis.id);
    expect(packet.statements[0].selection_reason).toBe("hard_thesis");
  });

  it("includes artifact-type matching statements", () => {
    insertAcceptedStatement(db, projectId, {
      text: "README rules",
      artifact_types: ["readme_section"],
    });
    insertAcceptedStatement(db, projectId, {
      text: "CLI rules",
      artifact_types: ["cli_help"],
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    const texts = packet.statements.map((s) => s.text);
    expect(texts).toContain("README rules");
  });

  it("includes scope-matching statements", () => {
    insertAcceptedStatement(db, projectId, {
      text: "Architecture truth",
      statement_type: "pattern",
      hardness: "strong",
      scope: ["architecture"],
    });

    const packet = buildCanonPacket(db, projectId, null, "feature_brief", ["architecture"]);
    const texts = packet.statements.map((s) => s.text);
    expect(texts).toContain("Architecture truth");
  });

  it("includes hard/strong anti-patterns", () => {
    insertAcceptedStatement(db, projectId, {
      text: "Never frame as helper tool",
      statement_type: "anti_pattern",
      hardness: "hard",
    });
    insertAcceptedStatement(db, projectId, {
      text: "Soft anti-pattern",
      statement_type: "anti_pattern",
      hardness: "soft",
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    const antiPatterns = packet.statements.filter((s) => s.statement_type === "anti_pattern");
    expect(antiPatterns.some((s) => s.text === "Never frame as helper tool")).toBe(true);
  });

  it("includes voice/naming laws", () => {
    insertAcceptedStatement(db, projectId, {
      text: "Use operational language: spine, doctor, route",
      statement_type: "voice",
      hardness: "strong",
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "package_blurb", ["product"]);
    expect(packet.statements.some((s) => s.statement_type === "voice")).toBe(true);
  });

  it("excludes retired/superseded statements", () => {
    const s1 = insertAcceptedStatement(db, projectId, { text: "Old thesis" });
    updateStatementLifecycle(db, s1.id, "superseded");

    insertAcceptedStatement(db, projectId, { text: "New thesis" });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    expect(packet.statements.every((s) => s.text !== "Old thesis")).toBe(true);
  });

  it("includes accepted tensions", () => {
    insertAcceptedStatement(db, projectId, { text: "Thesis" });

    createAcceptedTension(db, {
      project_id: projectId,
      canon_version: "canon-v1",
      title: "Framing tension",
      description: "OS vs accessible",
      related_statement_ids: [],
      evidence_refs: [],
      resolution_note: "Both valid",
      severity: "medium",
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    expect(packet.tensions.length).toBe(1);
    expect(packet.items.some((i) => i.source_kind === "tension")).toBe(true);
  });

  it("enriches with tag overlap from candidate text", () => {
    insertAcceptedStatement(db, projectId, {
      text: "Routing is canonical",
      statement_type: "pattern",
      hardness: "strong",
      tags: ["routing"],
    });

    const packet = buildCanonPacket(
      db, projectId, "canon-v1", "feature_brief", ["product"],
      "This feature adds new routing capabilities",
    );

    expect(packet.statements.some((s) => s.tags.includes("routing"))).toBe(true);
  });

  it("caps packet size", () => {
    // Insert 30 statements
    for (let i = 0; i < 30; i++) {
      insertAcceptedStatement(db, projectId, {
        text: `Statement ${i}`,
        statement_type: "pattern",
        hardness: "soft",
        scope: ["product"],
      });
    }

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    expect(packet.statements.length).toBeLessThanOrEqual(20);
  });

  it("builds valid prompt text", () => {
    insertAcceptedStatement(db, projectId, {
      text: "Core thesis",
      statement_type: "thesis",
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    const text = formatPacketForPrompt(packet);

    expect(text).toContain("CANON STATEMENTS");
    expect(text).toContain("Core thesis");
    expect(text).toContain("[thesis]");
  });

  it("produces auditable packet items", () => {
    insertAcceptedStatement(db, projectId, { text: "Thesis", hardness: "hard" });
    insertAcceptedStatement(db, projectId, {
      text: "Anti-pattern",
      statement_type: "anti_pattern",
      hardness: "hard",
    });

    const packet = buildCanonPacket(db, projectId, "canon-v1", "readme_section", ["product"]);
    expect(packet.items.length).toBeGreaterThanOrEqual(2);
    expect(packet.items.every((i) => i.rank > 0)).toBe(true);
    expect(packet.items.every((i) => i.reason_selected !== "")).toBe(true);
  });
});
