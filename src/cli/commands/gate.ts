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
