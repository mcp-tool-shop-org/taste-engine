import type { ArtifactType } from "../core/enums.js";
import type { EnforcementMode } from "../gate/gate-types.js";

export const POLICY_PRESETS = ["advisory-starter", "docs-heavy", "product-copy"] as const;
export type PolicyPreset = (typeof POLICY_PRESETS)[number];

export type SourceSuggestion = {
  path: string;
  inferred_type: string;
  priority: "high" | "medium" | "low";
  reason: string;
};

export type OnboardReport = {
  project_slug: string;
  source_artifacts_found: number;
  source_suggestions: SourceSuggestion[];
  canon_statement_count: number;
  canon_confidence: "strong" | "moderate" | "sparse" | "empty";
  sparse_warnings: string[];
  surface_readiness: Record<string, {
    has_canon_coverage: boolean;
    recommended_mode: EnforcementMode;
    reason: string;
  }>;
  recommended_first_surfaces: ArtifactType[];
  ready_for_gate: boolean;
  next_steps: string[];
};
