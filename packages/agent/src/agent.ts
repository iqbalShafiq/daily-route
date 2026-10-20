import { Agent } from "@anvia/core";
import { hasAgentProvider, type Env } from "@daily-route/env";
import type { Database } from "@daily-route/db";
import { createEmbeddingProvider } from "@daily-route/semantic";
import { PlaceResolver } from "@daily-route/semantic";

import { NetworkCache, type TransitAgentContext } from "./context.js";
import { ROUTE_AGENT_INSTRUCTIONS } from "./instructions.js";
import { createCompletionModel, modelConfigFromEnv } from "./model.js";
import { createNewsSearch } from "./news.js";
import { createTools } from "./tools.js";

/**
 * The routing assistant.
 *
 * It is constructed once per process and reused: the agent holds no mutable
 * run state of its own, and every dependency it needs is injected.
 */

export type RouteAgentBundle = {
  /** `null` when no model provider is configured. */
  agent: Agent | null;
  cache: NetworkCache;
  context: TransitAgentContext;
  /** The tools the agent may call, by name. */
  toolNames: string[];
};

export type CreateRouteAgentOptions = {
  env: Env;
  db: Database;
};

export function createRouteAgent(options: CreateRouteAgentOptions): RouteAgentBundle {
  const { env, db } = options;

  const provider = createEmbeddingProvider(env);
  const resolver = new PlaceResolver(db, provider);
  const context: TransitAgentContext = { db, resolver };
  const cache = new NetworkCache(context);

  const newsSearch = createNewsSearch(env.TAVILY_API_KEY);
  const tools = createTools(context, cache, {
    enabled: newsSearch !== null,
    search: newsSearch ?? undefined,
  });

  // The provider client refuses to exist without a key, so the agent is
  // only constructed when one is configured. Everything else — the tools,
  // the resolver, the network cache — works either way.
  if (!hasAgentProvider(env)) {
    return { agent: null, cache, context, toolNames: tools.map((tool) => tool.name) };
  }

  const model = createCompletionModel(modelConfigFromEnv(env));

  const agent = new Agent({
    id: "daily-route-assistant",
    name: "Asisten Rute Daily Route",
    description:
      "Menjawab pertanyaan rute perjalanan di Jabodetabek dan memberi tahu pengalihan atau penutupan jalur.",
    model,
    instructions: ROUTE_AGENT_INSTRUCTIONS,
    tools,
    maxTurns: 12,
    temperature: 0.2,
  });

  return { agent, cache, context, toolNames: tools.map((tool) => tool.name) };
}
