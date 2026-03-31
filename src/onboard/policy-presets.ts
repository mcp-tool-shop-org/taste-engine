import type { GatePolicy } from "../gate/policy-types.js";
import type { PolicyPreset } from "./onboard-types.js";

/**
 * Policy presets for common repo shapes.
 */
export function getPreset(preset: PolicyPreset, canonVersion: string): GatePolicy {
  switch (preset) {
    case "advisory-starter":
      return {
        canon_version: canonVersion,
        default_mode: "advisory",
        surfaces: [],
        skip_globs: [],
        require_override_receipts: false,
      };

    case "docs-heavy":
      return {
        canon_version: canonVersion,
        default_mode: "advisory",
        surfaces: [
          { artifact_type: "readme_section", mode: "warn", globs: [], notes: "README is primary product surface" },
          { artifact_type: "release_note", mode: "advisory", globs: [] },
          { artifact_type: "package_blurb", mode: "warn", globs: [], notes: "Package description is high-signal" },
        ],
        skip_globs: [],
        require_override_receipts: false,
      };

    case "product-copy":
      return {
        canon_version: canonVersion,
        default_mode: "advisory",
        surfaces: [
          { artifact_type: "package_blurb", mode: "warn", globs: [], notes: "Package description defines product identity" },
          { artifact_type: "readme_section", mode: "warn", globs: [], notes: "README framing is product-critical" },
          { artifact_type: "naming_proposal", mode: "warn", globs: [], notes: "Naming changes threaten identity" },
          { artifact_type: "release_note", mode: "advisory", globs: [] },
          { artifact_type: "feature_brief", mode: "advisory", globs: [] },
        ],
        skip_globs: [],
        require_override_receipts: false,
      };
  }
}
