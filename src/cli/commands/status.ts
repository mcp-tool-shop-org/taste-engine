import { resolve } from "node:path";
import { buildOrgStatus, buildPromotionQueue, buildDemotionQueue } from "../../org/org-engine.js";
import { generateOrgAlerts } from "../../org/org-alerts.js";
import { generateDigest } from "../../watchtower/watchtower-engine.js";

export async function statusCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);

  // Current state
  const statuses = buildOrgStatus(dir);
  const alerts = generateOrgAlerts(statuses, dir);
  const promotions = buildPromotionQueue(statuses);
  const demotions = buildDemotionQueue(statuses);

  const gateReady = statuses.filter((s) => s.gate_ready).length;
  const totalStmts = statuses.reduce((s, r) => s + r.statement_count, 0);

  console.log(`=== Taste Engine Status ===`);
  console.log(`Repos: ${statuses.length} | Gate ready: ${gateReady} | Canon: ${totalStmts} stmts`);
  console.log();

  // Alerts
  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const info = alerts.filter((a) => a.severity === "info");

  if (critical.length > 0) {
    console.log(`Alerts: ${critical.length} critical, ${warnings.length} warning, ${info.length} info`);
    for (const a of critical) console.log(`  [!!] ${a.repo_slug}: ${a.title}`);
    for (const a of warnings) console.log(`  [!]  ${a.repo_slug}: ${a.title}`);
  } else if (warnings.length > 0) {
    console.log(`Alerts: ${warnings.length} warning, ${info.length} info`);
    for (const a of warnings) console.log(`  [!] ${a.repo_slug}: ${a.title}`);
  } else if (info.length > 0) {
    console.log(`Alerts: ${info.length} info`);
  } else {
    console.log("Alerts: none");
  }

  // Queue
  if (promotions.length > 0 || demotions.length > 0) {
    console.log();
    if (promotions.length > 0) console.log(`Queue: ${promotions.length} promotion(s) pending`);
    if (demotions.length > 0) console.log(`Queue: ${demotions.length} demotion(s) pending`);
  }

  // Digest action items
  try {
    const digest = generateDigest(dir);
    if (digest.action_items.length > 0) {
      console.log();
      console.log("Action items:");
      for (const item of digest.action_items.slice(0, 5)) console.log(`  -> ${item}`);
      if (digest.action_items.length > 5) console.log(`  ... and ${digest.action_items.length - 5} more`);
    } else {
      console.log();
      console.log("No action items. Portfolio is healthy.");
    }
  } catch {
    // No snapshots yet — that's fine
  }
}
