import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { NetworkCache } from "@daily-route/agent";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createAttemptLimiter } from "./attempts.js";
import type { ApiDeps } from "./deps.js";
import { loadJpoDocument } from "./jpo-store.js";

/**
 * The line detail endpoint against the real graph.
 *
 * The stop list is the one the planner uses: the test verifies the API reads
 * `lineStops` in position order rather than any hand-written sample.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);

const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });

const deps: ApiDeps = {
  db,
  env,
  cache,
  resolver,
  agent: null,
  lastProviderError: null,
  attempts: createAttemptLimiter(100, 15 * 60_000),
  jpos: loadJpoDocument(),
};

const app = createApp(deps);

let lineId = "";

beforeAll(async () => {
  const { network } = await cache.get();
  const line = network.lines.find((candidate) => candidate.code === "1");
  if (!line) throw new Error("The seeded network has no Corridor 1");
  lineId = line.id;
});

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

describe("GET /api/lines/:id", () => {
  it("returns the real ordered stops of each direction", async () => {
    const response = await request(app).get(`/api/lines/${encodeURIComponent(lineId)}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: lineId,
      code: "1",
      systemId: "transjakarta",
      mode: "bus",
      serviceClass: "brt",
    });

    const forward = response.body.directions.find(
      (direction: { direction: string }) => direction.direction === "forward",
    );
    expect(forward).toBeTruthy();
    expect(forward.stops.length).toBeGreaterThan(5);
    expect(forward.headsign).toBe(forward.stops[forward.stops.length - 1].name);

    // Every stop is a station the graph knows, and the order is the graph's.
    const { network } = await cache.get();
    const expected = network.lineStops
      .filter((entry) => entry.lineId === lineId && entry.direction === "forward")
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.stationId);
    expect(forward.stops.map((stop: { id: string }) => stop.id)).toEqual(expected);

    const first = forward.stops[0];
    expect(typeof first.latitude).toBe("number");
    expect(typeof first.longitude).toBe("number");
  });

  it("answers 404 for an id the graph does not carry", async () => {
    const response = await request(app).get("/api/lines/transjakarta:not-a-line");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Line not found" });
  });
});
