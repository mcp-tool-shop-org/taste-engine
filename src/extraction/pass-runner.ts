import type Database from "better-sqlite3";
import type { LlmProvider } from "../providers/provider.js";
import type { SourceArtifact } from "../core/types.js";
import type {
  PassType,
  ExtractedStatementCandidate,
  ContradictionFinding,
  ExemplarNomination,
  LlmPassOutput,
  LlmContradictionOutput,
  LlmExemplarOutput,
} from "./extraction-types.js";
import type { StatementType, HardnessLevel, Scope, ArtifactType } from "../core/enums.js";
import {
  HARDNESS_LEVELS,
  SCOPES,
  ARTIFACT_TYPES,
} from "../core/enums.js";
import {
  LlmPassOutputSchema,
  LlmContradictionOutputSchema,
  LlmExemplarOutputSchema,
} from "./extraction-validate.js";
import {
  insertCandidate,
  insertContradiction,
  insertExemplar,
  updatePassResult,
} from "./extraction-store.js";
import { getPassPrompt, buildSourceBlock } from "./prompts.js";
import { now } from "../util/timestamps.js";

// ── Retry helpers ─────────────────────────────────────────────

/** Errors that are worth retrying (LLM gave bad output, not a network failure). */
export function isRetryableError(error: string): boolean {
  return error.includes("Malformed JSON") || error.includes("Invalid LLM output");
}

/** Sleep for ms, used for exponential backoff between retries. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff durations: 1s, 2s, 4s, ... */
function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt);
}

/** Map pass type to the statement type it produces. */
const PASS_TO_STATEMENT_TYPE: Record<string, StatementType> = {
  thesis: "thesis",
  pattern: "pattern",
  anti_pattern: "anti_pattern",
  decision: "decision",
  boundary: "boundary",
  // voice_naming can produce "voice" or "naming" — handled specially
};

export type PassRunResult = {
  passType: PassType;
  candidateCount: number;
  contradictionCount: number;
  exemplarCount: number;
  errors: string[];
};

/**
 * Run a single extraction pass against source artifacts.
 */
