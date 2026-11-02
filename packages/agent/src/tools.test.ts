import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver, RoadLookup } from "@daily-route/semantic";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NetworkCache, type TransitAgentContext } from "./context.js";
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

    expect(result.rute.length).toBeGreaterThan(0);
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
