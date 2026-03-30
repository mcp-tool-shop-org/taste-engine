#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { canonStatusCommand } from "./commands/canon.js";

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

program.parse();
