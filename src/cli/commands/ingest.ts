import { resolve, join, basename, extname } from "node:path";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { migrate } from "../../db/migrate.js";
import { getProject } from "../../canon/canon-store.js";
import {
  insertSourceArtifact,
  getSourceArtifactByHash,
} from "../../artifacts/source-artifacts.js";
import { sha256 } from "../../util/hashing.js";
import type { SourceArtifactType } from "../../core/enums.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "migrations");

/** Infer source artifact type from filename. */
function inferType(filename: string): SourceArtifactType {
  const lower = filename.toLowerCase();
  if (lower.includes("readme")) return "readme";
  if (lower.includes("changelog") || lower.includes("release")) return "release_note";
  if (lower.includes("architecture") || lower.includes("design")) return "architecture_note";
  if (lower.includes("help") || lower.includes("cli")) return "cli_help";
  if (lower.includes("negative") || lower.includes("anti") || lower.includes("bad")) return "negative_example";
  if (lower.includes("example") || lower.includes("exemplar")) return "example_output";
  return "doc";
}

export async function ingestCommand(opts: {
  paths: string[];
  root?: string;
  type?: string;
}): Promise<void> {
  const root = resolve(opts.root ?? process.cwd());

  if (!isInitialized(root)) {
    console.log("Not initialized. Run: taste init <slug>");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(root)!;
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

  let added = 0;
  let skipped = 0;

  for (const inputPath of opts.paths) {
    const absPath = resolve(inputPath);

    if (!existsSync(absPath)) {
      console.log(`  [skip] Not found: ${absPath}`);
      skipped++;
      continue;
    }

    const stat = statSync(absPath);
    const filesToProcess: string[] = [];

    if (stat.isDirectory()) {
      // Ingest all markdown files in directory
      const files = readdirSync(absPath)
        .filter((f) => /\.(md|txt|rst)$/i.test(f))
        .map((f) => join(absPath, f));
      filesToProcess.push(...files);
    } else {
      filesToProcess.push(absPath);
    }

    for (const filePath of filesToProcess) {
      const body = readFileSync(filePath, "utf-8");
      const hash = sha256(body);

      // Check for duplicates
      const existing = getSourceArtifactByHash(db, project.id, hash);
      if (existing) {
        console.log(`  [skip] Already ingested: ${basename(filePath)}`);
        skipped++;
        continue;
      }

      const artifactType = (opts.type as SourceArtifactType) ?? inferType(basename(filePath));
      const title = basename(filePath, extname(filePath));

      insertSourceArtifact(db, project.id, title, artifactType, body, filePath);
      console.log(`  [add] ${basename(filePath)} (${artifactType})`);
      added++;
    }
  }

  closeDb();
  console.log();
  console.log(`Ingested: ${added} added, ${skipped} skipped.`);
}
