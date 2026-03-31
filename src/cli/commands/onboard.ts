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
