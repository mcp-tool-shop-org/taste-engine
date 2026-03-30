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

program.parse();
