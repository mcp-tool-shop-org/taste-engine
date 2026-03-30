import { describe, it, expect } from "vitest";
import {
  STATEMENT_TYPES,
  LIFECYCLE_STATES,
  HARDNESS_LEVELS,
  SCOPES,
  ARTIFACT_TYPES,
  SOURCE_ARTIFACT_TYPES,
  VERDICTS,
  DIMENSION_RATINGS,
  COLLISION_RATINGS,
  OBSERVATION_KINDS,
  REVISION_ACTIONS,
  LOCATOR_KINDS,
  EXTRACTION_METHODS,
} from "../../src/core/enums.js";

describe("enums", () => {
  it("statement types include all 7 canon truth types", () => {
    expect(STATEMENT_TYPES).toContain("thesis");
    expect(STATEMENT_TYPES).toContain("pattern");
    expect(STATEMENT_TYPES).toContain("anti_pattern");
    expect(STATEMENT_TYPES).toContain("boundary");
    expect(STATEMENT_TYPES).toContain("voice");
    expect(STATEMENT_TYPES).toContain("naming");
    expect(STATEMENT_TYPES).toContain("decision");
    expect(STATEMENT_TYPES.length).toBe(7);
  });

  it("lifecycle states include all 5 states", () => {
    expect(LIFECYCLE_STATES).toEqual(["proposed", "accepted", "superseded", "retired", "disputed"]);
  });

  it("hardness levels include all 4 levels", () => {
    expect(HARDNESS_LEVELS).toEqual(["hard", "strong", "soft", "experimental"]);
  });

  it("scopes cover all product areas", () => {
    expect(SCOPES.length).toBe(7);
    expect(SCOPES).toContain("product");
    expect(SCOPES).toContain("cli");
    expect(SCOPES).toContain("naming");
  });

  it("artifact types cover Phase 0 targets", () => {
    expect(ARTIFACT_TYPES).toContain("readme_section");
    expect(ARTIFACT_TYPES).toContain("feature_brief");
    expect(ARTIFACT_TYPES).toContain("cli_help");
    expect(ARTIFACT_TYPES).toContain("release_note");
    expect(ARTIFACT_TYPES.length).toBe(6);
  });

  it("verdicts form the full ladder", () => {
    expect(VERDICTS).toEqual([
      "aligned",
      "mostly_aligned",
      "salvageable_drift",
      "hard_drift",
      "contradiction",
    ]);
  });

  it("dimension ratings are strong/mixed/weak", () => {
    expect(DIMENSION_RATINGS).toEqual(["strong", "mixed", "weak"]);
  });

  it("collision ratings are none/minor/major", () => {
    expect(COLLISION_RATINGS).toEqual(["none", "minor", "major"]);
  });

  it("source artifact types include negative examples", () => {
    expect(SOURCE_ARTIFACT_TYPES).toContain("negative_example");
    expect(SOURCE_ARTIFACT_TYPES).toContain("readme");
  });

  it("extraction methods are human and ollama", () => {
    expect(EXTRACTION_METHODS).toEqual(["human", "ollama"]);
  });

  it("locator kinds cover all evidence reference styles", () => {
    expect(LOCATOR_KINDS).toEqual(["line_range", "section", "heading", "excerpt"]);
  });

  it("observation kinds cover all review categories", () => {
    expect(OBSERVATION_KINDS).toEqual(["preserved", "drift", "conflict", "uncertainty"]);
  });

  it("revision actions are keep/cut/revise", () => {
    expect(REVISION_ACTIONS).toEqual(["keep", "cut", "revise"]);
  });
});
