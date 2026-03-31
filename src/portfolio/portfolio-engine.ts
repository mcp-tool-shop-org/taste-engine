import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  PortfolioRepo,
  PortfolioMatrix,
  PortfolioFinding,
  DriftFamily,
} from "./portfolio-types.js";
import { generateOnboardReport } from "../onboard/onboard-report.js";
import { loadPolicy } from "../gate/policy.js";
import { loadConfig } from "../cli/config.js";

/**
 * Scan a proving/portfolio directory for all initialized repos.
 */
export function discoverRepos(portfolioDir: string): PortfolioRepo[] {
  const repos: PortfolioRepo[] = [];

  if (!existsSync(portfolioDir)) return repos;

  for (const entry of readdirSync(portfolioDir)) {
    const repoDir = join(portfolioDir, entry);
    const tasteDir = join(repoDir, ".taste");
    const configPath = join(tasteDir, "taste.json");

    if (!existsSync(configPath)) continue;

    try {
      const config = loadConfig(repoDir);
      if (!config) continue;

      const dbPath = join(repoDir, config.dbPath);
      if (!existsSync(dbPath)) continue;

      const db = new Database(dbPath, { readonly: true });

      const project = db.prepare("SELECT * FROM projects LIMIT 1").get() as any;
      if (!project) { db.close(); continue; }

      // Count statements
      const stmtCount = (db.prepare(
        "SELECT COUNT(*) as c FROM canon_statements WHERE project_id = ? AND lifecycle = 'accepted'",
      ).get(project.id) as { c: number }).c;

      const byType = db.prepare(
        "SELECT statement_type, COUNT(*) as c FROM canon_statements WHERE project_id = ? AND lifecycle = 'accepted' GROUP BY statement_type",
      ).all(project.id) as { statement_type: string; c: number }[];

      const countsByType = Object.fromEntries(byType.map((r) => [r.statement_type, r.c]));

      // Canon confidence
      let confidence: "strong" | "moderate" | "sparse" | "empty" = "empty";
      if (stmtCount === 0) confidence = "empty";
      else if (stmtCount < 5) confidence = "sparse";
      else if (stmtCount < 12) confidence = "moderate";
      else confidence = "strong";

      // Sparse warnings
      const sparseWarnings: string[] = [];
      if (!countsByType["thesis"]) sparseWarnings.push("No thesis");
      if (!countsByType["anti_pattern"]) sparseWarnings.push("No anti-patterns");
      if (!countsByType["voice"] && !countsByType["naming"]) sparseWarnings.push("No voice/naming");

      // Gate surfaces
      const policy = loadPolicy(tasteDir);
      const warnSurfaces = policy.surfaces.filter((s) => s.mode === "warn").map((s) => s.artifact_type);
      const requiredSurfaces = policy.surfaces.filter((s) => s.mode === "required").map((s) => s.artifact_type);

      repos.push({
        slug: config.projectSlug,
        name: project.name,
        db_path: dbPath,
        canon_version: project.current_version,
        canon_confidence: confidence,
        statement_count: stmtCount,
        statement_counts_by_type: countsByType,
        gate_ready: confidence !== "empty" && confidence !== "sparse",
        surfaces_at_warn: warnSurfaces,
        surfaces_at_required: requiredSurfaces,
        sparse_warnings: sparseWarnings,
      });

      db.close();
    } catch {
      // Skip repos that fail to load
    }
  }

  return repos;
}

/**
 * Build the portfolio matrix from discovered repos.
 */
export function buildPortfolioMatrix(repos: PortfolioRepo[]): PortfolioMatrix {
  return {
    repos,
    total_repos: repos.length,
    total_statements: repos.reduce((sum, r) => sum + r.statement_count, 0),
    canon_strong_count: repos.filter((r) => r.canon_confidence === "strong").length,
    canon_moderate_count: repos.filter((r) => r.canon_confidence === "moderate").length,
    canon_sparse_count: repos.filter((r) => r.canon_confidence === "sparse").length,
    gate_ready_count: repos.filter((r) => r.gate_ready).length,
  };
}

/**
 * Detect recurring drift families across repos.
 */
