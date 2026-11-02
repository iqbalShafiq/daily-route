import {
  buildStreamRules,
  superviseStream,
  createAnnouncementScreen,
  createClassifierAgent,
  createXClient,
  createXStream,
  createNewsSearch,
  createQueryPlanner,
  createResearchReader,
  researchNotice,
  setUsageSink,
  DisruptionClassifier,
  DisruptionMonitor,
  modelConfigFromEnv,
  NetworkCache,
  NoticeGrounder,
  OPERATOR_HANDLES,
  recoverMissedPosts,
  ActivityLog,
  flushTracing,
  createTemporaryServiceAgent,
  TemporaryServiceAgent,
  TemporaryServiceWriter,
  NoticeReviewAgent,
} from "@daily-route/agent";
import {
  createDb,
  createUsageSink,
  monitorQueueStats,
  newestSocialPost,
} from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver, RoadLookup } from "@daily-route/semantic";
import express from "express";

/**
 * The background worker.
 *
 * It holds one filtered stream to X and turns each Post the operators
 * publish into a disruption record. There is no timeline poll. On each
 * connection it runs one bounded recent-search catch-up: original Posts,
 * after the last stored Post or Reply, at most eight hours back. The stream
 * remains the live source.
 *
 * Classification is a durable Postgres queue, so a burst of Posts is read
 * after the stream has already moved on.
 */

const STREAM_HANDLES = (
  Object.entries(OPERATOR_HANDLES) as [string, string][]
).map(([systemId, handle]) => ({ systemId, handle }));

