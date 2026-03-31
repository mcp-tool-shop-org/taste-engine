import { describe, it, expect } from "vitest";
import {
  verdictToGateResult,
  verdictToRepairPath,
  computeOverallResult,
} from "../../src/gate/gate-types.js";

describe("gate types", () => {
  describe("verdictToGateResult", () => {
    // Advisory mode — most permissive
    it("advisory: aligned = pass", () => expect(verdictToGateResult("aligned", "advisory")).toBe("pass"));
    it("advisory: mostly_aligned = pass", () => expect(verdictToGateResult("mostly_aligned", "advisory")).toBe("pass"));
    it("advisory: salvageable_drift = pass", () => expect(verdictToGateResult("salvageable_drift", "advisory")).toBe("pass"));
    it("advisory: hard_drift = warn", () => expect(verdictToGateResult("hard_drift", "advisory")).toBe("warn"));
    it("advisory: contradiction = warn", () => expect(verdictToGateResult("contradiction", "advisory")).toBe("warn"));

    // Warn mode
    it("warn: aligned = pass", () => expect(verdictToGateResult("aligned", "warn")).toBe("pass"));
    it("warn: salvageable_drift = pass", () => expect(verdictToGateResult("salvageable_drift", "warn")).toBe("pass"));
    it("warn: hard_drift = block", () => expect(verdictToGateResult("hard_drift", "warn")).toBe("block"));
    it("warn: contradiction = block", () => expect(verdictToGateResult("contradiction", "warn")).toBe("block"));

    // Required mode — strictest
    it("required: aligned = pass", () => expect(verdictToGateResult("aligned", "required")).toBe("pass"));
    it("required: salvageable_drift = warn", () => expect(verdictToGateResult("salvageable_drift", "required")).toBe("warn"));
    it("required: hard_drift = block", () => expect(verdictToGateResult("hard_drift", "required")).toBe("block"));
    it("required: contradiction = block", () => expect(verdictToGateResult("contradiction", "required")).toBe("block"));
  });

  describe("verdictToRepairPath", () => {
    it("aligned = no repair", () => expect(verdictToRepairPath("aligned")).toBeNull());
    it("mostly_aligned = no repair", () => expect(verdictToRepairPath("mostly_aligned")).toBeNull());
    it("salvageable_drift = patch", () => expect(verdictToRepairPath("salvageable_drift")).toBe("patch"));
    it("hard_drift = structural", () => expect(verdictToRepairPath("hard_drift")).toBe("structural"));
    it("contradiction = irreparable", () => expect(verdictToRepairPath("contradiction")).toBe("irreparable"));
  });

  describe("computeOverallResult", () => {
    it("all pass = pass", () => {
      expect(computeOverallResult([
        { artifact: {} as any, verdict: "aligned", gate_result: "pass", summary: "", repair_available: false, repair_path: null },
        { artifact: {} as any, verdict: "aligned", gate_result: "pass", summary: "", repair_available: false, repair_path: null },
      ])).toBe("pass");
    });

    it("any warn = warn", () => {
      expect(computeOverallResult([
        { artifact: {} as any, verdict: "aligned", gate_result: "pass", summary: "", repair_available: false, repair_path: null },
        { artifact: {} as any, verdict: "hard_drift", gate_result: "warn", summary: "", repair_available: true, repair_path: "structural" },
      ])).toBe("warn");
    });

    it("any block = block", () => {
      expect(computeOverallResult([
        { artifact: {} as any, verdict: "aligned", gate_result: "pass", summary: "", repair_available: false, repair_path: null },
        { artifact: {} as any, verdict: "contradiction", gate_result: "block", summary: "", repair_available: true, repair_path: "irreparable" },
      ])).toBe("block");
    });

    it("block wins over warn", () => {
      expect(computeOverallResult([
        { artifact: {} as any, verdict: "hard_drift", gate_result: "warn", summary: "", repair_available: true, repair_path: "structural" },
        { artifact: {} as any, verdict: "contradiction", gate_result: "block", summary: "", repair_available: true, repair_path: "irreparable" },
      ])).toBe("block");
    });
  });
});
