import { describe, it, expect } from "vitest";
import { computeDelta, generateDigest } from "../../src/watchtower/watchtower-engine.js";
import type { WatchtowerSnapshot } from "../../src/watchtower/watchtower-types.js";
import type { OrgRepoStatus } from "../../src/org/org-types.js";

function makeRepo(slug: string, overrides: Partial<OrgRepoStatus> = {}): OrgRepoStatus {
  return {
    slug, name: slug, canon_confidence: "strong", canon_version: "v1",
    statement_count: 15, gate_ready: true,
    surfaces: { readme_section: "advisory", package_blurb: "warn", naming_proposal: "warn" },
    override_count: 0, last_review_at: null, risk_flags: [],
    ...overrides,
  };
}

function makeSnapshot(id: string, repos: OrgRepoStatus[], overrides: Partial<WatchtowerSnapshot> = {}): WatchtowerSnapshot {
  return {
    id, timestamp: new Date().toISOString().replace("Z", "+00:00"),
    repos, alerts: [], total_statements: repos.reduce((s, r) => s + r.statement_count, 0),
    gate_ready_count: repos.filter((r) => r.gate_ready).length,
    promotion_ready_count: 0, override_total: 0,
    ...overrides,
  };
}

describe("watchtower engine", () => {
  describe("computeDelta", () => {
    it("detects canon count changes", () => {
      const prev = makeSnapshot("s1", [makeRepo("a", { statement_count: 10 })]);
      const curr = makeSnapshot("s2", [makeRepo("a", { statement_count: 15 })]);
      const delta = computeDelta(prev, curr);
      expect(delta.items.some((i) => i.category === "canon_changed" && i.description.includes("10 -> 15"))).toBe(true);
    });

    it("detects policy changes", () => {
      const prev = makeSnapshot("s1", [makeRepo("a", { surfaces: { package_blurb: "warn" } })]);
      const curr = makeSnapshot("s2", [makeRepo("a", { surfaces: { package_blurb: "required" } })]);
      const delta = computeDelta(prev, curr);
      expect(delta.items.some((i) => i.category === "policy_changed" && i.description.includes("warn -> required"))).toBe(true);
      expect(delta.summary.policy_changes).toBe(1);
    });

    it("detects override spikes", () => {
      const prev = makeSnapshot("s1", [makeRepo("a", { override_count: 0 })]);
      const curr = makeSnapshot("s2", [makeRepo("a", { override_count: 5 })]);
      const delta = computeDelta(prev, curr);
      expect(delta.items.some((i) => i.category === "override_spike")).toBe(true);
    });

    it("detects new repos", () => {
      const prev = makeSnapshot("s1", [makeRepo("a")]);
      const curr = makeSnapshot("s2", [makeRepo("a"), makeRepo("b")]);
      const delta = computeDelta(prev, curr);
      expect(delta.items.some((i) => i.repo_slug === "b" && i.description.includes("New repo"))).toBe(true);
    });

    it("detects confidence changes", () => {
      const prev = makeSnapshot("s1", [makeRepo("a", { canon_confidence: "moderate" })]);
      const curr = makeSnapshot("s2", [makeRepo("a", { canon_confidence: "strong" })]);
      const delta = computeDelta(prev, curr);
      expect(delta.items.some((i) => i.description.includes("moderate -> strong"))).toBe(true);
    });

    it("detects new alerts", () => {
      const prev = makeSnapshot("s1", [makeRepo("a")], { alerts: [] });
      const curr = makeSnapshot("s2", [makeRepo("a")], {
        alerts: [{ severity: "warning", category: "override_spike", repo_slug: "a", surface: null, title: "Override spike", description: "test", recommended_action: "test" }],
      });
      const delta = computeDelta(prev, curr);
      expect(delta.summary.new_alerts).toBe(1);
    });

    it("detects resolved alerts", () => {
      const prev = makeSnapshot("s1", [makeRepo("a")], {
        alerts: [{ severity: "info", category: "enrichment_needed", repo_slug: "a", surface: null, title: "Enrich", description: "test", recommended_action: "test" }],
      });
      const curr = makeSnapshot("s2", [makeRepo("a")], { alerts: [] });
      const delta = computeDelta(prev, curr);
      expect(delta.summary.resolved_alerts).toBe(1);
      expect(delta.items.some((i) => i.category === "alert_resolved")).toBe(true);
    });

    it("empty delta when nothing changed", () => {
      const repos = [makeRepo("a")];
      const prev = makeSnapshot("s1", repos);
      const curr = makeSnapshot("s2", repos);
      const delta = computeDelta(prev, curr);
      expect(delta.items.length).toBe(0);
    });
  });
});
