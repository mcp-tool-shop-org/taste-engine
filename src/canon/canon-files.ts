import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../util/json.js";
import { CanonFileSchema, type CanonFile } from "../core/validate.js";
import { now } from "../util/timestamps.js";
import type { CanonStatement, EvidenceRef } from "../core/types.js";

/** Build the filename for a canon version file. */
function versionFileName(slug: string, version: string): string {
  return `${slug}-${version}.json`;
}

/** Write a canon file to disk with validation. */
export function writeCanonFile(
  canonDir: string,
  slug: string,
  name: string,
  version: string,
  statements: CanonStatement[],
  evidence: EvidenceRef[],
  sourceCount: number,
): void {
  if (!existsSync(canonDir)) {
    mkdirSync(canonDir, { recursive: true });
  }

  const file: CanonFile = {
    project: { slug, name, version },
    statements,
    evidence,
    metadata: {
      generated_at: now(),
      source_count: sourceCount,
    },
  };

  // Validate before writing
  CanonFileSchema.parse(file);

  const filePath = join(canonDir, versionFileName(slug, version));
  writeJson(filePath, file);
}

/** Read and validate a canon file from disk. Returns null if not found. */
export function readCanonFile(
  canonDir: string,
  slug: string,
  version: string,
): CanonFile | null {
  const filePath = join(canonDir, versionFileName(slug, version));
  const raw = readJson<unknown>(filePath);
  if (raw === null) return null;
  return CanonFileSchema.parse(raw);
}

/** List all canon files in a directory. */
export function listCanonFiles(canonDir: string): string[] {
  if (!existsSync(canonDir)) return [];
  return readdirSync(canonDir).filter((f) => f.endsWith(".json")).sort();
}
