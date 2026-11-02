import { OpenAIClient } from "@anvia/openai";

import type { Env } from "@daily-route/env";

import { withCheapestProvider } from "./provider-routing.js";
import { withUsage } from "./usage.js";

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

/**
 * Ask OpenRouter for the cheapest endpoint of the model, every request.
 *
 * `sort: "price"` disables the router's normal load balancing and tries the
 * providers in live price order. `allow_fallbacks` keeps the request alive
 * when the cheapest endpoint is down; `require_parameters` drops providers
 * that would silently ignore tools or the output schema. The order is
 * evaluated by OpenRouter per request, so a provider that raises its price
 * stops being first on the next call without a deploy.
 */
export const CHEAPEST_PROVIDER = {
  provider: {
    sort: "price",
    allow_fallbacks: true,
    require_parameters: true,
  },
} as const;

/**
 * Reasoning effort for every agent call.
 *
 * OpenRouter reads `reasoning.effort` on the chat-completions body. The
 * typed OpenAI control only applies to known OpenAI model ids, and the
 * model here is whatever `AGENT_MODEL` names, so the effort travels as a
 * provider option instead.
 */
export const MEDIUM_REASONING = {
  reasoning: { effort: "medium" },
  ...CHEAPEST_PROVIDER,
} as const;

/**
 * The effort for an agent whose tools do the hard part.
 *
 * The grounder chooses between tool results and ids; it does not reason
 * about the announcement's prose. Reasoning is asked for only where it
 * decides something, so a poll does not pay for a long deliberation on
 * every street name.
 */
export const LOW_REASONING = {
  reasoning: { effort: "low" },
  ...CHEAPEST_PROVIDER,
} as const;

/** Create the completion model used by the routing agent. */
export function createCompletionModel(config: ModelConfig, operation = "unknown") {
  const client = createProviderClient(config);
  const model = client.completionModel({
    modelId: config.model,
    api: config.api,
  });
  // Only OpenRouter exposes live endpoint prices; another OpenAI-compatible
  // provider is left untouched.
  const routed = config.baseUrl.includes("openrouter.ai")
    ? withCheapestProvider(model, config)
    : model;
  return withUsage(routed, { operation, modelId: config.model });
}
