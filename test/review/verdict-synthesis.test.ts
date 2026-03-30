import { describe, it, expect } from "vitest";
import {
  synthesizeVerdict,
  extractRatings,
  reconcileVerdict,
  detectCategoryCollapse,
  detectNamingOnlyViolation,
  detectRecoverableMotion,
  buildVerdictContext,
} from "../../src/review/verdict-synthesis.js";
import type { DimensionEvaluation } from "../../src/review/review-run-types.js";
import type { VerdictContext } from "../../src/review/verdict-synthesis.js";

describe("verdict synthesis", () => {
  describe("synthesizeVerdict — base rules", () => {
    it("aligned: all strong/none", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("aligned");
    });

    it("contradiction: weak thesis + major collision", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "weak",
        pattern_fidelity: "strong",
        anti_pattern_collision: "major",
        voice_naming_fit: "strong",
      })).toBe("contradiction");
    });

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
  });

  // === Fix 1: Salvageability gate ===
  describe("salvageability gate", () => {
    it("caps contradiction to hard_drift when core motion is recoverable", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "weak", pattern_fidelity: "weak", anti_pattern_collision: "major", voice_naming_fit: "weak" },
        { category_collapse_detected: false, naming_only_violation: false, core_motion_recoverable: true },
      )).toBe("hard_drift");
    });

    it("caps hard_drift to salvageable when core motion is recoverable", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "weak", pattern_fidelity: "strong", anti_pattern_collision: "none", voice_naming_fit: "strong" },
        { category_collapse_detected: false, naming_only_violation: false, core_motion_recoverable: true },
      )).toBe("salvageable_drift");
    });

    it("caps major collision to salvageable when recoverable", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "strong", pattern_fidelity: "strong", anti_pattern_collision: "major", voice_naming_fit: "strong" },
        { category_collapse_detected: false, naming_only_violation: false, core_motion_recoverable: true },
      )).toBe("salvageable_drift");
    });

    it("allows contradiction when motion is NOT recoverable", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "weak", pattern_fidelity: "weak", anti_pattern_collision: "major", voice_naming_fit: "weak" },
        { category_collapse_detected: false, naming_only_violation: false, core_motion_recoverable: false },
      )).toBe("contradiction");
    });
  });

  // === Fix 2: Category-collapse detector ===
  describe("category-collapse escalation", () => {
    it("escalates mixed thesis to hard_drift when category collapse detected", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "mixed", pattern_fidelity: "strong", anti_pattern_collision: "none", voice_naming_fit: "strong" },
        { category_collapse_detected: true, naming_only_violation: false, core_motion_recoverable: false },
      )).toBe("hard_drift");
    });

    it("does not escalate without category collapse", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "mixed", pattern_fidelity: "strong", anti_pattern_collision: "none", voice_naming_fit: "strong" },
        { category_collapse_detected: false, naming_only_violation: false, core_motion_recoverable: false },
      )).toBe("mostly_aligned");
    });
  });

  // === Fix 3: Naming-law separation ===
  describe("naming-law vs thesis separation", () => {
    it("caps naming-only violation at hard_drift, not contradiction", () => {
      expect(synthesizeVerdict(
        { thesis_preservation: "weak", pattern_fidelity: "strong", anti_pattern_collision: "major", voice_naming_fit: "weak" },
        { category_collapse_detected: false, naming_only_violation: true, core_motion_recoverable: false },
      )).toBe("hard_drift");
    });
  });

  // === Fix 4: Relaxed aligned threshold ===
  describe("relaxed aligned threshold", () => {
    it("aligned: strong thesis + minor collision + all else strong", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "minor",
        voice_naming_fit: "strong",
      })).toBe("aligned");
    });

    it("aligned: strong thesis + none collision + one mixed secondary", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "none",
        voice_naming_fit: "strong",
      })).toBe("aligned");
    });

    it("aligned: strong thesis + none collision + mixed voice", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "mixed",
      })).toBe("aligned");
    });

    it("mostly_aligned: strong thesis + none collision + two mixed secondaries", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "mixed",
        anti_pattern_collision: "none",
        voice_naming_fit: "mixed",
      })).toBe("mostly_aligned");
    });

    it("mostly_aligned: minor collision + weak pattern (not all strong)", () => {
      expect(synthesizeVerdict({
        thesis_preservation: "strong",
        pattern_fidelity: "weak",
        anti_pattern_collision: "minor",
        voice_naming_fit: "strong",
      })).toBe("mostly_aligned");
    });
  });

  // === Detectors ===
  describe("detectCategoryCollapse", () => {
    it("detects assistant reframing", () => {
      expect(detectCategoryCollapse("It's like having a smart assistant that knows which expert to call.")).toBe(true);
    });

    it("detects prompt library framing", () => {
      expect(detectCategoryCollapse("A curated collection of AI persona templates for Claude.")).toBe(true);
    });

    it("detects chat-first reframing", () => {
      expect(detectCategoryCollapse("Replace the CLI with a chat-first experience.")).toBe(true);
    });

    it("detects copy-paste persona framing", () => {
      expect(detectCategoryCollapse("Simply pick the persona, paste it into Claude, and go.")).toBe(true);
    });

    it("detects structure removal", () => {
      expect(detectCategoryCollapse("Remove references to evidence, verdicts, and contracts.")).toBe(true);
    });

    it("passes operational language", () => {
      expect(detectCategoryCollapse("Routes tasks through mission, pack, or free routing based on confidence.")).toBe(false);
    });

    it("passes technical descriptions", () => {
      expect(detectCategoryCollapse("61 role contracts with structured evidence and honest escalation.")).toBe(false);
    });
  });

  describe("detectNamingOnlyViolation", () => {
    it("true when only voice is weak", () => {
      expect(detectNamingOnlyViolation({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "weak",
      })).toBe(true);
    });

    it("false when thesis is also weak", () => {
      expect(detectNamingOnlyViolation({
        thesis_preservation: "weak",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "weak",
      })).toBe(false);
    });

    it("false when voice is not weak", () => {
      expect(detectNamingOnlyViolation({
        thesis_preservation: "strong",
        pattern_fidelity: "strong",
        anti_pattern_collision: "none",
        voice_naming_fit: "mixed",
      })).toBe(false);
    });
  });

  describe("detectRecoverableMotion", () => {
    it("recoverable: talks about routing and role contracts", () => {
      expect(detectRecoverableMotion("Recommends the best roles and coordinates handoff with structured evidence.")).toBe(true);
    });

    it("recoverable: mentions role routing and structured output", () => {
      expect(detectRecoverableMotion("Organize your role routing with structured output and escalation.")).toBe(true);
    });

    it("not recoverable: copy-paste-go with no structure", () => {
      expect(detectRecoverableMotion("Simply pick a persona, paste it into Claude, and go. No configuration needed.")).toBe(false);
    });

    it("not recoverable: replace CLI with no structure", () => {
      expect(detectRecoverableMotion("Replace the CLI-first approach. No need for commands or structured workflows.")).toBe(false);
    });
  });

  describe("buildVerdictContext", () => {
    it("detects category collapse and naming violation", () => {
      const ctx = buildVerdictContext(
        "It's like having a smart assistant that manages things.",
        { thesis_preservation: "strong", pattern_fidelity: "strong", anti_pattern_collision: "none", voice_naming_fit: "weak" },
      );
      expect(ctx.category_collapse_detected).toBe(true);
      expect(ctx.naming_only_violation).toBe(true);
    });

    it("detects recoverable motion with structured evidence language", () => {
      const ctx = buildVerdictContext(
        "Organize role routing with structured evidence and escalation paths.",
        { thesis_preservation: "mixed", pattern_fidelity: "strong", anti_pattern_collision: "none", voice_naming_fit: "strong" },
      );
      expect(ctx.core_motion_recoverable).toBe(true);
    });

    it("does not detect recoverable motion in pure persona copy", () => {
      const ctx = buildVerdictContext(
        "A curated collection of AI persona templates. Just pick and paste.",
        { thesis_preservation: "weak", pattern_fidelity: "weak", anti_pattern_collision: "major", voice_naming_fit: "weak" },
      );
      expect(ctx.core_motion_recoverable).toBe(false);
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
    });

    it("no uncertainty when model agrees", () => {
      const { uncertainty } = reconcileVerdict("aligned", "aligned");
      expect(uncertainty).toBeUndefined();
    });

    it("handles missing model verdict", () => {
      const { verdict } = reconcileVerdict("salvageable_drift", undefined);
      expect(verdict).toBe("salvageable_drift");
    });
  });
});
