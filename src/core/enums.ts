export const STATEMENT_TYPES = [
  "thesis",
  "pattern",
  "anti_pattern",
  "boundary",
  "voice",
  "naming",
  "decision",
] as const;
export type StatementType = (typeof STATEMENT_TYPES)[number];

export const LIFECYCLE_STATES = [
  "proposed",
  "accepted",
  "superseded",
  "retired",
  "disputed",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const HARDNESS_LEVELS = [
  "hard",
  "strong",
  "soft",
  "experimental",
] as const;
export type HardnessLevel = (typeof HARDNESS_LEVELS)[number];

export const SCOPES = [
  "product",
  "docs",
  "cli",
  "architecture",
  "ux",
  "marketing",
  "naming",
] as const;
export type Scope = (typeof SCOPES)[number];

export const ARTIFACT_TYPES = [
  "readme_section",
  "package_blurb",
  "feature_brief",
  "cli_help",
  "release_note",
  "naming_proposal",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const SOURCE_ARTIFACT_TYPES = [
  "readme",
  "doc",
  "architecture_note",
  "release_note",
  "cli_help",
  "example_output",
  "negative_example",
] as const;
export type SourceArtifactType = (typeof SOURCE_ARTIFACT_TYPES)[number];

export const VERDICTS = [
  "aligned",
  "mostly_aligned",
  "salvageable_drift",
  "hard_drift",
  "contradiction",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const DIMENSION_RATINGS = ["strong", "mixed", "weak"] as const;
export type DimensionRating = (typeof DIMENSION_RATINGS)[number];

export const COLLISION_RATINGS = ["none", "minor", "major"] as const;
export type CollisionRating = (typeof COLLISION_RATINGS)[number];

export const OBSERVATION_KINDS = [
  "preserved",
  "drift",
  "conflict",
  "uncertainty",
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export const REVISION_ACTIONS = ["keep", "cut", "revise"] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];

export const LOCATOR_KINDS = [
  "line_range",
  "section",
  "heading",
  "excerpt",
] as const;
export type LocatorKind = (typeof LOCATOR_KINDS)[number];

export const EXTRACTION_METHODS = ["human", "ollama"] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];
