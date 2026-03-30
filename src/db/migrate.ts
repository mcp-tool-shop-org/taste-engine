import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

/**
 * Apply pending migrations to the database.
 * Migration files must be named NNN_*.sql (e.g., 001_init.sql).
 */
export function migrate(db: Database.Database, migrationsDir: string): number {
  // Ensure migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT version FROM _migrations")
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (isNaN(version)) continue;
    if (applied.has(version)) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    db.exec(sql);
    count++;
  }

  return count;
}

/** Get the current migration version. */
export function currentVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare("SELECT MAX(version) as v FROM _migrations")
      .get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
