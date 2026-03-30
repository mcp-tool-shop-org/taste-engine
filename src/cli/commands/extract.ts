import { resolve, join } from "node:path";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import { getSourceArtifacts } from "../../artifacts/source-artifacts.js";
import { OllamaProvider } from "../../providers/ollama/ollama-provider.js";
import {
  getLatestExtractionRun,
  getPassResults,
  getCandidates,
  getCandidateCounts,
  getContradictions,
  getExemplars,
} from "../../extraction/extraction-store.js";
import { runExtraction, DEFAULT_PASSES, CORE_PASSES } from "../../extraction/extract.js";
import type { PassType } from "../../extraction/extraction-types.js";
import { PASS_TYPES } from "../../extraction/extraction-types.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

function ensureInit(root: string) {
  if (!isInitialized(root)) {
    console.log("Not initialized. Run: taste init <slug>");
    process.exitCode = 1;
    return null;
  }
  return loadConfig(root)!;
}

export async function extractRunCommand(opts: {
  root?: string;
  core?: boolean;
  passes?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const config = ensureInit(root);
  if (!config) return;

  const fullDbPath = join(root, config.dbPath);
  const db = openDb(fullDbPath);
  migrate(db, MIGRATIONS_DIR);

  const project = getProject(db, config.projectSlug);
  if (!project) {
    console.log(`Project "${config.projectSlug}" not found.`);
    closeDb();
    process.exitCode = 1;
    return;
  }

  const sources = getSourceArtifacts(db, project.id);
  if (sources.length === 0) {
    console.log("No source artifacts found. Ingest sources first.");
    console.log("Use: taste ingest <path> to add source artifacts.");
    closeDb();
    process.exitCode = 1;
    return;
  }

  // Determine pass set
  let passes: PassType[];
  if (opts.passes) {
    passes = opts.passes.split(",").map((p) => p.trim()) as PassType[];
    const invalid = passes.filter((p) => !(PASS_TYPES as readonly string[]).includes(p));
    if (invalid.length > 0) {
      console.log(`Invalid passes: ${invalid.join(", ")}`);
      console.log(`Valid: ${PASS_TYPES.join(", ")}`);
      closeDb();
      process.exitCode = 1;
      return;
    }
  } else {
    passes = opts.core ? CORE_PASSES : DEFAULT_PASSES;
  }

  const provider = new OllamaProvider({
    baseUrl: config.provider.baseUrl,
    model: config.provider.model,
  });

  // Health check first
  const health = await provider.healthCheck();
  if (!health.ok) {
    console.log(`Ollama not available: ${health.detail}`);
    closeDb();
    process.exitCode = 1;
    return;
  }

  console.log(`Extracting canon from ${sources.length} source artifact(s)`);
  console.log(`Passes: ${passes.join(", ")}`);
  console.log(`Model: ${config.provider.model}`);
  console.log();

  const result = await runExtraction(db, provider, {
    projectId: project.id,
    sources,
    passes,
    onPassStart: (passType) => {
      process.stdout.write(`  [${passType}] running...`);
    },
    onPassComplete: (pr) => {
      const counts = [
        pr.candidateCount > 0 ? `${pr.candidateCount} candidates` : null,
        pr.contradictionCount > 0 ? `${pr.contradictionCount} contradictions` : null,
        pr.exemplarCount > 0 ? `${pr.exemplarCount} exemplars` : null,
      ].filter(Boolean).join(", ");
      const status = pr.errors.length > 0 ? "ERRORS" : "done";
      console.log(` ${status}${counts ? ` (${counts})` : ""}`);
      for (const err of pr.errors) {
        console.log(`    ERROR: ${err}`);
      }
    },
  });

  console.log();
  console.log(`Extraction complete.`);
  console.log(`  Candidates: ${result.consolidation.total_after} (${result.consolidation.merged_count} merged)`);
  if (result.consolidation.generic_flagged > 0) {
    console.log(`  Generic/low-confidence: ${result.consolidation.generic_flagged}`);
  }
  if (result.totalErrors > 0) {
    console.log(`  Errors: ${result.totalErrors}`);
  }

  console.log();
  console.log(`Run ID: ${result.run.id}`);
  console.log("Use 'taste extract candidates' to inspect results.");

  closeDb();
}

export async function extractStatusCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());
  const config = ensureInit(root);
  if (!config) return;

  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);

  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); return; }

  const run = getLatestExtractionRun(db, project.id);
  if (!run) {
    console.log("No extraction runs yet.");
    closeDb();
    return;
  }

  const passes = getPassResults(db, run.id);
  const counts = getCandidateCounts(db, run.id);
  const contradictions = getContradictions(db, run.id);
  const exemplars = getExemplars(db, run.id);

  console.log(`Latest run: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Started: ${run.started_at}`);
  if (run.completed_at) console.log(`Completed: ${run.completed_at}`);
  console.log();

  console.log("Passes:");
  for (const p of passes) {
    console.log(`  ${p.pass_type}: ${p.status} (${p.candidate_count} candidates)`);
    if (p.error_detail) console.log(`    Error: ${p.error_detail}`);
  }

  console.log();
  console.log(`Candidates: ${counts.total}`);
  if (Object.keys(counts.by_type).length > 0) {
    console.log("  By type:");
    for (const [type, n] of Object.entries(counts.by_type)) {
      console.log(`    ${type}: ${n}`);
    }
  }
  if (Object.keys(counts.by_status).length > 0) {
    console.log("  By status:");
    for (const [status, n] of Object.entries(counts.by_status)) {
      console.log(`    ${status}: ${n}`);
    }
  }

  if (contradictions.length > 0) {
    console.log(`\nContradictions: ${contradictions.length}`);
  }
  if (exemplars.length > 0) {
    console.log(`Exemplars: ${exemplars.length}`);
  }

  closeDb();
}

