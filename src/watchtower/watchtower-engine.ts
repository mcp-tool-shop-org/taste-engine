import { existsSync } from "node:fs";
import { join } from "node:path";
import type { WatchtowerSnapshot, WatchtowerDelta, DeltaItem, WatchtowerDigest } from "./watchtower-types.js";
import type { OrgRepoStatus } from "../org/org-types.js";
import { buildOrgStatus, buildPromotionQueue } from "../org/org-engine.js";
import { generateOrgAlerts } from "../org/org-alerts.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";
import { readJson, writeJson } from "../util/json.js";

const SNAPSHOTS_FILE = "watchtower-snapshots.json";
const MAX_SNAPSHOTS = 50;

function snapshotsPath(portfolioDir: string): string {
  return join(portfolioDir, SNAPSHOTS_FILE);
}

function loadSnapshots(portfolioDir: string): WatchtowerSnapshot[] {
  return readJson<WatchtowerSnapshot[]>(snapshotsPath(portfolioDir)) ?? [];
}

function saveSnapshots(portfolioDir: string, snapshots: WatchtowerSnapshot[]): void {
  // Keep only last N
  const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
  writeJson(snapshotsPath(portfolioDir), trimmed);
}

// ── Scan ────────────────────────────────────────────────────

export function runScan(portfolioDir: string): WatchtowerSnapshot {
  const statuses = buildOrgStatus(portfolioDir);
  const alerts = generateOrgAlerts(statuses, portfolioDir);
  const promotions = buildPromotionQueue(statuses);

  const snapshot: WatchtowerSnapshot = {
    id: newId(),
    timestamp: now(),
    repos: statuses,
    alerts,
    total_statements: statuses.reduce((s, r) => s + r.statement_count, 0),
    gate_ready_count: statuses.filter((r) => r.gate_ready).length,
    promotion_ready_count: promotions.filter((p) => p.recommended_mode === "required").length,
    override_total: statuses.reduce((s, r) => s + r.override_count, 0),
  };

  const snapshots = loadSnapshots(portfolioDir);
  snapshots.push(snapshot);
  saveSnapshots(portfolioDir, snapshots);

  return snapshot;
}

// ── Delta ───────────────────────────────────────────────────

