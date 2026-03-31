import { describe, it, expect } from "vitest";
import {
  buildPortfolioMatrix,
  detectDriftFamilies,
  generatePortfolioFindings,
} from "../../src/portfolio/portfolio-engine.js";
import type { PortfolioRepo } from "../../src/portfolio/portfolio-types.js";

function makeRepo(slug: string, overrides: Partial<PortfolioRepo> = {}): PortfolioRepo {
  return {
    slug,
    name: slug,
    db_path: `/fake/${slug}.db`,
    canon_version: "v1",
    canon_confidence: "strong",
    statement_count: 15,
    statement_counts_by_type: { thesis: 3, anti_pattern: 4, pattern: 5, voice: 2, naming: 1 },
    gate_ready: true,
    surfaces_at_warn: [],
    surfaces_at_required: [],
    sparse_warnings: [],
    ...overrides,
  };
}

describe("portfolio engine", () => {
  describe("buildPortfolioMatrix", () => {
    it("computes totals from repos", () => {
      const repos = [makeRepo("a", { statement_count: 10 }), makeRepo("b", { statement_count: 20 })];
      const matrix = buildPortfolioMatrix(repos);
      expect(matrix.total_repos).toBe(2);
      expect(matrix.total_statements).toBe(30);
      expect(matrix.canon_strong_count).toBe(2);
      expect(matrix.gate_ready_count).toBe(2);
    });

    it("counts confidence levels", () => {
      const repos = [
        makeRepo("a", { canon_confidence: "strong" }),
        makeRepo("b", { canon_confidence: "moderate" }),
        makeRepo("c", { canon_confidence: "sparse" }),
      ];
      const matrix = buildPortfolioMatrix(repos);
      expect(matrix.canon_strong_count).toBe(1);
      expect(matrix.canon_moderate_count).toBe(1);
      expect(matrix.canon_sparse_count).toBe(1);
    });
  });

  describe("generatePortfolioFindings", () => {
    it("detects voice/naming sparse pattern across repos", () => {
      const repos = [
        makeRepo("a", { sparse_warnings: ["No voice/naming"] }),
        makeRepo("b", { sparse_warnings: ["No voice/naming"] }),
        makeRepo("c"),
      ];
      const matrix = buildPortfolioMatrix(repos);
      const findings = generatePortfolioFindings(matrix, []);
      expect(findings.some((f) => f.category === "sparse_pattern" && f.title.includes("Voice"))).toBe(true);
    });

    it("detects graduation patterns", () => {
      const repos = [
        makeRepo("a", { surfaces_at_warn: ["package_blurb", "naming_proposal"] }),
        makeRepo("b", { surfaces_at_warn: ["package_blurb"] }),
        makeRepo("c"),
      ];
      const matrix = buildPortfolioMatrix(repos);
      const findings = generatePortfolioFindings(matrix, []);
      expect(findings.some((f) =>
        f.category === "graduation_pattern" && f.title.includes("package_blurb"),
      )).toBe(true);
    });

    it("reports strong canon average stats", () => {
      const repos = [
        makeRepo("a", { canon_confidence: "strong", statement_count: 15 }),
        makeRepo("b", { canon_confidence: "strong", statement_count: 20 }),
        makeRepo("c", { canon_confidence: "moderate", statement_count: 8 }),
      ];
      const matrix = buildPortfolioMatrix(repos);
      const findings = generatePortfolioFindings(matrix, []);
      expect(findings.some((f) => f.category === "preset_fit")).toBe(true);
    });

    it("reports portfolio-wide drift families", () => {
      const families = [
        { name: "Generic framing", description: "test", repos_with_anti_pattern: ["a", "b", "c"], is_portfolio_wide: true },
      ];
      const repos = [makeRepo("a"), makeRepo("b"), makeRepo("c")];
      const matrix = buildPortfolioMatrix(repos);
      const findings = generatePortfolioFindings(matrix, families);
      expect(findings.some((f) => f.category === "drift_family" && f.title.includes("Portfolio-wide"))).toBe(true);
    });

    it("no findings for small portfolio", () => {
      const repos = [makeRepo("a")];
      const matrix = buildPortfolioMatrix(repos);
      const findings = generatePortfolioFindings(matrix, []);
      // With only 1 repo, most patterns need 2+ to fire
      expect(findings.filter((f) => f.category === "sparse_pattern").length).toBe(0);
    });
  });
});