export async function extractCandidatesCommand(opts: {
  root?: string;
  type?: string;
  status?: string;
  minConfidence?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const config = ensureInit(root);
  if (!config) return;

  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);

  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); return; }

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs."); closeDb(); return; }

  const candidates = getCandidates(db, run.id, {
    statement_type: opts.type as any,
    status: (opts.status as any) ?? "proposed",
    min_confidence: opts.minConfidence ? parseFloat(opts.minConfidence) : undefined,
  });

  if (candidates.length === 0) {
    console.log("No matching candidates.");
    closeDb();
    return;
  }

  for (const c of candidates) {
    console.log(`[${c.statement_type}] (${(c.confidence * 100).toFixed(0)}%) ${c.suggested_hardness}`);
    console.log(`  ${c.text}`);
    console.log(`  Rationale: ${c.rationale}`);
    if (c.evidence_refs.length > 0) {
      console.log(`  Evidence: ${c.evidence_refs.join(", ")}`);
    }
    console.log(`  Tags: ${c.tags.join(", ") || "(none)"}`);
    console.log(`  ID: ${c.id}`);
    console.log();
  }

  console.log(`${candidates.length} candidate(s) shown.`);
  closeDb();
}

export async function extractContradictionsCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());
  const config = ensureInit(root);
  if (!config) return;

  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);

  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); return; }

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs."); closeDb(); return; }

  const contradictions = getContradictions(db, run.id);
  if (contradictions.length === 0) {
    console.log("No contradictions found.");
    closeDb();
    return;
  }

  for (const c of contradictions) {
    console.log(`[${c.severity}] ${c.title}`);
    console.log(`  ${c.description}`);
    if (c.evidence_refs.length > 0) {
      console.log(`  Evidence: ${c.evidence_refs.join(", ")}`);
    }
    console.log(`  Status: ${c.status}`);
    console.log(`  ID: ${c.id}`);
    console.log();
  }

  console.log(`${contradictions.length} contradiction(s) found.`);
  closeDb();
}

export async function extractExemplarsCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());
  const config = ensureInit(root);
  if (!config) return;

  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);

  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); return; }

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs."); closeDb(); return; }

  const exemplars = getExemplars(db, run.id);
  if (exemplars.length === 0) {
    console.log("No exemplar nominations.");
    closeDb();
    return;
  }

  for (const e of exemplars) {
    console.log(`[${(e.confidence * 100).toFixed(0)}%] ${e.locator_kind}: ${e.locator_value}`);
    console.log(`  ${e.why_it_matters}`);
    if (e.candidate_traits.length > 0) {
      console.log(`  Traits: ${e.candidate_traits.join(", ")}`);
    }
    console.log(`  ID: ${e.id}`);
    console.log();
  }

  console.log(`${exemplars.length} exemplar(s) nominated.`);
  closeDb();
}
