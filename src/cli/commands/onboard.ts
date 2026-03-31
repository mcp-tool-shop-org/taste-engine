import { resolve, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import { scanForSources } from "../../onboard/source-scanner.js";
import { getPreset } from "../../onboard/policy-presets.js";
import { generateOnboardReport } from "../../onboard/onboard-report.js";
import { generateRecommendation } from "../../onboard/recommend.js";
import { discoverRepos, buildPortfolioMatrix, detectDriftFamilies } from "../../portfolio/portfolio-engine.js";
import { savePolicy } from "../../gate/policy.js";
import { tasteDir } from "../config.js";
import { initCommand } from "./init.js";
import { ingestCommand } from "./ingest.js";
import type { PolicyPreset } from "../../onboard/onboard-types.js";
import { POLICY_PRESETS } from "../../onboard/onboard-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

export async function onboardRunCommand(opts: {
  root?: string;
  slug: string;
  name?: string;
  preset?: string;
  repoPath?: string;
  autoIngest?: boolean;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const repoPath = resolve(opts.repoPath ?? root);

  // Step 1: Initialize if needed
  if (!isInitialized(root)) {
    console.log("=== Step 1: Initialize ===");
    await initCommand({ slug: opts.slug, name: opts.name, root });
    console.log();
  } else {
    console.log("Already initialized.");
  }

  // Step 2: Scan for sources
  console.log("=== Step 2: Scan for sources ===");
  const sources = scanForSources(repoPath);
  console.log(`Found ${sources.length} candidate source artifacts:`);
  for (const s of sources) {
    const icon = s.priority === "high" ? "[!]" : s.priority === "medium" ? "[~]" : "[ ]";
    console.log(`  ${icon} ${s.path}`);
    console.log(`      ${s.reason}`);
  }
  console.log();

  // Step 3: Auto-ingest high-priority sources
  if (opts.autoIngest) {
    const highPriority = sources.filter((s) => s.priority === "high" || s.priority === "medium");
    if (highPriority.length > 0) {
      console.log("=== Step 3: Ingest sources ===");
      await ingestCommand({
        paths: highPriority.map((s) => s.path),
        root,
      });
      console.log();
    }
  }

  // Step 4: Apply policy preset
  const preset = (opts.preset as PolicyPreset) ?? "advisory-starter";
  if (!(POLICY_PRESETS as readonly string[]).includes(preset)) {
    console.log(`Unknown preset: ${preset}. Available: ${POLICY_PRESETS.join(", ")}`);
  } else {
    console.log(`=== Step 4: Apply gate policy (${preset}) ===`);
    const config = loadConfig(root)!;
    const policy = getPreset(preset, config.projectSlug === opts.slug ? "canon-v1" : "canon-v1");
    savePolicy(tasteDir(root), policy);
    console.log(`  Mode: ${policy.default_mode}`);
    if (policy.surfaces.length > 0) {
      for (const s of policy.surfaces) {
        console.log(`  ${s.artifact_type}: ${s.mode}`);
      }
    }
    console.log();
  }

  // Step 5: Generate report
  console.log("=== Step 5: Onboarding Report ===");
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);

  if (project) {
    const report = generateOnboardReport(db, project.id, config.projectSlug, sources);
    printReport(report);
  } else {
    console.log("Project not found in database.");
  }

  closeDb();
}

export async function onboardReportCommand(opts: { root?: string }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());

  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); process.exitCode = 1; return; }

  const repoPath = resolve(root);
  const sources = scanForSources(repoPath);
  const report = generateOnboardReport(db, project.id, config.projectSlug, sources);
  printReport(report);

  closeDb();
}

