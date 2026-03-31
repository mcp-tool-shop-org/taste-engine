import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { backupRepo, backupPortfolio, restoreBackup, exportState, importState } from "../../backup/backup-engine.js";
import type { StateExport } from "../../backup/backup-engine.js";

export async function backupRepoCommand(opts: { root: string; output: string }): Promise<void> {
  const root = resolve(opts.root);
  const output = resolve(opts.output);

  try {
    const { manifest, backupDir } = backupRepo(root, output);
    console.log(`Backup complete: ${backupDir}`);
    console.log(`  Files: ${manifest.contents.length}`);
    const totalBytes = manifest.contents.reduce((s, e) => s + e.size_bytes, 0);
    console.log(`  Size:  ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log(`  Time:  ${manifest.created_at.slice(0, 19)}`);
  } catch (err) {
    console.error(`Backup failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

export async function backupPortfolioCommand(opts: { dir: string; output: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const output = resolve(opts.output);

  try {
    const { manifest, backupDir } = backupPortfolio(dir, output);
    const repoCount = new Set(manifest.contents.map((e) => e.relative_path.split("/")[0])).size;
    console.log(`Portfolio backup complete: ${backupDir}`);
    console.log(`  Repos: ${repoCount}`);
    console.log(`  Files: ${manifest.contents.length}`);
    const totalBytes = manifest.contents.reduce((s, e) => s + e.size_bytes, 0);
    console.log(`  Size:  ${(totalBytes / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error(`Backup failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

export async function restoreCommand(opts: { from: string; to: string; dryRun?: boolean }): Promise<void> {
  const from = resolve(opts.from);
  const to = resolve(opts.to);

  try {
    const { restored, skipped } = restoreBackup(from, to, { dryRun: opts.dryRun });

    if (opts.dryRun) {
      console.log("Dry run — no files written.");
    }

    if (restored.length > 0) {
      console.log(`${opts.dryRun ? "Would restore" : "Restored"}: ${restored.length} files`);
      for (const r of restored) console.log(`  + ${r}`);
    }

    if (skipped.length > 0) {
      console.log(`Skipped: ${skipped.length}`);
      for (const s of skipped) console.log(`  - ${s}`);
    }
  } catch (err) {
    console.error(`Restore failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

export async function exportStateCommand(opts: { dir: string; output: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const output = resolve(opts.output);

  try {
    const state = exportState(dir);
    const { writeJson } = await import("../../util/json.js");
    writeJson(output, state);

    console.log(`State exported: ${output}`);
    console.log(`  Policies:  ${state.policies.length}`);
    console.log(`  Actions:   ${state.actions.length}`);
    console.log(`  Snapshots: ${state.snapshots.length}`);
  } catch (err) {
    console.error(`Export failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

export async function importStateCommand(opts: { dir: string; from: string; dryRun?: boolean }): Promise<void> {
  const dir = resolve(opts.dir);
  const from = resolve(opts.from);

  try {
    const raw = JSON.parse(readFileSync(from, "utf-8")) as StateExport;
    const { applied, skipped } = importState(dir, raw, { dryRun: opts.dryRun });

    if (opts.dryRun) {
      console.log("Dry run — no files written.");
    }

    if (applied.length > 0) {
      console.log(`${opts.dryRun ? "Would apply" : "Applied"}:`);
      for (const a of applied) console.log(`  + ${a}`);
    }

    if (skipped.length > 0) {
      console.log("Skipped:");
      for (const s of skipped) console.log(`  - ${s}`);
    }
  } catch (err) {
    console.error(`Import failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}
