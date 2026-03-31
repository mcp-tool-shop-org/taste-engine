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
  console.log(JSON.stringify({ statuses, promotions, demotions, hotspots, recommendations: recs, alerts }, null, 2));
}
