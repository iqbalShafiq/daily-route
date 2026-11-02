import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { NetworkCache } from "@daily-route/agent";
import { createDb, deleteTemporaryService, saveTemporaryService } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import type { TemporaryService } from "@daily-route/transit";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";

import { createApp } from "./app.js";
import type { ApiDeps } from "./deps.js";

/**
 * The HTTP planner sees an announced temporary service through the same
 * network cache as every other line. This is the read side of the overlay,
 * after the writer test has covered the write and validation side.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });
const app = createApp({ db, env, cache, resolver, agent: null, lastProviderError: null } satisfies ApiDeps);

const service: TemporaryService = {
  id: "temporary-tst9-2027-10-31",
  eventKey: "temporary-tst9-2027-10-31",
  code: "TST9",
  name: "Grogol Reformasi - Roxy",
  systemId: "transjakarta",
  mode: "bus",
  serviceClass: "brt",
  operator: "Transjakarta",
  color: null,
  directions: [
    {
      direction: "forward",
      headsign: "Roxy",
      stationIds: [
        "transjakarta:grogol-reformasi",
        "transjakarta:roxy",
        "transjakarta:grogol",
        "transjakarta:tanjung-duren",
        "transjakarta:grogol-reformasi",
      ],
      windows: [{ days: [1, 2, 3, 4, 5, 6, 7], startMinute: 300, endMinute: 1320, headwayMinutes: 10 }],
    },
  ],
  startsAt: "2027-10-31T05:00:00+07:00",
  endsAt: null,
  reviewAt: "2027-11-14T05:00:00+07:00",
  status: "active",
  source: {
    postId: "1999999999999999999",
    url: "https://x.com/PT_Transjakarta/status/1999999999999999999",
    authorHandle: "PT_Transjakarta",
    publishedAt: "2026-10-29T09:00:00+07:00",
    quote: "Transjakarta mengoperasikan rute shuttle TST9.",
    images: [],
  },
  confidence: 0.9,
  metadata: { test: true },
};

afterAll(async () => {
  await deleteTemporaryService(db, service.id);
  cache.invalidate();
  await db.$client.end({ timeout: 5 });
});

describe("GET /api/routes/plan with a temporary service", () => {
  it("uses the announced line and marks the leg temporary", async () => {
    await saveTemporaryService(db, service);
    cache.invalidate();

    const response = await request(app).get(
      "/api/routes/plan?origin=Grogol%20Reformasi&destination=Roxy&at=2027-10-31T06%3A00%3A00%2B07%3A00",
    );
    expect(response.status).toBe(200);
    const legs = response.body.itineraries.flatMap(
      (itinerary: { legs: { lineCode: string | null; temporary?: boolean }[] }) => itinerary.legs,
    );
    expect(legs.some((leg: { lineCode: string | null }) => leg.lineCode === "TST9")).toBe(true);
    expect(legs.some((leg: { temporary?: boolean }) => leg.temporary === true)).toBe(true);
  });
});
