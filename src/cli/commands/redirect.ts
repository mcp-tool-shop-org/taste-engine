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
import { runRedirect } from "../../redirect/redirect-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

export async function redirectRunCommand(opts: {
  root?: string;
  artifact: string;
  canonVersion?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());

  if (!isInitialized(root)) { console.log("Not initialized."); process.exitCode = 1; return; }
  const config = loadConfig(root)!;
  const db = openDb(join(root, config.dbPath));
  migrate(db, MIGRATIONS_DIR);
  const project = getProject(db, config.projectSlug);
  if (!project) { console.log("Project not found."); closeDb(); process.exitCode = 1; return; }

  const canonVersion = opts.canonVersion ?? project.current_version;
  if (!canonVersion) { console.log("No canon version."); closeDb(); process.exitCode = 1; return; }

  const allCandidates = getCandidateArtifacts(db, project.id);
  const candidate = allCandidates.find((c) => c.id === opts.artifact || c.id.startsWith(opts.artifact));
  if (!candidate) { console.log(`Candidate not found: ${opts.artifact}`); closeDb(); process.exitCode = 1; return; }

  const review = getAlignmentReview(db, candidate.id);
  if (!review) { console.log("No review found."); closeDb(); process.exitCode = 1; return; }

  const provider = new OllamaProvider({ baseUrl: config.provider.baseUrl, model: config.provider.model });
  const health = await provider.healthCheck();
  if (!health.ok) { console.log(`Ollama not available: ${health.detail}`); closeDb(); process.exitCode = 1; return; }

  console.log(`Goal Redirection: ${candidate.title}`);
  console.log(`Source verdict: ${review.verdict}`);
  console.log();

  const result = await runRedirect(db, provider, {
    projectId: project.id, canonVersion, candidate, reviewId: review.id,
    onStep: (step) => console.log(`  [${step}]`),
  });

  if (result.errors.length > 0) {
    for (const e of result.errors) console.log(`  ERROR: ${e}`);
    closeDb();
    return;
  }

  const brief = result.brief!;

  console.log();
  console.log("=== PRESERVED GOAL ===");
  console.log(`  ${brief.preserved_goal}`);

  console.log();
  console.log("=== CONFLICT ===");
  console.log(`  ${brief.conflict_explanation}`);

  console.log();
  console.log("=== NON-NEGOTIABLE CONSTRAINTS ===");
  for (const c of brief.non_negotiable_constraints) {
    console.log(`  - ${c}`);
  }

  console.log();
  console.log("=== REDIRECTED DIRECTIONS ===");
  for (let i = 0; i < brief.directions.length; i++) {
    const d = brief.directions[i];
    console.log();
    console.log(`  ${i + 1}. ${d.title}`);
    console.log(`     ${d.summary}`);
    console.log(`     Preserves goal: ${d.how_it_preserves_goal}`);
    console.log(`     Canon alignment: ${d.canon_alignment}`);
    if (d.tradeoffs.length > 0) {
      for (const t of d.tradeoffs) console.log(`     ? ${t}`);
    }
  }

  console.log();
  console.log("=== RECOMMENDED NEXT BRIEF ===");
  console.log();
  console.log(brief.recommended_next_brief);

  console.log();
  console.log(`Redirect ID: ${brief.id}`);

  closeDb();
}
