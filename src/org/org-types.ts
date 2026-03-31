export type OrgRepoStatus = {
  slug: string;
  name: string;
  canon_confidence: "strong" | "moderate" | "sparse" | "empty";
  canon_version: string | null;
  statement_count: number;
  gate_ready: boolean;
  surfaces: Record<string, "advisory" | "warn" | "required">;
  override_count: number;
  last_review_at: string | null;
  risk_flags: string[];
};

export type PromotionCandidate = {
  repo_slug: string;
  surface: string;
  current_mode: "advisory" | "warn";
  recommended_mode: "warn" | "required";
  reason: string;
  evidence: string;
  risk: string | null;
};

export type DemotionCandidate = {
  repo_slug: string;
  surface: string;
  current_mode: "warn" | "required";
  recommended_mode: "advisory" | "warn";
  reason: string;
};

export type OverrideHotspot = {
  repo_slug: string;
  surface: string;
  override_count: number;
  most_common_action: string;
  most_common_reason: string;
};

export type OrgRecommendation = {
  action: "promote" | "demote" | "enrich_canon" | "onboard" | "alert";
  repo_slug: string;
  surface: string | null;
  description: string;
  priority: "high" | "medium" | "low";
};
