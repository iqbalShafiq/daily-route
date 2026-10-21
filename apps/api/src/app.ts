import express, { type Express } from "express";

import type { ApiDeps } from "./deps.js";
import { createAgentRouter } from "./routes/agent.js";
import { createRoutesRouter } from "./routes/routes.js";
import { createWalkRouter } from "./routes/walk.js";
import { createTransitRouter } from "./routes/transit.js";

/**
 * The HTTP application.
 *
 * `createApp` takes its dependencies as an argument, so the same app runs in
 * production, in the integration tests and in the end-to-end tests without
 * a hidden global.
 */
export function createApp(deps: ApiDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.use((_request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", deps.env.WEB_ORIGIN);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    next();
  });

  app.options(/.*/, (_request, response) => {
    response.sendStatus(204);
  });

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      agent: deps.agent !== null,
      model: deps.env.AGENT_MODEL,
      lastProviderError: deps.lastProviderError,
    });
  });

  app.use("/api", createTransitRouter(deps));
  app.use("/api/routes", createRoutesRouter(deps));
  app.use("/api/walk", createWalkRouter(deps));
  app.use("/api/agent", createAgentRouter(deps));

  app.use((_request, response) => {
    response.status(404).json({ error: "Endpoint tidak ditemukan" });
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("api error:", message);
    response.status(500).json({ error: "Kesalahan internal", detail: message });
  });

  return app;
}
