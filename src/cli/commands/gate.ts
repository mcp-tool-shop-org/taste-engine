import { resolve, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import { OllamaProvider } from "../../providers/ollama/ollama-provider.js";
import { detectArtifacts, getChangedFiles } from "../../gate/artifact-detector.js";
import { runGate, gateResultToJson } from "../../gate/gate-engine.js";
import type { EnforcementMode } from "../../gate/gate-types.js";
import { ENFORCEMENT_MODES } from "../../gate/gate-types.js";
import { loadPolicy, savePolicy, getModeForArtifact, shouldSkip, recordOverride, getOverrides } from "../../gate/policy.js";
import { DEFAULT_POLICY } from "../../gate/policy-types.js";
import { computeRolloutReport } from "../../gate/rollout-report.js";
import { tasteDir } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

export async function gateRunCommand(opts: {
  root?: string;
  files?: string[];
  staged?: boolean;
  mode?: string;
  canonVersion?: string;
  json?: boolean;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());

  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); process.exitCode = 1; return; }

  const canonVersion = opts.canonVersion ?? project.current_version;
  if (!canonVersion) { console.log("No canon version. Run 'taste canon freeze' first."); closeDb(); process.exitCode = 1; return; }

  const mode: EnforcementMode = (opts.mode as EnforcementMode) ?? "advisory";
  if (!(ENFORCEMENT_MODES as readonly string[]).includes(mode)) {
    console.log(`Invalid mode: ${mode}. Use: ${ENFORCEMENT_MODES.join(", ")}`);
    closeDb(); process.exitCode = 1; return;
  }

  // Detect artifacts
  let filePaths: string[];
  if (opts.files && opts.files.length > 0) {
    filePaths = opts.files.map((f) => resolve(f));
  } else {
    filePaths = getChangedFiles(root, opts.staged);
    if (filePaths.length === 0) {
      console.log("No changed files detected. Use --files to specify explicitly.");
      closeDb(); return;
    }
  }

  const artifacts = detectArtifacts(filePaths);
  if (artifacts.length === 0) {
    if (!opts.json) console.log("No supported artifacts found in changed files.");
    closeDb(); return;
  }

  // Health check
  const provider = new OllamaProvider({ baseUrl: config.provider.baseUrl, model: config.provider.model });
  const health = await provider.healthCheck();
  if (!health.ok) { console.log(`Ollama not available: ${health.detail}`); closeDb(); process.exitCode = 1; return; }

  if (!opts.json) {
    console.log(`Taste Gate — ${mode} mode`);
    console.log(`Canon: ${canonVersion}`);
    console.log(`Artifacts: ${artifacts.length}`);
    console.log();
  }

  const result = await runGate(db, provider, {
    projectId: project.id,
    canonVersion,
    artifacts,
    mode,
    callbacks: opts.json ? undefined : {
      onArtifactStart: (a, i, total) => {
        process.stdout.write(`  [${i + 1}/${total}] ${a.title} (${a.artifact_type})...`);
      },
      onArtifactComplete: (r, _i) => {
        const icons: Record<string, string> = { pass: "PASS", warn: "WARN", block: "BLOCK" };
        console.log(` ${icons[r.gate_result]} — ${r.verdict}`);
      },
    },
  });

  if (opts.json) {
    console.log(gateResultToJson(result));
  } else {
    console.log();

    // Per-artifact details
    for (const r of result.results) {
      if (r.gate_result === "pass") continue;

      console.log(`--- ${r.artifact.title} (${r.artifact.artifact_type}) ---`);
      console.log(`  Verdict: ${r.verdict}`);
      console.log(`  Gate: ${r.gate_result}`);
      console.log(`  ${r.summary}`);
      if (r.repair_path) {
        console.log(`  Repair: ${r.repair_path}`);
        if (r.repair_path === "patch") console.log("    Run: taste revise run --artifact <id>");
        if (r.repair_path === "structural") console.log("    Run: taste repair run --artifact <id>");
        if (r.repair_path === "irreparable") console.log("    This artifact's intent may need rethinking.");
      }
      console.log();
    }

    // Summary
    const icons: Record<string, string> = { pass: "[PASS]", warn: "[WARN]", block: "[BLOCK]" };
    console.log(`=== Gate Result: ${icons[result.overall]} ===`);
    console.log(`  Checked: ${result.artifacts_checked}`);
    console.log(`  Passed: ${result.artifacts_passed}`);
    if (result.artifacts_warned > 0) console.log(`  Warned: ${result.artifacts_warned}`);
    if (result.artifacts_blocked > 0) console.log(`  Blocked: ${result.artifacts_blocked}`);

    if (result.errors.length > 0) {
      console.log();
      for (const e of result.errors) console.log(`  ERROR: ${e}`);
    }

    // Exit code for CI
    if (mode === "required" && result.overall === "block") {
      process.exitCode = 1;
    }
  }

  closeDb();
}

