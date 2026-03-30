#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { canonStatusCommand } from "./commands/canon.js";
import { ingestCommand } from "./commands/ingest.js";
import {
  extractRunCommand,
  extractStatusCommand,
  extractCandidatesCommand,
  extractContradictionsCommand,
  extractExemplarsCommand,
} from "./commands/extract.js";
import {
  reviewRunCommand,
  reviewShowCommand,
  reviewListCommand,
  reviewPacketCommand,
} from "./commands/review.js";
import {
  curateQueueCommand,
  curateInspectCommand,
  curateAcceptCommand,
  curateEditCommand,
  curateRejectCommand,
  curateDeferCommand,
  curateMergeCommand,
  curateContradictionsCommand,
  curateResolveContradictionCommand,
  canonFreezeCommand,
} from "./commands/curate.js";

const program = new Command();

program
  .name("taste")
  .description("Canon-and-judgment system for creative and product work")
  .version("0.1.0");

program
  .command("init <slug>")
  .description("Initialize taste-engine for a project")
  .option("-n, --name <name>", "Project display name (defaults to slug)")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (slug: string, opts: { name?: string; root?: string }) => {
    await initCommand({ slug, name: opts.name, root: opts.root });
  });

program
  .command("doctor")
  .description("Check environment health")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await doctorCommand(opts);
  });

program
  .command("ingest <paths...>")
  .description("Ingest source artifacts (files or directories)")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-t, --type <type>", "Force artifact type (readme, doc, architecture_note, etc.)")
  .action(async (paths: string[], opts: { root?: string; type?: string }) => {
    await ingestCommand({ paths, root: opts.root, type: opts.type });
  });

// Canon commands
const canon = program
  .command("canon")
  .description("Canon management commands");

canon
  .command("status")
  .description("Show current canon state")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await canonStatusCommand(opts);
  });

canon
  .command("freeze")
  .description("Freeze accepted canon into a versioned snapshot")
  .requiredOption("-l, --label <label>", "Version label (e.g., canon-v1)")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-n, --notes <notes>", "Version notes")
  .option("-f, --force", "Override freeze blockers")
  .action(async (opts: { root?: string; label: string; notes?: string; force?: boolean }) => {
    await canonFreezeCommand(opts);
  });

// Extract commands
const extract = program
  .command("extract")
  .description("Canon extraction commands");

extract
  .command("run")
  .description("Run multi-pass canon extraction")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--core", "Run only core passes (thesis, anti-pattern, pattern, contradiction)")
  .option("--passes <passes>", "Comma-separated list of passes to run")
  .action(async (opts: { root?: string; core?: boolean; passes?: string }) => {
    await extractRunCommand(opts);
  });

extract
  .command("status")
  .description("Show latest extraction run status")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await extractStatusCommand(opts);
  });

extract
  .command("candidates")
  .description("List extracted candidates")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-t, --type <type>", "Filter by statement type")
  .option("-s, --status <status>", "Filter by status (default: proposed)")
  .option("-c, --min-confidence <n>", "Minimum confidence threshold")
  .action(async (opts: { root?: string; type?: string; status?: string; minConfidence?: string }) => {
    await extractCandidatesCommand(opts);
  });

extract
  .command("contradictions")
  .description("Show contradiction findings")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await extractContradictionsCommand(opts);
  });

extract
  .command("exemplars")
  .description("Show exemplar nominations")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await extractExemplarsCommand(opts);
  });

// Curate commands
const curate = program
  .command("curate")
  .description("Canon curation commands");

curate
  .command("queue")
  .description("Show pending candidates for curation")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("-t, --type <type>", "Filter by statement type")
  .option("-c, --min-confidence <n>", "Minimum confidence threshold")
  .option("-s, --status <status>", "Filter by status (default: proposed)")
  .action(async (opts: { root?: string; type?: string; minConfidence?: string; status?: string }) => {
    await curateQueueCommand(opts);
  });

