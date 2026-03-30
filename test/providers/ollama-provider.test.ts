import { describe, it, expect } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama/ollama-provider.js";

describe("OllamaProvider", () => {
  it("reports name as ollama", () => {
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "test",
    });
    expect(provider.name()).toBe("ollama");
  });

  it("health check fails when ollama is unreachable", async () => {
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:19999",
      model: "test-model",
    });
    const result = await provider.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("ollama");
    expect(result.model).toBe("test-model");
  });

  it("completeJson fails when ollama is unreachable", async () => {
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:19999",
      model: "test-model",
      timeoutMs: 1000,
    });
    const result = await provider.completeJson({
      task: "test",
      system: "you are a test",
      prompt: "say hello",
      schemaName: "TestSchema",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
      expect(result.model).toBe("test-model");
    }
  });
});
