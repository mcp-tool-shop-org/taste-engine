import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

/** Generate a new random ID. */
export function newId(): string {
  return randomUUID();
}

/** Generate a content-hash-backed ID for deduplication. */
export function contentId(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}
