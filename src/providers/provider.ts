/**
 * LLM provider interface.
 *
 * The rest of the application MUST only interact with LLM capabilities
 * through this interface. No module outside src/providers/ should import
 * Ollama-specific code directly.
 */
export interface LlmProvider {
  /** Provider name (e.g., "ollama"). */
  name(): string;

  /** Check whether the provider is reachable and the model is available. */
  healthCheck(): Promise<HealthResult>;

  /**
   * Send a prompt and receive structured JSON back.
   * The provider is responsible for enforcing JSON-only output
   * and validating the response shape against schemaName.
   */
  completeJson<T>(input: CompletionInput): Promise<CompletionResult<T>>;
}

export type HealthResult = {
  ok: boolean;
  provider: string;
  model?: string;
  detail?: string;
};

export type CompletionInput = {
  /** Short label for the task (e.g., "thesis_extraction"). */
  task: string;
  /** System prompt. */
  system: string;
  /** User prompt with the actual content. */
  prompt: string;
  /** Name of the expected output schema (for error messages). */
  schemaName: string;
};

export type CompletionResult<T> = {
  ok: true;
  data: T;
  model: string;
  elapsed_ms: number;
} | {
  ok: false;
  error: string;
  model: string;
  elapsed_ms: number;
};