export async function runPass(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    passId: string;
    passType: PassType;
    runId: string;
    projectId: string;
    sources: SourceArtifact[];
    retries?: number;
  },
): Promise<PassRunResult> {
  const { passId, passType, runId, projectId, sources } = opts;
  const maxRetries = opts.retries ?? 0;
  const errors: string[] = [];
  const ts = now();

  updatePassResult(db, passId, { status: "running", started_at: ts });

  const prompt = getPassPrompt(passType);
  const sourceBlock = buildSourceBlock(
    sources.map((s) => ({ title: s.title, body: s.body })),
  );
  const filledPrompt = prompt.promptTemplate.replace("{{sources}}", sourceBlock);

  // Handle different pass types
  if (passType === "contradiction") {
    return runContradictionPass(db, provider, { passId, runId, projectId, system: prompt.system, prompt: filledPrompt, errors, retries: maxRetries });
  }

  if (passType === "exemplar") {
    return runExemplarPass(db, provider, { passId, runId, projectId, sources, system: prompt.system, prompt: filledPrompt, errors, retries: maxRetries });
  }

  // Standard statement extraction pass (with retry)
  let lastError: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs(attempt - 1);
      console.log(`  [${passType}] retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }

    const result = await provider.completeJson<LlmPassOutput>({
      task: `${passType}_extraction`,
      system: prompt.system,
      prompt: filledPrompt,
      schemaName: "LlmPassOutput",
    });

    if (!result.ok) {
      lastError = result.error;
      if (isRetryableError(result.error) && attempt < maxRetries) {
        continue;
      }
      errors.push(result.error);
      updatePassResult(db, passId, {
        status: "failed",
        completed_at: now(),
        error_count: 1,
        error_detail: result.error,
      });
      return { passType, candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors };
    }

    // Validate LLM output
    const parsed = LlmPassOutputSchema.safeParse(result.data);
    if (!parsed.success) {
      const msg = `Invalid LLM output: ${parsed.error.message}`;
      lastError = msg;
      if (attempt < maxRetries) {
        continue;
      }
      errors.push(msg);
      updatePassResult(db, passId, {
        status: "failed",
        completed_at: now(),
        error_count: 1,
        error_detail: msg,
      });
      return { passType, candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors };
    }

    // Success — break out of retry loop with valid parsed data
    lastError = undefined;

    let candidateCount = 0;
    for (const raw of parsed.data.candidates) {
      let stmtType: StatementType;
      if (passType === "voice_naming") {
        stmtType = raw.text.toLowerCase().includes("naming") || raw.text.toLowerCase().includes("name") ? "naming" : "voice";
      } else {
        stmtType = PASS_TO_STATEMENT_TYPE[passType] ?? "thesis";
      }

      const genericPenalty = isGenericStatement(raw.text) ? 0.3 : 0;
      const adjustedConfidence = Math.max(0, Math.min(1, raw.confidence - genericPenalty));

      insertCandidate(db, {
        project_id: projectId,
        extraction_run_id: runId,
        pass_type: passType,
        text: raw.text,
        statement_type: stmtType,
        rationale: raw.rationale,
        confidence: adjustedConfidence,
        suggested_hardness: normalizeHardness(raw.suggested_hardness),
        suggested_scope: normalizeScopes(raw.suggested_scope),
        suggested_artifact_types: [],
        tags: raw.tags,
        evidence_refs: raw.evidence_section ? [raw.evidence_section] : [],
        status: "proposed",
        merged_into_id: null,
      });
      candidateCount++;
    }

    updatePassResult(db, passId, {
      status: "completed",
      completed_at: now(),
      candidate_count: candidateCount,
      error_count: errors.length,
    });

    return { passType, candidateCount, contradictionCount: 0, exemplarCount: 0, errors };
  }

  // Should not reach here, but safety net
  errors.push(lastError ?? "Unknown error after retries");
  updatePassResult(db, passId, {
    status: "failed",
    completed_at: now(),
    error_count: 1,
    error_detail: lastError ?? "Unknown error after retries",
  });
  return { passType, candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors };
}

// ── Contradiction pass ─────────────────────────────────────────

async function runContradictionPass(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    passId: string;
    runId: string;
    projectId: string;
    system: string;
    prompt: string;
    errors: string[];
    retries?: number;
  },
): Promise<PassRunResult> {
  const maxRetries = opts.retries ?? 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs(attempt - 1);
      console.log(`  [contradiction] retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }

    const result = await provider.completeJson<LlmContradictionOutput>({
      task: "contradiction_detection",
      system: opts.system,
      prompt: opts.prompt,
      schemaName: "LlmContradictionOutput",
    });

    if (!result.ok) {
      if (isRetryableError(result.error) && attempt < maxRetries) {
        continue;
      }
      opts.errors.push(result.error);
      updatePassResult(db, opts.passId, {
        status: "failed",
        completed_at: now(),
        error_count: 1,
        error_detail: result.error,
      });
      return { passType: "contradiction", candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors: opts.errors };
    }

    const parsed = LlmContradictionOutputSchema.safeParse(result.data);
    if (!parsed.success) {
      const msg = `Invalid LLM output: ${parsed.error.message}`;
      if (attempt < maxRetries) {
        continue;
      }
      opts.errors.push(msg);
      updatePassResult(db, opts.passId, {
        status: "failed",
        completed_at: now(),
        error_count: 1,
        error_detail: msg,
      });
      return { passType: "contradiction", candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors: opts.errors };
    }

    let count = 0;
    for (const raw of parsed.data.contradictions) {
      const severity = (["low", "medium", "high"] as const).includes(raw.severity as any)
        ? (raw.severity as "low" | "medium" | "high")
        : "medium";

      insertContradiction(db, {
        extraction_run_id: opts.runId,
        title: raw.title,
        description: raw.description,
        conflicting_candidate_ids: [],
        evidence_refs: raw.evidence_sections,
        severity,
        status: "open",
      });
      count++;
    }

    updatePassResult(db, opts.passId, {
      status: "completed",
      completed_at: now(),
      candidate_count: count,
      error_count: opts.errors.length,
    });

    return { passType: "contradiction", candidateCount: 0, contradictionCount: count, exemplarCount: 0, errors: opts.errors };
  }

  // Safety net
  opts.errors.push("Unknown error after retries");
  return { passType: "contradiction", candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors: opts.errors };
}

