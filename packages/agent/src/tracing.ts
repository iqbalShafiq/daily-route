import { LangfuseClient } from "@anvia/langfuse";
import type { AgentObservabilityOptions } from "@anvia/core/observability";

import type { Env } from "@daily-route/env";

/**
 * Langfuse tracing for the routing assistant and the disruption classifier.
 *
 * One client per process. Missing credentials leave tracing off and the
 * agents still run; a half-configured client is not constructed.
 */

let client: LangfuseClient | null = null;
let decided = false;

export function langfuseClient(env: Env): LangfuseClient | null {
  if (!decided) {
    decided = true;
    const baseUrl = env.LANGFUSE_BASE_URL ?? env.LANGFUSE_HOST;
    if (env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && baseUrl) {
      client = new LangfuseClient({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl,
        serviceName: "daily-route",
        environment: env.NODE_ENV,
      });
    }
  }
  return client;
}

/**
 * Langfuse 5 only exports spans from its own tracer name.
 *
 * `@anvia/langfuse` records on `@anvia/langfuse`, so the default filter
 * drops every span before it leaves the process. Keep that tracer as well.
 */
export function allowAnviaTraceSpans(tracing: LangfuseClient): void {
  const holder = tracing as unknown as {
    resource?: {
      processor?: {
        anviaFilter?: boolean;
        shouldExportSpan?: (args: {
          otelSpan: { instrumentationScope?: { name?: string } };
        }) => boolean;
      };
    };
  };
  const processor = holder.resource?.processor;
  if (!processor?.shouldExportSpan || processor.anviaFilter) return;
  const current = processor.shouldExportSpan.bind(processor);
  processor.shouldExportSpan = (args) =>
    current(args) || args.otelSpan.instrumentationScope?.name === "@anvia/langfuse";
  processor.anviaFilter = true;
}

/** Observer options for an agent, or nothing when Langfuse is not configured. */
export function langfuseObservability(env: Env): AgentObservabilityOptions | undefined {
  const tracing = langfuseClient(env);
  if (!tracing) return undefined;
  const observer = tracing.observer({
    captureMode: "full",
    redactInputs: true,
    redactOutputs: true,
  });
  const startRun = observer.startRun.bind(observer);
  observer.startRun = async (args) => {
    const run = await startRun(args);
    allowAnviaTraceSpans(tracing);
    return run;
  };
  return {
    observers: { langfuse: observer },
    primaryTrace: "langfuse",
  };
}

export async function flushTracing(): Promise<void> {
  if (client) allowAnviaTraceSpans(client);
  await client?.flush();
}
