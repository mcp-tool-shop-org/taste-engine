import { resolve } from "node:path";
import { runScan, getSnapshotHistory, getLatestDelta, generateDigest } from "../../watchtower/watchtower-engine.js";

export async function watchtowerScanCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const snapshot = runScan(dir);

  console.log(`Scan complete: ${snapshot.timestamp}`);
  console.log(`  Repos: ${snapshot.repos.length}`);
  console.log(`  Gate ready: ${snapshot.gate_ready_count}`);
  console.log(`  Statements: ${snapshot.total_statements}`);
  console.log(`  Alerts: ${snapshot.alerts.length}`);
  console.log(`  Promotion-ready: ${snapshot.promotion_ready_count}`);
  console.log(`  Overrides: ${snapshot.override_total}`);
  console.log(`  Snapshot: ${snapshot.id.slice(0, 8)}`);
}

export async function watchtowerHistoryCommand(opts: { dir: string }): Promise<void> {
  const history = getSnapshotHistory(resolve(opts.dir));

  if (history.length === 0) { console.log("No scan history. Run 'taste watchtower scan' first."); return; }

  console.log("=== Watchtower History ===");
  for (const s of history.slice(-10)) {
    console.log(`  ${s.timestamp} — ${s.repos.length} repos, ${s.total_statements} stmts, ${s.alerts.length} alerts [${s.id.slice(0, 8)}]`);
  }
  console.log(`\n${history.length} total snapshot(s).`);
}

export async function watchtowerDeltaCommand(opts: { dir: string }): Promise<void> {
  const delta = getLatestDelta(resolve(opts.dir));

  if (!delta) { console.log("Need at least 2 scans for delta. Run 'taste watchtower scan' again."); return; }

  if (delta.items.length === 0) { console.log("No changes since last scan."); return; }

  console.log(`=== Changes: ${delta.from_timestamp.slice(0, 19)} -> ${delta.to_timestamp.slice(0, 19)} ===`);
  console.log();

  const catIcons: Record<string, string> = {
    promotion_ready: "[+]", newly_stale: "[!]", override_spike: "[!]",
    canon_changed: "[~]", policy_changed: "[~]",
    alert_resolved: "[ok]", alert_new: "[!]", enrichment_done: "[+]",
  };

  for (const item of delta.items) {
    const icon = catIcons[item.category] ?? "[?]";
    const target = item.surface ? `${item.repo_slug}/${item.surface}` : item.repo_slug;
    console.log(`  ${icon} ${target}: ${item.description}`);
  }

  console.log();
  console.log(`Summary: ${delta.summary.new_alerts} new alerts, ${delta.summary.resolved_alerts} resolved, ${delta.summary.canon_changes} canon changes, ${delta.summary.policy_changes} policy changes, ${delta.summary.newly_promotable} newly promotable`);
}

export async function watchtowerDigestCommand(opts: { dir: string; json?: boolean }): Promise<void> {
  const digest = generateDigest(resolve(opts.dir));

  if (opts.json) { console.log(JSON.stringify(digest, null, 2)); return; }

  console.log("=== Watchtower Digest ===");
  console.log(`Scan: ${digest.scan_time.slice(0, 19)}`);
  console.log();
  console.log(`State: ${digest.current_state.repos} repos, ${digest.current_state.gate_ready} gate-ready, ${digest.current_state.total_statements} stmts`);
  console.log(`Alerts: ${digest.current_state.active_alerts} | Promotable: ${digest.current_state.promotion_candidates}`);

  if (digest.delta) {
    console.log();
    console.log(`Changes: ${digest.delta.items.length} items`);
    console.log(`  New alerts: ${digest.delta.summary.new_alerts} | Resolved: ${digest.delta.summary.resolved_alerts}`);
    console.log(`  Canon: ${digest.delta.summary.canon_changes} | Policy: ${digest.delta.summary.policy_changes}`);
    console.log(`  Promotable: ${digest.delta.summary.newly_promotable}`);
  }

  if (digest.action_items.length > 0) {
    console.log();
    console.log("Action items:");
    for (const item of digest.action_items) console.log(`  -> ${item}`);
  } else {
    console.log();
    console.log("No action items. Portfolio is healthy.");
  }
}
