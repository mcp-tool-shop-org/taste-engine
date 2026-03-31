import { describe, it, expect } from "vitest";
import {
  buildPromotionQueue,
  buildDemotionQueue,
  generateOrgRecommendations,
} from "../../src/org/org-engine.js";
import type { OrgRepoStatus } from "../../src/org/org-types.js";

function makeStatus(slug: string, overrides: Partial<OrgRepoStatus> = {}): OrgRepoStatus {
  return {
    slug, name: slug, canon_confidence: "strong", canon_version: "v1",
    statement_count: 15, gate_ready: true,
    surfaces: { readme_section: "advisory", package_blurb: "warn", naming_proposal: "warn", feature_brief: "advisory", cli_help: "advisory", release_note: "advisory" },
    override_count: 0, last_review_at: null, risk_flags: [],
    ...overrides,
  };
}

describe("org engine", () => {
  describe("promotion queue", () => {
    it("promotes advisory surfaces on strong repos", () => {
      const statuses = [makeStatus("a")];
      const queue = buildPromotionQueue(statuses);
      expect(queue.some((p) => p.surface === "readme_section" && p.recommended_mode === "warn")).toBe(true);
    });

    it("promotes warn to required for package_blurb with 0 overrides", () => {
      const statuses = [makeStatus("a", { override_count: 0 })];
      const queue = buildPromotionQueue(statuses);
      expect(queue.some((p) => p.surface === "package_blurb" && p.recommended_mode === "required")).toBe(true);
    });

    it("does not promote non-ready repos", () => {
      const statuses = [makeStatus("a", { gate_ready: false, canon_confidence: "sparse" })];
      const queue = buildPromotionQueue(statuses);
      expect(queue.length).toBe(0);
    });

    it("does not promote feature_brief to required", () => {
      const statuses = [makeStatus("a", { surfaces: { ...makeStatus("a").surfaces, feature_brief: "warn" } })];
      const queue = buildPromotionQueue(statuses);
      expect(queue.some((p) => p.surface === "feature_brief" && p.recommended_mode === "required")).toBe(false);
    });
  });

  describe("demotion queue", () => {
    it("demotes when override count is high", () => {
      const statuses = [makeStatus("a", { override_count: 5 })];
      const queue = buildDemotionQueue(statuses);
      expect(queue.length).toBeGreaterThan(0);
      expect(queue[0].reason).toContain("overrides");
    });

    it("demotes when canon is sparse", () => {
      const statuses = [makeStatus("a", { canon_confidence: "sparse", surfaces: { ...makeStatus("a").surfaces, package_blurb: "required" } })];
      const queue = buildDemotionQueue(statuses);
      expect(queue.some((d) => d.reason.includes("sparse"))).toBe(true);
    });
  });

  describe("org recommendations", () => {
    it("generates promote + enrich recommendations", () => {
      const statuses = [
        makeStatus("a"),
        makeStatus("b", { risk_flags: ["No voice/naming"], canon_confidence: "moderate", statement_count: 8 }),
      ];
      const promotions = buildPromotionQueue(statuses);
      const demotions = buildDemotionQueue(statuses);
      const recs = generateOrgRecommendations(statuses, promotions, demotions);

      expect(recs.some((r) => r.action === "promote")).toBe(true);
      expect(recs.some((r) => r.action === "enrich_canon" && r.repo_slug === "b")).toBe(true);
    });

    it("prioritizes demotions as high", () => {
      const statuses = [makeStatus("a", { override_count: 10 })];
      const demotions = buildDemotionQueue(statuses);
      const recs = generateOrgRecommendations(statuses, [], demotions);

      const demoteRecs = recs.filter((r) => r.action === "demote");
      expect(demoteRecs.length).toBeGreaterThan(0);
      expect(demoteRecs[0].priority).toBe("high");
    });

    it("recommends anti-pattern enrichment for repos missing it", () => {
      const statuses = [makeStatus("a", { risk_flags: ["No anti-patterns"] })];
      const recs = generateOrgRecommendations(statuses, [], []);
      expect(recs.some((r) => r.action === "enrich_canon" && r.description.includes("anti-pattern"))).toBe(true);
    });
  });
});
