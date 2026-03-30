import type { Dimension } from "./review-run-types.js";

const BASE_SYSTEM = `You are a canon alignment reviewer for a taste-judgment system.
Your job is to evaluate a candidate artifact against specific canon statements.

Rules:
- Judge ONLY the dimension you are asked about.
- Reference specific canon statement IDs in your evidence.
- Use the product's own language, not generic critique language.
- Be specific: quote or reference the candidate text that supports your judgment.
- Confidence reflects how clearly the canon supports your judgment.
- Output JSON only. No markdown or explanation outside the JSON.`;

export type DimensionPromptConfig = {
  system: string;
  promptTemplate: string;
};

const DIMENSION_PROMPTS: Record<Dimension, DimensionPromptConfig> = {
  thesis_preservation: {
    system: `${BASE_SYSTEM}

DIMENSION: Thesis Preservation
Evaluate whether the candidate preserves what the product fundamentally IS.
- Does it maintain the product's identity framing?
- Does it accidentally reframe the product into a weaker or different category?
- Is there explicit contradiction of hard thesis statements?
- Rate as: strong (thesis fully preserved), mixed (partially preserved), weak (thesis lost or contradicted)`,

    promptTemplate: `Evaluate THESIS PRESERVATION for this candidate artifact.

=== CANDIDATE ===
Type: {{artifactType}}
Purpose: {{purpose}}
---
{{candidateBody}}
---

{{canonPacket}}

Respond with JSON:
{
  "rating": "strong|mixed|weak",
  "judgment": "2-3 sentences explaining your rating",
  "confidence": 0.0-1.0,
  "evidence_statement_ids": ["IDs of canon statements that support this judgment"],
  "notes": ["specific observations"]
}`,
  },

  pattern_fidelity: {
    system: `${BASE_SYSTEM}

DIMENSION: Pattern Fidelity
Evaluate whether the candidate uses native product structures or generic substitutes.
- Does it preserve the repo's recurring architectural/naming/workflow patterns?
- Does it use native structures or fall back to generic alternatives?
- Rate as: strong (native patterns used), mixed (some native, some generic), weak (mostly generic patterns)`,

    promptTemplate: `Evaluate PATTERN FIDELITY for this candidate artifact.

=== CANDIDATE ===
Type: {{artifactType}}
Purpose: {{purpose}}
---
{{candidateBody}}
---

{{canonPacket}}

Respond with JSON:
{
  "rating": "strong|mixed|weak",
  "judgment": "2-3 sentences explaining your rating",
  "confidence": 0.0-1.0,
  "evidence_statement_ids": ["IDs of canon statements that support this judgment"],
  "notes": ["specific observations"]
}`,
  },

  anti_pattern_collision: {
    system: `${BASE_SYSTEM}

DIMENSION: Anti-Pattern Collision
Evaluate whether the candidate reproduces known wrong shapes for this product.
- Does it accidentally drift toward patterns the product explicitly rejects?
- Is the collision minor (surface-level) or major (structural drift)?
- Rate as: none (no collision), minor (surface-level echo), major (structural drift into rejected patterns)`,

    promptTemplate: `Evaluate ANTI-PATTERN COLLISION for this candidate artifact.

=== CANDIDATE ===
Type: {{artifactType}}
Purpose: {{purpose}}
---
{{candidateBody}}
---

{{canonPacket}}

Respond with JSON:
{
  "rating": "none|minor|major",
  "judgment": "2-3 sentences explaining your rating",
  "confidence": 0.0-1.0,
  "evidence_statement_ids": ["IDs of canon statements that support this judgment"],
  "notes": ["specific observations"]
}`,
  },

  voice_naming_fit: {
    system: `${BASE_SYSTEM}

DIMENSION: Voice & Naming Fit
Evaluate whether the candidate sounds like this product.
- Does it preserve naming conventions and signature vocabulary?
- Does it slip into generic helper language or wrong naming?
- Does the framing match the product's voice law?
- Rate as: strong (sounds native), mixed (partially native), weak (sounds generic or foreign)`,

    promptTemplate: `Evaluate VOICE & NAMING FIT for this candidate artifact.

=== CANDIDATE ===
Type: {{artifactType}}
Purpose: {{purpose}}
---
{{candidateBody}}
---

{{canonPacket}}

Respond with JSON:
{
  "rating": "strong|mixed|weak",
  "judgment": "2-3 sentences explaining your rating",
  "confidence": 0.0-1.0,
  "evidence_statement_ids": ["IDs of canon statements that support this judgment"],
  "notes": ["specific observations"]
}`,
  },
};

export function getDimensionPrompt(dimension: Dimension): DimensionPromptConfig {
  return DIMENSION_PROMPTS[dimension];
}

/** Fill template variables in a prompt. */
export function fillPrompt(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

// ── Synthesis prompt ───────────────────────────────────────────

export const SYNTHESIS_SYSTEM = `You are a canon alignment reviewer synthesizing dimension evaluations into a final review.

Rules:
- Synthesize the 4 dimension evaluations into a coherent review.
- Do NOT re-evaluate from scratch. Use only the dimension results provided.
- Verdict must follow the ladder: aligned, mostly_aligned, salvageable_drift, hard_drift, contradiction.
- Use the product's own language in the summary.
- Revision suggestions should preserve the artifact's intent, not flatten it.
- Output JSON only.`;

export const SYNTHESIS_PROMPT_TEMPLATE = `Synthesize these dimension evaluations into a final alignment review.

=== CANDIDATE ===
Type: {{artifactType}}
Purpose: {{purpose}}
---
{{candidateBody}}
---

=== DIMENSION EVALUATIONS ===
{{dimensionResults}}

Respond with JSON:
{
  "verdict": "aligned|mostly_aligned|salvageable_drift|hard_drift|contradiction",
  "summary": "2-4 sentence summary in product-native language",
  "preserved": [{"text": "what the artifact got right", "evidence_ids": ["statement IDs"]}],
  "drift_points": [{"text": "where it drifted", "evidence_ids": ["statement IDs"]}],
  "conflicts": [{"text": "direct contradictions", "evidence_ids": ["statement IDs"]}],
  "uncertainties": ["sparse canon or weak signals"],
  "suggestions": [{"action": "keep|cut|revise", "target_excerpt": "text from artifact or null", "guidance": "what to do"}]
}`;
