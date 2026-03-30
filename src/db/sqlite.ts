import Database from "better-sqlite3";

let _db: Database.Database | null = null;

/** Open (or return existing) database connection. */
export function openDb(dbPath: string): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

/** Close the current database connection. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Get the current database instance (throws if not opened). */
export function getDb(): Database.Database {
  if (!_db) throw new Error("Database not opened. Call openDb first.");
  return _db;
}
