import { describe, it, expect } from "vitest";
import { generateOrgAlerts, filterAlerts, THRESHOLDS } from "../../src/org/org-alerts.js";
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

describe("org alerts", () => {
  it("alerts on promotion-ready surfaces", () => {
    const statuses = [makeStatus("a")];
    const alerts = generateOrgAlerts(statuses, "/fake");
    expect(alerts.some((a) => a.category === "promotion_ready")).toBe(true);
  });

  it("alerts on override spike", () => {
    const statuses = [makeStatus("a", { override_count: 5 })];
    const alerts = generateOrgAlerts(statuses, "/fake");
    expect(alerts.some((a) => a.category === "override_spike")).toBe(true);
    expect(alerts.find((a) => a.category === "override_spike")!.severity).toBe("warning");
  });

  it("alerts on empty canon as critical", () => {
    const statuses = [makeStatus("a", { canon_confidence: "empty", statement_count: 0, gate_ready: false, risk_flags: ["No canon"] })];
    const alerts = generateOrgAlerts(statuses, "/fake");
    const empty = alerts.find((a) => a.category === "sparse_canon" && a.severity === "critical");
    expect(empty).toBeDefined();
  });

  it("alerts on missing voice/naming", () => {
    const statuses = [makeStatus("a", { risk_flags: ["No voice/naming"] })];
    const alerts = generateOrgAlerts(statuses, "/fake");
    expect(alerts.some((a) => a.category === "enrichment_needed" && a.title.includes("voice"))).toBe(true);
  });

  it("alerts on missing anti-patterns", () => {
    const statuses = [makeStatus("a", { risk_flags: ["No anti-patterns"] })];
    const alerts = generateOrgAlerts(statuses, "/fake");
    expect(alerts.some((a) => a.category === "enrichment_needed" && a.title.includes("anti-pattern"))).toBe(true);
  });

  it("sorts critical before warning before info", () => {
    const statuses = [
      makeStatus("a"),
      makeStatus("b", { canon_confidence: "empty", statement_count: 0, gate_ready: false, risk_flags: ["No canon"] }),
      makeStatus("c", { override_count: 10 }),
    ];
    const alerts = generateOrgAlerts(statuses, "/fake");
    const severities = alerts.map((a) => a.severity);
    const critIdx = severities.indexOf("critical");
    const warnIdx = severities.indexOf("warning");
    const infoIdx = severities.indexOf("info");
    if (critIdx >= 0 && warnIdx >= 0) expect(critIdx).toBeLessThan(warnIdx);
    if (warnIdx >= 0 && infoIdx >= 0) expect(warnIdx).toBeLessThan(infoIdx);
  });

  it("filters by severity", () => {
    const statuses = [makeStatus("a"), makeStatus("b", { override_count: 5 })];
    const alerts = generateOrgAlerts(statuses, "/fake");
    const warnings = filterAlerts(alerts, { severity: "warning" });
    expect(warnings.every((a) => a.severity === "warning")).toBe(true);
  });

  it("filters by repo", () => {
    const statuses = [makeStatus("a"), makeStatus("b", { risk_flags: ["No voice/naming"] })];
    const alerts = generateOrgAlerts(statuses, "/fake");
    const bAlerts = filterAlerts(alerts, { repo: "b" });
    expect(bAlerts.every((a) => a.repo_slug === "b")).toBe(true);
  });

  it("no alerts for healthy portfolio", () => {
    // Strong canon, no overrides, surfaces at warn — only promotion info
    const statuses = [makeStatus("a")];
    const alerts = generateOrgAlerts(statuses, "/fake");
    const nonInfo = alerts.filter((a) => a.severity !== "info");
    expect(nonInfo.length).toBe(0);
  });

  it("thresholds are inspectable", () => {
    expect(THRESHOLDS.override_spike).toBe(3);
    expect(THRESHOLDS.stale_review_days).toBe(30);
    expect(THRESHOLDS.strong_canon_min).toBe(12);
  });
});
