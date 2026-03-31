import type { OrgRepoStatus } from "../org/org-types.js";
import type { OrgAlert } from "../org/org-alerts.js";

export type WatchtowerSnapshot = {
  id: string;
  timestamp: string;
  repos: OrgRepoStatus[];
  alerts: OrgAlert[];
  total_statements: number;
  gate_ready_count: number;
  promotion_ready_count: number;
  override_total: number;
};

export type DeltaItem = {
  category: "promotion_ready" | "newly_stale" | "override_spike" | "canon_changed" | "policy_changed" | "alert_resolved" | "alert_new" | "enrichment_done";
  repo_slug: string;
  surface: string | null;
  description: string;
  previous: string | null;
  current: string | null;
};

export type WatchtowerDelta = {
  from_snapshot_id: string;
  to_snapshot_id: string;
  from_timestamp: string;
  to_timestamp: string;
  items: DeltaItem[];
  summary: {
    new_alerts: number;
    resolved_alerts: number;
    canon_changes: number;
    policy_changes: number;
    newly_promotable: number;
    newly_stale: number;
  };
};

export type WatchtowerDigest = {
  scan_time: string;
  delta: WatchtowerDelta | null;
  current_state: {
    repos: number;
    gate_ready: number;
    total_statements: number;
    active_alerts: number;
    promotion_candidates: number;
  };
  action_items: string[];
};
