import type { SourceSuggestion, PolicyPreset } from "./onboard-types.js";
import type { GatePolicy, SurfacePolicy } from "../gate/policy-types.js";
import { capByTokenBudget } from "./source-scanner.js";
import { getPreset } from "./policy-presets.js";

export const REPO_SHAPES = ["doctrine-heavy", "product-copy", "moderate-mixed", "sparse"] as const;
export type RepoShape = (typeof REPO_SHAPES)[number];

export type AdoptionRecommendation = {
  repo_shape: RepoShape;
  shape_reason: string;

  recommended_preset: PolicyPreset;
  preset_reason: string;

  source_recommendation: {
    total_found: number;
    recommended_count: number;
    recommended_sources: SourceSuggestion[];
    deferred_sources: SourceSuggestion[];
    needs_voice_split: boolean;
    voice_split_reason: string | null;
    estimated_tokens: number;
  };

  gate_recommendation: {
    initial_surfaces: Array<{ artifact_type: string; mode: string; reason: string }>;
    deferred_surfaces: Array<{ artifact_type: string; reason: string }>;
  };

  likely_confidence: "strong" | "moderate" | "sparse";
  confidence_reason: string;

  risk_briefing: string[];
  drift_watchlist: string[];
};

/**
 * Generate adoption recommendations for a new repo.
 */
