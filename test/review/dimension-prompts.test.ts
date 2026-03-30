import { describe, it, expect } from "vitest";
import { getDimensionPrompt, fillPrompt } from "../../src/review/dimension-prompts.js";
import { DIMENSIONS } from "../../src/review/review-run-types.js";

describe("dimension prompts", () => {
  it("every dimension has a prompt config", () => {
    for (const dim of DIMENSIONS) {
      const config = getDimensionPrompt(dim);
      expect(config).toBeDefined();
      expect(config.system).toBeTruthy();
      expect(config.promptTemplate).toBeTruthy();
    }
  });

  it("thesis prompt mentions identity and reframing", () => {
    const config = getDimensionPrompt("thesis_preservation");
    expect(config.system).toContain("identity");
    expect(config.system).toContain("reframe");
  });

  it("anti-pattern prompt mentions collision severity", () => {
    const config = getDimensionPrompt("anti_pattern_collision");
    expect(config.system).toContain("minor");
    expect(config.system).toContain("major");
  });

  it("voice/naming prompt mentions naming conventions", () => {
    const config = getDimensionPrompt("voice_naming_fit");
    expect(config.system).toContain("naming");
    expect(config.system).toContain("vocabulary");
  });

  it("all prompts require JSON output", () => {
    for (const dim of DIMENSIONS) {
      const config = getDimensionPrompt(dim);
      expect(config.system).toContain("JSON only");
    }
  });

  it("all prompts contain template variables", () => {
    for (const dim of DIMENSIONS) {
      const config = getDimensionPrompt(dim);
      expect(config.promptTemplate).toContain("{{artifactType}}");
      expect(config.promptTemplate).toContain("{{candidateBody}}");
      expect(config.promptTemplate).toContain("{{canonPacket}}");
    }
  });

  describe("fillPrompt", () => {
    it("replaces template variables", () => {
      const result = fillPrompt("Hello {{name}}, your type is {{type}}", {
        name: "World",
        type: "readme",
      });
      expect(result).toBe("Hello World, your type is readme");
    });

    it("replaces multiple occurrences", () => {
      const result = fillPrompt("{{x}} and {{x}}", { x: "yes" });
      expect(result).toBe("yes and yes");
    });
  });
});