export function detectDriftFamilies(repos: PortfolioRepo[]): DriftFamily[] {
  const families: DriftFamily[] = [];

  // Collect all anti-pattern texts across repos
  const antiPatternsByRepo = new Map<string, string[]>();

  for (const repo of repos) {
    if (!existsSync(repo.db_path)) continue;
    try {
      const db = new Database(repo.db_path, { readonly: true });
      const project = db.prepare("SELECT id FROM projects LIMIT 1").get() as any;
      if (!project) { db.close(); continue; }

      const antiPatterns = db.prepare(
        "SELECT text FROM canon_statements WHERE project_id = ? AND statement_type = 'anti_pattern' AND lifecycle = 'accepted'",
      ).all(project.id) as { text: string }[];

      antiPatternsByRepo.set(repo.slug, antiPatterns.map((r) => r.text));
      db.close();
    } catch { /* skip */ }
  }

  // Find common themes
  const themeKeywords: Array<{ name: string; keywords: string[]; description: string }> = [
    { name: "Generic framing drift", keywords: ["generic", "helper", "assistant", "prompt"], description: "Product described as generic AI tool instead of its specific identity" },
    { name: "Governance bypass", keywords: ["bypass", "skip", "gate", "approval", "auto-approve"], description: "Attempts to remove governance, gates, or operator oversight" },
    { name: "Vocabulary erosion", keywords: ["rename", "simplify", "friendly", "approachable"], description: "Replacing specific terminology with generic alternatives" },
    { name: "Structure hiding", keywords: ["hide", "abstract", "complex", "behind the scenes"], description: "Hiding product architecture from users to seem simpler" },
    { name: "Vibes-based verification", keywords: ["vibes", "feels", "impression", "subjective"], description: "Replacing structured evidence with subjective assessment" },
  ];

  for (const theme of themeKeywords) {
    const affected: string[] = [];
    for (const [slug, patterns] of antiPatternsByRepo) {
      const hasTheme = patterns.some((p) => {
        const lower = p.toLowerCase();
        return theme.keywords.some((k) => lower.includes(k));
      });
      if (hasTheme) affected.push(slug);
    }

    if (affected.length >= 2) {
      families.push({
        name: theme.name,
        description: theme.description,
        repos_with_anti_pattern: affected,
        is_portfolio_wide: affected.length >= Math.ceil(repos.length * 0.5),
      });
    }
  }

  return families;
}

/**
 * Generate portfolio-level findings.
 */
export function generatePortfolioFindings(
  matrix: PortfolioMatrix,
  driftFamilies: DriftFamily[],
): PortfolioFinding[] {
  const findings: PortfolioFinding[] = [];

  // Portfolio-wide drift families
  for (const df of driftFamilies) {
    if (df.is_portfolio_wide) {
      findings.push({
        category: "drift_family",
        title: `Portfolio-wide: ${df.name}`,
        description: df.description,
        repos_affected: df.repos_with_anti_pattern,
        evidence: `${df.repos_with_anti_pattern.length}/${matrix.total_repos} repos have this anti-pattern`,
      });
    }
  }

  // Sparse canon patterns — check per-dimension sparsity across the portfolio
  const voiceSparse = matrix.repos.filter((r) => r.sparse_warnings.some((w) => w.toLowerCase().includes("voice")));
  if (voiceSparse.length >= 2) {
    findings.push({
      category: "sparse_pattern",
      title: "Voice/naming canon consistently sparse",
      description: "Multiple repos lack voice/naming statements. This weakens the gate's ability to assess language alignment.",
      repos_affected: voiceSparse.map((r) => r.slug),
      evidence: `${voiceSparse.length}/${matrix.total_repos} repos missing voice/naming canon`,
    });
  }

  // Graduation patterns
  const warnRepos = matrix.repos.filter((r) => r.surfaces_at_warn.length > 0);
  if (warnRepos.length >= 2) {
    // Find commonly promoted surfaces
    const surfaceCounts = new Map<string, number>();
    for (const r of warnRepos) {
      for (const s of r.surfaces_at_warn) {
        surfaceCounts.set(s, (surfaceCounts.get(s) ?? 0) + 1);
      }
    }
    for (const [surface, count] of surfaceCounts) {
      if (count >= 2) {
        findings.push({
          category: "graduation_pattern",
          title: `${surface} reliably promoted to warn`,
          description: `${surface} has been promoted to warn in ${count} repos, suggesting it's a safe early promotion target.`,
          repos_affected: warnRepos.filter((r) => r.surfaces_at_warn.includes(surface)).map((r) => r.slug),
          evidence: `${count}/${matrix.total_repos} repos at warn`,
        });
      }
    }
  }

  // Doctrine density pattern
  const strongRepos = matrix.repos.filter((r) => r.canon_confidence === "strong");
  if (strongRepos.length >= 2) {
    const avgStatements = strongRepos.reduce((sum, r) => sum + r.statement_count, 0) / strongRepos.length;
    findings.push({
      category: "preset_fit",
      title: "Strong canon repos average " + Math.round(avgStatements) + " statements",
      description: "Repos reaching strong confidence tend to have rich doctrine sources (README + docs/ + anti-patterns).",
      repos_affected: strongRepos.map((r) => r.slug),
      evidence: `Average ${Math.round(avgStatements)} statements across ${strongRepos.length} strong repos`,
    });
  }

  return findings;
}
