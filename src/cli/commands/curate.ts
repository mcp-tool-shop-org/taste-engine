import { resolve, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject, getStatements } from "../../canon/canon-store.js";
import {
  getLatestExtractionRun,
  getCandidates,
  getContradictions,
  getExemplars,
} from "../../extraction/extraction-store.js";
import {
  acceptCandidate,
  rejectCandidate,
  deferCandidate,
  mergeCandidate,
  checkFreezeBlockers,
  freezeCanon,
  createAcceptedTension,
  getAcceptedTensions,
} from "../../curation/curation-store.js";
import { writeCanonFile } from "../../canon/canon-files.js";
import type { ExtractedStatementCandidate } from "../../extraction/extraction-types.js";
import type { HardnessLevel, Scope } from "../../core/enums.js";

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

// ── Queue ──────────────────────────────────────────────────────

export async function curateQueueCommand(opts: {
  root?: string;
  type?: string;
  minConfidence?: string;
  status?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs. Run 'taste extract run' first."); closeDb(); return; }

  const candidates = getCandidates(db, run.id, {
    statement_type: opts.type as any,
    status: (opts.status as any) ?? "proposed",
    min_confidence: opts.minConfidence ? parseFloat(opts.minConfidence) : undefined,
  });

  if (candidates.length === 0) {
    console.log("No candidates matching filters.");
    closeDb();
    return;
  }

  for (const c of candidates) {
    const conf = (c.confidence * 100).toFixed(0);
    const generic = c.confidence < 0.3 ? " [GENERIC]" : "";
    console.log(`  [${c.statement_type}] ${conf}% ${c.suggested_hardness}${generic}`);
    console.log(`    ${c.text}`);
    console.log(`    ID: ${c.id}`);
    console.log();
  }

  console.log(`${candidates.length} candidate(s) in queue.`);
  closeDb();
}

// ── Inspect ────────────────────────────────────────────────────

export async function curateInspectCommand(candidateId: string, opts: { root?: string }): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs."); closeDb(); return; }

  const all = getCandidates(db, run.id);
  const candidate = all.find((c) => c.id === candidateId || c.id.startsWith(candidateId));
  if (!candidate) {
    console.log(`Candidate not found: ${candidateId}`);
    closeDb();
    return;
  }

  console.log("=== Candidate ===");
  console.log(`ID:         ${candidate.id}`);
  console.log(`Type:       ${candidate.statement_type}`);
  console.log(`Status:     ${candidate.status}`);
  console.log(`Text:       ${candidate.text}`);
  console.log(`Rationale:  ${candidate.rationale}`);
  console.log(`Confidence: ${(candidate.confidence * 100).toFixed(0)}%`);
  if (candidate.confidence < 0.3) console.log(`            [GENERIC PENALTY APPLIED]`);
  console.log();

  console.log("=== Suggestions ===");
  console.log(`Hardness:       ${candidate.suggested_hardness}`);
  console.log(`Scope:          ${candidate.suggested_scope.join(", ")}`);
  console.log(`Artifact types: ${candidate.suggested_artifact_types.join(", ") || "(any)"}`);
  console.log(`Tags:           ${candidate.tags.join(", ") || "(none)"}`);
  console.log();

  if (candidate.evidence_refs.length > 0) {
    console.log("=== Evidence ===");
    for (const ref of candidate.evidence_refs) {
      console.log(`  - ${ref}`);
    }
    console.log();
  }

  // Related: similar candidates
  const related = all.filter((c) =>
    c.id !== candidate.id &&
    c.statement_type === candidate.statement_type &&
    c.status === "proposed",
  );
  if (related.length > 0) {
    console.log(`=== Related candidates (${related.length}) ===`);
    for (const r of related.slice(0, 5)) {
      console.log(`  [${(r.confidence * 100).toFixed(0)}%] ${r.text.slice(0, 80)}`);
      console.log(`    ID: ${r.id}`);
    }
    console.log();
  }

  // Contradictions
  const contradictions = getContradictions(db, run.id);
  if (contradictions.length > 0) {
    console.log(`=== Contradictions (${contradictions.length}) ===`);
    for (const c of contradictions) {
      console.log(`  [${c.severity}] ${c.title} (${c.status})`);
    }
    console.log();
  }

  // Existing accepted canon
  const accepted = getStatements(db, project.id, { lifecycle: "accepted" });
  if (accepted.length > 0) {
    console.log(`=== Accepted canon (${accepted.length}) ===`);
    for (const s of accepted.slice(0, 5)) {
      console.log(`  [${s.statement_type}] ${s.hardness}: ${s.text.slice(0, 80)}`);
    }
    console.log();
  }

  console.log("=== Actions ===");
  console.log("  taste curate accept <id>");
  console.log("  taste curate edit <id> --text \"revised text\"");
  console.log("  taste curate reject <id> --reason \"why\"");
  console.log("  taste curate defer <id>");
  console.log("  taste curate merge <id> --into <statement-id>");

  closeDb();
}

