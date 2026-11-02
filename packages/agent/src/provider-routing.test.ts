import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompletionRequest } from "@anvia/core";

import { rankProviders, routeRequest } from "./provider-routing.js";

const request: CompletionRequest = {
  chatHistory: [{ role: "user", content: "How do I get to Simpang Kuningan?" }],
  tools: [],
  documents: [],
  maxTokens: 50,
};

const config = {
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "key",
  model: "deepseek/deepseek-v4.1-flash-1017",
  api: "chat" as const,
  contextWindow: null,
};

describe("rankProviders", () => {
  it("weighs prompt and completion price with the request's token budget", () => {
    const prices = [
      { provider: "CheapPrompt", prompt: 0.00000002, completion: 0.000001 },
      { provider: "CheapCompletion", prompt: 0.00000008, completion: 0.0000005 },
    ];
    expect(rankProviders(prices, 35, 50)[0]?.provider).toBe("CheapCompletion");
    expect(rankProviders(prices, 1_000, 10)[0]?.provider).toBe("CheapPrompt");
  });
});

describe("routeRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts the cheapest endpoint for this request first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              endpoints: [
                {
                  provider_name: "CheapPrompt",
                  pricing: { prompt: "0.00000002", completion: "0.000001" },
                },
                {
                  provider_name: "CheapCompletion",
                  pricing: { prompt: "0.00000008", completion: "0.0000005" },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const routed = await routeRequest(request, {
      ...config,
      model: "test/model-cheapest",
    });
    const provider = routed.providerOptions?.["provider"] as { order?: string[] };
    expect(provider.order?.[0]).toBe("CheapCompletion");
  });

  it("fetches the price list once when requests arrive together", async () => {
    let fetches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetches += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(
          JSON.stringify({
            data: {
              endpoints: [
                { provider_name: "A", pricing: { prompt: "0.0000001", completion: "0.000001" } },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
    const concurrentConfig = { ...config, model: "test/model-concurrent" };
    await Promise.all([
      routeRequest(request, concurrentConfig),
      routeRequest(request, concurrentConfig),
    ]);
    expect(fetches).toBe(1);
  });
});
