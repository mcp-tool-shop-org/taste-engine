import { describe, it, expect } from "vitest";
import { checkOllamaHealth } from "../../src/providers/ollama/ollama-health.js";

describe("ollama health", () => {
  it("reports failure when ollama is unreachable", async () => {
    // Use a port that's almost certainly not running Ollama
    const result = await checkOllamaHealth("http://127.0.0.1:19999", "test-model", 1000);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/unreachable/i);
  });

  it("reports failure on timeout", async () => {
    // Use a very short timeout against a non-existent host
    const result = await checkOllamaHealth("http://192.0.2.1:11434", "test-model", 500);
    expect(result.ok).toBe(false);
    expect(result.detail).toBeDefined();
  });
});
