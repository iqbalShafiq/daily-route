import { Router } from "express";

import type { ApiDeps } from "../deps.js";

/**
 * Forwards the worker's activity stream.
 *
 * The browser never talks to the worker. This route copies the worker's
 * server-sent events, including the steps where a post or a news item is
 * being read by the model.
 */
export function createMonitorRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/activity", async (request, response) => {
    const url = `http://127.0.0.1:${deps.env.WORKER_PORT}/activity`;
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers: { Accept: "text/event-stream" },
      });
    } catch {
      response.status(503).json({ error: "The monitor is not running" });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      response.status(503).json({ error: "The monitor is not running" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const reader = upstream.body.getReader();
    const abort = (): void => {
      void reader.cancel().catch(() => undefined);
    };
    request.on("close", abort);

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(value);
      }
    } catch {
      // The browser closed the stream.
    } finally {
      request.off("close", abort);
      response.end();
    }
  });

  return router;
}
