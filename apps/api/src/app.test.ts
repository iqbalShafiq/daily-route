import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import { NetworkCache } from "@daily-route/agent";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import type { ApiDeps } from "./deps.js";

/**
 * Integration tests for the HTTP API.
 *
 * They run against the real database that `pnpm db:seed` fills, so they
 * cover the schema, the queries, the semantic resolver and the routing
 * engine together.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);

const provider = createEmbeddingProvider(env);
const resolver = new PlaceResolver(db, provider);
const cache = new NetworkCache({ db, resolver });

const deps: ApiDeps = {
  db,
  env,
  cache,
  resolver,
  agent: null,
  lastProviderError: null,
};

const app = createApp(deps);

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

describe("GET /api/health", () => {
  it("reports the service as available", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.agent).toBe(false);
  });
});

describe("GET /api/systems", () => {
  it("lists every operator with its line count", async () => {
    const response = await request(app).get("/api/systems");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(5);

    const ids = response.body.map((system: { id: string }) => system.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "transjakarta",
        "mrt-jakarta",
        "lrt-jakarta",
        "lrt-jabodebek",
        "krl-jabodetabek",
      ]),
    );

    for (const system of response.body) {
      expect(system.lineCount).toBeGreaterThan(0);
      expect(system.name.length).toBeGreaterThan(0);
    }
  });
});

describe("GET /api/lines", () => {
  it("returns the lines of one system", async () => {
    const response = await request(app).get("/api/lines?systemId=mrt-jakarta");
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    for (const line of response.body) {
      expect(line.systemId).toBe("mrt-jakarta");
    }
  });

  it("covers every service class of Transjakarta", async () => {
    const response = await request(app).get("/api/lines?systemId=transjakarta");
    expect(response.status).toBe(200);
    const classes = new Set(response.body.map((line: { serviceClass: string }) => line.serviceClass));
    expect(classes).toContain("brt");
    expect(classes).toContain("feeder");
  });
});

describe("GET /api/stations", () => {
  it("resolves a station name with a tolerant matcher", async () => {
    const response = await request(app).get("/api/stations?q=Kelapa%20Gading&limit=5");
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].name.toLowerCase()).toContain("kelapa gading");
  });

  it("finds an interchange hub by a landmark name", async () => {
    const response = await request(app).get("/api/stations?q=Grand%20Indonesia&limit=5");
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it("returns a station with the lines that serve it", async () => {
    const search = await request(app).get("/api/stations?q=Bundaran%20HI&limit=1");
    const stationId = search.body[0]?.id as string | undefined;
    expect(stationId).toBeTruthy();

    const response = await request(app).get(`/api/stations/${encodeURIComponent(stationId!)}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(stationId);
    expect(Array.isArray(response.body.lines)).toBe(true);
  });

  it("answers 404 for an unknown station", async () => {
    const response = await request(app).get("/api/stations/tidak-ada");
    expect(response.status).toBe(404);
  });
});

describe("GET /api/routes/plan", () => {
  it("plans a journey across two modes", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Bundaran%20HI&destination=Kelapa%20Gading",
    );
    expect(response.status).toBe(200);
    expect(response.body.itineraries.length).toBeGreaterThan(0);

    const itinerary = response.body.itineraries[0];
    expect(itinerary.durationMinutes).toBeGreaterThan(0);
    expect(itinerary.legs.length).toBeGreaterThan(0);
    expect(itinerary.geometry.length).toBeGreaterThan(1);

    // The journey starts at the origin and ends at the destination.
    const firstLeg = itinerary.legs[0];
    const lastLeg = itinerary.legs[itinerary.legs.length - 1];
    expect(firstLeg.fromName.toLowerCase()).toContain("bundaran");
    expect(lastLeg.toName.toLowerCase()).toContain("kelapa gading");
  });

  it("returns an alternative when the direct route exists", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Lebak%20Bulus&destination=Senen",
    );
    expect(response.status).toBe(200);
    expect(response.body.itineraries.length).toBeGreaterThan(0);
  });

  it("rejects a missing destination", async () => {
    const response = await request(app).get("/api/routes/plan?origin=Senen");
    expect(response.status).toBe(400);
  });

  it("answers 404 when a place cannot be found", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=xyzzyplugh&destination=Senen",
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/routes/disruptions", () => {
  it("returns the active disruptions", async () => {
    const response = await request(app).get("/api/routes/disruptions");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("unknown endpoints", () => {
  it("answers 404", async () => {
    const response = await request(app).get("/api/tidak-ada");
    expect(response.status).toBe(404);
  });
});

beforeAll(async () => {
  // The cache holds the network snapshot; it is warmed by the first request.
  await cache.get();
});
