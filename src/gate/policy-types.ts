import type { EnforcementMode } from "./gate-types.js";
import type { ArtifactType } from "../core/enums.js";

/**
 * Per-repo gate policy. Lives at .taste/gate-policy.json in the target repo.
 */
export type GatePolicy = {
  canon_version: string;
  default_mode: EnforcementMode;

  /** Per-surface enforcement overrides. */
  surfaces: SurfacePolicy[];

  /** Glob patterns for files to always skip. */
  skip_globs: string[];

  /** Whether override receipts are required for bypass. */
  require_override_receipts: boolean;
};

export type SurfacePolicy = {
  artifact_type: ArtifactType;
  mode: EnforcementMode;
  globs: string[];
  notes?: string;
};

export type OverrideReceipt = {
  id: string;
  project_id: string;
  artifact_path: string;
  artifact_type: string;
  original_verdict: string;
  original_gate_result: string;
  action: "bypass" | "defer_repair" | "accept_as_is";
  reason: string;
  follow_up_artifact_id: string | null;
  created_at: string;
};

export type RolloutReport = {
  project_slug: string;
  canon_version: string;
  period: { from: string; to: string };
  total_gate_runs: number;
  total_artifacts_checked: number;
  pass_count: number;
  warn_count: number;
  block_count: number;
  override_count: number;
  repair_usage_count: number;
  by_artifact_type: Record<string, {
    checked: number;
    passed: number;
    warned: number;
    blocked: number;
    overridden: number;
  }>;
  hot_spots: Array<{
    artifact_type: string;
    issue: string;
    count: number;
  }>;
  promotion_readiness: Record<string, {
    current_mode: string;
    recommended_mode: string;
    reason: string;
  }>;
};

export const DEFAULT_POLICY: GatePolicy = {
  canon_version: "canon-v1",
  default_mode: "advisory",
  surfaces: [],
  skip_globs: [],
  require_override_receipts: false,
};
