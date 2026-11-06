import { createDb, deleteUser, insertUser, upsertRiderPlace } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver, RoadLookup } from "@daily-route/semantic";
import type { Jpo } from "@daily-route/transit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NetworkCache, type TransitAgentContext } from "./context.js";
import { currentPlaceStore, riderStore } from "./rider-context.js";
import { createTools } from "./tools.js";

/**
 * The agent's tools, against the real database.
 *
 * These are the tools the model calls, so their answers are the answers the
 * rider gets. They are tested through the same call the agent makes.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const context: TransitAgentContext = { db, resolver };
const cache = new NetworkCache(context);
const tools = createTools(context, cache, { enabled: false }, new RoadLookup());

/**
 * A tool, typed by the shape of its result.
 *
 * Anvia's `Tool` exposes `call(args)`, which is what the agent itself
 * uses, so the test calls the tool exactly as the model would.
 */
const tool = <Input, Output>(name: string) => {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Tool ${name} is missing`);
  const typed = found as unknown as { call: (args: Input) => Promise<Output> };
  return (args: Input) => typed.call(args);
};

beforeAll(async () => {
  const { count } = await db.execute<{ count: number }>(
    "SELECT count(*)::int AS count FROM stations",
  );
  if (!count || count === 0) {
    throw new Error("The database is empty. Run `pnpm db:seed` before the tests.");
  }
});

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

describe("resolve_place", () => {
  it("returns candidates for a place", async () => {
    const placeTool = tool<
      { query: string; limit?: number },
      { candidates: { name: string; stationId: string; score: number }[] }
    >("resolve_place");

    const result = await placeTool({ query: "Bundaran HI", limit: 5 });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.stationId).toContain(":");
    expect(result.candidates[0]?.score).toBeGreaterThan(0);
  });
});

describe("plan_journey", () => {
  it("plans a journey and reports the legs", async () => {
    const routeTool = tool<
      { origin: string; destination: string },
      {
        rute: { legs: { dari: string; ke: string }[]; durasiMenit: number }[];
        catatan: string[];
      }
    >("plan_journey");

    const result = await routeTool({ origin: "Bundaran HI", destination: "Kelapa Gading" });

    expect(result.rute).toHaveLength(1);
    const first = result.rute[0];
    expect(first?.legs.length).toBeGreaterThan(0);
    expect(first?.durasiMenit).toBeGreaterThan(0);
  });

  it("asks for a more specific name when a place is not found", async () => {
    const routeTool = tool<
      { origin: string; destination: string },
      { rute: unknown[]; catatan: string[] }
    >("plan_journey");

    const result = await routeTool({ origin: "xyzzyplugh", destination: "Senen" });

    expect(result.rute).toEqual([]);
    expect(result.catatan.join(" ")).toMatch(/spesifik/);
  });

  it("starts from the rider's marked current place", async () => {
    const { network } = await cache.get();
    const station =
      network.stations.find((candidate) => candidate.name === "Bundaran HI") ??
      network.stations.find((candidate) => candidate.isInterchange);
    expect(station).toBeDefined();
    if (!station) return;

    const routeTool = tool<
      { originCurrent: true; destination: string },
      {
        rute: unknown[];
        catatan: string[];
        asal: { dari?: string | null; jalanKaki?: { menit: number; km: number } | null };
      }
    >("plan_journey");

    const result = await currentPlaceStore.run(
      {
        name: "Bundaran HI",
        address: "Jalan M.H. Thamrin, Jakarta Pusat",
        latitude: station.latitude + 0.002,
        longitude: station.longitude,
      },
      () => routeTool({ originCurrent: true, destination: "Kelapa Gading" }),
    );

    expect(result.rute.length).toBeGreaterThan(0);
    expect(result.asal.dari).toBe("Bundaran HI");
    expect(result.asal.jalanKaki).not.toBeNull();
    expect(result.catatan.join(" ")).toMatch(/jalan kaki/i);
  });

  it("starts from a saved place the rider named", async () => {
    const { network } = await cache.get();
    const station =
      network.stations.find((candidate) => candidate.name === "Bundaran HI") ??
      network.stations.find((candidate) => candidate.isInterchange);
    expect(station).toBeDefined();
    if (!station) return;

    const created = await insertUser(db, {
      email: `fixture_agent_${Date.now()}@example.test`,
      passwordHash: "test-hash",
    });
    if (!created.ok) throw new Error("The fixture user could not be created.");

    try {
      const saved = await upsertRiderPlace(db, created.user.id, {
        label: "Home",
        payload: {
          kind: "place",
          id: `fixture_agent_place_${Date.now()}`,
          name: "Bundaran HI",
          address: "Jalan M.H. Thamrin, Jakarta Pusat",
          latitude: station.latitude,
          longitude: station.longitude,
          systemId: null,
          systemName: null,
        },
      });
      expect(saved.ok).toBe(true);

      const routeTool = tool<
        { origin: string; destination: string },
        { rute: unknown[]; catatan: string[] }
      >("plan_journey");

      const result = await riderStore.run({ userId: created.user.id }, () =>
        routeTool({ origin: "Home", destination: "Kelapa Gading" }),
      );

      expect(result.rute.length).toBeGreaterThan(0);
      expect(result.catatan.join(" ")).toMatch(/Mulai dari Home/);
    } finally {
      await deleteUser(db, created.user.id);
    }
  });

  it("says the current place is missing instead of guessing it", async () => {
    const routeTool = tool<
      { originCurrent: true; destination: string },
      { rute: unknown[]; catatan: string[] }
    >("plan_journey");

    const result = await routeTool({ originCurrent: true, destination: "Senen" });

    expect(result.rute).toEqual([]);
    expect(result.catatan.join(" ")).toMatch(/belum ditandai/i);
  });
});

describe("get_station", () => {
  it("reports the lines that serve a station", async () => {
    const stationTool = tool<
      { stationId: string },
      { ditemukan: boolean; lines: { code: string; name: string }[] }
    >("get_station");

    const { network } = await cache.get();
    const station = network.stations.find((candidate) => candidate.isInterchange);
    expect(station).toBeDefined();

    const result = await stationTool({ stationId: station?.id ?? "" });

    expect(result.ditemukan).toBe(true);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it("reports an unknown station as not found", async () => {
    const stationTool = tool<{ stationId: string }, { ditemukan: boolean }>("get_station");

    expect((await stationTool({ stationId: "tidak-ada" })).ditemukan).toBe(false);
  });
});

describe("list_active_disruptions", () => {
  it("answers with the list of active disruptions", async () => {
    const disruptionTool = tool<{ lineIds?: string[] }, { total: number }>("list_active_disruptions");

    const result = await disruptionTool({});
    expect(typeof result.total).toBe("number");
  });
});

describe("search_news", () => {
  it("is not offered when the news source is not configured", () => {
    expect(tools.map((candidate) => candidate.name)).not.toContain("search_news");
  });
});

describe("find_line and list_line_stops", () => {
  it("resolves a corridor code and lists its stops", async () => {
    const findLine = tool<
      { codeOrName: string },
      { lines: { lineId: string; code: string }[] }
    >("find_line");
    const found = await findLine({ codeOrName: "1" });
    expect(found.lines[0]?.code).toBe("1");

    const listStops = tool<
      { lineId: string },
      {
        found: boolean;
        directions: {
          direction: string;
          label: string;
          stops: { stationId: string; name: string }[];
        }[];
      }
    >("list_line_stops");
    const first = found.lines[0];
    expect(first).toBeTruthy();
    const stops = await listStops({ lineId: first?.lineId ?? "" });
    expect(stops.found).toBe(true);
    expect(stops.directions.length).toBeGreaterThan(0);
    expect(stops.directions[0]?.stops.length).toBeGreaterThan(2);
    expect(stops.directions[0]?.label).toContain("→");
  });

  it("reports that a scheduled one-way line has finished its window", async () => {
    const findLine = tool<
      { codeOrName: string; at?: string },
      {
        lines: {
          code: string;
          directions: { direction: string; service: { active: boolean; detail: string | null } | null }[];
        }[];
      }
    >("find_line");

    const afternoon = await findLine({ codeOrName: "7R", at: "2026-10-27T15:18:00+07:00" });
    const afternoonDirection = afternoon.lines[0]?.directions[0];
    expect(afternoonDirection?.service?.active).toBe(false);
    expect(afternoonDirection?.service?.detail).toContain("05:00");

    const morning = await findLine({ codeOrName: "7R", at: "2026-10-27T05:30:00+07:00" });
    expect(morning.lines[0]?.directions[0]?.service?.active).toBe(true);
  });
});

describe("find_jpo", () => {
  it("returns the official bridge at a coordinate", async () => {
    const jpo: Jpo = {
      id: "jpo:test",
      name: "JPO Test",
      kind: "jpo",
      source: "jakarta-bina-marga",
      official: true,
      city: "Jakarta Barat",
      address: "Jl. Test",
      remark: "BUSWAY TEST",
      lengthM: 100,
      geometry: [
        { latitude: -6.2, longitude: 106.8 },
        { latitude: -6.2, longitude: 106.801 },
      ],
      startsAt: { latitude: -6.2, longitude: 106.8 },
      endsAt: { latitude: -6.2, longitude: 106.801 },
      officialPoint: { latitude: -6.2, longitude: 106.8 },
      stations: [
        {
          stationId: "transjakarta:grogol-reformasi",
          stationName: "Grogol Reformasi",
          distanceM: 20,
          end: "end",
        },
      ],
      confidence: "official-line",
      updatedAt: null,
    };
    const jpoTools = createTools(
      { db, resolver, jpos: [jpo] },
      cache,
      { enabled: false },
      new RoadLookup(),
    );
    const found = jpoTools.find((candidate) => candidate.name === "find_jpo");
    if (!found) throw new Error("find_jpo is missing");
    const call = found as unknown as {
      call: (args: { latitude: number; longitude: number }) => Promise<{
        jpos: { name: string; official: boolean; stations: string[] }[];
      }>;
    };

    const result = await call.call({ latitude: -6.2, longitude: 106.8001 });
    expect(result.jpos[0]).toMatchObject({
      name: "JPO Test",
      official: true,
      stations: ["Grogol Reformasi"],
    });
  });
});


describe("list_notice_history", () => {
  it("reads closed notices as well as active ones", async () => {
    const history = tool<
      { query: string; status: "active" | "resolved" | "all"; limit: number },
      { total: number; notices: { status: string; resolvedAt: string | null }[] }
    >("list_notice_history");
    const result = await history({ query: "Jakarta Running Festival", status: "all", limit: 10 });
    expect(result.total).toBeGreaterThan(0);
    expect(result.notices.some((notice) => notice.status === "resolved")).toBe(true);
  });
});
