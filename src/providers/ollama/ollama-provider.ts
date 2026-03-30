import type {
  LlmProvider,
  HealthResult,
  CompletionInput,
  CompletionResult,
} from "../provider.js";
import type { OllamaGenerateRequest, OllamaGenerateResponse } from "./ollama-types.js";
import { checkOllamaHealth } from "./ollama-health.js";

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes for generation
const HEALTH_TIMEOUT_MS = 5_000;

export class OllamaProvider implements LlmProvider {
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(opts: { baseUrl: string; model: string; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  name(): string {
    return "ollama";
  }

  async healthCheck(): Promise<HealthResult> {
    const result = await checkOllamaHealth(this.baseUrl, this.model, HEALTH_TIMEOUT_MS);
    return {
      ok: result.ok,
      provider: "ollama",
      model: this.model,
      detail: result.detail,
    };
  }

  async completeJson<T>(input: CompletionInput): Promise<CompletionResult<T>> {
    const start = Date.now();

    const body: OllamaGenerateRequest = {
      model: this.model,
      system: input.system,
      prompt: input.prompt,
      format: "json",
      stream: false,
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const elapsed = Date.now() - start;

      if (!res.ok) {
        return {
          ok: false,
          error: `Ollama returned HTTP ${res.status}: ${await res.text()}`,
          model: this.model,
          elapsed_ms: elapsed,
        };
      }

      const data = (await res.json()) as OllamaGenerateResponse;

      // Parse the JSON response
      let parsed: T;
      try {
        parsed = JSON.parse(data.response) as T;
      } catch {
        return {
          ok: false,
          error: `Malformed JSON from model for ${input.schemaName}: ${data.response.slice(0, 200)}`,
          model: this.model,
          elapsed_ms: elapsed,
        };
      }

      return {
        ok: true,
        data: parsed,
        model: data.model ?? this.model,
        elapsed_ms: elapsed,
      };
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("abort") || msg.includes("AbortError")) {
        return {
          ok: false,
          error: `Ollama request timed out after ${this.timeoutMs}ms`,
          model: this.model,
          elapsed_ms: elapsed,
        };
      }

      return {
        ok: false,
        error: `Ollama request failed: ${msg}`,
        model: this.model,
        elapsed_ms: elapsed,
      };
    }
  }
}
