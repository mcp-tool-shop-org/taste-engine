/** ISO 8601 datetime with offset, suitable for all schema fields. */
export function now(): string {
  return new Date().toISOString().replace("Z", "+00:00");
}
