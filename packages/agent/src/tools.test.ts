import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
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
const tools = createTools(context, cache, { enabled: false });

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

describe("cari_tempat", () => {
  it("returns candidates for a place", async () => {
    const placeTool = tool<
      { text: string; limit?: number },
      { candidates: { name: string; stationId: string; score: number }[] }
    >("cari_tempat");

    const result = await placeTool({ text: "Bundaran HI", limit: 5 });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.stationId).toContain(":");
    expect(result.candidates[0]?.score).toBeGreaterThan(0);
  });
});

describe("rencana_rute", () => {
  it("plans a journey and reports the legs", async () => {
    const routeTool = tool<
      { asal: string; tujuan: string },
      {
        rute: { legs: { dari: string; ke: string }[]; durasiMenit: number }[];
        catatan: string[];
      }
    >("rencana_rute");

    const result = await routeTool({ asal: "Bundaran HI", tujuan: "Kelapa Gading" });

    expect(result.rute.length).toBeGreaterThan(0);
    const first = result.rute[0];
    expect(first?.legs.length).toBeGreaterThan(0);
    expect(first?.durasiMenit).toBeGreaterThan(0);
  });

  it("asks for a more specific name when a place is not found", async () => {
    const routeTool = tool<
      { asal: string; tujuan: string },
      { rute: unknown[]; catatan: string[] }
    >("rencana_rute");

    const result = await routeTool({ asal: "xyzzyplugh", tujuan: "Senen" });

    expect(result.rute).toEqual([]);
    expect(result.catatan.join(" ")).toMatch(/spesifik/);
  });
});

describe("detail_stasiun", () => {
  it("reports the lines that serve a station", async () => {
    const stationTool = tool<
      { stationId: string },
      { ditemukan: boolean; lines: { code: string; name: string }[] }
    >("detail_stasiun");

    const { network } = await cache.get();
    const station = network.stations.find((candidate) => candidate.isInterchange);
    expect(station).toBeDefined();

    const result = await stationTool({ stationId: station?.id ?? "" });

    expect(result.ditemukan).toBe(true);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it("reports an unknown station as not found", async () => {
    const stationTool = tool<{ stationId: string }, { ditemukan: boolean }>("detail_stasiun");

    expect((await stationTool({ stationId: "tidak-ada" })).ditemukan).toBe(false);
  });
});

describe("cek_gangguan", () => {
  it("answers with the list of active disruptions", async () => {
    const disruptionTool = tool<{ lineIds?: string[] }, { total: number }>("cek_gangguan");

    const result = await disruptionTool({});
    expect(typeof result.total).toBe("number");
  });
});

describe("cari_berita", () => {
  it("says the news source is unavailable when it is not configured", async () => {
    const newsTool = tool<
      { query: string },
      { tersedia: boolean; pesan: string }
    >("cari_berita");

    const result = await newsTool({ query: "gangguan Transjakarta" });
    expect(result.tersedia).toBe(false);
    expect(result.pesan.length).toBeGreaterThan(0);
  });
});
