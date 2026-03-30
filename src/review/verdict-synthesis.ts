import type { Verdict, DimensionRating, CollisionRating } from "../core/enums.js";
import type { DimensionEvaluation, LlmSynthesisOutput } from "./review-run-types.js";

export type VerdictInput = {
  thesis_preservation: DimensionRating;
  pattern_fidelity: DimensionRating;
  anti_pattern_collision: CollisionRating;
  voice_naming_fit: DimensionRating;
};

/**
 * Optional context signals that influence verdict calibration.
 * These come from the candidate artifact and canon packet analysis.
 */
export type VerdictContext = {
  /** Does the candidate text contain category-collapse reframing? */
  category_collapse_detected: boolean;
  /** Is the primary problem naming/voice rather than thesis? */
  naming_only_violation: boolean;
  /** Does the candidate preserve the core product motion in recoverable form? */
  core_motion_recoverable: boolean;
};

const DEFAULT_CONTEXT: VerdictContext = {
  category_collapse_detected: false,
  naming_only_violation: false,
  core_motion_recoverable: false,
};

/**
 * Deterministic verdict synthesis from dimension ratings.
 *
 * This is rule-backed, not model-decided. The model provides dimension
 * ratings; this function maps them to the verdict ladder.
 *
 * Four calibration rules (from proving run feedback):
 * 1. Salvageability gate: core_motion_recoverable caps at salvageable_drift
 * 2. Category-collapse detector: assistant/helper reframing escalates
 * 3. Naming-law vs thesis separation: naming-only violations cap at hard_drift
 * 4. Relaxed aligned threshold: strong thesis + none collision = aligned even with mixed secondary
 */
export function synthesizeVerdict(input: VerdictInput, context?: VerdictContext): Verdict {
  const { thesis_preservation, pattern_fidelity, anti_pattern_collision, voice_naming_fit } = input;
  const ctx = context ?? DEFAULT_CONTEXT;

  // Count weak dimensions for severity assessment
  const weakCount = [thesis_preservation, pattern_fidelity, voice_naming_fit]
    .filter((r) => r === "weak").length;

  // === contradiction ===
  // Requires: thesis explicitly broken AND major anti-pattern collision
  // Fix 1: salvageability gate — if core motion is recoverable, cap at hard_drift
  if (thesis_preservation === "weak" && anti_pattern_collision === "major") {
    if (ctx.core_motion_recoverable) {
      return "hard_drift";
    }
    // Fix 3: naming-only violations don't reach contradiction
    if (ctx.naming_only_violation) {
      return "hard_drift";
    }
    return "contradiction";
  }

  // === hard_drift ===
  // Thesis lost OR major anti-pattern collision
  if (thesis_preservation === "weak") {
    // Fix 1: salvageability gate
    if (ctx.core_motion_recoverable) {
      return "salvageable_drift";
    }
    return "hard_drift";
  }

  if (anti_pattern_collision === "major") {
    // Fix 3: naming-only violation with major collision caps at hard_drift, not contradiction
    // Fix 1: if recoverable, cap at salvageable
    if (ctx.core_motion_recoverable) {
      return "salvageable_drift";
    }
    return "hard_drift";
  }

  // Fix 2: category-collapse detector escalates salvageable to hard_drift
  // If the artifact reframes the product as assistant/helper/prompt-library
  // but dimensions only show mixed/minor, the real severity is higher
  if (ctx.category_collapse_detected && thesis_preservation === "mixed") {
    return "hard_drift";
  }

  // === salvageable_drift ===
  // Core idea compatible but significant problems
  if (thesis_preservation === "mixed" && anti_pattern_collision === "minor") {
    return "salvageable_drift";
  }
  if (thesis_preservation === "mixed" && voice_naming_fit === "weak") {
    return "salvageable_drift";
  }
  if (pattern_fidelity === "weak" && voice_naming_fit === "weak") {
    return "salvageable_drift";
  }
  if (thesis_preservation === "mixed" && pattern_fidelity === "weak") {
    return "salvageable_drift";
  }

  // === mostly_aligned ===
  // Major canon holds but some weak points
  if (thesis_preservation === "mixed") {
    return "mostly_aligned";
  }
  if (anti_pattern_collision === "minor") {
    // Fix 4: if thesis is strong and everything else is strong,
    // minor anti-pattern scent alone doesn't block aligned
    if (thesis_preservation === "strong" && pattern_fidelity === "strong" && voice_naming_fit === "strong") {
      return "aligned";
    }
    return "mostly_aligned";
  }
  if (pattern_fidelity === "weak") {
    return "mostly_aligned";
  }
  if (voice_naming_fit === "weak") {
    return "mostly_aligned";
  }

  // Fix 4: mixed secondary dimensions with strong thesis = mostly_aligned still,
  // but aligned is reachable when thesis is strong + collision none + at most one mixed
  if (thesis_preservation === "strong" && anti_pattern_collision === "none") {
    const mixedCount = [pattern_fidelity, voice_naming_fit].filter((r) => r === "mixed").length;
    if (mixedCount <= 1) {
      return "aligned";
    }
  }

  if (pattern_fidelity === "mixed" || voice_naming_fit === "mixed") {
    return "mostly_aligned";
  }

  // === aligned ===
  return "aligned";
}

