import { resolve, join } from "node:path";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { getProject, getStatementCounts } from "../../canon/canon-store.js";
import { getCurrentVersion, listVersions } from "../../canon/canon-version.js";
import { STATEMENT_TYPES, LIFECYCLE_STATES, HARDNESS_LEVELS } from "../../core/enums.js";

export async function canonStatusCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());

  if (!isInitialized(root)) {
    console.log("Not initialized. Run: taste init <slug>");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(root)!;
  const fullDbPath = join(root, config.dbPath);
  const db = openDb(fullDbPath);

  const project = getProject(db, config.projectSlug);
  if (!project) {
    console.log(`Project "${config.projectSlug}" not found in database.`);
    closeDb();
    process.exitCode = 1;
    return;
  }

  const currentVer = getCurrentVersion(db, project.id);
  const versions = listVersions(db, project.id);
  const counts = getStatementCounts(db, project.id);

  console.log(`Project: ${project.name} (${project.project_slug})`);
  console.log(`Current version: ${currentVer?.version_label ?? "(none)"}`);
  console.log(`Versions: ${versions.length === 0 ? "(none)" : versions.map((v) => v.version_label).join(", ")}`);
  console.log();

  if (counts.total === 0) {
    console.log("No canon statements yet.");
    console.log("Run extraction to populate canon (coming in 0B).");
  } else {
    console.log(`Statements: ${counts.total}`);
    console.log();

    console.log("By lifecycle:");
    for (const state of LIFECYCLE_STATES) {
      const n = counts.by_lifecycle[state] ?? 0;
      if (n > 0) console.log(`  ${state}: ${n}`);
    }

    console.log("By hardness:");
    for (const level of HARDNESS_LEVELS) {
      const n = counts.by_hardness[level] ?? 0;
      if (n > 0) console.log(`  ${level}: ${n}`);
    }

    console.log("By type:");
    for (const type of STATEMENT_TYPES) {
      const n = counts.by_type[type] ?? 0;
      if (n > 0) console.log(`  ${type}: ${n}`);
    }
  }

  closeDb();
}
