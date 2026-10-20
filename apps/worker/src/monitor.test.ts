import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import { DisruptionMonitor, NetworkCache, type ClassifyResult } from "@daily-route/agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The disruption monitor, against the real database.
 *
 * The classifier is replaced by a stub, so the test covers the part that
 * is ours: what is read, what is stored, what is not stored twice, and
 * what closes an open disruption.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });

const post = {
  id: "1900000000000000001",
  text: "Layanan koridor 1 dialihkan sementara di sekitar Halte Bundaran Senayan.",
  createdAt: new Date().toISOString(),
  authorId: "104556071",
  authorHandle: "PT_Transjakarta",
  url: "https://x.com/PT_Transjakarta/status/1900000000000000001",
};

const analysis = {
  isDisruption: true,
  kind: "diversion" as const,
  severity: "severe" as const,
  title: "Koridor 1 dialihkan",
  summary: "Layanan koridor 1 dialihkan sementara.",
  affectedStationNames: ["Bundaran Senayan"],
  affectedLineCodes: ["1"],
  affectedSystemIds: ["transjakarta" as const],
  confidence: 0.9,
  resolvesDisruptionIds: [] as string[],
};

beforeAll(async () => {
  await db.execute("TRUNCATE TABLE social_posts, news_items, disruptions RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

function buildMonitor(
  classify: (input: unknown) => Promise<ClassifyResult>,
  announcement: { id: string; text: string } = post,
) {
  return new DisruptionMonitor({
    db,
    cache,
    classify: classify as never,
    x: {
      searchAccount: async () => [
        {
          ...post,
          id: announcement.id,
          text: announcement.text,
          url: `https://x.com/PT_Transjakarta/status/${announcement.id}`,
        },
      ],
    },
    news: null,
    handles: [{ systemId: "transjakarta", handle: "PT_Transjakarta" }],
  });
}

describe("DisruptionMonitor", () => {
  it("stores a new announcement and the disruption it describes", async () => {
    const monitor = buildMonitor(async () => ({
      analysis,
      stationIds: [],
      lineIds: [],
      resolvesDisruptionIds: [],
    }));

    const result = await monitor.poll();

    expect(result.fetched).toBe(1);
    expect(result.fresh).toBe(1);
    expect(result.disruptions).toBe(1);
    expect(result.errors).toEqual([]);

    const stored = await db.execute<{ count: number }>(
      `SELECT count(*)::int AS count FROM social_posts WHERE external_id = '${post.id}'`,
    );
    expect(stored[0]?.count).toBe(1);

    const disruptions = await db.execute<{ title: string; severity: string }>(
      "SELECT title, severity FROM disruptions WHERE source = 'x:PT_Transjakarta'",
    );
    expect(disruptions.length).toBe(1);
    expect(disruptions[0]?.title).toBe("Koridor 1 dialihkan");
    expect(disruptions[0]?.severity).toBe("severe");
  });

  it("does not store the same announcement twice", async () => {
    const monitor = buildMonitor(async () => ({
      analysis,
      stationIds: [],
      lineIds: [],
      resolvesDisruptionIds: [],
    }));

    const result = await monitor.poll();

    expect(result.fetched).toBe(1);
    expect(result.fresh).toBe(0);
    expect(result.disruptions).toBe(0);
  });

  it("closes an open disruption when the operator says so", async () => {
    const open = await db.execute<{ id: string }>(
      "INSERT INTO disruptions (source, source_type, external_id, severity, status, kind, title, published_at, confidence) " +
        "VALUES ('x:test', 'social', 'external-open', 'warning', 'active', 'delay', 'Keterlambatan', now(), 0.8) RETURNING id",
    );
    const disruptionId = open[0]?.id;
    expect(disruptionId).toBeTruthy();

    // The resolution arrives as a new announcement, which is how an
    // operator actually publishes it.
    const monitor = buildMonitor(
      async () => ({
        analysis: {
          ...analysis,
          isDisruption: false,
          resolvesDisruptionIds: [disruptionId ?? ""],
        },
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [disruptionId ?? ""],
      }),
      { id: "1900000000000000002", text: "Layanan kembali normal." },
    );

    const result = await monitor.poll();

    expect(result.resolved).toBe(1);

    const closed = await db.execute<{ status: string }>(
      `SELECT status FROM disruptions WHERE id = '${disruptionId ?? ""}'`,
    );
    expect(closed[0]?.status).toBe("resolved");
  });

  it("reports a failing source without losing the others", async () => {
    const monitor = new DisruptionMonitor({
      db,
      cache,
      classify: async () => ({
        analysis,
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
      }),
      x: {
        searchAccount: async () => {
          throw new Error("X API rate limit reached");
        },
      },
      news: null,
      handles: [{ systemId: "transjakarta", handle: "PT_Transjakarta" }],
    });

    const result = await monitor.poll();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("X API rate limit");
  });
});
