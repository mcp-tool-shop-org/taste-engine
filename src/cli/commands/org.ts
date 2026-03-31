import { resolve } from "node:path";
import {
  buildOrgStatus,
  buildPromotionQueue,
  buildDemotionQueue,
  buildOverrideHotspots,
  generateOrgRecommendations,
} from "../../org/org-engine.js";
import { detectDriftFamilies } from "../../portfolio/portfolio-engine.js";
import { discoverRepos } from "../../portfolio/portfolio-engine.js";
import { generateOrgAlerts, filterAlerts } from "../../org/org-alerts.js";
import { createAction, previewAction, applyAction, rollbackAction, getActions, getActionHistory } from "../../org/org-actions.js";
import type { EnforcementMode } from "../../gate/gate-types.js";

export async function orgMatrixCommand(opts: { dir: string }): Promise<void> {
  const statuses = buildOrgStatus(resolve(opts.dir));
  if (statuses.length === 0) { console.log("No repos found."); return; }

  const gateReady = statuses.filter((r) => r.gate_ready).length;
  const totalStmts = statuses.reduce((s, r) => s + r.statement_count, 0);

  console.log("=== Org Rollout Matrix ===");
  console.log(`Repos: ${statuses.length} | Gate ready: ${gateReady} | Total canon: ${totalStmts} statements`);
  console.log();

  for (const r of statuses) {
    const conf = { strong: "STRONG", moderate: "MOD", sparse: "SPARSE", empty: "EMPTY" }[r.canon_confidence];
    const gate = r.gate_ready ? "READY" : "NOT READY";
    const warnSurfaces = Object.entries(r.surfaces).filter(([_, m]) => m === "warn").map(([s]) => s);
    const reqSurfaces = Object.entries(r.surfaces).filter(([_, m]) => m === "required").map(([s]) => s);

    console.log(`  ${r.slug} [${conf}] ${r.statement_count} stmts — ${gate}`);
    if (warnSurfaces.length > 0) console.log(`    warn: ${warnSurfaces.join(", ")}`);
    if (reqSurfaces.length > 0) console.log(`    required: ${reqSurfaces.join(", ")}`);
    if (r.override_count > 0) console.log(`    overrides: ${r.override_count}`);
    if (r.risk_flags.length > 0) console.log(`    risks: ${r.risk_flags.join(", ")}`);
  }
}

export async function orgQueueCommand(opts: { dir: string }): Promise<void> {
  const statuses = buildOrgStatus(resolve(opts.dir));
  const promotions = buildPromotionQueue(statuses);
  const demotions = buildDemotionQueue(statuses);

  if (promotions.length === 0 && demotions.length === 0) {
    console.log("No promotion or demotion candidates.");
    return;
  }

  if (promotions.length > 0) {
    console.log("=== Promotion Queue ===");
    for (const p of promotions) {
      console.log(`  ${p.repo_slug} / ${p.surface}: ${p.current_mode} → ${p.recommended_mode}`);
      console.log(`    ${p.reason}`);
      if (p.risk) console.log(`    Risk: ${p.risk}`);
    }
    console.log();
  }

  if (demotions.length > 0) {
    console.log("=== Demotion Queue ===");
    for (const d of demotions) {
      console.log(`  ${d.repo_slug} / ${d.surface}: ${d.current_mode} → ${d.recommended_mode}`);
      console.log(`    ${d.reason}`);
    }
  }
}

export async function orgOverridesCommand(opts: { dir: string }): Promise<void> {
  const hotspots = buildOverrideHotspots(resolve(opts.dir));

  if (hotspots.length === 0) {
    console.log("No override hotspots.");
    return;
  }

  console.log("=== Override Hotspots ===");
  for (const h of hotspots) {
    console.log(`  ${h.repo_slug} / ${h.surface}: ${h.override_count} overrides`);
    console.log(`    Most common: ${h.most_common_action} — ${h.most_common_reason}`);
  }
}

