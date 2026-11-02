import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import { NetworkCache } from "@daily-route/agent";
import { DEMO_DISRUPTION_ID } from "@daily-route/transit";
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
    // The kinds of service the operator runs, with the operator's own
    // names.
    expect(classes).toContain("brt");
    expect(classes).toContain("mikrotrans");
    expect(classes).toContain("non-brt");
    expect(classes).toContain("royaltrans");
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

describe("GET /api/stations/:id/departures", () => {
  it("returns scheduled lines and their service window", async () => {
    const response = await request(app).get(
      "/api/stations/transjakarta:grogol-reformasi/departures?at=2026-10-27T09%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    expect(response.body.station.name).toBe("Grogol Reformasi");
    const nine = response.body.lines.find((line: { code: string }) => line.code === "9");
    expect(nine).toBeDefined();
    expect(nine.serviceLabel).toContain("Frequent");
    expect(nine.headwayMinMinutes).toBeGreaterThan(0);
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
      "/api/routes/plan?origin=Lebak%20Bulus&destination=Senen&at=2026-10-29T12%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    expect(response.body.itineraries.length).toBeGreaterThan(0);
  });

  it("does not offer a one-way scheduled route after its last departure", async () => {
    const codesAt = async (at: string): Promise<string[]> => {
      const response = await request(app).get(
        `/api/routes/plan?origin=Simpang%20Kuningan&destination=Grogol%20Reformasi&limit=5&at=${encodeURIComponent(at)}`,
      );
      expect(response.status).toBe(200);
      return response.body.itineraries.flatMap(
        (itinerary: { legs: { kind: string; lineCode: string | null }[] }) =>
          itinerary.legs.filter((leg) => leg.kind === "ride").map((leg) => leg.lineCode),
      );
    };

    expect(await codesAt("2026-10-27T05:30:00+07:00")).toContain("7R");
    expect(await codesAt("2026-10-27T15:18:00+07:00")).not.toContain("7R");
  });

  it("returns the scheduled patterns of a corridor", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Lebak%20Bulus&destination=Pasar%20Baru&limit=3&at=2026-10-25T12%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    const legs = response.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null; variants: unknown[] }[] }) => itinerary.legs,
    );
    const leg = legs.find((candidate: { lineCode: string | null }) => candidate.lineCode === "8");
    expect(leg).toBeDefined();
    expect(leg.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ headsign: "Pasar Baru via Cideng", serviceLabel: "Sunday" }),
      ]),
    );
    const cideng = leg.variants.find(
      (variant: { headsign: string }) => variant.headsign === "Pasar Baru via Cideng",
    );
    expect(cideng.extra).toEqual(expect.arrayContaining(["Grogol", "Roxy"]));
    expect(cideng.skipped).toEqual(expect.arrayContaining(["Tomang Raya"]));
    expect(cideng.situational).toBe(true);
  });

  it("uses the scheduled headway at the requested departure time", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Grogol%20Reformasi&destination=Simpang%20Kuningan&at=2026-10-27T09%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    expect(response.body.quotedAt).toBe("2026-10-27T02:00:00.000Z");
    const leg = response.body.itineraries[0].legs.find(
      (candidate: { kind: string }) => candidate.kind === "ride",
    );
    expect(leg.serviceLabel?.toLowerCase()).toContain("frequent");
    expect(leg.headwayMinMinutes).toBeGreaterThan(0);
  });

  it("offers 8A only on its Sunday service", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Jelambar&destination=Juanda&limit=5&at=2026-10-25T12%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    const legs = response.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null; patternLabel: string | null }[] }) =>
        itinerary.legs,
    );
    const leg = legs.find(
      (candidate: { lineCode: string | null; patternLabel: string | null }) =>
        candidate.lineCode === "8A" && candidate.patternLabel === "Juanda",
    );
    expect(leg).toBeDefined();
  });

  it("uses the 4 branch that serves the requested side of the route", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Pulo%20Gadung&destination=Galunggung&limit=3&at=2026-10-26T12%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    const legs = response.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null; patternLabel: string | null }[] }) =>
        itinerary.legs,
    );
    expect(legs.some((candidate: { lineCode: string | null }) => candidate.lineCode === "4")).toBe(true);
  });

  it("offers 13E only on its weekend service", async () => {
    const sunday = await request(app).get(
      "/api/routes/plan?origin=Puri%20Beta&destination=Flyover%20Kuningan&limit=3&at=2026-10-25T12%3A00%3A00%2B07%3A00",
    );
    expect(sunday.status).toBe(200);
    const sundayLegs = sunday.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null }[] }) => itinerary.legs,
    );
    expect(sundayLegs.some((candidate: { lineCode: string | null }) => candidate.lineCode === "13E")).toBe(true);

    const monday = await request(app).get(
      "/api/routes/plan?origin=Puri%20Beta&destination=Flyover%20Kuningan&limit=3&at=2026-10-26T12%3A00%3A00%2B07%3A00",
    );
    const mondayLegs = monday.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null }[] }) => itinerary.legs,
    );
    expect(mondayLegs.some((candidate: { lineCode: string | null }) => candidate.lineCode === "13E")).toBe(false);
  });

  it("uses the weekend 13E on a national holiday instead of L13E", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Puri%20Beta&destination=Flyover%20Kuningan&limit=3&at=2026-08-17T12%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    const legs = response.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null }[] }) => itinerary.legs,
    );
    expect(legs.some((candidate: { lineCode: string | null }) => candidate.lineCode === "13E")).toBe(true);
    expect(legs.some((candidate: { lineCode: string | null }) => candidate.lineCode === "L13E")).toBe(false);
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
    expect(
      response.body.some((row: { id?: string }) => row.id === DEMO_DISRUPTION_ID),
    ).toBe(false);
  });

  it("plans Grogol to Simpang Kuningan without the labelled Denpasar scenario", async () => {
    const response = await request(app).get(
      "/api/routes/plan?origin=Grogol%20Reformasi&destination=Simpang%20Kuningan",
    );
    expect(response.status).toBe(200);
    expect(response.body.itineraries.length).toBeGreaterThan(0);
    expect(
      response.body.disruptions.some((row: { id?: string }) => row.id === DEMO_DISRUPTION_ID),
    ).toBe(false);
    expect(
      (response.body.watch ?? []).some((row: { id?: string }) => row.id === DEMO_DISRUPTION_ID),
    ).toBe(false);
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
