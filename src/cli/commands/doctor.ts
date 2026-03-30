import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { isInitialized, loadConfig } from "../config.js";
import { openDb, closeDb } from "../../db/sqlite.js";
import { currentVersion } from "../../db/migrate.js";
import { OllamaProvider } from "../../providers/ollama/ollama-provider.js";

type Check = {
  name: string;
  status: "ok" | "fail" | "warn";
  detail?: string;
};

export async function doctorCommand(opts?: { root?: string }): Promise<void> {
  const root = resolve(opts?.root ?? process.cwd());
  const checks: Check[] = [];

  // 1. Config exists
  if (!isInitialized(root)) {
    checks.push({ name: "config", status: "fail", detail: "Not initialized. Run: taste init <slug>" });
    printChecks(checks);
    return;
  }
  checks.push({ name: "config", status: "ok" });

  const config = loadConfig(root)!;

  // 2. Database accessible
  const fullDbPath = join(root, config.dbPath);
  if (!existsSync(fullDbPath)) {
    checks.push({ name: "database", status: "fail", detail: `Database not found: ${fullDbPath}` });
  } else {
    try {
      const db = openDb(fullDbPath);
      const ver = currentVersion(db);
      checks.push({ name: "database", status: "ok", detail: `migration v${ver}` });
      closeDb();
    } catch (err) {
      checks.push({ name: "database", status: "fail", detail: String(err) });
    }
  }

  // 3. Canon directory
  const canonDir = join(root, config.canonDir);
  if (!existsSync(canonDir)) {
    checks.push({ name: "canon-dir", status: "warn", detail: `Canon directory missing: ${canonDir}` });
  } else {
    checks.push({ name: "canon-dir", status: "ok" });
  }

  // 4. Ollama health
  const provider = new OllamaProvider({
    baseUrl: config.provider.baseUrl,
    model: config.provider.model,
  });
  const health = await provider.healthCheck();
  if (health.ok) {
    checks.push({ name: "ollama", status: "ok", detail: `model: ${config.provider.model}` });
  } else {
    checks.push({ name: "ollama", status: "fail", detail: health.detail });
  }

  printChecks(checks);
}

function printChecks(checks: Check[]): void {
  const icons = { ok: "[ok]", fail: "[FAIL]", warn: "[warn]" } as const;
  for (const c of checks) {
    const icon = icons[c.status];
    const detail = c.detail ? ` — ${c.detail}` : "";
    console.log(`  ${icon} ${c.name}${detail}`);
  }

  const failures = checks.filter((c) => c.status === "fail");
  if (failures.length > 0) {
    console.log(`\n${failures.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll checks passed.");
  }
}
