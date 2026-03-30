import type { Verdict, DimensionRating, CollisionRating } from "../core/enums.js";
import type { DimensionEvaluation, LlmSynthesisOutput } from "./review-run-types.js";

export type VerdictInput = {
  thesis_preservation: DimensionRating;
  pattern_fidelity: DimensionRating;
  anti_pattern_collision: CollisionRating;
  voice_naming_fit: DimensionRating;
};

/**
 * Deterministic verdict synthesis from dimension ratings.
 *
 * This is rule-backed, not model-decided. The model provides dimension
 * ratings; this function maps them to the verdict ladder.
 */
export function synthesizeVerdict(input: VerdictInput): Verdict {
  const { thesis_preservation, pattern_fidelity, anti_pattern_collision, voice_naming_fit } = input;

  // === contradiction ===
  // Explicit contradiction of hard canon
  if (thesis_preservation === "weak" && anti_pattern_collision === "major") {
    return "contradiction";
  }

  // === hard_drift ===
  // Thesis lost or major anti-pattern collision
  if (thesis_preservation === "weak") {
    return "hard_drift";
  }
  if (anti_pattern_collision === "major") {
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
    return "mostly_aligned";
  }
  if (pattern_fidelity === "weak") {
    return "mostly_aligned";
  }
  if (voice_naming_fit === "weak") {
    return "mostly_aligned";
  }
  if (pattern_fidelity === "mixed" || voice_naming_fit === "mixed") {
    return "mostly_aligned";
  }

  // === aligned ===
  // Everything strong/none
  return "aligned";
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
 *
 * If the model suggests a more severe verdict than the rules produce,
 * we note it as an uncertainty. We never upgrade severity on model
 * suggestion alone — the rules are the truth.
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
