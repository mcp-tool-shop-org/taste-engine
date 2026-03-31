import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  OrgRepoStatus,
  PromotionCandidate,
  DemotionCandidate,
  OverrideHotspot,
  OrgRecommendation,
} from "./org-types.js";
import { loadConfig } from "../cli/config.js";
import { loadPolicy } from "../gate/policy.js";
import { ARTIFACT_TYPES } from "../core/enums.js";

/**
 * Build org-wide repo status from a portfolio directory.
 */
export function buildOrgStatus(portfolioDir: string): OrgRepoStatus[] {
  const statuses: OrgRepoStatus[] = [];
  if (!existsSync(portfolioDir)) return statuses;

  for (const entry of readdirSync(portfolioDir)) {
    const repoDir = join(portfolioDir, entry);
    const tasteDir = join(repoDir, ".taste");
    if (!existsSync(join(tasteDir, "taste.json"))) continue;

    try {
      const config = loadConfig(repoDir);
      if (!config) continue;

      const dbPath = join(repoDir, config.dbPath);
      if (!existsSync(dbPath)) continue;

      const db = new Database(dbPath, { readonly: true });
      const project = db.prepare("SELECT * FROM projects LIMIT 1").get() as any;
      if (!project) { db.close(); continue; }

      // Statement count + confidence
      const stmtCount = (db.prepare("SELECT COUNT(*) as c FROM canon_statements WHERE project_id = ? AND lifecycle = 'accepted'").get(project.id) as { c: number }).c;
      let confidence: OrgRepoStatus["canon_confidence"] = "empty";
      if (stmtCount >= 12) confidence = "strong";
      else if (stmtCount >= 5) confidence = "moderate";
      else if (stmtCount > 0) confidence = "sparse";

      // Surface enforcement from policy
      const policy = loadPolicy(tasteDir);
      const surfaces: Record<string, "advisory" | "warn" | "required"> = {};
      for (const type of ARTIFACT_TYPES) {
        const surfacePolicy = policy.surfaces.find((s) => s.artifact_type === type);
        surfaces[type] = (surfacePolicy?.mode ?? policy.default_mode) as any;
      }

      // Override count
      let overrideCount = 0;
      try {
        overrideCount = (db.prepare("SELECT COUNT(*) as c FROM override_receipts WHERE project_id = ?").get(project.id) as { c: number }).c;
      } catch { /* table may not exist */ }

      // Last review
      let lastReviewAt: string | null = null;
      try {
        const lastReview = db.prepare("SELECT created_at FROM alignment_reviews WHERE project_id = ? ORDER BY rowid DESC LIMIT 1").get(project.id) as { created_at: string } | undefined;
        lastReviewAt = lastReview?.created_at ?? null;
      } catch { /* ok */ }

      // Risk flags
      const risks: string[] = [];
      if (confidence === "empty") risks.push("No canon");
      if (confidence === "sparse") risks.push("Sparse canon");

      const byType = db.prepare("SELECT statement_type, COUNT(*) as c FROM canon_statements WHERE project_id = ? AND lifecycle = 'accepted' GROUP BY statement_type").all(project.id) as { statement_type: string; c: number }[];
      const typeMap = Object.fromEntries(byType.map((r) => [r.statement_type, r.c]));
      if (!typeMap["voice"] && !typeMap["naming"]) risks.push("No voice/naming");
      if (!typeMap["anti_pattern"]) risks.push("No anti-patterns");
      if (overrideCount > 3) risks.push(`${overrideCount} overrides`);

      statuses.push({
        slug: config.projectSlug,
        name: project.name,
        canon_confidence: confidence,
        canon_version: project.current_version,
        statement_count: stmtCount,
        gate_ready: confidence !== "empty" && confidence !== "sparse",
        surfaces,
        override_count: overrideCount,
        last_review_at: lastReviewAt,
        risk_flags: risks,
      });

      db.close();
    } catch { /* skip broken repos */ }
  }

  return statuses.sort((a, b) => b.statement_count - a.statement_count);
}

/**
 * Build promotion queue from org status.
 */
