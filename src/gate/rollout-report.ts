import type Database from "better-sqlite3";
import type { RolloutReport } from "./policy-types.js";
import type { GatePolicy } from "./policy-types.js";
import { getOverrideCount, getOverrides } from "./policy.js";
import { now } from "../util/timestamps.js";

/**
 * Compute a rollout report from gate run history.
 * Uses review and gate data from the database.
 */
export function computeRolloutReport(
  db: Database.Database,
  projectId: string,
  projectSlug: string,
  canonVersion: string,
): RolloutReport {
  // Count total reviews (proxy for gate runs)
  const totalReviews = (db.prepare(
    "SELECT COUNT(*) as c FROM alignment_reviews WHERE project_id = ? AND canon_version = ?",
  ).get(projectId, canonVersion) as { c: number }).c;

  // Count by verdict
  const verdictCounts = db.prepare(
    "SELECT verdict, COUNT(*) as c FROM alignment_reviews WHERE project_id = ? AND canon_version = ? GROUP BY verdict",
  ).all(projectId, canonVersion) as { verdict: string; c: number }[];

  const verdictMap = Object.fromEntries(verdictCounts.map((r) => [r.verdict, r.c]));

  const passCount = (verdictMap["aligned"] ?? 0) + (verdictMap["mostly_aligned"] ?? 0);
  const warnCount = verdictMap["salvageable_drift"] ?? 0;
  const blockCount = (verdictMap["hard_drift"] ?? 0) + (verdictMap["contradiction"] ?? 0);

  // Count by artifact type
  const byType: Record<string, { checked: number; passed: number; warned: number; blocked: number; overridden: number }> = {};

  const typeRows = db.prepare(
    `SELECT ca.artifact_type, ar.verdict, COUNT(*) as c
     FROM alignment_reviews ar
     JOIN candidate_artifacts ca ON ca.id = ar.candidate_artifact_id
     WHERE ar.project_id = ? AND ar.canon_version = ?
     GROUP BY ca.artifact_type, ar.verdict`,
  ).all(projectId, canonVersion) as { artifact_type: string; verdict: string; c: number }[];

  for (const row of typeRows) {
    if (!byType[row.artifact_type]) {
      byType[row.artifact_type] = { checked: 0, passed: 0, warned: 0, blocked: 0, overridden: 0 };
    }
    const entry = byType[row.artifact_type];
    entry.checked += row.c;

    if (row.verdict === "aligned" || row.verdict === "mostly_aligned") entry.passed += row.c;
    else if (row.verdict === "salvageable_drift") entry.warned += row.c;
    else entry.blocked += row.c;
  }

  // Override counts
  const overrideCount = getOverrideCount(db, projectId);
  const overrides = getOverrides(db, projectId);

  // Count overrides by type
  for (const ov of overrides) {
    if (byType[ov.artifact_type]) {
      byType[ov.artifact_type].overridden++;
    }
  }

  // Hot spots: artifact types with high warn/block rates
  const hotSpots: Array<{ artifact_type: string; issue: string; count: number }> = [];
  for (const [type, counts] of Object.entries(byType)) {
    if (counts.checked < 2) continue;
    const blockRate = counts.blocked / counts.checked;
    const warnRate = counts.warned / counts.checked;
    if (blockRate > 0.3) {
      hotSpots.push({ artifact_type: type, issue: "high block rate", count: counts.blocked });
    }
    if (warnRate > 0.4) {
      hotSpots.push({ artifact_type: type, issue: "high warn rate", count: counts.warned });
    }
  }

  // Promotion readiness
  const promotion: Record<string, { current_mode: string; recommended_mode: string; reason: string }> = {};
  for (const [type, counts] of Object.entries(byType)) {
    if (counts.checked < 3) {
      promotion[type] = { current_mode: "advisory", recommended_mode: "advisory", reason: "Insufficient data (< 3 reviews)" };
      continue;
    }

    const passRate = counts.passed / counts.checked;
    const blockRate = counts.blocked / counts.checked;

    if (passRate > 0.8 && blockRate < 0.1) {
      promotion[type] = { current_mode: "advisory", recommended_mode: "required", reason: `${(passRate * 100).toFixed(0)}% pass rate, clean signal` };
    } else if (passRate > 0.6) {
      promotion[type] = { current_mode: "advisory", recommended_mode: "warn", reason: `${(passRate * 100).toFixed(0)}% pass rate, some noise` };
    } else {
      promotion[type] = { current_mode: "advisory", recommended_mode: "advisory", reason: `${(passRate * 100).toFixed(0)}% pass rate, too noisy for promotion` };
    }
  }

  // Repair usage: count revision runs
  let repairCount = 0;
  try {
    repairCount = (db.prepare(
      "SELECT COUNT(*) as c FROM review_runs WHERE project_id = ?",
    ).get(projectId) as { c: number }).c - totalReviews;
    if (repairCount < 0) repairCount = 0;
  } catch {
    repairCount = 0;
  }

  return {
    project_slug: projectSlug,
    canon_version: canonVersion,
    period: { from: "inception", to: now() },
    total_gate_runs: totalReviews,
    total_artifacts_checked: totalReviews,
    pass_count: passCount,
    warn_count: warnCount,
    block_count: blockCount,
    override_count: overrideCount,
    repair_usage_count: repairCount,
    by_artifact_type: byType,
    hot_spots: hotSpots,
    promotion_readiness: promotion,
  };
}