export async function onboardRecommendCommand(opts: {
  repoPath: string;
  portfolioDir?: string;
}): Promise<void> {
  const repoPath = resolve(opts.repoPath);
  const sources = scanForSources(repoPath);

  // Build portfolio context if available
  let portfolioContext: Parameters<typeof generateRecommendation>[1] | undefined;
  if (opts.portfolioDir) {
    const repos = discoverRepos(resolve(opts.portfolioDir));
    if (repos.length > 0) {
      const matrix = buildPortfolioMatrix(repos);
      const driftFamilies = detectDriftFamilies(repos);

      const strongRepos = repos.filter((r) => r.canon_confidence === "strong");
      const avgStrong = strongRepos.length > 0
        ? Math.round(strongRepos.reduce((s, r) => s + r.statement_count, 0) / strongRepos.length)
        : 17;

      // Find commonly promoted surfaces
      const surfaceCounts = new Map<string, number>();
      for (const r of repos) {
        for (const s of r.surfaces_at_warn) surfaceCounts.set(s, (surfaceCounts.get(s) ?? 0) + 1);
      }
      const reliableSurfaces = [...surfaceCounts.entries()]
        .filter(([_, count]) => count >= 2)
        .map(([surface]) => surface);

      portfolioContext = {
        avg_strong_statements: avgStrong,
        common_drift_families: driftFamilies.filter((d) => d.is_portfolio_wide).map((d) => d.name + " — " + d.description),
        reliable_first_surfaces: reliableSurfaces,
      };
    }
  }

  const rec = generateRecommendation(sources, portfolioContext);

  console.log("=== Adoption Recommendation ===");
  console.log();
  console.log(`Repo shape: ${rec.repo_shape}`);
  console.log(`  ${rec.shape_reason}`);
  console.log();

  console.log(`Recommended preset: ${rec.recommended_preset}`);
  console.log(`  ${rec.preset_reason}`);
  console.log();

  console.log(`Likely confidence: ${rec.likely_confidence}`);
  console.log(`  ${rec.confidence_reason}`);
  console.log();

  console.log(`=== Sources (${rec.source_recommendation.recommended_count}/${rec.source_recommendation.total_found}) ===`);
  for (const s of rec.source_recommendation.recommended_sources) {
    console.log(`  [ingest] ${s.path}`);
    console.log(`    ${s.reason}`);
  }
  if (rec.source_recommendation.deferred_sources.length > 0) {
    console.log();
    console.log("  Deferred (over token budget):");
    for (const s of rec.source_recommendation.deferred_sources) {
      console.log(`    [later] ${s.path}`);
    }
  }
  if (rec.source_recommendation.needs_voice_split) {
    console.log();
    console.log(`  [!] ${rec.source_recommendation.voice_split_reason}`);
  }
  console.log(`  Estimated tokens: ~${rec.source_recommendation.estimated_tokens}`);
  console.log();

  console.log("=== Gate Policy ===");
  if (rec.gate_recommendation.initial_surfaces.length > 0) {
    console.log("  Initial surfaces:");
    for (const s of rec.gate_recommendation.initial_surfaces) {
      console.log(`    ${s.artifact_type}: ${s.mode} — ${s.reason}`);
    }
  }
  if (rec.gate_recommendation.deferred_surfaces.length > 0) {
    console.log("  Deferred:");
    for (const s of rec.gate_recommendation.deferred_surfaces) {
      console.log(`    ${s.artifact_type}: advisory — ${s.reason}`);
    }
  }
  console.log();

  if (rec.risk_briefing.length > 0) {
    console.log("=== Risks ===");
    for (const r of rec.risk_briefing) console.log(`  [!] ${r}`);
    console.log();
  }

  if (rec.drift_watchlist.length > 0) {
    console.log("=== Drift Watchlist ===");
    for (const d of rec.drift_watchlist) console.log(`  ~ ${d}`);
    console.log();
  }

  console.log("To proceed: taste onboard run --slug <name> --repo-path <path> --preset " + rec.recommended_preset + " --auto-ingest");
}

function printReport(report: ReturnType<typeof generateOnboardReport>): void {
  console.log(`Project: ${report.project_slug}`);
  console.log(`Sources found: ${report.source_artifacts_found}`);
  console.log(`Canon statements: ${report.canon_statement_count}`);

  const confIcons = { strong: "[STRONG]", moderate: "[MODERATE]", sparse: "[SPARSE]", empty: "[EMPTY]" };
  console.log(`Canon confidence: ${confIcons[report.canon_confidence]}`);
  console.log();

  if (report.sparse_warnings.length > 0) {
    console.log("Sparse canon warnings:");
    for (const w of report.sparse_warnings) console.log(`  [!] ${w}`);
    console.log();
  }

  console.log("Surface readiness:");
  for (const [type, readiness] of Object.entries(report.surface_readiness)) {
    const coverage = readiness.has_canon_coverage ? "covered" : "sparse";
    console.log(`  ${type}: ${coverage} → ${readiness.recommended_mode}`);
    console.log(`    ${readiness.reason}`);
  }

  if (report.recommended_first_surfaces.length > 0) {
    console.log();
    console.log(`Recommended first surfaces: ${report.recommended_first_surfaces.join(", ")}`);
  }

  console.log();
  console.log(`Ready for gate: ${report.ready_for_gate ? "YES" : "NOT YET"}`);

  if (report.next_steps.length > 0) {
    console.log();
    console.log("Next steps:");
    for (const step of report.next_steps) console.log(`  → ${step}`);
  }
}