export function buildPromotionQueue(statuses: OrgRepoStatus[]): PromotionCandidate[] {
  const candidates: PromotionCandidate[] = [];

  for (const repo of statuses) {
    if (!repo.gate_ready) continue;

    for (const [surface, mode] of Object.entries(repo.surfaces)) {
      if (mode === "advisory" && repo.canon_confidence === "strong") {
        candidates.push({
          repo_slug: repo.slug,
          surface,
          current_mode: "advisory",
          recommended_mode: "warn",
          reason: `Strong canon (${repo.statement_count} statements) supports warn-level enforcement`,
          evidence: `Canon confidence: strong, gate ready, ${repo.override_count} overrides`,
          risk: repo.risk_flags.length > 0 ? repo.risk_flags.join(", ") : null,
        });
      }

      if (mode === "warn" && repo.canon_confidence === "strong" && repo.override_count === 0) {
        // Only promote to required for package_blurb and naming_proposal — the proven surfaces
        if (surface === "package_blurb" || surface === "naming_proposal") {
          candidates.push({
            repo_slug: repo.slug,
            surface,
            current_mode: "warn",
            recommended_mode: "required",
            reason: "Strong canon, zero overrides at warn — candidate for required enforcement",
            evidence: `${repo.statement_count} statements, 0 overrides, gate ready`,
            risk: null,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Build demotion candidates.
 */
export function buildDemotionQueue(statuses: OrgRepoStatus[]): DemotionCandidate[] {
  const candidates: DemotionCandidate[] = [];

  for (const repo of statuses) {
    if (repo.override_count > 3) {
      for (const [surface, mode] of Object.entries(repo.surfaces)) {
        if (mode === "warn" || mode === "required") {
          candidates.push({
            repo_slug: repo.slug,
            surface,
            current_mode: mode,
            recommended_mode: mode === "required" ? "warn" : "advisory",
            reason: `${repo.override_count} overrides indicate excessive friction`,
          });
        }
      }
    }

    if (repo.canon_confidence === "sparse") {
      for (const [surface, mode] of Object.entries(repo.surfaces)) {
        if (mode !== "advisory") {
          candidates.push({
            repo_slug: repo.slug,
            surface,
            current_mode: mode as any,
            recommended_mode: "advisory",
            reason: "Canon too sparse for this enforcement level",
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Build override hotspot analysis.
 */
export function buildOverrideHotspots(portfolioDir: string): OverrideHotspot[] {
  const hotspots: OverrideHotspot[] = [];
  if (!existsSync(portfolioDir)) return hotspots;

  for (const entry of readdirSync(portfolioDir)) {
    const repoDir = join(portfolioDir, entry);
    const config = loadConfig(repoDir);
    if (!config) continue;

    const dbPath = join(repoDir, config.dbPath);
    if (!existsSync(dbPath)) continue;

    try {
      const db = new Database(dbPath, { readonly: true });

      const overrides = db.prepare(
        "SELECT artifact_type, action, reason FROM override_receipts ORDER BY created_at DESC",
      ).all() as { artifact_type: string; action: string; reason: string }[];

      if (overrides.length > 0) {
        // Group by artifact type
        const byType = new Map<string, typeof overrides>();
        for (const o of overrides) {
          const group = byType.get(o.artifact_type) ?? [];
          group.push(o);
          byType.set(o.artifact_type, group);
        }

        for (const [type, group] of byType) {
          const actions = group.map((o) => o.action);
          const mostCommonAction = mode(actions);
          const reasons = group.map((o) => o.reason);
          const mostCommonReason = reasons[0] ?? "unknown";

          hotspots.push({
            repo_slug: config.projectSlug,
            surface: type,
            override_count: group.length,
            most_common_action: mostCommonAction,
            most_common_reason: mostCommonReason.slice(0, 80),
          });
        }
      }

      db.close();
    } catch { /* skip */ }
  }

  return hotspots.sort((a, b) => b.override_count - a.override_count);
}

/**
 * Generate org-level recommendations.
 */
export function generateOrgRecommendations(
  statuses: OrgRepoStatus[],
  promotions: PromotionCandidate[],
  demotions: DemotionCandidate[],
): OrgRecommendation[] {
  const recs: OrgRecommendation[] = [];

  // Promotion recommendations
  for (const p of promotions.slice(0, 10)) {
    recs.push({
      action: "promote",
      repo_slug: p.repo_slug,
      surface: p.surface,
      description: `Promote ${p.surface} from ${p.current_mode} to ${p.recommended_mode}: ${p.reason}`,
      priority: p.recommended_mode === "required" ? "high" : "medium",
    });
  }

  // Demotion recommendations
  for (const d of demotions) {
    recs.push({
      action: "demote",
      repo_slug: d.repo_slug,
      surface: d.surface,
      description: `Demote ${d.surface} from ${d.current_mode} to ${d.recommended_mode}: ${d.reason}`,
      priority: "high",
    });
  }

  // Canon enrichment recommendations
  for (const repo of statuses) {
    if (repo.risk_flags.includes("No voice/naming") && repo.canon_confidence !== "empty") {
      recs.push({
        action: "enrich_canon",
        repo_slug: repo.slug,
        surface: null,
        description: "Run voice/naming extraction to improve gate accuracy",
        priority: "medium",
      });
    }
    if (repo.risk_flags.includes("No anti-patterns") && repo.gate_ready) {
      recs.push({
        action: "enrich_canon",
        repo_slug: repo.slug,
        surface: null,
        description: "Add anti-pattern documentation to improve drift detection",
        priority: "medium",
      });
    }
  }

  return recs.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

function mode(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = arr[0] ?? "unknown";
  let bestCount = 0;
  for (const [v, c] of counts) { if (c > bestCount) { best = v; bestCount = c; } }
  return best;
}
