import { Router } from "express";

import type { ApiDeps } from "../deps.js";

/**
 * The JPO registry the map and the interface read.
 *
 * It is a committed build, not a live layer: the official points and the
 * OpenStreetMap lines are merged by `pnpm data:jpo`, and every response can
 * be traced back to that file.
 */
export function createJpoRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/", (request, response) => {
    if (!deps.jpos) {
      response.status(503).json({
        error: "The JPO registry is not built. Run pnpm data:jpo.",
        jpos: [],
      });
      return;
    }

    const stationId =
      typeof request.query["stationId"] === "string" ? request.query["stationId"] : null;
    if (!stationId) {
      response.setHeader("Cache-Control", "public, max-age=3600");
      response.json(deps.jpos);
      return;
    }

    response.setHeader("Cache-Control", "public, max-age=3600");
    response.json({
      ...deps.jpos,
      jpos: deps.jpos.jpos.filter((jpo) =>
        jpo.stations.some((station) => station.stationId === stationId),
      ),
    });
  });

  return router;
}
