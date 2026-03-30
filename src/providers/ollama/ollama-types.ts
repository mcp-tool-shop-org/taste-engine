/** Ollama /api/generate request shape (subset we use). */
export type OllamaGenerateRequest = {
  model: string;
  prompt: string;
  system?: string;
  format: "json";
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
};

/** Ollama /api/generate response shape (subset we use). */
export type OllamaGenerateResponse = {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
};

/** Ollama /api/tags response shape. */
export type OllamaTagsResponse = {
  models: Array<{
    name: string;
    model: string;
    size: number;
    digest: string;
  }>;
};
