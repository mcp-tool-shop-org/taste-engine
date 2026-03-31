import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { now } from "../util/timestamps.js";
import { readJson, writeJson } from "../util/json.js";

export type BackupManifest = {
  version: "1";
  created_at: string;
  source_dir: string;
  contents: BackupEntry[];
};

export type BackupEntry = {
  relative_path: string;
  kind: "database" | "config" | "policy" | "canon" | "actions" | "snapshots" | "overrides";
  size_bytes: number;
};

// Files to back up from a repo's .taste/ directory
const TASTE_FILES: Array<{ glob: string; kind: BackupEntry["kind"] }> = [
  { glob: "taste.json", kind: "config" },
  { glob: "taste.db", kind: "database" },
  { glob: "gate-policy.json", kind: "policy" },
];

// Files to back up from portfolio root
const PORTFOLIO_FILES: Array<{ glob: string; kind: BackupEntry["kind"] }> = [
  { glob: "org-actions.json", kind: "actions" },
  { glob: "watchtower-snapshots.json", kind: "snapshots" },
];

// ── Repo-level backup ────────────────────────────────────────

export function backupRepo(repoDir: string, outputDir: string): { manifest: BackupManifest; backupDir: string } {
  const tasteDir = join(repoDir, ".taste");
  if (!existsSync(tasteDir)) {
    throw new Error(`No .taste directory found in ${repoDir}`);
  }

  const ts = now().replace(/[:.]/g, "-").slice(0, 19);
  const slug = basename(repoDir);
  const backupDir = join(outputDir, `${slug}-${ts}`);
  mkdirSync(backupDir, { recursive: true });

  const entries: BackupEntry[] = [];

  // Copy .taste/ files
  const tasteBkDir = join(backupDir, ".taste");
  mkdirSync(tasteBkDir, { recursive: true });
  for (const f of TASTE_FILES) {
    const src = join(tasteDir, f.glob);
    if (existsSync(src)) {
      const dest = join(tasteBkDir, f.glob);
      copyFileSync(src, dest);
      entries.push({ relative_path: `.taste/${f.glob}`, kind: f.kind, size_bytes: statSync(src).size });
    }
  }

  // Copy canon/ directory
  const canonDir = join(repoDir, "canon");
  if (existsSync(canonDir)) {
    const canonBkDir = join(backupDir, "canon");
    mkdirSync(canonBkDir, { recursive: true });
    for (const file of readdirSync(canonDir)) {
      const src = join(canonDir, file);
      if (statSync(src).isFile()) {
        copyFileSync(src, join(canonBkDir, file));
        entries.push({ relative_path: `canon/${file}`, kind: "canon", size_bytes: statSync(src).size });
      }
    }
  }

  const manifest: BackupManifest = { version: "1", created_at: now(), source_dir: repoDir, contents: entries };
  writeJson(join(backupDir, "backup-manifest.json"), manifest);

  return { manifest, backupDir };
}

// ── Portfolio-level backup ────────────────────────────────────

export function backupPortfolio(portfolioDir: string, outputDir: string): { manifest: BackupManifest; backupDir: string } {
  if (!existsSync(portfolioDir)) {
    throw new Error(`Portfolio directory not found: ${portfolioDir}`);
  }

  const ts = now().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = join(outputDir, `portfolio-${ts}`);
  mkdirSync(backupDir, { recursive: true });

  const entries: BackupEntry[] = [];

  // Copy portfolio-level files
  for (const f of PORTFOLIO_FILES) {
    const src = join(portfolioDir, f.glob);
    if (existsSync(src)) {
      copyFileSync(src, join(backupDir, f.glob));
      entries.push({ relative_path: f.glob, kind: f.kind, size_bytes: statSync(src).size });
    }
  }

  // Copy each repo's .taste/ and canon/
  for (const entry of readdirSync(portfolioDir)) {
    const repoDir = join(portfolioDir, entry);
    if (!statSync(repoDir).isDirectory()) continue;
    const tasteDir = join(repoDir, ".taste");
    if (!existsSync(tasteDir)) continue;

    const repoBackupDir = join(backupDir, entry);
    mkdirSync(repoBackupDir, { recursive: true });
    const tasteBkDir = join(repoBackupDir, ".taste");
    mkdirSync(tasteBkDir, { recursive: true });

    for (const f of TASTE_FILES) {
      const src = join(tasteDir, f.glob);
      if (existsSync(src)) {
        copyFileSync(src, join(tasteBkDir, f.glob));
        entries.push({ relative_path: `${entry}/.taste/${f.glob}`, kind: f.kind, size_bytes: statSync(src).size });
      }
    }

    const canonDir = join(repoDir, "canon");
    if (existsSync(canonDir)) {
      const canonBkDir = join(repoBackupDir, "canon");
      mkdirSync(canonBkDir, { recursive: true });
      for (const file of readdirSync(canonDir)) {
        const src = join(canonDir, file);
        if (statSync(src).isFile()) {
          copyFileSync(src, join(canonBkDir, file));
          entries.push({ relative_path: `${entry}/canon/${file}`, kind: "canon", size_bytes: statSync(src).size });
        }
      }
    }
  }

  const manifest: BackupManifest = { version: "1", created_at: now(), source_dir: portfolioDir, contents: entries };
  writeJson(join(backupDir, "backup-manifest.json"), manifest);

  return { manifest, backupDir };
}

