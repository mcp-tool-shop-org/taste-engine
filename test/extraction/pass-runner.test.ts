import { describe, it, expect, vi } from "vitest";
import { isGenericStatement, isRetryableError } from "../../src/extraction/pass-runner.js";

describe("pass-runner helpers", () => {
  describe("isGenericStatement", () => {
    it("flags generic capability statements", () => {
      expect(isGenericStatement("The tool is powerful and flexible")).toBe(true);
      expect(isGenericStatement("The product is user-friendly")).toBe(true);
      expect(isGenericStatement("This tool helps users manage their workflow")).toBe(true);
      expect(isGenericStatement("The product enables teams to collaborate")).toBe(true);
      expect(isGenericStatement("It is a great solution for developers")).toBe(true);
      expect(isGenericStatement("The system provides comprehensive features")).toBe(true);
    });

    it("accepts repo-specific statements", () => {
      expect(isGenericStatement("Role-OS is a routing and execution operating system")).toBe(false);
      expect(isGenericStatement("Adoption must be enforced through session spines")).toBe(false);
      expect(isGenericStatement("Prompt library framing is rejected")).toBe(false);
      expect(isGenericStatement("Doctor checks enforce runtime health")).toBe(false);
      expect(isGenericStatement("Thin shell over a strict operational core")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isGenericStatement("THE TOOL IS POWERFUL AND ROBUST")).toBe(true);
    });
  });

  describe("isRetryableError", () => {
    it("marks JSON parse failures as retryable", () => {
      expect(isRetryableError("Malformed JSON from model for LlmPassOutput: {bad")).toBe(true);
    });

    it("marks Zod validation failures as retryable", () => {
      expect(isRetryableError("Invalid LLM output: Expected array, received string")).toBe(true);
    });

    it("does NOT retry network/Ollama errors", () => {
      expect(isRetryableError("Ollama returned HTTP 500: internal error")).toBe(false);
      expect(isRetryableError("Ollama request timed out after 300000ms")).toBe(false);
      expect(isRetryableError("Ollama request failed: fetch failed")).toBe(false);
    });
  });
});
