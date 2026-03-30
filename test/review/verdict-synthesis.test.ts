import { describe, it, expect } from "vitest";
import { synthesizeVerdict, extractRatings, reconcileVerdict } from "../../src/review/verdict-synthesis.js";
import type { DimensionEvaluation } from "../../src/review/review-run-types.js";

describe("verdict synthesis", () => {
  describe("synthesizeVerdict", () => {
    // === aligned ===
    it("aligned: all strong/none", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("aligned");
    });

    // === contradiction ===
    it("contradiction: weak thesis + major collision", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "weak",
        pattern_fidelity: "strong",
        anti_pattern_collision: "major",
        voice_naming_fit: "strong",
      })).toBe("contradiction");
    });

    // === hard_drift ===
    it("hard_drift: weak thesis alone", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "weak",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("hard_drift");
    });

    it("hard_drift: major collision alone", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "major",
        voice_naming_fit: "strong",
      })).toBe("hard_drift");
    });

    // === salvageable_drift ===
    it("salvageable_drift: mixed thesis + minor collision", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "mixed",
        pattern_fidelity: "strong",
        anti_pattern_collision: "minor",
        voice_naming_fit: "strong",
      })).toBe("salvageable_drift");
    });

    it("salvageable_drift: mixed thesis + weak voice", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "mixed",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "weak",
      })).toBe("salvageable_drift");
    });

    it("salvageable_drift: weak pattern + weak voice", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "weak",
        anti_pattern_collision: "none",
        voice_naming_fit: "weak",
      })).toBe("salvageable_drift");
    });

    it("salvageable_drift: mixed thesis + weak pattern", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "mixed",
        pattern_fidelity: "weak",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("salvageable_drift");
    });

    // === mostly_aligned ===
    it("mostly_aligned: mixed thesis only", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "mixed",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("mostly_aligned");
    });

    it("mostly_aligned: minor collision only", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "minor",
        voice_naming_fit: "strong",
      })).toBe("mostly_aligned");
    });

    it("mostly_aligned: weak pattern only", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "weak",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("mostly_aligned");
    });

    it("mostly_aligned: weak voice only", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "weak",
      })).toBe("mostly_aligned");
    });

    it("mostly_aligned: mixed pattern", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("mostly_aligned");
    });

    it("mostly_aligned: mixed voice", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "mixed",
      })).toBe("mostly_aligned");
    });
  });

  describe("extractRatings", () => {
    it("extracts ratings from evaluations", () => {
      const evals: DimensionEvaluation[] = [
        { id: "1", review_run_id: "r1", dimension: "thesis_preservation", rating: "strong", judgment: "test", confidence: 0.9, evidence_statement_ids: [], notes: [] },
        { id: "2", review_run_id: "r1", dimension: "pattern_fidelity", rating: "mixed", judgment: "test", confidence: 0.7, evidence_statement_ids: [], notes: [] },
        { id: "3", review_run_id: "r1", dimension: "anti_pattern_collision", rating: "none", judgment: "test", confidence: 0.8, evidence_statement_ids: [], notes: [] },
        { id: "4", review_run_id: "r1", dimension: "voice_naming_fit", rating: "weak", judgment: "test", confidence: 0.6, evidence_statement_ids: [], notes: [] },
      ];

      const ratings = extractRatings(evals);
      expect(ratings.thesis_preservation).toBe("strong");
      expect(ratings.pattern_fidelity).toBe("mixed");
      expect(ratings.anti_pattern_collision).toBe("none");
      expect(ratings.voice_naming_fit).toBe("weak");
    });

    it("uses fallback defaults for missing dimensions", () => {
      const ratings = extractRatings([]);
      expect(ratings.thesis_preservation).toBe("mixed");
      expect(ratings.anti_pattern_collision).toBe("minor");
    });
  });

  describe("reconcileVerdict", () => {
    it("trusts rule verdict over model", () => {
      const { verdict } = reconcileVerdict("aligned", "hard_drift");
      expect(verdict).toBe("aligned");
    });

    it("notes uncertainty when model is more severe", () => {
      const { verdict, uncertainty } = reconcileVerdict("mostly_aligned", "hard_drift");
      expect(verdict).toBe("mostly_aligned");
      expect(uncertainty).toBeDefined();
      expect(uncertainty).toContain("hard_drift");
    });

    it("no uncertainty when model agrees", () => {
      const { verdict, uncertainty } = reconcileVerdict("aligned", "aligned");
      expect(verdict).toBe("aligned");
      expect(uncertainty).toBeUndefined();
    });

    it("handles missing model verdict", () => {
      const { verdict, uncertainty } = reconcileVerdict("salvageable_drift", undefined);
      expect(verdict).toBe("salvageable_drift");
      expect(uncertainty).toBeUndefined();
    });

    it("handles invalid model verdict", () => {
      const { verdict, uncertainty } = reconcileVerdict("aligned", "garbage");
      expect(verdict).toBe("aligned");
      expect(uncertainty).toBeUndefined();
    });
  });
});
