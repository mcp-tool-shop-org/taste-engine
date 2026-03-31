import type { ArtifactType, Verdict } from "../core/enums.js";

export const ENFORCEMENT_MODES = ["advisory", "warn", "required"] as const;
export type EnforcementMode = (typeof ENFORCEMENT_MODES)[number];

export const GATE_RESULTS = ["pass", "warn", "block"] as const;
export type GateResult = (typeof GATE_RESULTS)[number];

export type DetectedArtifact = {
  path: string;
  title: string;
  artifact_type: ArtifactType;
  body: string;
};

export type ArtifactGateResult = {
  artifact: DetectedArtifact;
  verdict: Verdict;
  gate_result: GateResult;
  summary: string;
  repair_available: boolean;
  repair_path: "patch" | "structural" | "irreparable" | null;
};

export type GateRunResult = {
  overall: GateResult;
  mode: EnforcementMode;
  canon_version: string;
  artifacts_checked: number;
  artifacts_passed: number;
  artifacts_warned: number;
  artifacts_blocked: number;
  results: ArtifactGateResult[];
  errors: string[];
};

/** Map verdict to gate result based on enforcement mode. */
export function verdictToGateResult(verdict: Verdict, mode: EnforcementMode): GateResult {
  switch (verdict) {
    case "aligned":
    case "mostly_aligned":
      return "pass";
    case "salvageable_drift":
      return mode === "required" ? "warn" : "pass";
    case "hard_drift":
      return mode === "advisory" ? "warn" : "block";
    case "contradiction":
      return mode === "advisory" ? "warn" : "block";
    default:
      return "warn";
  }
}

/** Determine repair path from verdict. */
export function verdictToRepairPath(verdict: Verdict): "patch" | "structural" | "irreparable" | null {
  switch (verdict) {
    case "aligned":
    case "mostly_aligned":
      return null;
    case "salvageable_drift":
      return "patch";
    case "hard_drift":
      return "structural";
    case "contradiction":
      return "irreparable";
    default:
      return null;
  }
}

/** Compute overall gate result from per-artifact results. */
export function computeOverallResult(results: ArtifactGateResult[]): GateResult {
  if (results.some((r) => r.gate_result === "block")) return "block";
  if (results.some((r) => r.gate_result === "warn")) return "warn";
  return "pass";
}
