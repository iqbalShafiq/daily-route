import type { CompletionModel } from "@anvia/core";
import { afterEach, describe, expect, it } from "vitest";

import { setUsageSink, withUsage, type UsageEvent } from "./usage.js";

const model = {
  provider: "openrouter",
  modelId: "deepseek/deepseek-v4.1-flash-1017",
  capabilities: {
    streaming: false,
    tools: false,
    toolChoice: false,
    imageInput: false,
    documentInput: false,
    outputSchema: false,
    reasoning: false,
  },
  async completion() {
    return {
      choice: [],
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      rawResponse: { provider: "Sail Research", usage: { cost: 0.002 } },
    };
  },
} as unknown as CompletionModel;

describe("withUsage", () => {
  afterEach(() => {
    setUsageSink(null);
  });

  it("records the provider that answered, the tokens and the cost", async () => {
    const events: UsageEvent[] = [];
    setUsageSink((event) => {
      events.push(event);
    });
    await withUsage(model, { operation: "chat", modelId: model.modelId }).completion({
      chatHistory: [{ role: "user", content: "hi" }],
      tools: [],
      documents: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "ai",
      operation: "chat",
      providerName: "Sail Research",
      promptTokens: 10,
      completionTokens: 5,
      costUsd: 0.002,
      status: "ok",
    });
  });
});
