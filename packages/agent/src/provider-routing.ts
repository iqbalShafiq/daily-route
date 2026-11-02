import type { CompletionModel, CompletionRequest } from "@anvia/core";

import type { ModelConfig } from "./model.js";

/**
 * Route each OpenRouter request to the endpoint that is cheapest for *this*
 * request, not merely the one with the lowest prompt price.
 *
 * OpenRouter's `sort: "price"` ranks by list price; a model with a cheap
 * prompt and an expensive completion can still win that sort while costing
 * more for a long answer. This module reads the live endpoint prices, weighs
 * them with the request's input estimate and output budget, and puts the
 * cheapest providers first. The price list is cached for a minute, so a
 * provider that changes its price is re-ranked without a deploy.
 */

export type EndpointPrice = {
  provider: string;
  prompt: number;
  completion: number;
};

type CacheEntry = { at: number; prices: EndpointPrice[] };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();
/** One in-flight price request per model, so ten tabs do not fetch ten times. */
const pending = new Map<string, Promise<EndpointPrice[]>>();

export function rankProviders(
  prices: readonly EndpointPrice[],
  inputTokens: number,
  outputTokens: number,
): EndpointPrice[] {
  return [...prices].sort((left, right) => {
    const leftCost = left.prompt * inputTokens + left.completion * outputTokens;
    const rightCost = right.prompt * inputTokens + right.completion * outputTokens;
    return leftCost - rightCost;
  });
}

export function estimateInputTokens(request: CompletionRequest): number {
  const parts: string[] = [];
  if (request.instructions) parts.push(request.instructions);
  for (const message of request.chatHistory) {
    parts.push(typeof message.content === "string" ? message.content : JSON.stringify(message.content));
  }
  for (const tool of request.tools) {
    parts.push(tool.name, tool.description, JSON.stringify(tool.parameters));
  }
  for (const document of request.documents) parts.push(document.text);
  // A rough tokeniser is enough to rank providers; the output budget is the
  // larger term for the long answers this app makes.
  return Math.max(1, Math.ceil(parts.join(" ").length / 4));
}

async function endpointPrices(config: ModelConfig): Promise<EndpointPrice[]> {
  const key = `${config.baseUrl}|${config.model}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.prices;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const task = loadEndpointPrices(config, key, hit).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

async function loadEndpointPrices(
  config: ModelConfig,
  key: string,
  hit: CacheEntry | undefined,
): Promise<EndpointPrice[]> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const url = `${base}/models/${config.model}/endpoints`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return hit?.prices ?? [];
    const payload = (await response.json()) as {
      data?: { endpoints?: RawEndpoint[] };
      endpoints?: RawEndpoint[];
    };
    const endpoints = payload.data?.endpoints ?? payload.endpoints ?? [];
    const byProvider = new Map<string, EndpointPrice>();
    for (const endpoint of endpoints) {
      const provider = endpoint.provider_name ?? endpoint.name;
      const prompt = Number(endpoint.pricing?.prompt);
      const completion = Number(endpoint.pricing?.completion);
      if (!provider || !Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
      const current = byProvider.get(provider);
      if (!current || prompt < current.prompt || (prompt === current.prompt && completion < current.completion)) {
        byProvider.set(provider, { provider, prompt, completion });
      }
    }
    const prices = [...byProvider.values()];
    cache.set(key, { at: Date.now(), prices });
    return prices;
  } catch {
    if (hit) return hit.prices;
    return [];
  }
}

type RawEndpoint = {
  name?: string;
  provider_name?: string;
  pricing?: { prompt?: string | number; completion?: string | number };
};

export async function routeRequest(
  request: CompletionRequest,
  config: ModelConfig,
): Promise<CompletionRequest> {
  const prices = await endpointPrices(config);
  if (prices.length === 0) return request;
  const inputTokens = estimateInputTokens(request);
  const outputTokens = request.maxTokens ?? 1_024;
  const ranked = rankProviders(prices, inputTokens, outputTokens)
    .map((entry) => entry.provider)
    .filter((provider, index, all) => all.indexOf(provider) === index);
  return {
    ...request,
    providerOptions: {
      ...request.providerOptions,
      provider: {
        order: ranked.slice(0, 5),
        allow_fallbacks: true,
        require_parameters: true,
      },
    },
  };
}

/**
 * Wrap a completion model so every call is routed to the cheapest endpoint.
 *
 * A wrapper instead of a middleware because it sees the final request, with
 * the instructions and tools the agent actually sends, and because it can
 * wrap both `completion` and `streamCompletion`.
 */
export function withCheapestProvider(
  model: CompletionModel,
  config: ModelConfig,
): CompletionModel {
  const wrapped: CompletionModel = {
    provider: model.provider,
    modelId: model.modelId,
    ...(model.contextLimits ? { contextLimits: model.contextLimits } : {}),
    capabilities: model.capabilities,
    ...(model.controls ? { controls: model.controls } : {}),
    ...(model.traceRequest ? { traceRequest: model.traceRequest.bind(model) } : {}),
    async completion(request, options) {
      return model.completion(await routeRequest(request, config), options);
    },
  };
  const streaming = model as unknown as {
    streamCompletion?: (
      request: CompletionRequest,
      options?: unknown,
    ) => AsyncIterable<unknown>;
  };
  const streamCompletion = streaming.streamCompletion;
  if (streamCompletion) {
    const withStream = wrapped as CompletionModel & {
      streamCompletion: (
        request: CompletionRequest,
        options?: unknown,
      ) => AsyncIterable<unknown>;
    };
    withStream.streamCompletion = async function* (request, options) {
      yield* streamCompletion.call(model, await routeRequest(request, config), options);
    };
    return withStream;
  }
  return wrapped;
}
