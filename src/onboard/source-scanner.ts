import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { SourceSuggestion } from "./onboard-types.js";

/** Rough token estimate: ~4 chars per token for English markdown. */
function estimateTokens(path: string): number {
  try {
    const size = statSync(path).size;
    return Math.ceil(size / 4);
  } catch { return 0; }
}

/**
 * Scan a repo directory for candidate source artifacts.
 * Returns prioritized suggestions for what to ingest first.
 */
export function scanForSources(repoRoot: string): SourceSuggestion[] {
  const suggestions: SourceSuggestion[] = [];

  // Priority 1: Root-level doctrine files
  const rootFiles = safeReaddir(repoRoot).filter((f) => /\.md$/i.test(f));
  for (const f of rootFiles) {
    const lower = f.toLowerCase();
    const path = join(repoRoot, f);

    if (lower === "readme.md") {
      suggestions.push({ path, inferred_type: "readme", priority: "high", reason: "Primary README — usually the strongest thesis source" });
    } else if (lower === "changelog.md") {
      suggestions.push({ path, inferred_type: "release_note", priority: "medium", reason: "CHANGELOG — decision history and version narrative" });
    } else if (lower === "security.md") {
      suggestions.push({ path, inferred_type: "doc", priority: "medium", reason: "Security policy — boundary conditions" });
    } else if (lower.includes("anti-pattern") || lower.includes("antipattern")) {
      suggestions.push({ path, inferred_type: "negative_example", priority: "high", reason: "Anti-patterns doc — critical for drift detection" });
    } else if (lower.includes("architecture") || lower.includes("design")) {
      suggestions.push({ path, inferred_type: "architecture_note", priority: "high", reason: "Architecture doc — thesis and pattern source" });
    } else if (lower.includes("when-to-use") || lower.includes("decision") || lower.includes("adr")) {
      suggestions.push({ path, inferred_type: "doc", priority: "high", reason: "Decision doc — rationale for product choices" });
    } else if (lower.includes("hook") || lower.includes("policy") || lower.includes("law") || lower.includes("contract")) {
      suggestions.push({ path, inferred_type: "doc", priority: "high", reason: "Policy/law doc — governance truth" });
    } else if (lower.includes("audit") || lower.includes("summary")) {
      suggestions.push({ path, inferred_type: "doc", priority: "medium", reason: "Audit summary — product assessment" });
    } else if (/^readme\..{2,5}\.md$/i.test(lower)) {
      // Skip translations
    } else if (lower === "contributing.md" || lower === "code_of_conduct.md") {
      // Skip community files
    } else {
      suggestions.push({ path, inferred_type: "doc", priority: "low", reason: "Root-level markdown" });
    }
  }

  // Priority 2: docs/ directory
  const docsDir = join(repoRoot, "docs");
  if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
    const docFiles = safeReaddir(docsDir).filter((f) => /\.md$/i.test(f));
    for (const f of docFiles) {
      const path = join(docsDir, f);
      const lower = f.toLowerCase();

      let priority: "high" | "medium" | "low" = "medium";
      let reason = "Docs directory file";

      if (lower.includes("anti-pattern") || lower.includes("antipattern")) {
        priority = "high";
        reason = "Anti-patterns — critical for canon extraction";
      } else if (lower.includes("architecture") || lower.includes("fitness") || lower.includes("constitution")) {
        priority = "high";
        reason = "Architecture/constitution — thesis and boundary source";
      } else if (lower.includes("law") || lower.includes("policy") || lower.includes("packet")) {
        priority = "high";
        reason = "Law/policy doc — governance and pattern source";
      }

      suggestions.push({ path, inferred_type: "doc", priority, reason });
    }
  }

  // Priority 3: package.json description
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(require("node:fs").readFileSync(pkgPath, "utf-8"));
      if (pkg.description) {
        suggestions.push({
          path: pkgPath,
          inferred_type: "package_description",
          priority: "low",
          reason: "Package description — existing product blurb",
        });
      }
    } catch { /* ignore */ }
  }

  // Sort by priority
  const order = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => order[a.priority] - order[b.priority]);

  return suggestions;
}

/**
 * Cap source suggestions by estimated token budget.
 * Returns the top-N sources that fit within the budget,
 * prioritizing high-priority files.
 */
export function capByTokenBudget(
  suggestions: SourceSuggestion[],
  maxTokens: number = 8000,
): { selected: SourceSuggestion[]; dropped: SourceSuggestion[]; totalTokens: number } {
  const selected: SourceSuggestion[] = [];
  const dropped: SourceSuggestion[] = [];
  let totalTokens = 0;

  for (const s of suggestions) {
    const tokens = estimateTokens(s.path);
    if (totalTokens + tokens <= maxTokens) {
      selected.push(s);
      totalTokens += tokens;
    } else {
      dropped.push(s);
    }
  }

  return { selected, dropped, totalTokens };
}

/**
 * Get recommended source tiers.
 */
export function getSourceTiers(suggestions: SourceSuggestion[]): {
  top3: SourceSuggestion[];
  top5: SourceSuggestion[];
  full: SourceSuggestion[];
} {
  return {
    top3: suggestions.slice(0, 3),
    top5: suggestions.slice(0, 5),
    full: suggestions,
  };
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
