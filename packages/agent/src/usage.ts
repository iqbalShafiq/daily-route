import type { CompletionModel, CompletionRequest } from "@anvia/core";

/**
 * The usage ledger.
 *
 * X and OpenRouter charge per call or per token. The application keeps one
 * row per call — provider, model, operation, tokens or Posts, estimated cost
 * — so the bill can be explained later. The sink is injected by the process
 * that owns the database; without one, recording is a no-op and the model
 * call is never slowed down.
 */
export type UsageEvent = {
  kind: "x" | "ai";
  provider: string;
  operation: string;
  model?: string | null | undefined;
  providerName?: string | null | undefined;
  endpoint?: string | null | undefined;
  status?: string | null | undefined;
  requests?: number | undefined;
  posts?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  costUsd?: number | undefined;
  latencyMs?: number | undefined;
  traceId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type UsageSink = (event: UsageEvent) => void | Promise<void>;

let sink: UsageSink | null = null;

export function setUsageSink(next: UsageSink | null): void {
  sink = next;
}

/** Fire and forget: a ledger that fails must not fail the call it records. */
export function recordUsage(event: UsageEvent): void {
  const current = sink;
  if (!current) return;
  try {
    void Promise.resolve(current(event)).catch(() => undefined);
  } catch {
    // The sink is telemetry, not part of the request.
  }
}

type RawUsage = {
  provider?: string;
  usage?: { cost?: number };
};

function rawOf(response: unknown): RawUsage {
  return (response ?? {}) as RawUsage;
}

function aiEvent(
  operation: string,
  modelId: string,
  response: { usage: { inputTokens: number; outputTokens: number }; rawResponse: unknown; finishReason?: string },
  latencyMs: number,
  status: "ok" | "error",
): UsageEvent {
  const raw = rawOf(response.rawResponse);
  return {
    kind: "ai",
    provider: "openrouter",
    operation,
    model: modelId,
    providerName: raw.provider ?? null,
    status,
    promptTokens: response.usage.inputTokens,
    completionTokens: response.usage.outputTokens,
    costUsd: typeof raw.usage?.cost === "number" ? raw.usage.cost : 0,
    latencyMs,
    metadata: response.finishReason ? { finishReason: response.finishReason } : {},
  };
}

/** Wrap a model so every completion and stream is written to the ledger. */
export function withUsage(
  model: CompletionModel,
  input: { operation: string; modelId: string },
): CompletionModel {
  const wrapped: CompletionModel = {
    provider: model.provider,
    modelId: model.modelId,
    ...(model.contextLimits ? { contextLimits: model.contextLimits } : {}),
    capabilities: model.capabilities,
    ...(model.controls ? { controls: model.controls } : {}),
    ...(model.traceRequest ? { traceRequest: model.traceRequest.bind(model) } : {}),
    async completion(request, options) {
      const started = Date.now();
      try {
        const result = await model.completion(request, options);
        recordUsage(aiEvent(input.operation, input.modelId, result, Date.now() - started, "ok"));
        return result;
      } catch (error) {
        recordUsage({
          kind: "ai",
          provider: "openrouter",
          operation: input.operation,
          model: input.modelId,
          status: "error",
          latencyMs: Date.now() - started,
          metadata: { error: error instanceof Error ? error.message.slice(0, 300) : String(error) },
        });
        throw error;
      }
    },
  };
  const streaming = model as unknown as {
    streamCompletion?: (
      request: CompletionRequest,
      options?: unknown,
    ) => AsyncIterable<{ type: string; response?: Parameters<typeof aiEvent>[2] }>;
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
      const started = Date.now();
      try {
        for await (const event of streamCompletion.call(model, request, options)) {
          if (event.type === "final" && event.response) {
            recordUsage(aiEvent(input.operation, input.modelId, event.response, Date.now() - started, "ok"));
          } else if (event.type === "error") {
            recordUsage({
              kind: "ai",
              provider: "openrouter",
              operation: input.operation,
              model: input.modelId,
              status: "error",
              latencyMs: Date.now() - started,
            });
          }
          yield event;
        }
      } catch (error) {
        recordUsage({
          kind: "ai",
          provider: "openrouter",
          operation: input.operation,
          model: input.modelId,
          status: "error",
          latencyMs: Date.now() - started,
          metadata: { error: error instanceof Error ? error.message.slice(0, 300) : String(error) },
        });
        throw error;
      }
    };
    return withStream;
  }
  return wrapped;
}
