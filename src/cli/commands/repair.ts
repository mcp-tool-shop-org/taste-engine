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
import { runStructuralRepair } from "../../revision/structural-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

export async function repairRunCommand(opts: {
  root?: string;
  artifact: string;
  canonVersion?: string;
  maxConcepts?: string;
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
  if (!review) { console.log("No review found. Run 'taste review run' first."); closeDb(); process.exitCode = 1; return; }

  const provider = new OllamaProvider({ baseUrl: config.provider.baseUrl, model: config.provider.model });
  const health = await provider.healthCheck();
  if (!health.ok) { console.log(`Ollama not available: ${health.detail}`); closeDb(); process.exitCode = 1; return; }

  console.log(`Structural repair: ${candidate.title}`);
  console.log(`Source verdict: ${review.verdict}`);
  console.log(`Canon version: ${canonVersion}`);
  console.log();

  const result = await runStructuralRepair(db, provider, {
    projectId: project.id, canonVersion, candidate, reviewId: review.id,
    escalationReason: "Patch-first revision did not improve verdict sufficiently",
    maxConcepts: opts.maxConcepts ? parseInt(opts.maxConcepts) : 3,
    onStep: (step) => console.log(`  [${step}]`),
  });

  if (result.errors.length > 0) {
    console.log();
    for (const e of result.errors) console.log(`  ERROR: ${e}`);
  }

  // Print goal
  if (result.goal) {
    console.log();
    console.log("=== GOAL ===");
    console.log(`  ${result.goal.primary_goal}`);
    if (result.goal.preserved_intent.length > 0) {
      console.log("  Preserved intent:");
      for (const p of result.goal.preserved_intent) console.log(`    + ${p}`);
    }
  }

  // Print fault
  if (result.fault) {
    console.log();
    console.log("=== STRUCTURAL FAULT ===");
    console.log(`  ${result.fault.structural_fault}`);
    console.log(`  Why patch fails: ${result.fault.why_patch_is_insufficient}`);
    console.log(`  Repairable: ${result.fault.goal_is_repairable ? "yes" : "NO"}`);
  }

  // Irreparable
  if (result.irreparable) {
    console.log();
    console.log("=== IRREPARABLE ===");
    console.log(`  ${result.irreparable.reason}`);
    if (result.irreparable.suggested_reframe) {
      console.log(`  Suggested reframe: ${result.irreparable.suggested_reframe}`);
    }
    closeDb();
    return;
  }

  // Print outcomes
  for (const outcome of result.outcomes) {
    const tierIcon = outcome.tier_improvement > 0 ? `+${outcome.tier_improvement}` : outcome.tier_improvement === 0 ? "=" : `${outcome.tier_improvement}`;

    console.log();
    console.log(`=== REPAIR #${outcome.option_index + 1}: ${outcome.concept.title} (${review.verdict} → ${outcome.re_review_verdict} [${tierIcon}]) ===`);
    console.log();
    console.log(outcome.draft.body);
    console.log();
    console.log("  Concept: " + outcome.concept.summary);
    console.log("  Preserved goal: " + outcome.concept.preserved_goal);
    console.log("  Replacement: " + outcome.concept.replacement_mechanism);
    if (outcome.concept.tradeoffs.length > 0) {
      console.log("  Tradeoffs:");
      for (const t of outcome.concept.tradeoffs) console.log(`    ? ${t}`);
    }
    console.log(`  Dimensions: thesis=${outcome.thesis_preservation} pattern=${outcome.pattern_fidelity} anti=${outcome.anti_pattern_collision} voice=${outcome.voice_naming_fit}`);
  }

  if (result.outcomes.length > 0) {
    const best = result.outcomes[0];
    console.log();
    console.log(`=== RECOMMENDED: #${best.option_index + 1} — ${best.concept.title} ===`);
  }

  closeDb();
}