// ── Accept ─────────────────────────────────────────────────────

export async function curateAcceptCommand(candidateId: string, opts: {
  root?: string;
  hardness?: string;
  scope?: string;
  tag?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const candidate = findCandidate(db, project.id, candidateId);
  if (!candidate) { closeDb(); return; }

  const overrides: Parameters<typeof acceptCandidate>[2] = {};
  if (opts.hardness) overrides.hardness = opts.hardness as HardnessLevel;
  if (opts.scope) overrides.scope = opts.scope.split(",").map((s) => s.trim()) as Scope[];
  if (opts.tag) overrides.tags = opts.tag.split(",").map((t) => t.trim());

  const { statement } = acceptCandidate(db, candidate, Object.keys(overrides).length > 0 ? overrides : undefined);

  console.log(`Accepted into canon: ${statement.text.slice(0, 80)}`);
  console.log(`  Statement ID: ${statement.id}`);
  console.log(`  Hardness: ${statement.hardness}`);
  console.log(`  Scope: ${statement.scope.join(", ")}`);

  closeDb();
}

// ── Edit + Accept ──────────────────────────────────────────────

export async function curateEditCommand(candidateId: string, opts: {
  root?: string;
  text: string;
  hardness?: string;
  scope?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const candidate = findCandidate(db, project.id, candidateId);
  if (!candidate) { closeDb(); return; }

  const overrides: Parameters<typeof acceptCandidate>[2] = { text: opts.text };
  if (opts.hardness) overrides.hardness = opts.hardness as HardnessLevel;
  if (opts.scope) overrides.scope = opts.scope.split(",").map((s) => s.trim()) as Scope[];

  const { statement } = acceptCandidate(db, candidate, overrides);

  console.log(`Accepted with edits: ${statement.text.slice(0, 80)}`);
  console.log(`  Statement ID: ${statement.id}`);

  closeDb();
}

// ── Reject ─────────────────────────────────────────────────────

export async function curateRejectCommand(candidateId: string, opts: {
  root?: string;
  reason: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const candidate = findCandidate(db, project.id, candidateId);
  if (!candidate) { closeDb(); return; }

  rejectCandidate(db, candidate, opts.reason);
  console.log(`Rejected: ${candidate.text.slice(0, 80)}`);
  console.log(`  Reason: ${opts.reason}`);

  closeDb();
}

// ── Defer ──────────────────────────────────────────────────────

export async function curateDeferCommand(candidateId: string, opts: {
  root?: string;
  reason?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const candidate = findCandidate(db, project.id, candidateId);
  if (!candidate) { closeDb(); return; }

  deferCandidate(db, candidate, opts.reason);
  console.log(`Deferred: ${candidate.text.slice(0, 80)}`);

  closeDb();
}

// ── Merge ──────────────────────────────────────────────────────

export async function curateMergeCommand(candidateId: string, opts: {
  root?: string;
  into: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const candidate = findCandidate(db, project.id, candidateId);
  if (!candidate) { closeDb(); return; }

  const statements = getStatements(db, project.id, { lifecycle: "accepted" });
  const target = statements.find((s) => s.id === opts.into || s.id.startsWith(opts.into));
  if (!target) {
    console.log(`Target statement not found: ${opts.into}`);
    closeDb();
    return;
  }

  mergeCandidate(db, candidate, target.id);
  console.log(`Merged into: ${target.text.slice(0, 80)}`);

  closeDb();
}

// ── Contradictions ─────────────────────────────────────────────

export async function curateContradictionsCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs."); closeDb(); return; }

  const contradictions = getContradictions(db, run.id);
  const tensions = getAcceptedTensions(db, project.id);

  if (contradictions.length === 0 && tensions.length === 0) {
    console.log("No contradictions or tensions.");
    closeDb();
    return;
  }

  if (contradictions.length > 0) {
    console.log(`=== Contradictions (${contradictions.length}) ===`);
    for (const c of contradictions) {
      console.log(`  [${c.severity}] ${c.title} — ${c.status}`);
      console.log(`    ${c.description}`);
      console.log(`    ID: ${c.id}`);
      console.log();
    }
  }

  if (tensions.length > 0) {
    console.log(`=== Accepted Tensions (${tensions.length}) ===`);
    for (const t of tensions) {
      console.log(`  [${t.severity}] ${t.title}`);
      console.log(`    ${t.resolution_note}`);
      console.log();
    }
  }

  closeDb();
}

// ── Resolve Contradiction ──────────────────────────────────────

export async function curateResolveContradictionCommand(findingId: string, opts: {
  root?: string;
  action: "resolve" | "accept_tension";
  note: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { db, project } = ctx;

  const run = getLatestExtractionRun(db, project.id);
  if (!run) { console.log("No extraction runs."); closeDb(); return; }

  const all = getContradictions(db, run.id);
  const finding = all.find((c) => c.id === findingId || c.id.startsWith(findingId));
  if (!finding) {
    console.log(`Contradiction not found: ${findingId}`);
    closeDb();
    return;
  }

  if (opts.action === "resolve") {
    db.prepare("UPDATE contradiction_findings SET status = 'resolved' WHERE id = ?").run(finding.id);
    console.log(`Resolved: ${finding.title}`);
  } else {
    db.prepare("UPDATE contradiction_findings SET status = 'accepted_tension' WHERE id = ?").run(finding.id);

    createAcceptedTension(db, {
      project_id: project.id,
      canon_version: "pending",
      title: finding.title,
      description: finding.description,
      related_statement_ids: [],
      evidence_refs: finding.evidence_refs,
      resolution_note: opts.note,
      severity: finding.severity,
    });

    console.log(`Accepted as tension: ${finding.title}`);
  }

  closeDb();
}

// ── Freeze ─────────────────────────────────────────────────────

export async function canonFreezeCommand(opts: {
  root?: string;
  label: string;
  notes?: string;
  force?: boolean;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());
  const ctx = setup(root);
  if (!ctx) return;
  const { config, db, project } = ctx;

  // Check blockers
  const blockers = checkFreezeBlockers(db, project.id);
  if (blockers.length > 0 && !opts.force) {
    console.log("Cannot freeze — blockers found:");
    for (const b of blockers) {
      console.log(`  [BLOCK] ${b.reason}`);
      for (const d of b.details) {
        console.log(`    - ${d}`);
      }
    }
    console.log();
    console.log("Use --force to override.");
    closeDb();
    process.exitCode = 1;
    return;
  }

  if (blockers.length > 0 && opts.force) {
    console.log("Overriding blockers:");
    for (const b of blockers) {
      console.log(`  [WARN] ${b.reason}`);
    }
    console.log();
  }

  const result = freezeCanon(db, project.id, opts.label, opts.notes);

  // Write canon JSON file
  const statements = getStatements(db, project.id, { lifecycle: "accepted" });
  const tensions = getAcceptedTensions(db, project.id);

  // Build extended canon file with tensions
  const canonDir = join(root, config.canonDir);
  writeCanonFile(canonDir, config.projectSlug, project.name, opts.label, statements, [], statements.length);

  console.log(`Canon frozen: ${opts.label}`);
  console.log(`  Statements: ${result.statementCount}`);
  for (const [type, count] of Object.entries(result.snapshot.statement_counts_by_type)) {
    console.log(`    ${type}: ${count}`);
  }
  if (result.tensionCount > 0) {
    console.log(`  Accepted tensions: ${result.tensionCount}`);
  }
  if (result.exemplarCount > 0) {
    console.log(`  Exemplars: ${result.exemplarCount}`);
  }
  for (const w of result.warnings) {
    console.log(`  [WARN] ${w}`);
  }
  console.log();
  console.log(`Canon file: ${join(canonDir, `${config.projectSlug}-${opts.label}.json`)}`);

  closeDb();
}

// ── Helpers ────────────────────────────────────────────────────

function findCandidate(
  db: import("better-sqlite3").Database,
  projectId: string,
  candidateId: string,
): ExtractedStatementCandidate | null {
  const run = getLatestExtractionRun(db, projectId);
  if (!run) { console.log("No extraction runs."); return null; }

  const all = getCandidates(db, run.id);
  const candidate = all.find((c) => c.id === candidateId || c.id.startsWith(candidateId));
  if (!candidate) {
    console.log(`Candidate not found: ${candidateId}`);
    return null;
  }
  return candidate;
}
