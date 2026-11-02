import express, { type Express } from "express";

import type { ApiDeps } from "./deps.js";
import { createAccountRouter } from "./routes/account.js";
import { createAgentRouter } from "./routes/agent.js";
import { createMonitorRouter } from "./routes/monitor.js";
import { createPlacesRouter } from "./routes/places.js";
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
    // The browser sends the session cookie, so the allowed origin is exact
    // and credentials are enabled; a wildcard origin cannot carry a cookie.
    response.setHeader("Access-Control-Allow-Origin", deps.env.WEB_ORIGIN);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.setHeader("Vary", "Origin");
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
      tracing: Boolean(
        deps.env.LANGFUSE_PUBLIC_KEY &&
          deps.env.LANGFUSE_SECRET_KEY &&
          (deps.env.LANGFUSE_BASE_URL ?? deps.env.LANGFUSE_HOST),
      ),
      lastProviderError: deps.lastProviderError,
    });
  });

  app.use("/api", createTransitRouter(deps));
  app.use("/api/account", createAccountRouter(deps));
  app.use("/api/places", createPlacesRouter(deps));
  app.use("/api/routes", createRoutesRouter(deps));
  app.use("/api/walk", createWalkRouter(deps));
  app.use("/api/agent", createAgentRouter(deps));
  app.use("/api/monitor", createMonitorRouter(deps));

  app.use((_request, response) => {
    response.status(404).json({ error: "Endpoint not found" });
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("api error:", message);
    response.status(500).json({ error: "Internal error", detail: message });
  });

  return app;
}
