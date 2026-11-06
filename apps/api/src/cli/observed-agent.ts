import { Agent } from "@anvia/core";

import {
  createCompletionModel,
  createTools,
  langfuseObservability,
  MEDIUM_REASONING,
  modelConfigFromEnv,
  ROUTE_AGENT_INSTRUCTIONS,
  setUsageSink,
  type NetworkCache,
  type TransitAgentContext,
} from "@daily-route/agent";
import { createUsageSink, type Database } from "@daily-route/db";
import type { Env } from "@daily-route/env";

/**
 * The trial and eval agent.
 *
 * It is the production instructions and model with one extra layer: every
 * tool call and result is recorded for the test report. The agent also
 * carries the Langfuse observer, so the same run produces the trace the
 * production agent would produce. The X stream is not touched.
 */

export type ToolObservation = {
  tool: string;
  args: unknown;
  result: unknown;
};

export type ObservedAgent = {
  agent: Agent;
  /** The calls of the current case. Callers clear it before each case. */
  observations: ToolObservation[];
};

export function createObservedAgent(options: {
  env: Env;
  db: Database;
  context: TransitAgentContext;
  cache: NetworkCache;
}): ObservedAgent {
  const { env, db, context, cache } = options;
  setUsageSink(createUsageSink(db));

  const tools = createTools(context, cache, { enabled: false }, null);
  const observations: ToolObservation[] = [];
  const observed = tools.map((tool) =>
    new Proxy(tool, {
      get(target, property, receiver) {
        if (property !== "call") return Reflect.get(target, property, receiver);
        return async (args: unknown) => {
          const call = target as unknown as {
            call: (input: unknown) => Promise<unknown>;
          };
          const result = await call.call(args);
          observations.push({ tool: target.name, args, result });
          return result;
        };
      },
    }),
  );

  const observability = langfuseObservability(env);
  const model = createCompletionModel(modelConfigFromEnv(env), "chat");
  const agent = new Agent({
    id: "daily-route-current-place-test",
    name: "Asisten Rute Daily Route",
    description: "The current-place trial and evaluation agent.",
    model,
    instructions: ROUTE_AGENT_INSTRUCTIONS,
    maxTokens: 16384,
    tools: observed,
    maxTurns: 8,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });

  return { agent, observations };
}