export async function orgHotspotsCommand(opts: { dir: string }): Promise<void> {
  const repos = discoverRepos(resolve(opts.dir));
  const families = detectDriftFamilies(repos);

  if (families.length === 0) { console.log("No drift hotspots detected."); return; }

  console.log("=== Drift Hotspots ===");
  for (const f of families) {
    const scope = f.is_portfolio_wide ? "[PORTFOLIO]" : "[LOCAL]";
    console.log(`  ${scope} ${f.name} — ${f.repos_with_anti_pattern.length} repos`);
    console.log(`    ${f.description}`);
    console.log(`    Repos: ${f.repos_with_anti_pattern.join(", ")}`);
    console.log();
  }
}

export async function orgRecommendationsCommand(opts: { dir: string }): Promise<void> {
  const statuses = buildOrgStatus(resolve(opts.dir));
  const promotions = buildPromotionQueue(statuses);
  const demotions = buildDemotionQueue(statuses);
  const recs = generateOrgRecommendations(statuses, promotions, demotions);

  if (recs.length === 0) { console.log("No recommendations."); return; }

  console.log("=== Org Recommendations ===");
  for (const r of recs) {
    const icon = { high: "[!]", medium: "[~]", low: "[ ]" }[r.priority];
    const target = r.surface ? `${r.repo_slug}/${r.surface}` : r.repo_slug;
    console.log(`  ${icon} [${r.action}] ${target}`);
    console.log(`    ${r.description}`);
  }
}

export async function orgAlertsCommand(opts: { dir: string; severity?: string; category?: string; repo?: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const statuses = buildOrgStatus(dir);
  let alerts = generateOrgAlerts(statuses, dir);

  alerts = filterAlerts(alerts, {
    severity: opts.severity as any,
    category: opts.category,
    repo: opts.repo,
  });

  if (alerts.length === 0) { console.log("No alerts."); return; }

  const icons = { critical: "[!!]", warning: "[!]", info: "[~]" };

  console.log("=== Org Alerts ===");
  for (const a of alerts) {
    console.log(`  ${icons[a.severity]} [${a.category}] ${a.title}`);
    console.log(`    ${a.description}`);
    console.log(`    Action: ${a.recommended_action}`);
    console.log();
  }

  const critCount = alerts.filter((a) => a.severity === "critical").length;
  const warnCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount = alerts.filter((a) => a.severity === "info").length;
  console.log(`${alerts.length} alert(s): ${critCount} critical, ${warnCount} warning, ${infoCount} info`);
}

export async function orgStaleCommand(opts: { dir: string }): Promise<void> {
  const statuses = buildOrgStatus(resolve(opts.dir));
  const alerts = generateOrgAlerts(statuses, resolve(opts.dir));
  const stale = filterAlerts(alerts, { category: "stale_rollout" });
  const sparse = filterAlerts(alerts, { category: "sparse_canon" });

  if (stale.length === 0 && sparse.length === 0) {
    console.log("No stale or sparse repos.");
    return;
  }

  if (sparse.length > 0) {
    console.log("=== Sparse Canon ===");
    for (const a of sparse) {
      console.log(`  ${a.severity === "critical" ? "[!!]" : "[!]"} ${a.title}`);
      console.log(`    ${a.recommended_action}`);
    }
    console.log();
  }

  if (stale.length > 0) {
    console.log("=== Stale Rollout ===");
    for (const a of stale) {
      console.log(`  [~] ${a.title}`);
      console.log(`    ${a.recommended_action}`);
    }
  }
}

export async function orgExportCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const statuses = buildOrgStatus(dir);
  const promotions = buildPromotionQueue(statuses);
  const demotions = buildDemotionQueue(statuses);
  const hotspots = buildOverrideHotspots(dir);
  const recs = generateOrgRecommendations(statuses, promotions, demotions);

  const alerts = generateOrgAlerts(statuses, dir);
  const actions = getActionHistory(dir);
  console.log(JSON.stringify({ statuses, promotions, demotions, hotspots, recommendations: recs, alerts, actions }, null, 2));
}

// ── Actions ────────────────────────────────────────────────────

