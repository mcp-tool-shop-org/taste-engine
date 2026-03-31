import type Database from "better-sqlite3";
import type { OnboardReport, SourceSuggestion } from "./onboard-types.js";
import type { ArtifactType } from "../core/enums.js";
import { ARTIFACT_TYPES } from "../core/enums.js";
import { getStatements, getStatementCounts } from "../canon/canon-store.js";

/**
 * Generate an onboarding report assessing readiness for gate usage.
 */
export function generateOnboardReport(
  db: Database.Database,
  projectId: string,
  projectSlug: string,
  sources: SourceSuggestion[],
): OnboardReport {
  const counts = getStatementCounts(db, projectId);
  const total = counts.total;

  // Canon confidence
  let canonConfidence: "strong" | "moderate" | "sparse" | "empty";
  if (total === 0) canonConfidence = "empty";
  else if (total < 5) canonConfidence = "sparse";
  else if (total < 12) canonConfidence = "moderate";
  else canonConfidence = "strong";

  // Sparse warnings
  const sparseWarnings: string[] = [];
  if (!counts.by_type["thesis"] || counts.by_type["thesis"] < 1) {
    sparseWarnings.push("No thesis statements. Gate cannot assess product identity preservation.");
  }
  if (!counts.by_type["anti_pattern"] || counts.by_type["anti_pattern"] < 1) {
    sparseWarnings.push("No anti-pattern statements. Gate cannot detect known drift patterns.");
  }
  if (!counts.by_type["voice"] && !counts.by_type["naming"]) {
    sparseWarnings.push("No voice/naming statements. Gate cannot assess language alignment.");
  }
  if (!counts.by_type["pattern"] || counts.by_type["pattern"] < 1) {
    sparseWarnings.push("No pattern statements. Gate cannot assess structural fidelity.");
  }

  // Surface readiness
  const statements = getStatements(db, projectId, { lifecycle: "accepted" });
  const surfaceReadiness: OnboardReport["surface_readiness"] = {};

  for (const type of ARTIFACT_TYPES) {
    // Check if any accepted statement targets this artifact type
    const hasTargeted = statements.some((s) => s.artifact_types.includes(type));
    // Check if general canon is strong enough
    const hasThesis = (counts.by_type["thesis"] ?? 0) >= 1;
    const hasAntiPattern = (counts.by_type["anti_pattern"] ?? 0) >= 1;

    const hasCoverage = hasThesis && (hasTargeted || hasAntiPattern);

    let recommendedMode: "advisory" | "warn" | "required" = "advisory";
    let reason = "";

    if (!hasCoverage) {
      recommendedMode = "advisory";
      reason = "Sparse canon coverage — keep advisory until canon is stronger";
    } else if (canonConfidence === "strong" && hasTargeted) {
      recommendedMode = "warn";
      reason = "Good canon coverage with targeted statements";
    } else {
      recommendedMode = "advisory";
      reason = "General canon present but no artifact-type-specific statements yet";
    }

    surfaceReadiness[type] = { has_canon_coverage: hasCoverage, recommended_mode: recommendedMode, reason };
  }

  // Recommended first surfaces
  const recommended: ArtifactType[] = [];
  if (surfaceReadiness["package_blurb"]?.has_canon_coverage) recommended.push("package_blurb");
  if (surfaceReadiness["readme_section"]?.has_canon_coverage) recommended.push("readme_section");
  if (surfaceReadiness["naming_proposal"]?.has_canon_coverage) recommended.push("naming_proposal");
  if (recommended.length === 0 && canonConfidence !== "empty") {
    recommended.push("readme_section"); // Always try readme first
  }

  // Ready for gate?
  const readyForGate = canonConfidence !== "empty" && canonConfidence !== "sparse";

  // Next steps
  const nextSteps: string[] = [];
  if (total === 0) {
    nextSteps.push("Run 'taste extract run --core' to extract candidate canon from source artifacts.");
    nextSteps.push("Curate extracted candidates with 'taste curate queue' and 'taste curate accept'.");
    nextSteps.push("Freeze canon with 'taste canon freeze --label canon-v1'.");
  } else if (canonConfidence === "sparse") {
    nextSteps.push("Canon is sparse. Consider ingesting more source artifacts and running additional extraction passes.");
    nextSteps.push("Run voice/naming extraction: 'taste extract run --passes voice_naming'.");
    nextSteps.push("Curate and freeze when you have at least 8-10 statements across thesis, anti-pattern, pattern, and voice.");
  } else if (!readyForGate) {
    nextSteps.push("Freeze canon before enabling the gate: 'taste canon freeze --label canon-v1'.");
  } else {
    nextSteps.push("Gate is ready. Run 'taste gate run --files README.md' to try your first review.");
    nextSteps.push("Check rollout status with 'taste gate report'.");
    if (sparseWarnings.length > 0) {
      nextSteps.push("Consider addressing sparse canon warnings to improve gate accuracy.");
    }
  }

  return {
    project_slug: projectSlug,
    source_artifacts_found: sources.length,
    source_suggestions: sources,
    canon_statement_count: total,
    canon_confidence: canonConfidence,
    sparse_warnings: sparseWarnings,
    surface_readiness: surfaceReadiness,
    recommended_first_surfaces: recommended,
    ready_for_gate: readyForGate,
    next_steps: nextSteps,
  };
}
