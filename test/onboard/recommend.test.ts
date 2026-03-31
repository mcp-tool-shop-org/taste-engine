import { describe, it, expect } from "vitest";
import { generateRecommendation } from "../../src/onboard/recommend.js";
import type { SourceSuggestion } from "../../src/onboard/onboard-types.js";

function makeSources(overrides: Partial<SourceSuggestion>[]): SourceSuggestion[] {
  return overrides.map((o, i) => ({
    path: o.path ?? `/repo/file${i}.md`,
    inferred_type: o.inferred_type ?? "doc",
    priority: o.priority ?? "medium",
    reason: o.reason ?? "test",
    ...o,
  }));
}

describe("adoption recommendations", () => {
  describe("repo shape classification", () => {
    it("classifies doctrine-heavy repo", () => {
      const sources = makeSources([
        { path: "/repo/README.md", inferred_type: "readme", priority: "high", reason: "Primary README" },
        { path: "/repo/ANTI-PATTERNS.md", inferred_type: "negative_example", priority: "high", reason: "Anti-patterns" },
        { path: "/repo/docs/policy.md", priority: "high", reason: "Policy/law doc" },
        { path: "/repo/docs/design.md", priority: "medium" },
      ]);
      const rec = generateRecommendation(sources);
      expect(rec.repo_shape).toBe("doctrine-heavy");
      expect(rec.recommended_preset).toBe("product-copy");
    });

    it("classifies product-copy repo", () => {
      const sources = makeSources([
        { path: "/repo/README.md", inferred_type: "readme", priority: "high", reason: "Primary README" },
        { path: "/repo/architecture.md", inferred_type: "architecture_note", priority: "high", reason: "Architecture" },
      ]);
      const rec = generateRecommendation(sources);
      expect(rec.repo_shape).toBe("product-copy");
      expect(rec.recommended_preset).toBe("product-copy");
    });

    it("classifies moderate-mixed repo", () => {
      const sources = makeSources([
        { path: "/repo/README.md", inferred_type: "readme", priority: "high", reason: "Primary README" },
        { path: "/repo/CHANGELOG.md", priority: "medium" },
      ]);
      const rec = generateRecommendation(sources);
      expect(rec.repo_shape).toBe("moderate-mixed");
      expect(rec.recommended_preset).toBe("docs-heavy");
    });

    it("classifies sparse repo", () => {
      const sources = makeSources([{ path: "/repo/notes.md", priority: "low" }]);
      const rec = generateRecommendation(sources);
      expect(rec.repo_shape).toBe("sparse");
      expect(rec.recommended_preset).toBe("advisory-starter");
    });

    it("classifies empty repo", () => {
      const rec = generateRecommendation([]);
      expect(rec.repo_shape).toBe("sparse");
      expect(rec.likely_confidence).toBe("sparse");
    });
  });

  describe("source recommendations", () => {
    it("caps sources by token budget", () => {
      // Create sources that together exceed budget
      const sources = makeSources(
        Array.from({ length: 10 }, (_, i) => ({ path: `/repo/file${i}.md`, priority: "medium" as const })),
      );
      const rec = generateRecommendation(sources);
      expect(rec.source_recommendation.recommended_count).toBeLessThanOrEqual(sources.length);
    });

    it("recommends voice split for large source sets", () => {
      const sources = makeSources(
        Array.from({ length: 8 }, (_, i) => ({ path: `/repo/file${i}.md`, priority: "high" as const })),
      );
      const rec = generateRecommendation(sources);
      expect(rec.source_recommendation.needs_voice_split).toBe(true);
    });
  });

  describe("gate recommendations", () => {
    it("recommends package_blurb and naming at warn for non-sparse repos", () => {
      const sources = makeSources([
        { path: "/repo/README.md", inferred_type: "readme", priority: "high", reason: "Primary README" },
        { path: "/repo/arch.md", inferred_type: "architecture_note", priority: "high" },
      ]);
      const rec = generateRecommendation(sources);
      const warns = rec.gate_recommendation.initial_surfaces.filter((s) => s.mode === "warn");
      expect(warns.some((s) => s.artifact_type === "package_blurb")).toBe(true);
      expect(warns.some((s) => s.artifact_type === "naming_proposal")).toBe(true);
    });

    it("defers all surfaces for sparse repos", () => {
      const rec = generateRecommendation([]);
      expect(rec.gate_recommendation.initial_surfaces.length).toBe(0);
      expect(rec.gate_recommendation.deferred_surfaces.length).toBeGreaterThan(0);
    });

    it("uses portfolio evidence for surface promotion", () => {
      const sources = makeSources([
        { path: "/repo/README.md", inferred_type: "readme", priority: "high", reason: "README" },
        { path: "/repo/arch.md", inferred_type: "architecture_note", priority: "high" },
      ]);
      const rec = generateRecommendation(sources, {
        avg_strong_statements: 20,
        common_drift_families: ["Governance bypass"],
        reliable_first_surfaces: ["package_blurb", "naming_proposal", "readme_section"],
      });
      // readme_section should be warn for doctrine-heavy with portfolio evidence
      expect(rec.gate_recommendation.initial_surfaces.some((s) => s.artifact_type === "readme_section")).toBe(true);
    });
  });

  describe("risk briefing", () => {
    it("warns about missing anti-patterns", () => {
      const sources = makeSources([{ path: "/repo/README.md", inferred_type: "readme", priority: "high" }]);
      const rec = generateRecommendation(sources);
      expect(rec.risk_briefing.some((r) => r.includes("anti-pattern"))).toBe(true);
    });

    it("warns about sparse source set", () => {
      const rec = generateRecommendation([]);
      expect(rec.risk_briefing.some((r) => r.includes("Sparse"))).toBe(true);
    });
  });

  describe("portfolio context", () => {
    it("uses portfolio drift families as watchlist", () => {
      const sources = makeSources([{ path: "/repo/README.md", inferred_type: "readme", priority: "high" }]);
      const rec = generateRecommendation(sources, {
        avg_strong_statements: 17,
        common_drift_families: ["Governance bypass — removes gates"],
        reliable_first_surfaces: ["package_blurb"],
      });
      expect(rec.drift_watchlist).toContain("Governance bypass — removes gates");
    });
  });
});
