import { resolve, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import { getCandidateArtifacts } from "../../artifacts/candidate-artifacts.js";
import { OllamaProvider } from "../../providers/ollama/ollama-provider.js";
import { getAlignmentReview } from "../../review/review-store.js";
import { runRevision } from "../../revision/revision-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

export async function reviseRunCommand(opts: {
  root?: string;
  artifact: string;
  canonVersion?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());

  if (!isInitialized(root)) {
    console.log("Not initialized.");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); process.exitCode = 1; return; }

  const canonVersion = opts.canonVersion ?? project.current_version;
  if (!canonVersion) { console.log("No canon version. Run 'taste canon freeze' first."); closeDb(); process.exitCode = 1; return; }

  // Find the candidate artifact
  const allCandidates = getCandidateArtifacts(db, project.id);
  const candidate = allCandidates.find((c) => c.id === opts.artifact || c.id.startsWith(opts.artifact));
  if (!candidate) { console.log(`Candidate not found: ${opts.artifact}`); closeDb(); process.exitCode = 1; return; }

  // Find the review
  const review = getAlignmentReview(db, candidate.id);
  if (!review) { console.log(`No review found for artifact ${candidate.id}. Run 'taste review run' first.`); closeDb(); process.exitCode = 1; return; }

  const provider = new OllamaProvider({ baseUrl: config.provider.baseUrl, model: config.provider.model });
  const health = await provider.healthCheck();
  if (!health.ok) { console.log(`Ollama not available: ${health.detail}`); closeDb(); process.exitCode = 1; return; }

  console.log(`Revising: ${candidate.title}`);
  console.log(`Source verdict: ${review.verdict}`);
  console.log(`Canon version: ${canonVersion}`);
  console.log();

  const result = await runRevision(db, provider, {
    projectId: project.id,
    canonVersion,
    candidate,
    reviewId: review.id,
    onStep: (step) => console.log(`  [${step}]`),
  });

  if (result.errors.length > 0) {
    console.log();
    for (const e of result.errors) console.log(`  ERROR: ${e}`);
  }

  if (result.options.length === 0) {
    console.log("No revision options produced.");
    closeDb();
    return;
  }

  for (const scored of result.options) {
    const opt = scored.option;
    const tierIcon = scored.tier_improvement > 0 ? `+${scored.tier_improvement}` : scored.tier_improvement === 0 ? "=" : `${scored.tier_improvement}`;

    console.log();
    console.log(`=== ${opt.level.toUpperCase()} REVISION (${review.verdict} → ${scored.re_review_verdict} [${tierIcon}]) ===`);
    console.log();
    console.log(opt.body);
    console.log();
    console.log("--- Change Rationale ---");
    for (const cr of opt.change_rationale) {
      console.log(`  ~ ${cr.change}`);
      console.log(`    Drift fixed: ${cr.drift_fixed}`);
      console.log(`    Canon restored: ${cr.canon_restored}`);
    }
    if (opt.preserved_strengths.length > 0) {
      console.log();
      console.log("--- Preserved ---");
      for (const s of opt.preserved_strengths) console.log(`  + ${s}`);
    }
    if (opt.unresolved_tradeoffs.length > 0) {
      console.log();
      console.log("--- Unresolved Tradeoffs ---");
      for (const t of opt.unresolved_tradeoffs) console.log(`  ? ${t}`);
    }
    console.log();
    console.log(`  Dimensions: thesis=${scored.thesis_preservation} pattern=${scored.pattern_fidelity} anti=${scored.anti_pattern_collision} voice=${scored.voice_naming_fit}`);
  }

  closeDb();
}
