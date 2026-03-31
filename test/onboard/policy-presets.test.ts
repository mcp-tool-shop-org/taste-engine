import { describe, it, expect } from "vitest";
import { getPreset } from "../../src/onboard/policy-presets.js";

describe("policy presets", () => {
  it("advisory-starter is fully advisory", () => {
    const policy = getPreset("advisory-starter", "v1");
    expect(policy.default_mode).toBe("advisory");
    expect(policy.surfaces.length).toBe(0);
    expect(policy.require_override_receipts).toBe(false);
  });

  it("docs-heavy promotes readme and package_blurb to warn", () => {
    const policy = getPreset("docs-heavy", "v1");
    expect(policy.default_mode).toBe("advisory");
    expect(policy.surfaces.find((s) => s.artifact_type === "readme_section")?.mode).toBe("warn");
    expect(policy.surfaces.find((s) => s.artifact_type === "package_blurb")?.mode).toBe("warn");
  });

  it("product-copy promotes naming_proposal to warn", () => {
    const policy = getPreset("product-copy", "v1");
    expect(policy.surfaces.find((s) => s.artifact_type === "naming_proposal")?.mode).toBe("warn");
    expect(policy.surfaces.find((s) => s.artifact_type === "package_blurb")?.mode).toBe("warn");
  });

  it("all presets use the provided canon version", () => {
    for (const preset of ["advisory-starter", "docs-heavy", "product-copy"] as const) {
      expect(getPreset(preset, "canon-v2").canon_version).toBe("canon-v2");
    }
  });
});
