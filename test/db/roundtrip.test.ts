import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { migrate } from "../../src/db/migrate.js";
import {
  createProject,
  getProject,
  insertStatement,
  getStatements,
  updateStatementLifecycle,
  updateStatementHardness,
  getStatementCounts,
} from "../../src/canon/canon-store.js";
import { createCanonVersion, getCurrentVersion, listVersions, freezeCanonVersion } from "../../src/canon/canon-version.js";
import { insertSourceArtifact, getSourceArtifacts, getSourceArtifactByHash } from "../../src/artifacts/source-artifacts.js";
import { insertEvidence, getEvidenceForStatement } from "../../src/artifacts/evidence.js";
import { insertCandidateArtifact, getCandidateArtifacts } from "../../src/artifacts/candidate-artifacts.js";
import { sha256 } from "../../src/util/hashing.js";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

describe("database roundtrips", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS_DIR);
  });

  afterEach(() => {
    db.close();
  });

  describe("projects", () => {
    it("creates and retrieves project", () => {
      const project = createProject(db, "role-os", "Role-OS", "Routing OS for roles");
      expect(project.project_slug).toBe("role-os");

      const fetched = getProject(db, "role-os");
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Role-OS");
    });

    it("returns null for missing project", () => {
      expect(getProject(db, "nonexistent")).toBeNull();
    });
  });

  describe("canon statements", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = createProject(db, "test", "Test", "Test project").id;
    });

    it("inserts and retrieves statement", () => {
      const stmt = insertStatement(db, {
        project_id: projectId,
        canon_version: null,
        text: "This product is an operating system, not a helper",
        statement_type: "thesis",
        lifecycle: "proposed",
        hardness: "hard",
        scope: ["product"],
        artifact_types: ["readme_section"],
        tags: ["identity"],
        rationale: "Core thesis",
        confidence: 0.9,
        replacement_statement_id: null,
      });

      expect(stmt.id).toBeTruthy();

      const all = getStatements(db, projectId);
      expect(all.length).toBe(1);
      expect(all[0].text).toBe("This product is an operating system, not a helper");
      expect(all[0].scope).toEqual(["product"]);
      expect(all[0].tags).toEqual(["identity"]);
    });

    it("filters by lifecycle", () => {
      insertStatement(db, {
        project_id: projectId,
        canon_version: null,
        text: "Proposed",
        statement_type: "thesis",
        lifecycle: "proposed",
        hardness: "hard",
        scope: ["product"],
        artifact_types: [],
        tags: [],
        rationale: null,
        confidence: null,
        replacement_statement_id: null,
      });
      insertStatement(db, {
        project_id: projectId,
        canon_version: null,
        text: "Accepted",
        statement_type: "thesis",
        lifecycle: "accepted",
        hardness: "hard",
        scope: ["product"],
        artifact_types: [],
        tags: [],
        rationale: null,
        confidence: null,
        replacement_statement_id: null,
      });

      const proposed = getStatements(db, projectId, { lifecycle: "proposed" });
      expect(proposed.length).toBe(1);
      expect(proposed[0].text).toBe("Proposed");

      const accepted = getStatements(db, projectId, { lifecycle: "accepted" });
      expect(accepted.length).toBe(1);
      expect(accepted[0].text).toBe("Accepted");
    });

    it("updates lifecycle with replacement", () => {
      const s1 = insertStatement(db, {
        project_id: projectId,
        canon_version: null,
        text: "Old thesis",
        statement_type: "thesis",
        lifecycle: "accepted",
        hardness: "hard",
        scope: ["product"],
        artifact_types: [],
        tags: [],
        rationale: null,
        confidence: null,
        replacement_statement_id: null,
      });
      const s2 = insertStatement(db, {
        project_id: projectId,
        canon_version: null,
        text: "New thesis",
        statement_type: "thesis",
        lifecycle: "accepted",
        hardness: "hard",
        scope: ["product"],
        artifact_types: [],
        tags: [],
        rationale: null,
        confidence: null,
        replacement_statement_id: null,
      });

      updateStatementLifecycle(db, s1.id, "superseded", s2.id);

      const all = getStatements(db, projectId, { lifecycle: "superseded" });
      expect(all.length).toBe(1);
      expect(all[0].replacement_statement_id).toBe(s2.id);
    });

    it("updates hardness independently of lifecycle", () => {
      const stmt = insertStatement(db, {
        project_id: projectId,
        canon_version: null,
        text: "Test",
        statement_type: "pattern",
        lifecycle: "accepted",
        hardness: "soft",
        scope: ["docs"],
        artifact_types: [],
        tags: [],
        rationale: null,
        confidence: null,
        replacement_statement_id: null,
      });

      updateStatementHardness(db, stmt.id, "hard");

      const all = getStatements(db, projectId);
      expect(all[0].lifecycle).toBe("accepted");
      expect(all[0].hardness).toBe("hard");
    });

    it("counts by lifecycle, hardness, and type", () => {
      insertStatement(db, {
        project_id: projectId, canon_version: null, text: "T1",
        statement_type: "thesis", lifecycle: "accepted", hardness: "hard",
        scope: ["product"], artifact_types: [], tags: [], rationale: null,
        confidence: null, replacement_statement_id: null,
      });
      insertStatement(db, {
        project_id: projectId, canon_version: null, text: "T2",
        statement_type: "anti_pattern", lifecycle: "proposed", hardness: "strong",
        scope: ["product"], artifact_types: [], tags: [], rationale: null,
        confidence: null, replacement_statement_id: null,
      });

      const counts = getStatementCounts(db, projectId);
      expect(counts.total).toBe(2);
      expect(counts.by_lifecycle.accepted).toBe(1);
      expect(counts.by_lifecycle.proposed).toBe(1);
      expect(counts.by_hardness.hard).toBe(1);
      expect(counts.by_hardness.strong).toBe(1);
      expect(counts.by_type.thesis).toBe(1);
      expect(counts.by_type.anti_pattern).toBe(1);
    });
  });

  describe("canon versions", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = createProject(db, "ver-test", "Version Test", "desc").id;
    });

    it("creates and lists versions", () => {
      createCanonVersion(db, projectId, "canon-v1");
      const versions = listVersions(db, projectId);
      expect(versions.length).toBe(1);
      expect(versions[0].version_label).toBe("canon-v1");
    });

    it("updates project current_version", () => {
      createCanonVersion(db, projectId, "canon-v1");
      const project = getProject(db, "ver-test");
      expect(project!.current_version).toBe("canon-v1");
    });

    it("freezes a version", () => {
      createCanonVersion(db, projectId, "canon-v1");
      freezeCanonVersion(db, projectId, "canon-v1");
      const current = getCurrentVersion(db, projectId);
      expect(current).not.toBeNull();
      expect(current!.frozen_at).not.toBeNull();
    });
  });

  describe("source artifacts", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = createProject(db, "src-test", "Source Test", "desc").id;
    });

    it("inserts with content hash", () => {
      const body = "# Role-OS\n\nAn operating system for roles.";
      const artifact = insertSourceArtifact(db, projectId, "README", "readme", body, "README.md");
      expect(artifact.content_hash).toBe(sha256(body));
    });

    it("retrieves by hash for dedup", () => {
      const body = "content";
      insertSourceArtifact(db, projectId, "Test", "doc", body);
      const found = getSourceArtifactByHash(db, projectId, sha256(body));
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Test");
    });

    it("returns null for unknown hash", () => {
      expect(getSourceArtifactByHash(db, projectId, "abc")).toBeNull();
    });
  });

  describe("evidence linkage", () => {
    let projectId: string;
    let statementId: string;
    let sourceId: string;

    beforeEach(() => {
      projectId = createProject(db, "ev-test", "Evidence Test", "desc").id;
      statementId = insertStatement(db, {
        project_id: projectId, canon_version: null, text: "thesis",
        statement_type: "thesis", lifecycle: "accepted", hardness: "hard",
        scope: ["product"], artifact_types: [], tags: [], rationale: null,
        confidence: null, replacement_statement_id: null,
      }).id;
      sourceId = insertSourceArtifact(db, projectId, "README", "readme", "body").id;
    });

    it("links evidence to statement and source", () => {
      insertEvidence(db, {
        statement_id: statementId,
        source_artifact_id: sourceId,
        locator: { kind: "heading", value: "## Thesis" },
        note: "First paragraph",
        extraction_method: "human",
        confidence: 0.95,
      });

      const evidence = getEvidenceForStatement(db, statementId);
      expect(evidence.length).toBe(1);
      expect(evidence[0].locator.kind).toBe("heading");
      expect(evidence[0].source_artifact_id).toBe(sourceId);
    });
  });

  describe("candidate artifacts", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = createProject(db, "ca-test", "Candidate Test", "desc").id;
    });

    it("inserts and retrieves candidates", () => {
      insertCandidateArtifact(db, projectId, "New README blurb", "readme_section", "Product description", "Role-OS helps you manage roles.");
      const all = getCandidateArtifacts(db, projectId);
      expect(all.length).toBe(1);
      expect(all[0].artifact_type).toBe("readme_section");
    });
  });
});