curate
  .command("inspect <candidate-id>")
  .description("Inspect a candidate in detail")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (candidateId: string, opts: { root?: string }) => {
    await curateInspectCommand(candidateId, opts);
  });

curate
  .command("accept <candidate-id>")
  .description("Accept a candidate into canon")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--hardness <level>", "Override hardness (hard, strong, soft, experimental)")
  .option("--scope <scopes>", "Override scope (comma-separated)")
  .option("--tag <tags>", "Override tags (comma-separated)")
  .action(async (candidateId: string, opts: { root?: string; hardness?: string; scope?: string; tag?: string }) => {
    await curateAcceptCommand(candidateId, opts);
  });

curate
  .command("edit <candidate-id>")
  .description("Edit and accept a candidate into canon")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--text <text>", "Revised statement text")
  .option("--hardness <level>", "Override hardness")
  .option("--scope <scopes>", "Override scope (comma-separated)")
  .action(async (candidateId: string, opts: { root?: string; text: string; hardness?: string; scope?: string }) => {
    await curateEditCommand(candidateId, opts);
  });

curate
  .command("reject <candidate-id>")
  .description("Reject a candidate with reason")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--reason <reason>", "Rejection reason")
  .action(async (candidateId: string, opts: { root?: string; reason: string }) => {
    await curateRejectCommand(candidateId, opts);
  });

curate
  .command("defer <candidate-id>")
  .description("Defer a candidate for later review")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--reason <reason>", "Reason for deferral")
  .action(async (candidateId: string, opts: { root?: string; reason?: string }) => {
    await curateDeferCommand(candidateId, opts);
  });

curate
  .command("merge <candidate-id>")
  .description("Merge a candidate into an existing canon statement")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--into <statement-id>", "Target canon statement ID")
  .action(async (candidateId: string, opts: { root?: string; into: string }) => {
    await curateMergeCommand(candidateId, opts);
  });

curate
  .command("contradictions")
  .description("Show contradictions and accepted tensions")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (opts: { root?: string }) => {
    await curateContradictionsCommand(opts);
  });

curate
  .command("resolve-contradiction <finding-id>")
  .description("Resolve or accept a contradiction as tension")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .requiredOption("--action <action>", "Action: resolve or accept_tension")
  .requiredOption("--note <note>", "Resolution note")
  .action(async (findingId: string, opts: { root?: string; action: string; note: string }) => {
    await curateResolveContradictionCommand(findingId, {
      root: opts.root,
      action: opts.action as "resolve" | "accept_tension",
      note: opts.note,
    });
  });

// Review commands
const review = program
  .command("review")
  .description("Artifact review commands");

review
  .command("run")
  .description("Review a candidate artifact against canon")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--file <path>", "Path to candidate artifact file")
  .option("--artifact <id>", "Existing candidate artifact ID")
  .requiredOption("--type <type>", "Artifact type (readme_section, package_blurb, feature_brief, cli_help, release_note, naming_proposal)")
  .requiredOption("--purpose <text>", "Intended purpose of the artifact")
  .option("--canon-version <version>", "Canon version to review against (default: current)")
  .action(async (opts: { root?: string; file?: string; artifact?: string; type: string; purpose: string; canonVersion?: string }) => {
    await reviewRunCommand({ ...opts, canonVersion: opts.canonVersion ?? "" });
  });

review
  .command("show <review-id>")
  .description("Show a review result")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (reviewId: string, opts: { root?: string }) => {
    await reviewShowCommand(reviewId, opts);
  });

review
  .command("list")
  .description("List stored reviews")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .option("--canon-version <version>", "Filter by canon version")
  .option("--verdict <verdict>", "Filter by verdict")
  .action(async (opts: { root?: string; canonVersion?: string; verdict?: string }) => {
    await reviewListCommand(opts);
  });

review
  .command("packet <run-id>")
  .description("Show canon packet composition for a review")
  .option("-r, --root <path>", "Project root directory (defaults to cwd)")
  .action(async (runId: string, opts: { root?: string }) => {
    await reviewPacketCommand(runId, opts);
  });

program.parse();