type StreamState = {
  connected: boolean;
  connectedSince: string | null;
  lastPostAt: string | null;
  reconnects: number;
  lastError: string | null;
  catchUp: { at: string; recovered: number; capped: number; errors: number } | null;
};

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);
  const usageSink = createUsageSink(db);
  setUsageSink(usageSink);

  const provider = createEmbeddingProvider(env);
  const resolver = new PlaceResolver(db, provider);
  const cache = new NetworkCache({ db, resolver });

  const screen = createAnnouncementScreen(env);
  console.log(screen ? `· jev: ${env.JEV_MODEL}` : "· jev: tidak dikonfigurasi, model percakapan yang menilai");
  const grounder = new NoticeGrounder({
    config: modelConfigFromEnv(env),
    env,
    resolver,
    cache,
    roads: new RoadLookup(),
  });
  const classifier = new DisruptionClassifier(
    createClassifierAgent(modelConfigFromEnv(env), env),
    resolver,
    cache,
    screen,
    grounder,
  );
  const temporaryServices = new TemporaryServiceAgent({
    agent: createTemporaryServiceAgent(modelConfigFromEnv(env), env),
    writer: new TemporaryServiceWriter({ db, resolver }),
    cache,
    modelId: env.AGENT_MODEL,
  });

  const stream = env.X_BEARER_TOKEN
    ? createXStream({
        bearerToken: env.X_BEARER_TOKEN,
        baseUrl: env.X_API_BASE_URL,
        rules: buildStreamRules(STREAM_HANDLES),
        usage: { operation: "monitor", sink: usageSink },
      })
    : null;
  const xClient = env.X_BEARER_TOKEN
    ? createXClient({
        bearerToken: env.X_BEARER_TOKEN,
        baseUrl: env.X_API_BASE_URL,
        usage: { operation: "monitor", sink: usageSink },
      })
    : null;

  const activity = new ActivityLog();
  activity.push({
    phase: "idle",
    source: "monitor",
    message: stream ? "Waiting for the stream." : "The X stream is not configured.",
  });

  const news = createNewsSearch(env.TAVILY_API_KEY);
  const noticeReview = news
    ? new NoticeReviewAgent({ config: modelConfigFromEnv(env), env, news })
    : null;
  const researchPlanner = news ? createQueryPlanner(modelConfigFromEnv(env), env, "research") : null;
  const researchReader = news ? createResearchReader(modelConfigFromEnv(env), env) : null;
  console.log(news ? "· riset jadwal: Tavily" : "· riset jadwal: Tavily tidak dikonfigurasi");
  const monitor = new DisruptionMonitor({
    db,
    cache,
    classify: (input) => classifier.classify(input),
    temporaryService: (input) => temporaryServices.process(input),
    ...(noticeReview ? { reviewNotice: (input) => noticeReview.review(input) } : {}),
    ...(news && researchPlanner && researchReader
      ? {
          research: (input) =>
            researchNotice(input, {
              search: news,
              planner: researchPlanner,
              reader: researchReader,
            }),
        }
      : {}),
    activity,
    classificationBudgetMs: env.CLASSIFY_BUDGET_MS,
    leaseMs: env.CLASSIFY_LEASE_MS,
    concurrency: env.CLASSIFY_CONCURRENCY,
    sweepLimit: env.NOTICE_SWEEP_LIMIT,
  });

  const streamState: StreamState = {
    connected: false,
    connectedSince: null,
    lastPostAt: null,
    reconnects: 0,
    lastError: null,
    catchUp: null,
  };
  let recovering = false;

  const controller = new AbortController();

  /**
   * Keep the one connection open.
   *
   * The same stream is opened again after a drop; a Post published while the
   * connection was down is not fetched later. That is the cost of having no
   * polling, and it is recorded by `reconnects` and `lastError` on /health.
   */
  const runStream = async (): Promise<void> => {
    if (!stream) return;
    await superviseStream(
      stream,
      {
        onReady: () => {
          streamState.connected = true;
          streamState.connectedSince = new Date().toISOString();
          /*
           * Reconcile only the last eight hours, and only original Posts.
           * The stream is live; a long outage is not a reason to buy a week
           * of replies. The last stored Post or Reply is the since_id.
           */
          if (!recovering && xClient) {
            recovering = true;
            void recoverMissedPosts({
              accounts: STREAM_HANDLES,
              baseline: (handle) => newestSocialPost(db, handle),
              search: (handle, options) =>
                xClient.searchPosts(`from:${handle} -is:retweet -is:reply`, {
                  ...options,
                  maxPages: 1,
                  includeAuthors: false,
                  authorHandle: handle,
                }),
              ingest: (post) => monitor.ingest(post),
            })
              .then((result) => {
                streamState.catchUp = {
                  at: new Date().toISOString(),
                  recovered: result.recovered,
                  capped: result.capped,
                  errors: result.errors.length,
                };
                if (result.recovered > 0) {
                  streamState.lastPostAt = new Date().toISOString();
                  console.log(
                    `· catch-up: ${result.recovered} post${result.capped > 0 ? ` (${result.capped} capped at 8h)` : ""}`,
                  );
                }
                for (const error of result.errors) console.warn(`  ! ${error}`);
              })
              .catch((error: unknown) => {
                console.warn(
                  "catch-up:",
                  error instanceof Error ? error.message : String(error),
                );
              })
              .finally(() => {
                recovering = false;
              });
          }
        },
        onPost: async (post, meta) => {
          const result = await monitor.ingest({
            ...post,
            systemId: meta.systemId ?? "unknown",
            accountId: post.authorId || null,
          });
          if (result.fresh > 0) streamState.lastPostAt = new Date().toISOString();
        },
        onError: (error) => {
          streamState.lastError =
            error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
          console.warn("stream:", streamState.lastError);
        },
      },
      {
        signal: controller.signal,
        onReconnect: () => {
          streamState.connected = false;
          streamState.connectedSince = null;
          streamState.reconnects += 1;
        },
      },
    );
  };

  const app = express();
  app.get("/activity", (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const writable = (): boolean =>
      !response.writableEnded && !response.destroyed && response.socket !== null;
    const send = (event: unknown): void => {
      if (!writable()) return;
      try {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // The reader went away between the check and the write.
      }
    };
    for (const event of activity.recent()) send(event);
    const unsubscribe = activity.subscribe(send);
    const keepAlive = setInterval(() => {
      if (!writable()) return;
      try {
        response.write(": keep-alive\n\n");
      } catch {
        // The reader went away; `close` clears the interval.
      }
    }, 15_000);
    const close = (): void => {
      clearInterval(keepAlive);
      unsubscribe();
    };
    request.on("close", close);
    request.on("aborted", close);
    response.on("error", close);
  });

  app.get("/health", async (_request, response) => {
    let queue: Awaited<ReturnType<typeof monitorQueueStats>> | null = null;
    try {
      queue = await monitorQueueStats(db);
    } catch {
      queue = null;
    }
    response.json({
      status: "ok",
      x: stream !== null,
      stream: streamState,
      queue,
    });
  });

  const server = app.listen(env.WORKER_PORT, "127.0.0.1", () => {
    console.log(`· worker berjalan di http://localhost:${env.WORKER_PORT}`);
    console.log(
      `· stream: ${stream ? STREAM_HANDLES.map((item) => `@${item.handle}`).join(", ") : "tidak dikonfigurasi"}`,
    );
    // The port is the single-instance lock: only the process that owns it
    // may open the one filtered-stream connection X allows.
    if (env.WORKER_CRON_ENABLED) {
      void runStream();
      const interval = setInterval(() => void tick(), 30_000);
      interval.unref();
      const firstTick = setTimeout(() => void tick(), 10_000);
      firstTick.unref();
      console.log("· antre dibaca setiap 30 detik; stream tanpa polling");
    }
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `· port ${env.WORKER_PORT} sudah dipakai worker lain; proses ini berhenti tanpa membuka stream`
        : `· worker gagal listen: ${error.message}`,
    );
    process.exit(1);
  });

  let ticking = false;
  const tick = async (): Promise<void> => {
    if (ticking) return;
    ticking = true;
    try {
      const result = await monitor.tick();
      if (result.disruptions > 0 || result.updated > 0 || result.resolved > 0) {
        console.log(
          `· antre: ${result.disruptions} baru, ${result.updated} diperbarui, ${result.resolved} selesai, ${result.queued} tersisa`,
        );
      }
      for (const error of result.errors) console.warn(`  ! ${error}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : "";
      console.error("antre gagal:", `${message}${cause}`);
    } finally {
      ticking = false;
    }
  };

  const shutdown = (signal: string): void => {
    console.log(`· ${signal} diterima, menutup worker`);
    controller.abort();
    stream?.close();
    server.close(() => {
      void flushTracing()
        .then(() => db.$client.end({ timeout: 5 }))
        .then(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  /*
   * A crash used to leave the process alive with no listener, which looked
   * like a quiet monitor with a frozen board. Log the cause and exit with a
   * failure so a supervisor can start a clean process.
   */
  process.on("uncaughtException", (error) => {
    console.error("uncaught exception:", error);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection:", reason);
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  console.error("gagal menjalankan worker:", error);
  process.exitCode = 1;
});
