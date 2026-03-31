import { readFileSync, existsSync } from "node:fs";
import { basename, extname } from "node:path";
import type { ArtifactType } from "../core/enums.js";
import type { DetectedArtifact } from "./gate-types.js";

/**
 * Supported artifact detection patterns.
 * Maps file patterns to artifact types for gate review.
 */
const DETECTION_RULES: Array<{
  test: (path: string, filename: string) => boolean;
  type: ArtifactType;
}> = [
  {
    test: (_p, f) => /^readme\.md$/i.test(f),
    type: "readme_section",
  },
  {
    test: (_p, f) => /^changelog\.md$/i.test(f) || /^release/i.test(f),
    type: "release_note",
  },
  {
    test: (p, _f) => /cli[_-]?help/i.test(p) || /usage\.md$/i.test(_f),
    type: "cli_help",
  },
  {
    test: (p, _f) => /naming/i.test(p),
    type: "naming_proposal",
  },
  {
    test: (p, _f) => /feature[_-]?brief/i.test(p) || /proposal/i.test(p),
    type: "feature_brief",
  },
];

/**
 * Detect package.json description changes as package_blurb artifacts.
 */
function detectPackageBlurb(path: string): DetectedArtifact | null {
  if (!basename(path).toLowerCase().match(/^package\.json$/)) return null;
  if (!existsSync(path)) return null;

  try {
    const pkg = JSON.parse(readFileSync(path, "utf-8"));
    if (pkg.description) {
      return {
        path,
        title: "package.json description",
        artifact_type: "package_blurb",
        body: pkg.description,
      };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Detect supported artifacts from a list of changed file paths.
 * Returns only files that match known artifact patterns.
 */
export function detectArtifacts(paths: string[]): DetectedArtifact[] {
  const detected: DetectedArtifact[] = [];

  for (const path of paths) {
    if (!existsSync(path)) continue;

    const filename = basename(path);
    const ext = extname(filename).toLowerCase();

    // Package.json special case
    const blurb = detectPackageBlurb(path);
    if (blurb) {
      detected.push(blurb);
      continue;
    }

    // Only process markdown files for other types
    if (ext !== ".md") continue;

    for (const rule of DETECTION_RULES) {
      if (rule.test(path, filename)) {
        const body = readFileSync(path, "utf-8");
        detected.push({
          path,
          title: basename(path, ext),
          artifact_type: rule.type,
          body,
        });
        break; // First match wins
      }
    }
  }

  return detected;
}

/**
 * Get changed files from git diff (staged or working tree).
 * Returns absolute paths.
 */
export function getChangedFiles(cwd: string, staged: boolean = false): string[] {
  const { execSync } = require("node:child_process");
  try {
    const cmd = staged
      ? "git diff --cached --name-only --diff-filter=ACMR"
      : "git diff --name-only --diff-filter=ACMR HEAD";
    const output = execSync(cmd, { cwd, encoding: "utf-8" });
    const { resolve } = require("node:path");
    return output
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => resolve(cwd, line));
  } catch {
    return [];
  }
}