export function generateRecommendation(
  sources: SourceSuggestion[],
  portfolioContext?: {
    avg_strong_statements: number;
    common_drift_families: string[];
    reliable_first_surfaces: string[];
  },
): AdoptionRecommendation {
  // ── Repo shape classification ──────────────────────────────
  const highPriority = sources.filter((s) => s.priority === "high");
  const hasAntiPatterns = sources.some((s) => s.inferred_type === "negative_example");
  const hasArchitecture = sources.some((s) => s.inferred_type === "architecture_note");
  const hasPolicy = sources.some((s) => s.reason.toLowerCase().includes("law") || s.reason.toLowerCase().includes("policy") || s.reason.toLowerCase().includes("contract"));
  const hasDocs = sources.some((s) => s.path.includes("/docs/") || s.path.includes("\\docs\\"));
  const hasReadme = sources.some((s) => s.inferred_type === "readme");

  let repoShape: RepoShape;
  let shapeReason: string;

  if ((hasAntiPatterns || hasPolicy) && hasDocs && highPriority.length >= 3) {
    repoShape = "doctrine-heavy";
    shapeReason = "Has anti-patterns/policy docs, dedicated docs/ directory, and 3+ high-priority sources";
  } else if (hasReadme && (hasArchitecture || highPriority.length >= 2)) {
    repoShape = "product-copy";
    shapeReason = "Has README and architecture/design docs — product identity is documented but not doctrine-dense";
  } else if (hasReadme && sources.length >= 2) {
    repoShape = "moderate-mixed";
    shapeReason = "Has README and some supporting docs but no dedicated doctrine";
  } else {
    repoShape = "sparse";
    shapeReason = sources.length === 0
      ? "No markdown documentation found"
      : `Only ${sources.length} source(s) found with limited doctrine signal`;
  }

  // ── Preset recommendation ──────────────────────────────────
  const presetMap: Record<RepoShape, PolicyPreset> = {
    "doctrine-heavy": "product-copy",
    "product-copy": "product-copy",
    "moderate-mixed": "docs-heavy",
    "sparse": "advisory-starter",
  };
  const recommendedPreset = presetMap[repoShape];

  const presetReasons: Record<PolicyPreset, string> = {
    "advisory-starter": "Sparse canon — start advisory-only until canon is stronger",
    "docs-heavy": "Moderate documentation — protect README and package description first",
    "product-copy": "Rich doctrine — protect package identity, naming, and README framing",
  };

  // ── Source-set recommendation ──────────────────────────────
  const TOKEN_BUDGET = 8000;
  const { selected, dropped, totalTokens } = capByTokenBudget(sources, TOKEN_BUDGET);

  const needsVoiceSplit = totalTokens > 6000 || sources.length > 5;
  const voiceSplitReason = needsVoiceSplit
    ? `${sources.length} sources (~${totalTokens} tokens) may exceed context. Run voice/naming on top 2-3 sources separately.`
    : null;

  // ── Gate recommendation ────────────────────────────────────
  const reliableSurfaces = portfolioContext?.reliable_first_surfaces ?? ["package_blurb", "naming_proposal"];

  const initialSurfaces: Array<{ artifact_type: string; mode: string; reason: string }> = [];
  const deferredSurfaces: Array<{ artifact_type: string; reason: string }> = [];

  if (repoShape !== "sparse") {
    for (const surface of ["package_blurb", "naming_proposal"]) {
      if (reliableSurfaces.includes(surface)) {
        initialSurfaces.push({
          artifact_type: surface,
          mode: "warn",
          reason: `Reliably promoted across the portfolio (${reliableSurfaces.includes(surface) ? "portfolio evidence" : "default"})`,
        });
      }
    }

    initialSurfaces.push({
      artifact_type: "readme_section",
      mode: repoShape === "doctrine-heavy" ? "warn" : "advisory",
      reason: repoShape === "doctrine-heavy" ? "Doctrine-heavy repos have strong README canon" : "Keep advisory until canon proves strong enough",
    });

    for (const surface of ["feature_brief", "cli_help", "release_note"]) {
      deferredSurfaces.push({ artifact_type: surface, reason: "Keep advisory until rollout data supports promotion" });
    }
  } else {
    deferredSurfaces.push({ artifact_type: "all", reason: "Canon too sparse — all surfaces stay advisory until canon is stronger" });
  }

  // ── Confidence prediction ──────────────────────────────────
  let likelyConfidence: "strong" | "moderate" | "sparse";
  let confidenceReason: string;

  const avgStrong = portfolioContext?.avg_strong_statements ?? 17;

  if (repoShape === "doctrine-heavy" && highPriority.length >= 3) {
    likelyConfidence = "strong";
    confidenceReason = `Doctrine-heavy repos with 3+ high-priority sources typically reach ${avgStrong}+ statements`;
  } else if (repoShape === "product-copy" || repoShape === "moderate-mixed") {
    likelyConfidence = "moderate";
    confidenceReason = "Mixed documentation usually yields 8-12 statements — enough for gate but not full coverage";
  } else {
    likelyConfidence = "sparse";
    confidenceReason = "Limited documentation may not produce enough canon for reliable gating";
  }

  // ── Risk briefing ──────────────────────────────────────────
  const risks: string[] = [];

  if (repoShape === "sparse") {
    risks.push("Sparse source set — gate judgments will have low confidence. Consider adding more documentation before relying on gate results.");
  }
  if (needsVoiceSplit) {
    risks.push("Large source set — run voice/naming extraction separately on top 2-3 sources to avoid context overflow.");
  }
  if (!hasAntiPatterns) {
    risks.push("No anti-patterns document found. The gate may miss repo-specific drift patterns. Consider documenting known wrong shapes.");
  }
  if (repoShape === "moderate-mixed" || repoShape === "sparse") {
    risks.push("Without dedicated doctrine docs, canon will rely heavily on README extraction. Thesis statements may be vague.");
  }

  // ── Drift watchlist ────────────────────────────────────────
  const driftWatchlist = portfolioContext?.common_drift_families ?? [
    "Governance bypass — watch for proposals that remove operator oversight",
    "Generic framing — watch for product descriptions that lose specific identity",
  ];

  return {
    repo_shape: repoShape,
    shape_reason: shapeReason,
    recommended_preset: recommendedPreset,
    preset_reason: presetReasons[recommendedPreset],
    source_recommendation: {
      total_found: sources.length,
      recommended_count: selected.length,
      recommended_sources: selected,
      deferred_sources: dropped,
      needs_voice_split: needsVoiceSplit,
      voice_split_reason: voiceSplitReason,
      estimated_tokens: totalTokens,
    },
    gate_recommendation: {
      initial_surfaces: initialSurfaces,
      deferred_surfaces: deferredSurfaces,
    },
    likely_confidence: likelyConfidence,
    confidence_reason: confidenceReason,
    risk_briefing: risks,
    drift_watchlist: driftWatchlist,
  };
}
