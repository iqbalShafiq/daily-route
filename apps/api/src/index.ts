import { createRouteAgent } from "@daily-route/agent";
import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";

import { createApp } from "./app.js";
import type { ApiDeps } from "./deps.js";

/**
 * The API entry point.
 *
 * Everything it needs comes from the single root `.env`, which `dotenv-cli`
 * loads before this process starts.
 */
async function main(): Promise<void> {
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);

  const provider = createEmbeddingProvider(env);
  const resolver = new PlaceResolver(db, provider);

  const bundle = createRouteAgent({ env, db });

  // Without a provider key the agent is not constructed at all, so the API
  // reports it as unavailable instead of failing on the first question.
  const agent = bundle.agent;

  const deps: ApiDeps = {
    db,
    env,
    cache: bundle.cache,
    resolver,
    agent,
    lastProviderError: null,
  };

  const app = createApp(deps);

  const server = app.listen(env.API_PORT, () => {
    console.log(`· API berjalan di http://localhost:${env.API_PORT}`);
    console.log(
      agent
        ? `· model: ${env.AGENT_MODEL} (${env.AGENT_BASE_URL})`
        : "· AGENT_API_KEY belum diisi; asisten rute tidak aktif",
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`· ${signal} diterima, menutup server`);
    server.close(() => {
      void db.$client.end({ timeout: 5 }).then(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("gagal menjalankan API:", error);
  process.exitCode = 1;
});