/**
 * Detect category-collapse reframing in candidate text.
 *
 * Returns true if the text reframes the product into a fundamentally
 * different category (assistant, helper, prompt library, persona pack,
 * chat tool) that dissolves the operating-system / routing / execution identity.
 */
export function detectCategoryCollapse(candidateText: string): boolean {
  const lower = candidateText.toLowerCase();
  const collapsePatterns = [
    /(?:like|having|is)\s+(?:a\s+)?(?:smart|helpful|friendly)\s+assistant/,
    /(?:just|simply)\s+(?:tell|describe|ask)\s+.*(?:does? the rest|handles? (?:everything|it all))/,
    /(?:copy|paste|pick)\s+.*(?:persona|prompt|template)/,
    /(?:collection|library|catalog)\s+of\s+(?:ai\s+)?(?:persona|prompt|template|helper)/,
    /(?:ai[- ]?powered|intelligent)\s+(?:prompt|persona|chat)\s+(?:management|coordination|platform)/,
    /(?:replace|remove|drop|eliminate)\s+.*(?:structured|evidence|verdict|contract|mission|routing)/,
    /chat[- ]?first\s+(?:experience|approach|interface)/,
    /no\s+(?:need\s+for|configuration|commands)\s+.*(?:just|simply)/,
  ];

  return collapsePatterns.some((p) => p.test(lower));
}

/**
 * Detect if the primary violation is naming/voice rather than thesis.
 *
 * Returns true when voice/naming is the weakest dimension but thesis
 * preservation is not weak — meaning the product identity is intact
 * but the language is wrong.
 */
export function detectNamingOnlyViolation(input: VerdictInput): boolean {
  return (
    input.voice_naming_fit === "weak" &&
    input.thesis_preservation !== "weak" &&
    input.pattern_fidelity !== "weak"
  );
}

/**
 * Heuristic for whether the core product motion is still recoverable.
 *
 * Returns true if the candidate is doing something the product would do
 * (routing, organizing work, coordinating roles) even if the framing is wrong.
 * Returns false if the candidate replaces the product motion entirely
 * (copy-paste personas, chat-only, no structure).
 */
export function detectRecoverableMotion(candidateText: string): boolean {
  const lower = candidateText.toLowerCase();

  // Positive signals: the artifact is still about the right product motions
  // Note: patterns must avoid matching product name "Role-OS" or "Role OS"
  const recoverableSignals = [
    /(?:route|routing|assign|dispatch|coordinate|organize)\s/,
    /(?:roles?\s+(?:contract|chain|selection|routing|boundary)|team\s+pack|workflow\s+(?:stage|step)|mission\s+(?:type|runner))/,
    /(?:review|verify|validate|evidence)\s+(?:item|requirement|verdict)/,
    /(?:handoff|escalat|structured\s+(?:output|evidence))/,
  ];

  // Strong negative signals: the artifact has replaced the product motion entirely
  const replacementSignals = [
    /(?:just|simply)\s+(?:copy|paste|pick|browse|select)\s+.*(?:go|done|instant)/,
    /no\s+(?:need|configuration|commands|structure|routing)/,
    /(?:replace|remove|eliminate)\s+.*(?:cli|command|structured|step)/,
  ];

  const hasRecoverable = recoverableSignals.some((p) => p.test(lower));
  const hasReplacement = replacementSignals.some((p) => p.test(lower));

  // Recoverable if positive signals present and not fully replaced
  return hasRecoverable && !hasReplacement;
}

/**
 * Build verdict context from candidate text and dimension ratings.
 */
export function buildVerdictContext(
  candidateText: string,
  ratings: VerdictInput,
): VerdictContext {
  return {
    category_collapse_detected: detectCategoryCollapse(candidateText),
    naming_only_violation: detectNamingOnlyViolation(ratings),
    core_motion_recoverable: detectRecoverableMotion(candidateText),
  };
}

/**
 * Extract dimension ratings from evaluations, with fallback defaults.
 */
export function extractRatings(evals: DimensionEvaluation[]): VerdictInput {
  const get = (dim: string, fallback: string) => {
    const e = evals.find((ev) => ev.dimension === dim);
    return (e?.rating ?? fallback) as any;
  };

  return {
    thesis_preservation: get("thesis_preservation", "mixed"),
    pattern_fidelity: get("pattern_fidelity", "mixed"),
    anti_pattern_collision: get("anti_pattern_collision", "minor"),
    voice_naming_fit: get("voice_naming_fit", "mixed"),
  };
}

/**
 * Apply model's suggested verdict as a soft signal, but trust
 * deterministic synthesis as the authority.
 */
export function reconcileVerdict(
  ruleVerdict: Verdict,
  modelVerdict: string | undefined,
): { verdict: Verdict; uncertainty?: string } {
  if (!modelVerdict) return { verdict: ruleVerdict };

  const ladder = ["aligned", "mostly_aligned", "salvageable_drift", "hard_drift", "contradiction"];
  const ruleIdx = ladder.indexOf(ruleVerdict);
  const modelIdx = ladder.indexOf(modelVerdict);

  if (modelIdx < 0) return { verdict: ruleVerdict };

  if (modelIdx > ruleIdx) {
    return {
      verdict: ruleVerdict,
      uncertainty: `Model suggested "${modelVerdict}" but rules produced "${ruleVerdict}". Dimension ratings may not capture all nuance.`,
    };
  }

  return { verdict: ruleVerdict };
}