// ── Policy Init ────────────────────────────────────────────────

export async function gatePolicyInitCommand(opts: { root?: string }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const config = loadConfig(root)!;
  const td = tasteDir(root);

  const policy = { ...DEFAULT_POLICY, canon_version: config.projectSlug === "role-os" ? "canon-v1" : "canon-v1" };
  savePolicy(td, policy);
  console.log(`Gate policy initialized at ${join(td, "gate-policy.json")}`);
  console.log(`  Mode: ${policy.default_mode}`);
  console.log(`  Canon: ${policy.canon_version}`);
  console.log("  Edit the file to add surface-specific enforcement.");
}

// ── Policy Show ────────────────────────────────────────────────

export async function gatePolicyShowCommand(opts: { root?: string }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const td = tasteDir(root);
  const policy = loadPolicy(td);

  console.log(`=== Gate Policy ===`);
  console.log(`  Canon version: ${policy.canon_version}`);
  console.log(`  Default mode: ${policy.default_mode}`);
  console.log(`  Require override receipts: ${policy.require_override_receipts}`);

  if (policy.surfaces.length > 0) {
    console.log();
    console.log("  Surfaces:");
    for (const s of policy.surfaces) {
      console.log(`    ${s.artifact_type}: ${s.mode}${s.globs.length > 0 ? ` (${s.globs.join(", ")})` : ""}`);
      if (s.notes) console.log(`      ${s.notes}`);
    }
  }

  if (policy.skip_globs.length > 0) {
    console.log();
    console.log(`  Skip: ${policy.skip_globs.join(", ")}`);
  }
}

// ── Override ───────────────────────────────────────────────────

export async function gateOverrideCommand(opts: {
  root?: string;
  artifact: string;
  type: string;
  verdict: string;
  gate: string;
  action: string;
  reason: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); process.exitCode = 1; return; }

  const override = recordOverride(db, {
    project_id: project.id,
    artifact_path: opts.artifact,
    artifact_type: opts.type,
    original_verdict: opts.verdict,
    original_gate_result: opts.gate,
    action: opts.action as any,
    reason: opts.reason,
    follow_up_artifact_id: null,
  });

  console.log(`Override recorded: ${override.id}`);
  console.log(`  Artifact: ${opts.artifact}`);
  console.log(`  Action: ${opts.action}`);
  console.log(`  Reason: ${opts.reason}`);

  closeDb();
}

// ── Rollout Report ─────────────────────────────────────────────

export async function gateReportCommand(opts: { root?: string; json?: boolean }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); process.exitCode = 1; return; }

  const canonVersion = project.current_version ?? "canon-v1";
  const report = computeRolloutReport(db, project.id, config.projectSlug, canonVersion);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    closeDb();
    return;
  }

  console.log(`=== Rollout Report: ${report.project_slug} ===`);
  console.log(`Canon: ${report.canon_version}`);
  console.log();
  console.log(`Gate runs: ${report.total_gate_runs}`);
  console.log(`  Passed: ${report.pass_count}`);
  console.log(`  Warned: ${report.warn_count}`);
  console.log(`  Blocked: ${report.block_count}`);
  console.log(`  Overrides: ${report.override_count}`);
  console.log(`  Repairs used: ${report.repair_usage_count}`);

  if (Object.keys(report.by_artifact_type).length > 0) {
    console.log();
    console.log("By artifact type:");
    for (const [type, counts] of Object.entries(report.by_artifact_type)) {
      const passRate = counts.checked > 0 ? ((counts.passed / counts.checked) * 100).toFixed(0) : "0";
      console.log(`  ${type}: ${counts.checked} checked, ${passRate}% pass, ${counts.blocked} blocked, ${counts.overridden} overridden`);
    }
  }

  if (report.hot_spots.length > 0) {
    console.log();
    console.log("Hot spots:");
    for (const hs of report.hot_spots) {
      console.log(`  [!] ${hs.artifact_type}: ${hs.issue} (${hs.count})`);
    }
  }

  if (Object.keys(report.promotion_readiness).length > 0) {
    console.log();
    console.log("Promotion readiness:");
    for (const [type, pr] of Object.entries(report.promotion_readiness)) {
      const arrow = pr.recommended_mode !== pr.current_mode ? ` → ${pr.recommended_mode}` : "";
      console.log(`  ${type}: ${pr.current_mode}${arrow} — ${pr.reason}`);
    }
  }

  closeDb();
}
