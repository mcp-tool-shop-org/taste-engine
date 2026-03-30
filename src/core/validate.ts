import { z } from "zod";
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
} from "./enums.js";

// ── Shared ─────────────────────────────────────────────────────

const isoDatetime = z.string().datetime({ offset: true });
const nonEmptyString = z.string().min(1);
const confidence = z.number().min(0).max(1).nullable();

// ── Project Canon ──────────────────────────────────────────────

export const ProjectCanonSchema = z.object({
  id: nonEmptyString,
  project_slug: nonEmptyString,
  name: nonEmptyString,
  summary: nonEmptyString,
  current_version: z.string().nullable(),
  created_at: isoDatetime,
  updated_at: isoDatetime,
});

// ── Canon Statement ────────────────────────────────────────────

export const CanonStatementSchema = z.object({
  id: nonEmptyString,
  project_id: nonEmptyString,
  canon_version: z.string().nullable(),

  text: nonEmptyString,
  statement_type: z.enum(STATEMENT_TYPES),

  lifecycle: z.enum(LIFECYCLE_STATES),
  hardness: z.enum(HARDNESS_LEVELS),

  scope: z.array(z.enum(SCOPES)).min(1),
  artifact_types: z.array(z.enum(ARTIFACT_TYPES)),

  tags: z.array(z.string()),
  rationale: z.string().nullable(),
  confidence: confidence,

  replacement_statement_id: z.string().nullable(),
  created_at: isoDatetime,
  updated_at: isoDatetime,
});

// ── Evidence ───────────────────────────────────────────────────

export const EvidenceLocatorSchema = z.object({
  kind: z.enum(LOCATOR_KINDS),
  value: nonEmptyString,
});

export const EvidenceRefSchema = z.object({
  id: nonEmptyString,
  statement_id: z.string().nullable(),
  source_artifact_id: nonEmptyString,

  locator: EvidenceLocatorSchema,

  note: z.string().nullable(),
  extraction_method: z.enum(EXTRACTION_METHODS),
  confidence: confidence,
});

// ── Source Artifact ─────────────────────────────────────────────

export const SourceArtifactSchema = z.object({
  id: nonEmptyString,
  project_id: nonEmptyString,

  title: nonEmptyString,
  artifact_type: z.enum(SOURCE_ARTIFACT_TYPES),

  path: z.string().nullable(),
  content_hash: nonEmptyString,
  body: nonEmptyString,

  created_at: isoDatetime,
  updated_at: isoDatetime,
});

// ── Candidate Artifact ──────────────────────────────────────────

export const CandidateArtifactSchema = z.object({
  id: nonEmptyString,
  project_id: nonEmptyString,

  title: nonEmptyString,
  artifact_type: z.enum(ARTIFACT_TYPES),

  intended_purpose: nonEmptyString,
  body: nonEmptyString,
  created_at: isoDatetime,
});

// ── Alignment Review ───────────────────────────────────────────

export const AlignmentReviewSchema = z.object({
  id: nonEmptyString,
  project_id: nonEmptyString,
  candidate_artifact_id: nonEmptyString,
  canon_version: nonEmptyString,

  verdict: z.enum(VERDICTS),

  thesis_preservation: z.enum(DIMENSION_RATINGS),
  pattern_fidelity: z.enum(DIMENSION_RATINGS),
  anti_pattern_collision: z.enum(COLLISION_RATINGS),
  voice_naming_fit: z.enum(DIMENSION_RATINGS),

  summary: nonEmptyString,
  created_at: isoDatetime,
});

// ── Review Observation ──────────────────────────────────────────

export const ReviewObservationSchema = z.object({
  id: nonEmptyString,
  review_id: nonEmptyString,
  kind: z.enum(OBSERVATION_KINDS),
  text: nonEmptyString,
});

// ── Revision Suggestion ─────────────────────────────────────────

export const RevisionSuggestionSchema = z.object({
  id: nonEmptyString,
  review_id: nonEmptyString,
  action: z.enum(REVISION_ACTIONS),
  target_excerpt: z.string().nullable(),
  guidance: nonEmptyString,
});

// ── Config ──────────────────────────────────────────────────────

export const TasteConfigSchema = z.object({
  projectSlug: nonEmptyString,
  dbPath: nonEmptyString,
  canonDir: nonEmptyString,
  provider: z.object({
    kind: z.literal("ollama"),
    baseUrl: z.string().url(),
    model: nonEmptyString,
  }),
});

// ── Canon JSON file ─────────────────────────────────────────────

export const CanonFileSchema = z.object({
  project: z.object({
    slug: nonEmptyString,
    name: nonEmptyString,
    version: nonEmptyString,
  }),
  statements: z.array(CanonStatementSchema),
  evidence: z.array(EvidenceRefSchema),
  metadata: z.object({
    generated_at: isoDatetime,
    source_count: z.number().int().min(0),
  }),
});

export type CanonFile = z.infer<typeof CanonFileSchema>;
