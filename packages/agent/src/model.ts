import { OpenAIClient } from "@anvia/openai";

import type { Env } from "@daily-route/env";

/**
 * The model factory.
 *
 * OpenRouter speaks the OpenAI wire format, so the official OpenAI adapter
 * points at OpenRouter's base URL and adds the two headers OpenRouter reads
 * for attribution.
 */

export const OPENROUTER_REFERER = "https://github.com/iqbalShafiq/daily-route";

export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Set to "responses" for providers that only implement the Responses API. */
  api: "chat" | "responses";
  contextWindow: number | null;
};

/**
 * Build the model configuration from the environment.
 *
 * The model id is read from `AGENT_MODEL` and sent to the provider verbatim;
 * nothing in the codebase hard-codes a model slug.
 */
export function modelConfigFromEnv(env: Env): ModelConfig {
  return {
    baseUrl: env.AGENT_BASE_URL,
    apiKey: env.AGENT_API_KEY ?? "",
    model: env.AGENT_MODEL,
    api: "chat",
    contextWindow: null,
  };
}

/** Create the provider client for a model configuration. */
export function createProviderClient(config: ModelConfig): OpenAIClient {
  return new OpenAIClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    headers: {
      "HTTP-Referer": OPENROUTER_REFERER,
      "X-OpenRouter-Title": "Daily Route",
    },
  });
}

/** Create the completion model used by the routing agent. */
export function createCompletionModel(config: ModelConfig) {
  const client = createProviderClient(config);
  return client.completionModel({
    modelId: config.model,
    api: config.api,
  });
}
