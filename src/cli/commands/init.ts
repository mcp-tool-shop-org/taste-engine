import { existsSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isInitialized, saveConfig, defaultConfig, tasteDir } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { createProject, getProject } from "../../canon/canon-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

export async function initCommand(opts: {
  slug: string;
  name?: string;
  root?: string;
  check?: boolean;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());

  if (isInitialized(root)) {
    console.log("Already initialized in", tasteDir(root));
    console.log("\nRun 'taste doctor' to check health.");
    return;
  }

  const slug = opts.slug;
  const name = opts.name ?? slug;
  const config = defaultConfig(slug);

  // Create directories
  const td = tasteDir(root);
  if (!existsSync(td)) mkdirSync(td, { recursive: true });

  const canonDir = join(root, config.canonDir);
  if (!existsSync(canonDir)) mkdirSync(canonDir, { recursive: true });

  // Save config
  saveConfig(root, config);

  // Initialize database
  const fullDbPath = join(root, config.dbPath);
  const db = openDb(fullDbPath);
  migrate(db, MIGRATIONS_DIR);

  // Create project if not exists
  const existing = getProject(db, slug);
  if (!existing) {
    createProject(db, slug, name, `Canon workspace for ${name}`);
  }

  closeDb();

  console.log(`Initialized taste-engine for "${name}"`);
  console.log(`  config: ${join(td, "taste.json")}`);
  console.log(`  db:     ${fullDbPath}`);
  console.log(`  canon:  ${canonDir}`);

  // Auto-run doctor if --check
  if (opts.check) {
    console.log();
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand({ root: opts.root });
  } else {
    console.log("\nNext steps:");
    console.log("  taste doctor                     # verify Ollama is running");
    console.log("  taste ingest README.md docs/      # ingest source docs");
    console.log("  taste extract run                 # extract canon statements");
  }
}
