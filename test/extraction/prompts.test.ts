import { describe, it, expect } from "vitest";
import { getPassPrompt, buildSourceBlock } from "../../src/extraction/prompts.js";
import { PASS_TYPES } from "../../src/extraction/extraction-types.js";

describe("prompts", () => {
  it("every pass type has a prompt config", () => {
    for (const passType of PASS_TYPES) {
      const prompt = getPassPrompt(passType);
      expect(prompt).toBeDefined();
      expect(prompt.system).toBeTruthy();
      expect(prompt.promptTemplate).toBeTruthy();
      expect(prompt.promptTemplate).toContain("{{sources}}");
    }
  });

  it("thesis prompt mentions identity not capability", () => {
    const prompt = getPassPrompt("thesis");
    expect(prompt.system).toContain("identity");
  });

  it("anti-pattern prompt asks for rejection-based statements", () => {
    const prompt = getPassPrompt("anti_pattern");
    expect(prompt.system).toContain("reject");
  });

  it("voice_naming prompt distinguishes voice from naming", () => {
    const prompt = getPassPrompt("voice_naming");
    expect(prompt.system).toContain("voice");
    expect(prompt.system).toContain("naming");
  });

  it("contradiction prompt treats contradictions as information", () => {
    const prompt = getPassPrompt("contradiction");
    expect(prompt.system).toContain("NOT an error");
  });

  it("all prompts ban generic language", () => {
    for (const passType of PASS_TYPES) {
      const prompt = getPassPrompt(passType);
      // All should warn against generic output
      expect(prompt.system.toLowerCase()).toMatch(/generic|restating|summarize/);
    }
  });

  describe("buildSourceBlock", () => {
    it("formats sources with titles", () => {
      const block = buildSourceBlock([
        { title: "README", body: "# Role-OS\n\nA routing OS." },
        { title: "Architecture", body: "## Design\n\nStrict core." },
      ]);

      expect(block).toContain("### README");
      expect(block).toContain("### Architecture");
      expect(block).toContain("# Role-OS");
      expect(block).toContain("## Design");
    });

    it("separates sources with dividers", () => {
      const block = buildSourceBlock([
        { title: "A", body: "content a" },
        { title: "B", body: "content b" },
      ]);
      expect(block).toContain("---");
    });

    it("handles empty sources", () => {
      const block = buildSourceBlock([]);
      expect(block).toBe("");
    });
  });
});
