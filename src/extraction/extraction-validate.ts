import { z } from "zod";
import {
  STATEMENT_TYPES,
  HARDNESS_LEVELS,
  SCOPES,
  ARTIFACT_TYPES,
} from "../core/enums.js";
import {
  PASS_TYPES,
  EXTRACTION_STATUSES,
  PASS_STATUSES,
  CANDIDATE_STATUSES,
  CONTRADICTION_SEVERITIES,
  CONTRADICTION_STATUSES,
} from "./extraction-types.js";

// ── LLM output validation ──────────────────────────────────────

export const LlmStatementCandidateSchema = z.object({
  text: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  suggested_hardness: z.string(),
  suggested_scope: z.array(z.string()),
  tags: z.array(z.string()),
  evidence_section: z.string(),
});

export const LlmPassOutputSchema = z.object({
  candidates: z.array(LlmStatementCandidateSchema),
});

export const LlmContradictionOutputSchema = z.object({
  contradictions: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      severity: z.string(),
      evidence_sections: z.array(z.string()),
    }),
  ),
});

export const LlmExemplarOutputSchema = z.object({
  exemplars: z.array(
    z.object({
      source_title: z.string().min(1),
      locator_kind: z.string(),
      locator_value: z.string().min(1),
      why_it_matters: z.string().min(1),
      candidate_traits: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

// ── Domain validation ──────────────────────────────────────────

export const ExtractedStatementCandidateSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  extraction_run_id: z.string().min(1),
  pass_type: z.enum(PASS_TYPES),
  text: z.string().min(1),
  statement_type: z.enum(STATEMENT_TYPES),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  suggested_hardness: z.enum(HARDNESS_LEVELS),
  suggested_scope: z.array(z.enum(SCOPES)).min(1),
  suggested_artifact_types: z.array(z.enum(ARTIFACT_TYPES)),
  tags: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  status: z.enum(CANDIDATE_STATUSES),
  merged_into_id: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export const ContradictionFindingSchema = z.object({
  id: z.string().min(1),
  extraction_run_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  conflicting_candidate_ids: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  severity: z.enum(CONTRADICTION_SEVERITIES),
  status: z.enum(CONTRADICTION_STATUSES),
  created_at: z.string().datetime({ offset: true }),
});

export const ExemplarNominationSchema = z.object({
  id: z.string().min(1),
  extraction_run_id: z.string().min(1),
  source_artifact_id: z.string().min(1),
  locator_kind: z.string().min(1),
  locator_value: z.string().min(1),
  why_it_matters: z.string().min(1),
  candidate_traits: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  created_at: z.string().datetime({ offset: true }),
});

export const ExtractionRunSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  source_artifact_ids: z.array(z.string()),
  provider: z.string().min(1),
  model: z.string().min(1),
  passes: z.array(z.enum(PASS_TYPES)),
  status: z.enum(EXTRACTION_STATUSES),
  started_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
});
