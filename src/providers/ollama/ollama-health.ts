import type { OllamaTagsResponse } from "./ollama-types.js";

/**
 * Check if Ollama is reachable and the specified model is available.
 */
export async function checkOllamaHealth(
  baseUrl: string,
  model: string,
  timeoutMs: number = 5000,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, detail: `Ollama returned HTTP ${res.status}` };
    }

    const data = (await res.json()) as OllamaTagsResponse;
    const available = data.models?.map((m) => m.name) ?? [];

    // Ollama model names can include :latest tag
    const modelBase = model.includes(":") ? model : `${model}:latest`;
    const found = available.some(
      (name) => name === model || name === modelBase,
    );

    if (!found) {
      return {
        ok: false,
        detail: `Model "${model}" not found. Available: ${available.join(", ") || "(none)"}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("AbortError")) {
      return { ok: false, detail: `Ollama unreachable (timeout ${timeoutMs}ms)` };
    }
    return { ok: false, detail: `Ollama unreachable: ${msg}` };
  }
}