export function computeDelta(prev: WatchtowerSnapshot, curr: WatchtowerSnapshot): WatchtowerDelta {
  const items: DeltaItem[] = [];

  const prevRepos = new Map(prev.repos.map((r) => [r.slug, r]));
  const currRepos = new Map(curr.repos.map((r) => [r.slug, r]));
  const prevAlertKeys = new Set(prev.alerts.map((a) => `${a.repo_slug}:${a.category}:${a.surface ?? ""}`));
  const currAlertKeys = new Set(curr.alerts.map((a) => `${a.repo_slug}:${a.category}:${a.surface ?? ""}`));

  for (const [slug, currRepo] of currRepos) {
    const prevRepo = prevRepos.get(slug);

    if (!prevRepo) {
      items.push({ category: "canon_changed", repo_slug: slug, surface: null, description: `New repo onboarded: ${slug}`, previous: null, current: `${currRepo.statement_count} statements` });
      continue;
    }

    // Canon count changes
    if (currRepo.statement_count !== prevRepo.statement_count) {
      items.push({ category: "canon_changed", repo_slug: slug, surface: null, description: `Canon statements: ${prevRepo.statement_count} -> ${currRepo.statement_count}`, previous: String(prevRepo.statement_count), current: String(currRepo.statement_count) });
    }

    // Policy changes per surface
    for (const [surface, currMode] of Object.entries(currRepo.surfaces)) {
      const prevMode = prevRepo.surfaces[surface];
      if (prevMode && prevMode !== currMode) {
        items.push({ category: "policy_changed", repo_slug: slug, surface, description: `${surface}: ${prevMode} -> ${currMode}`, previous: prevMode, current: currMode });
      }
    }

    // Override spikes
    if (currRepo.override_count > prevRepo.override_count + 2) {
      items.push({ category: "override_spike", repo_slug: slug, surface: null, description: `Override count jumped: ${prevRepo.override_count} -> ${currRepo.override_count}`, previous: String(prevRepo.override_count), current: String(currRepo.override_count) });
    }

    // Canon confidence changes
    if (currRepo.canon_confidence !== prevRepo.canon_confidence) {
      items.push({ category: "canon_changed", repo_slug: slug, surface: null, description: `Canon confidence: ${prevRepo.canon_confidence} -> ${currRepo.canon_confidence}`, previous: prevRepo.canon_confidence, current: currRepo.canon_confidence });
    }
  }

  // New alerts
  let newAlerts = 0;
  for (const a of curr.alerts) {
    const key = `${a.repo_slug}:${a.category}:${a.surface ?? ""}`;
    if (!prevAlertKeys.has(key)) {
      items.push({ category: "alert_new", repo_slug: a.repo_slug, surface: a.surface, description: a.title, previous: null, current: a.severity });
      newAlerts++;
    }
  }

  // Resolved alerts
  let resolvedAlerts = 0;
  for (const a of prev.alerts) {
    const key = `${a.repo_slug}:${a.category}:${a.surface ?? ""}`;
    if (!currAlertKeys.has(key)) {
      items.push({ category: "alert_resolved", repo_slug: a.repo_slug, surface: a.surface, description: `Resolved: ${a.title}`, previous: a.severity, current: null });
      resolvedAlerts++;
    }
  }

  // Newly promotable
  const prevPromotable = new Set(buildPromotionQueue(prev.repos).filter((p) => p.recommended_mode === "required").map((p) => `${p.repo_slug}:${p.surface}`));
  const currPromotable = buildPromotionQueue(curr.repos).filter((p) => p.recommended_mode === "required");
  let newlyPromotable = 0;
  for (const p of currPromotable) {
    const key = `${p.repo_slug}:${p.surface}`;
    if (!prevPromotable.has(key)) {
      items.push({ category: "promotion_ready", repo_slug: p.repo_slug, surface: p.surface, description: `${p.surface} now ready for required`, previous: null, current: "required" });
      newlyPromotable++;
    }
  }

  return {
    from_snapshot_id: prev.id,
    to_snapshot_id: curr.id,
    from_timestamp: prev.timestamp,
    to_timestamp: curr.timestamp,
    items,
    summary: {
      new_alerts: newAlerts,
      resolved_alerts: resolvedAlerts,
      canon_changes: items.filter((i) => i.category === "canon_changed").length,
      policy_changes: items.filter((i) => i.category === "policy_changed").length,
      newly_promotable: newlyPromotable,
      newly_stale: items.filter((i) => i.category === "newly_stale").length,
    },
  };
}

// ── History ──────────────────────────────────────────────────

export function getSnapshotHistory(portfolioDir: string): WatchtowerSnapshot[] {
  return loadSnapshots(portfolioDir);
}

export function getLatestDelta(portfolioDir: string): WatchtowerDelta | null {
  const snapshots = loadSnapshots(portfolioDir);
  if (snapshots.length < 2) return null;
  return computeDelta(snapshots[snapshots.length - 2], snapshots[snapshots.length - 1]);
}

// ── Digest ──────────────────────────────────────────────────

export function generateDigest(portfolioDir: string): WatchtowerDigest {
  const snapshots = loadSnapshots(portfolioDir);
  const latest = snapshots[snapshots.length - 1];
  const delta = snapshots.length >= 2 ? computeDelta(snapshots[snapshots.length - 2], latest) : null;

  const actionItems: string[] = [];
  if (delta) {
    for (const item of delta.items) {
      if (item.category === "promotion_ready") actionItems.push(`Promote ${item.repo_slug}/${item.surface} to required`);
      if (item.category === "override_spike") actionItems.push(`Review overrides on ${item.repo_slug}`);
      if (item.category === "alert_new") actionItems.push(`New alert: ${item.description}`);
    }
  }

  // Add standing items from alerts
  if (latest) {
    for (const a of latest.alerts.filter((a) => a.severity === "warning" || a.severity === "critical")) {
      if (!actionItems.some((ai) => ai.includes(a.repo_slug))) {
        actionItems.push(`${a.severity}: ${a.title}`);
      }
    }
  }

  return {
    scan_time: latest?.timestamp ?? now(),
    delta,
    current_state: {
      repos: latest?.repos.length ?? 0,
      gate_ready: latest?.gate_ready_count ?? 0,
      total_statements: latest?.total_statements ?? 0,
      active_alerts: latest?.alerts.length ?? 0,
      promotion_candidates: latest?.promotion_ready_count ?? 0,
    },
    action_items: actionItems,
  };
}
