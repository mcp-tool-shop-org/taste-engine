import { createHash } from "node:crypto";

/** SHA-256 hex hash of a string body. */
export function sha256(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
