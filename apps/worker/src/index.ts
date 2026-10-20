import {
  createClassifierAgent,
  DisruptionClassifier,
  DisruptionMonitor,
  expireStaleDisruptions,
  modelConfigFromEnv,
  NetworkCache,
  OPERATOR_HANDLES,
  createNewsSearch,
  createXClient,
  type MonitorHandles,
} from "@daily-route/agent";
import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import express from "express";

/**
 * The background worker.
 *
 * It polls the operators' public channels and the news feed, turns what it
 * finds into disruption records, and expires the ones that went stale. The
 * API reads those records; the worker never talks to the browser.
 */

const HANDLES: MonitorHandles[] = (
  Object.entries(OPERATOR_HANDLES) as [MonitorHandles["systemId"], string][]
).map(([systemId, handle]) => ({ systemId, handle }));

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);

  const provider = createEmbeddingProvider(env);
  const resolver = new PlaceResolver(db, provider);
  const cache = new NetworkCache({ db, resolver });

  const classifier = new DisruptionClassifier(
    createClassifierAgent(modelConfigFromEnv(env)),
    resolver,
    cache,
  );

  const newsSearch = createNewsSearch(env.TAVILY_API_KEY);
  const xClient = env.X_BEARER_TOKEN
    ? createXClient({ bearerToken: env.X_BEARER_TOKEN, baseUrl: env.X_API_BASE_URL })
    : null;

  const monitor = new DisruptionMonitor({
    db,
    cache,
    classify: (input) => classifier.classify(input),
    x: xClient,
    news: newsSearch,
    handles: HANDLES,
  });

  let lastPoll: { at: string; result: unknown } | null = null;
  let running = false;

  const poll = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await monitor.poll();
      const expired = await expireStaleDisruptions(db);
      lastPoll = { at: new Date().toISOString(), result: { ...result, expired } };
      cache.invalidate();
      console.log(
        `· poll ${lastPoll.at}: ${result.fetched} diambil, ${result.fresh} baru, ${result.disruptions} gangguan, ${result.resolved} diselesaikan`,
      );
      for (const error of result.errors) {
        console.warn(`  ! ${error}`);
      }
    } catch (error) {
      console.error("poll gagal:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  const app = express();
  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      x: xClient !== null,
      news: newsSearch !== null,
      lastPoll,
    });
  });

  const server = app.listen(env.WORKER_PORT, () => {
    console.log(`· worker berjalan di http://localhost:${env.WORKER_PORT}`);
    console.log(
      `· X: ${xClient ? Object.values(OPERATOR_HANDLES).join(", ") : "tidak dikonfigurasi"}`,
    );
    console.log(`· berita: ${newsSearch ? "Tavily aktif" : "Tavily tidak dikonfigurasi"}`);
  });

  if (env.WORKER_CRON_ENABLED) {
    const interval = setInterval(() => void poll(), env.X_POLL_INTERVAL_MS);
    interval.unref();
    console.log(`· interval poll ${env.X_POLL_INTERVAL_MS / 1000} detik`);
    void poll();
  }

  const shutdown = (signal: string): void => {
    console.log(`· ${signal} diterima, menutup worker`);
    server.close(() => {
      void db.$client.end({ timeout: 5 }).then(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("gagal menjalankan worker:", error);
  process.exitCode = 1;
});
