import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TasteConfig } from "../core/types.js";
import { TasteConfigSchema } from "../core/validate.js";
import { readJson, writeJson } from "../util/json.js";

const CONFIG_DIR = ".taste";
const CONFIG_FILE = "taste.json";

/** Resolve the .taste directory path for a given root. */
export function tasteDir(root: string = process.cwd()): string {
  return join(resolve(root), CONFIG_DIR);
}

/** Resolve the config file path. */
export function configPath(root: string = process.cwd()): string {
  return join(tasteDir(root), CONFIG_FILE);
}

/** Resolve the database file path from config. */
export function dbPath(root: string = process.cwd()): string {
  const config = loadConfig(root);
  if (!config) return join(tasteDir(root), "taste.db");
  return join(resolve(root), config.dbPath);
}

/** Load and validate config. Returns null if not found. */
export function loadConfig(root: string = process.cwd()): TasteConfig | null {
  const path = configPath(root);
  const raw = readJson<unknown>(path);
  if (raw === null) return null;
  return TasteConfigSchema.parse(raw);
}

/** Write config to disk. */
export function saveConfig(root: string, config: TasteConfig): void {
  const dir = tasteDir(root);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeJson(configPath(root), config);
}

/** Check if taste is initialized in a directory. */
export function isInitialized(root: string = process.cwd()): boolean {
  return existsSync(configPath(root));
}

/** Build a default config. */
export function defaultConfig(projectSlug: string): TasteConfig {
  return {
    projectSlug,
    dbPath: ".taste/taste.db",
    canonDir: "canon",
    provider: {
      kind: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:14b",
    },
  };
}
