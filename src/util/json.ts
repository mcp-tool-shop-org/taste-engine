import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** Read and parse a JSON file. Returns null if file does not exist. */
export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as T;
}

/** Write an object as pretty-printed JSON. */
export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