// ── Exemplar pass ──────────────────────────────────────────────

async function runExemplarPass(
  db: Database.Database,
  provider: LlmProvider,
  opts: {
    passId: string;
    runId: string;
    projectId: string;
    sources: SourceArtifact[];
    system: string;
    prompt: string;
    errors: string[];
    retries?: number;
  },
): Promise<PassRunResult> {
  const maxRetries = opts.retries ?? 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs(attempt - 1);
      console.log(`  [exemplar] retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }

    const result = await provider.completeJson<LlmExemplarOutput>({
      task: "exemplar_nomination",
      system: opts.system,
      prompt: opts.prompt,
      schemaName: "LlmExemplarOutput",
    });

    if (!result.ok) {
      if (isRetryableError(result.error) && attempt < maxRetries) {
        continue;
      }
      opts.errors.push(result.error);
      updatePassResult(db, opts.passId, {
        status: "failed",
        completed_at: now(),
        error_count: 1,
        error_detail: result.error,
      });
      return { passType: "exemplar", candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors: opts.errors };
    }

    const parsed = LlmExemplarOutputSchema.safeParse(result.data);
    if (!parsed.success) {
      const msg = `Invalid LLM output: ${parsed.error.message}`;
      if (attempt < maxRetries) {
        continue;
      }
      opts.errors.push(msg);
      updatePassResult(db, opts.passId, {
        status: "failed",
        completed_at: now(),
        error_count: 1,
        error_detail: msg,
      });
      return { passType: "exemplar", candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors: opts.errors };
    }

    // Match exemplar source_title to actual source artifacts
    const sourceMap = new Map(opts.sources.map((s) => [s.title.toLowerCase(), s.id]));
    let count = 0;

    for (const raw of parsed.data.exemplars) {
      const sourceId = sourceMap.get(raw.source_title.toLowerCase());
      if (!sourceId) {
        opts.errors.push(`Exemplar references unknown source: "${raw.source_title}"`);
        continue;
      }

      insertExemplar(db, {
        extraction_run_id: opts.runId,
        source_artifact_id: sourceId,
        locator_kind: raw.locator_kind,
        locator_value: raw.locator_value,
        why_it_matters: raw.why_it_matters,
        candidate_traits: raw.candidate_traits,
        confidence: raw.confidence,
      });
      count++;
    }

    updatePassResult(db, opts.passId, {
      status: "completed",
      completed_at: now(),
      candidate_count: count,
      error_count: opts.errors.length,
    });

    return { passType: "exemplar", candidateCount: 0, contradictionCount: 0, exemplarCount: count, errors: opts.errors };
  }

  // Safety net
  opts.errors.push("Unknown error after retries");
  return { passType: "exemplar", candidateCount: 0, contradictionCount: 0, exemplarCount: 0, errors: opts.errors };
}

// ── Helpers ────────────────────────────────────────────────────

/** Detect suspiciously generic statements. */
export function isGenericStatement(text: string): boolean {
  const lower = text.toLowerCase();
  const genericPatterns = [
    /^the (?:tool|product|system|software) (?:is|provides|offers) (?:powerful|flexible|robust|efficient|user-friendly|comprehensive)/,
    /^(?:this|the) (?:tool|product|system) (?:helps|enables|allows|provides|offers)/,
    /values? (?:quality|reliability|performance|simplicity)/,
    /^(?:it|this) is (?:a |an )?(?:great|good|excellent|comprehensive)/,
    /designed to be (?:easy|simple|intuitive)/,
  ];
  return genericPatterns.some((p) => p.test(lower));
}

function normalizeHardness(raw: string): HardnessLevel {
  const lower = raw.toLowerCase();
  if ((HARDNESS_LEVELS as readonly string[]).includes(lower)) return lower as HardnessLevel;
  return "soft";
}

function normalizeScopes(raw: string[]): Scope[] {
  const validScopes = raw
    .map((s) => s.toLowerCase())
    .filter((s) => (SCOPES as readonly string[]).includes(s)) as Scope[];
  return validScopes.length > 0 ? validScopes : ["product"];
}
