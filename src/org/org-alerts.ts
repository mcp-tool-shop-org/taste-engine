import type { OrgRepoStatus, PromotionCandidate, DemotionCandidate, OrgRecommendation } from "./org-types.js";
import { buildPromotionQueue, buildDemotionQueue, buildOverrideHotspots } from "./org-engine.js";

export const ALERT_SEVERITIES = ["critical", "warning", "info"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type OrgAlert = {
  severity: AlertSeverity;
  category: "promotion_ready" | "demotion_needed" | "override_spike" | "sparse_canon" | "stale_canon" | "stale_rollout" | "enrichment_needed";
  repo_slug: string;
  surface: string | null;
  title: string;
  description: string;
  recommended_action: string;
};

// ── Thresholds (inspectable doctrine) ──────────────────────────

export const THRESHOLDS = {
  /** Overrides above this trigger demotion alert */
  override_spike: 3,
  /** Days since last review before stale alert */
  stale_review_days: 30,
  /** Days since canon freeze before stale canon alert */
  stale_canon_days: 60,
  /** Min statements for strong confidence */
  strong_canon_min: 12,
  /** Min statements for moderate confidence */
  moderate_canon_min: 5,
} as const;

/**
 * Generate all org alerts from current state.
 */
export function generateOrgAlerts(
  statuses: OrgRepoStatus[],
  portfolioDir: string,
): OrgAlert[] {
  const alerts: OrgAlert[] = [];

  // ── Promotion-ready alerts ─────────────────────────────────
  const promotions = buildPromotionQueue(statuses);
  // Only surface the highest-value promotions (warn → required)
  const requiredCandidates = promotions.filter((p) => p.recommended_mode === "required");
  for (const p of requiredCandidates) {
    alerts.push({
      severity: "info",
      category: "promotion_ready",
      repo_slug: p.repo_slug,
      surface: p.surface,
      title: `${p.repo_slug}/${p.surface} ready for required`,
      description: p.reason,
      recommended_action: `taste org queue --dir <portfolio> to review, then update gate-policy.json`,
    });
  }

  // ── Demotion alerts ────────────────────────────────────────
  const demotions = buildDemotionQueue(statuses);
  for (const d of demotions) {
    alerts.push({
      severity: "warning",
      category: "demotion_needed",
      repo_slug: d.repo_slug,
      surface: d.surface,
      title: `${d.repo_slug}/${d.surface} should be demoted`,
      description: d.reason,
      recommended_action: `Demote ${d.surface} from ${d.current_mode} to ${d.recommended_mode} in gate-policy.json`,
    });
  }

  // ── Override spike alerts ──────────────────────────────────
  for (const repo of statuses) {
    if (repo.override_count > THRESHOLDS.override_spike) {
      alerts.push({
        severity: "warning",
        category: "override_spike",
        repo_slug: repo.slug,
        surface: null,
        title: `${repo.slug} has ${repo.override_count} overrides`,
        description: `Override count exceeds threshold (${THRESHOLDS.override_spike}). Authors may be bypassing instead of repairing.`,
        recommended_action: "Review override receipts. Consider demoting noisy surfaces or enriching canon.",
      });
    }
  }

  // ── Sparse canon alerts ────────────────────────────────────
  for (const repo of statuses) {
    if (repo.canon_confidence === "sparse" && repo.gate_ready) {
      alerts.push({
        severity: "warning",
        category: "sparse_canon",
        repo_slug: repo.slug,
        surface: null,
        title: `${repo.slug} has sparse canon but is gate-ready`,
        description: "Gate results may be unreliable with sparse canon. Enrich before promoting surfaces.",
        recommended_action: "Run additional extraction passes and curate more statements.",
      });
    }

    if (repo.canon_confidence === "empty") {
      alerts.push({
        severity: "critical",
        category: "sparse_canon",
        repo_slug: repo.slug,
        surface: null,
        title: `${repo.slug} has no canon`,
        description: "Repo is onboarded but has no accepted canon statements. Gate cannot function.",
        recommended_action: "Run taste extract run --core and curate candidates.",
      });
    }
  }

  // ── Enrichment needed alerts ───────────────────────────────
  for (const repo of statuses) {
    if (repo.risk_flags.includes("No voice/naming") && repo.canon_confidence !== "empty") {
      alerts.push({
        severity: "info",
        category: "enrichment_needed",
        repo_slug: repo.slug,
        surface: null,
        title: `${repo.slug} missing voice/naming canon`,
        description: "Gate cannot assess language alignment without voice/naming statements.",
        recommended_action: "Run taste extract run --passes voice_naming",
      });
    }

    if (repo.risk_flags.includes("No anti-patterns") && repo.gate_ready) {
      alerts.push({
        severity: "info",
        category: "enrichment_needed",
        repo_slug: repo.slug,
        surface: null,
        title: `${repo.slug} missing anti-pattern canon`,
        description: "Gate cannot detect known drift patterns without anti-pattern statements.",
        recommended_action: "Document known anti-patterns, ingest, and extract.",
      });
    }
  }

  // ── Stale rollout alerts ───────────────────────────────────
  const now = Date.now();
  for (const repo of statuses) {
    if (repo.last_review_at && repo.gate_ready) {
      const lastReview = new Date(repo.last_review_at).getTime();
      const daysSince = (now - lastReview) / (1000 * 60 * 60 * 24);
      if (daysSince > THRESHOLDS.stale_review_days) {
        alerts.push({
          severity: "info",
          category: "stale_rollout",
          repo_slug: repo.slug,
          surface: null,
          title: `${repo.slug} has no reviews in ${Math.round(daysSince)} days`,
          description: "Gate may not be running. Rollout status is stale.",
          recommended_action: "Verify gate is wired into workflow. Run taste gate report.",
        });
      }
    }
  }

  // Sort: critical → warning → info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

/**
 * Filter alerts by severity or category.
 */
export function filterAlerts(
  alerts: OrgAlert[],
  filters?: { severity?: AlertSeverity; category?: string; repo?: string },
): OrgAlert[] {
  let result = alerts;
  if (filters?.severity) result = result.filter((a) => a.severity === filters.severity);
  if (filters?.category) result = result.filter((a) => a.category === filters.category);
  if (filters?.repo) result = result.filter((a) => a.repo_slug === filters.repo);
  return result;
}
