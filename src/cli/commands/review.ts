import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import { insertCandidateArtifact, getCandidateArtifacts } from "../../artifacts/candidate-artifacts.js";
import { OllamaProvider } from "../../providers/ollama/ollama-provider.js";
import { runReview } from "../../review/review-engine.js";
import {
  listReviewRuns,
  getReviewRun,
  getPacketItems,
  getDimensionEvals,
  getAlignmentReview,
  getAlignmentReviewByRun,
  getObservations,
  getSuggestions,
} from "../../review/review-store.js";
import type { ArtifactType } from "../../core/enums.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

function setup(root: string) {
  if (!isInitialized(root)) {
    console.log("Not initialized. Run: taste init <slug>");
    process.exitCode = 1;
    return null;
  }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) {
    console.log(`Project "${config.projectSlug}" not found.`);
    closeDb();
    process.exitCode = 1;
    return null;
  }
  return { config, db, project };
}

export async function reviewRunCommand(opts: {
  root?: string;
  file?: string;
  artifact?: string;
  type: string;
  purpose: string;
  canonVersion: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { config, db, project } = ctx;

  if (!project.current_version && !opts.canonVersion) {
    console.log("No canon version frozen yet. Run 'taste canon freeze' first.");
    closeDb();
    process.exitCode = 1;
    return;
  }

  const canonVersion = opts.canonVersion ?? project.current_version!;
  const artifactType = opts.type as ArtifactType;

  // Get or create candidate artifact
  let candidate;
  if (opts.file) {
    const absPath = resolve(opts.file);
    if (!existsSync(absPath)) {
      console.log(`File not found: ${absPath}`);
      closeDb();
      process.exitCode = 1;
      return;
    }
    const body = readFileSync(absPath, "utf-8");
    const title = basename(absPath, extname(absPath));
    candidate = insertCandidateArtifact(db, project.id, title, artifactType, opts.purpose, body);
  } else if (opts.artifact) {
    const all = getCandidateArtifacts(db, project.id);
    candidate = all.find((c) => c.id === opts.artifact || c.id.startsWith(opts.artifact!));
    if (!candidate) {
      console.log(`Candidate artifact not found: ${opts.artifact}`);
      closeDb();
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("Provide --file or --artifact.");
    closeDb();
    process.exitCode = 1;
    return;
  }

  const provider = new OllamaProvider({
    baseUrl: config.provider.baseUrl,
    model: config.provider.model,
  });

  const health = await provider.healthCheck();
  if (!health.ok) {
    console.log(`Ollama not available: ${health.detail}`);
    closeDb();
    process.exitCode = 1;
    return;
  }

  console.log(`Reviewing: ${candidate.title}`);
  console.log(`Type: ${candidate.artifact_type}`);
  console.log(`Canon version: ${canonVersion}`);
  console.log();

  const result = await runReview(db, provider, {
    projectId: project.id,
    canonVersion,
    candidate,
    onDimensionStart: (dim) => {
      process.stdout.write(`  [${dim}] evaluating...`);
    },
    onDimensionComplete: (dim, rating) => {
      console.log(` ${rating}`);
    },
  });

  console.log();
  printReviewResult(result.alignmentReview.id, db);

  if (result.errors.length > 0) {
    console.log();
    console.log(`Errors: ${result.errors.length}`);
    for (const e of result.errors) {
      console.log(`  - ${e}`);
    }
  }

  closeDb();
}

export async function reviewShowCommand(reviewId: string, opts: { root?: string }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  // Find review by ID prefix
  const runs = listReviewRuns(db, project.id);
  const run = runs.find((r) => r.id === reviewId || r.id.startsWith(reviewId));

  if (run) {
    const review = getAlignmentReviewByRun(db, project.id, run.id);
    if (review) {
      printReviewResult(review.id, db);
      closeDb();
      return;
    }
  }

  // Try direct alignment review lookup
  const row = db.prepare("SELECT * FROM alignment_reviews WHERE id = ? OR id LIKE ?").get(reviewId, `${reviewId}%`) as any;
  if (row) {
    printReviewResult(row.id, db);
  } else {
    console.log(`Review not found: ${reviewId}`);
  }

  closeDb();
}

export async function reviewListCommand(opts: {
  root?: string;
  canonVersion?: string;
  verdict?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const runs = listReviewRuns(db, project.id, {
    canon_version: opts.canonVersion,
  });

  if (runs.length === 0) {
    console.log("No reviews found.");
    closeDb();
    return;
  }

  for (const run of runs) {
    const review = getAlignmentReviewByRun(db, project.id, run.id);
    const verdict = review?.verdict ?? "pending";
    if (opts.verdict && verdict !== opts.verdict) continue;

    console.log(`  [${verdict}] ${run.canon_version} — ${run.status}`);
    console.log(`    Run: ${run.id}`);
    console.log(`    Started: ${run.started_at}`);
    console.log();
  }

  closeDb();
}

export async function reviewPacketCommand(runId: string, opts: { root?: string }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const runs = listReviewRuns(db, project.id);
  const run = runs.find((r) => r.id === runId || r.id.startsWith(runId));
  if (!run) {
    console.log(`Review run not found: ${runId}`);
    closeDb();
    return;
  }

  const items = getPacketItems(db, run.id);
  if (items.length === 0) {
    console.log("No packet items found.");
    closeDb();
    return;
  }

  console.log(`Canon packet for run ${run.id}:`);
  console.log(`  Canon version: ${run.canon_version}`);
  console.log(`  Items: ${items.length}`);
  console.log();

  for (const item of items) {
    console.log(`  #${item.rank} [${item.source_kind}] ${item.reason_selected}`);
    console.log(`    Source: ${item.source_id}`);
  }

  closeDb();
}

function printReviewResult(reviewId: string, db: import("better-sqlite3").Database): void {
  const review = db.prepare("SELECT * FROM alignment_reviews WHERE id = ?").get(reviewId) as any;
  if (!review) return;

  const verdictIcons: Record<string, string> = {
    aligned: "[ALIGNED]",
    mostly_aligned: "[MOSTLY ALIGNED]",
    salvageable_drift: "[SALVAGEABLE DRIFT]",
    hard_drift: "[HARD DRIFT]",
    contradiction: "[CONTRADICTION]",
  };

  console.log(`=== Verdict: ${verdictIcons[review.verdict] ?? review.verdict} ===`);
  console.log();
  console.log(`Thesis preservation:    ${review.thesis_preservation}`);
  console.log(`Pattern fidelity:       ${review.pattern_fidelity}`);
  console.log(`Anti-pattern collision: ${review.anti_pattern_collision}`);
  console.log(`Voice/naming fit:       ${review.voice_naming_fit}`);
  console.log();
  console.log(`Summary: ${review.summary}`);

  const observations = getObservations(db, reviewId);
  const preserved = observations.filter((o) => o.kind === "preserved");
  const drift = observations.filter((o) => o.kind === "drift");
  const conflicts = observations.filter((o) => o.kind === "conflict");
  const uncertainties = observations.filter((o) => o.kind === "uncertainty");

  if (preserved.length > 0) {
    console.log();
    console.log("=== Preserved ===");
    for (const o of preserved) console.log(`  + ${o.text}`);
  }

  if (drift.length > 0) {
    console.log();
    console.log("=== Drift Points ===");
    for (const o of drift) console.log(`  ~ ${o.text}`);
  }

  if (conflicts.length > 0) {
    console.log();
    console.log("=== Conflicts ===");
    for (const o of conflicts) console.log(`  ! ${o.text}`);
  }

  if (uncertainties.length > 0) {
    console.log();
    console.log("=== Uncertainties ===");
    for (const o of uncertainties) console.log(`  ? ${o.text}`);
  }

  const suggestions = getSuggestions(db, reviewId);
  if (suggestions.length > 0) {
    console.log();
    console.log("=== Revision Guidance ===");
    for (const s of suggestions) {
      const icon = s.action === "keep" ? "+" : s.action === "cut" ? "-" : "~";
      console.log(`  ${icon} [${s.action}] ${s.guidance}`);
      if (s.target_excerpt) console.log(`    Target: "${s.target_excerpt}"`);
    }
  }

  console.log();
  console.log(`Review ID: ${reviewId}`);
}