// ── Restore ───────────────────────────────────────────────────

export function restoreBackup(backupDir: string, targetDir: string, opts?: { dryRun?: boolean }): { restored: string[]; skipped: string[] } {
  const manifestPath = join(backupDir, "backup-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No backup-manifest.json found in ${backupDir}`);
  }

  const manifest = readJson<BackupManifest>(manifestPath)!;
  const restored: string[] = [];
  const skipped: string[] = [];

  for (const entry of manifest.contents) {
    const src = join(backupDir, entry.relative_path);
    const dest = join(targetDir, entry.relative_path);

    if (!existsSync(src)) {
      skipped.push(`${entry.relative_path} (missing from backup)`);
      continue;
    }

    if (opts?.dryRun) {
      const exists = existsSync(dest);
      restored.push(`${entry.relative_path} (${exists ? "overwrite" : "create"})`);
      continue;
    }

    const destDir = join(dest, "..");
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    restored.push(entry.relative_path);
  }

  return { restored, skipped };
}

// ── Export state as JSON bundle ────────────────────────────────

export type StateExport = {
  version: "1";
  exported_at: string;
  source_dir: string;
  policies: Array<{ repo_slug: string; policy: unknown }>;
  actions: unknown[];
  snapshots: unknown[];
};

export function exportState(portfolioDir: string): StateExport {
  const policies: Array<{ repo_slug: string; policy: unknown }> = [];
  const actions = readJson<unknown[]>(join(portfolioDir, "org-actions.json")) ?? [];
  const snapshots = readJson<unknown[]>(join(portfolioDir, "watchtower-snapshots.json")) ?? [];

  for (const entry of readdirSync(portfolioDir)) {
    const policyPath = join(portfolioDir, entry, ".taste", "gate-policy.json");
    if (existsSync(policyPath)) {
      policies.push({ repo_slug: entry, policy: readJson(policyPath) });
    }
  }

  return { version: "1", exported_at: now(), source_dir: portfolioDir, policies, actions, snapshots };
}

// ── Import state from JSON bundle ──────────────────────────────

export function importState(portfolioDir: string, state: StateExport, opts?: { dryRun?: boolean }): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];

  // Restore policies
  for (const { repo_slug, policy } of state.policies) {
    const tasteDir = join(portfolioDir, repo_slug, ".taste");
    if (!existsSync(tasteDir)) {
      skipped.push(`${repo_slug}: .taste directory not found`);
      continue;
    }
    if (!opts?.dryRun) {
      writeJson(join(tasteDir, "gate-policy.json"), policy);
    }
    applied.push(`${repo_slug}: policy restored`);
  }

  // Restore actions
  if (state.actions.length > 0) {
    if (!opts?.dryRun) {
      writeJson(join(portfolioDir, "org-actions.json"), state.actions);
    }
    applied.push(`org-actions.json: ${state.actions.length} actions`);
  }

  // Restore snapshots
  if (state.snapshots.length > 0) {
    if (!opts?.dryRun) {
      writeJson(join(portfolioDir, "watchtower-snapshots.json"), state.snapshots);
    }
    applied.push(`watchtower-snapshots.json: ${state.snapshots.length} snapshots`);
  }

  return { applied, skipped };
}