export async function orgActionsQueueCommand(opts: { dir: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const statuses = buildOrgStatus(dir);
  const promotions = buildPromotionQueue(statuses);
  const demotions = buildDemotionQueue(statuses);

  if (promotions.length === 0 && demotions.length === 0) {
    console.log("No actionable items.");
    return;
  }

  console.log("=== Actionable Queue ===");
  for (const p of promotions) {
    console.log(`  [promote] ${p.repo_slug}/${p.surface}: ${p.current_mode} → ${p.recommended_mode}`);
    console.log(`    ${p.reason}`);
    console.log(`    taste org actions preview --dir ${opts.dir} --repo ${p.repo_slug} --surface ${p.surface} --to ${p.recommended_mode}`);
    console.log();
  }
  for (const d of demotions) {
    console.log(`  [demote] ${d.repo_slug}/${d.surface}: ${d.current_mode} → ${d.recommended_mode}`);
    console.log(`    ${d.reason}`);
    console.log();
  }
}

export async function orgActionsPreviewCommand(opts: {
  dir: string; repo: string; surface: string; to: string;
}): Promise<void> {
  const preview = previewAction(resolve(opts.dir), opts.repo, opts.surface, opts.to as EnforcementMode);

  console.log("=== Action Preview ===");
  console.log(`  ${preview.policy_diff}`);
  console.log(`  Current: ${preview.current_policy_mode ?? "(none)"}`);
  console.log(`  Proposed: ${preview.proposed_mode}`);

  if (preview.warnings.length > 0) {
    console.log();
    for (const w of preview.warnings) console.log(`  [!] ${w}`);
  }

  console.log();
  console.log(`To apply: taste org actions apply --dir ${opts.dir} --repo ${opts.repo} --surface ${opts.surface} --to ${opts.to} --reason "your reason"`);
}

export async function orgActionsApplyCommand(opts: {
  dir: string; repo: string; surface: string; to: string; reason: string;
}): Promise<void> {
  const dir = resolve(opts.dir);

  // Create action
  const action = createAction(dir, {
    kind: opts.to === "advisory" ? "demote" : "promote",
    repo_slug: opts.repo,
    surface: opts.surface,
    from_mode: null, // filled by apply
    to_mode: opts.to as EnforcementMode,
    reason: opts.reason,
    evidence: "Org queue recommendation",
  });

  // Fill from_mode from preview
  const preview = previewAction(dir, opts.repo, opts.surface, opts.to as EnforcementMode);
  action.from_mode = preview.current_policy_mode;

  // Apply
  const result = applyAction(dir, action.id);

  if (!result.success) {
    console.log(`Failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Applied: ${opts.repo}/${opts.surface} → ${opts.to}`);
  console.log(`  Reason: ${opts.reason}`);
  console.log(`  Receipt: ${action.id}`);
  console.log(`  Rollback: taste org actions rollback --dir ${opts.dir} --id ${action.id.slice(0, 8)} --reason "why"`);
}

export async function orgActionsRollbackCommand(opts: {
  dir: string; id: string; reason: string;
}): Promise<void> {
  const result = rollbackAction(resolve(opts.dir), opts.id, opts.reason);
  if (!result.success) {
    console.log(`Failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Rolled back: ${opts.id}`);
  console.log(`  Reason: ${opts.reason}`);
}

export async function orgActionsHistoryCommand(opts: { dir: string }): Promise<void> {
  const history = getActionHistory(resolve(opts.dir));

  if (history.length === 0) { console.log("No action history."); return; }

  console.log("=== Action History ===");
  for (const a of history) {
    const statusIcon = { proposed: "[ ]", applied: "[+]", rolled_back: "[x]" }[a.status];
    const target = a.surface ? `${a.repo_slug}/${a.surface}` : a.repo_slug;
    const modeChange = a.from_mode && a.to_mode ? `${a.from_mode} → ${a.to_mode}` : a.to_mode ?? "";
    console.log(`  ${statusIcon} [${a.kind}] ${target} ${modeChange}`);
    console.log(`    ${a.reason}`);
    if (a.applied_at) console.log(`    Applied: ${a.applied_at}`);
    if (a.rolled_back_at) console.log(`    Rolled back: ${a.rolled_back_at} — ${a.rollback_reason}`);
    console.log(`    ID: ${a.id.slice(0, 8)}`);
    console.log();
  }
}
