import { resolve, sep } from "node:path";

/** Repo slugs are directory names under the portfolio dir: one path segment, no separators. */
const REPO_SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;

export class InvalidRepoSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRepoSlugError";
  }
}

/**
 * Resolve a repo slug to its directory under portfolioDir. Every slug that reaches the
 * filesystem (workbench POST bodies, stored actions, backup bundles) goes through here,
 * so a slug can never name a path outside the portfolio.
 */
export function resolveRepoDir(portfolioDir: string, slug: unknown): string {
  if (typeof slug !== "string" || !REPO_SLUG_PATTERN.test(slug) || /^\.+$/.test(slug)) {
    throw new InvalidRepoSlugError("Invalid repo slug: use letters, digits, '.', '_' or '-' only");
  }
  const root = resolve(portfolioDir);
  const repoDir = resolve(root, slug);
  // The pattern already bars separators and '..'; this guards the join itself.
  if (!repoDir.startsWith(root + sep)) {
    throw new InvalidRepoSlugError("Invalid repo slug: resolves outside the portfolio directory");
  }
  return repoDir;
}
