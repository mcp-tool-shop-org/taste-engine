import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { GatePolicy, SurfacePolicy, OverrideReceipt } from "./policy-types.js";
import { DEFAULT_POLICY } from "./policy-types.js";
import type { ArtifactType, Verdict } from "../core/enums.js";
import type { EnforcementMode, DetectedArtifact, GateResult } from "./gate-types.js";
import { ENFORCEMENT_MODES } from "./gate-types.js";
import { ARTIFACT_TYPES } from "../core/enums.js";
import { writeJson, readJson } from "../util/json.js";
import { newId } from "../core/ids.js";
import { now } from "../util/timestamps.js";
import type Database from "better-sqlite3";

const SurfacePolicySchema = z.object({
  artifact_type: z.enum(ARTIFACT_TYPES),
  mode: z.enum(ENFORCEMENT_MODES),
  globs: z.array(z.string()),
  notes: z.string().optional(),
});

const GatePolicySchema = z.object({
  canon_version: z.string().min(1),
  default_mode: z.enum(ENFORCEMENT_MODES),
  surfaces: z.array(SurfacePolicySchema),
  skip_globs: z.array(z.string()),
  require_override_receipts: z.boolean(),
});

const POLICY_FILE = "gate-policy.json";

/** Load gate policy from .taste/ directory. Returns default if not found. */
export function loadPolicy(tasteDir: string): GatePolicy {
  const path = join(tasteDir, POLICY_FILE);
  if (!existsSync(path)) return DEFAULT_POLICY;

  const raw = readJson<unknown>(path);
  if (!raw) return DEFAULT_POLICY;

  return GatePolicySchema.parse(raw);
}

/** Save gate policy to .taste/ directory. */
export function savePolicy(tasteDir: string, policy: GatePolicy): void {
  writeJson(join(tasteDir, POLICY_FILE), policy);
}

/** Get enforcement mode for a specific artifact, considering surface overrides. */
export function getModeForArtifact(
  policy: GatePolicy,
  artifact: DetectedArtifact,
): EnforcementMode {
  // Check surface-specific overrides first
  for (const surface of policy.surfaces) {
    if (surface.artifact_type === artifact.artifact_type) {
      // Check glob match if specified
      if (surface.globs.length > 0) {
        const matches = surface.globs.some((g) => {
          // Simple glob: just check if path contains the pattern
          const pattern = g.replace(/\*/g, "");
          return artifact.path.includes(pattern) || pattern === "";
        });
        if (matches) return surface.mode;
      } else {
        return surface.mode;
      }
    }
  }
  return policy.default_mode;
}

/** Check if a file path should be skipped. */
export function shouldSkip(policy: GatePolicy, path: string): boolean {
  return policy.skip_globs.some((g) => {
    const pattern = g.replace(/\*/g, "");
    return path.includes(pattern);
  });
}

// ── Override Receipts ──────────────────────────────────────────

export function recordOverride(
  db: Database.Database,
  override: Omit<OverrideReceipt, "id" | "created_at">,
): OverrideReceipt {
  const id = newId();
  const ts = now();

  // Use a simple table — create if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS override_receipts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      original_verdict TEXT NOT NULL,
      original_gate_result TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('bypass','defer_repair','accept_as_is')),
      reason TEXT NOT NULL,
      follow_up_artifact_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.prepare(
    `INSERT INTO override_receipts (id, project_id, artifact_path, artifact_type, original_verdict, original_gate_result, action, reason, follow_up_artifact_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, override.project_id, override.artifact_path, override.artifact_type,
    override.original_verdict, override.original_gate_result, override.action,
    override.reason, override.follow_up_artifact_id, ts);

  return { ...override, id, created_at: ts };
}

export function getOverrides(db: Database.Database, projectId: string): OverrideReceipt[] {
  try {
    return db.prepare("SELECT * FROM override_receipts WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as OverrideReceipt[];
  } catch {
    return []; // Table may not exist yet
  }
}

export function getOverrideCount(db: Database.Database, projectId: string): number {
  try {
    return (db.prepare("SELECT COUNT(*) as c FROM override_receipts WHERE project_id = ?").get(projectId) as { c: number }).c;
  } catch {
    return 0;
  }
}
