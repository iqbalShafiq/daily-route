import {
  DisruptionMonitor,
  NetworkCache,
  type ClassifyResult,
  type MonitorOptions,
  type XPost,
} from "@daily-route/agent";
import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The disruption monitor, against the real database.
 *
 * The classifier is replaced by a stub and the stream by a direct `ingest`
 * call, so the test covers the part that is ours: what is stored, what is
 * not stored twice, and what closes an open disruption.
 *
 * Every fixture carries a unique prefix. The test never truncates a shared
 * table: `pnpm test` must not erase the notices a running worker collected.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });

const run = `test_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
// Not `test_`: the worker queue deliberately ignores those handles as
// fixtures, and this test needs its own fixture to travel through the queue.
const handle = `fixture_${run}_tj`;
const source = `x:${handle}`;
const externalId = `9900000000000000001${run}`;

const analysis = {
  isDisruption: true,
  kind: "diversion" as const,
  severity: "severe" as const,
  title: "Koridor 1 dialihkan",
  summary: "Layanan koridor 1 dialihkan sementara.",
  affectedStationNames: ["Bundaran Senayan"],
  affectedLineCodes: ["1"],
  affectedRoadNames: [] as string[],
  affectedTowards: null,
  affectedCompass: null,
  needsSchedule: false,
  diversion: null,
  affectedSystemIds: ["transjakarta" as const],
  confidence: 0.9,
  eventKey: `test-${run}`,
  targetDisruptionId: null,
  resolvesDisruptionIds: [] as string[],
  startsAt: null,
  endsAt: null,
};

type Announcement = { id: string; text: string; publishedAt: string };

function buildClassifier(
  result: Omit<ClassifyResult, "scope" | "lineCodes" | "roads" | "diversion"> &
    Partial<Pick<ClassifyResult, "scope" | "lineCodes" | "roads" | "diversion">>,
) {
  return async () => ({
    scope: "network" as const,
    lineCodes: [],
    roads: [],
    diversion: null,
    ...result,
  });
}

function buildMonitor(
  classify: () => Promise<ClassifyResult>,
  announcement: Announcement = {
    id: externalId,
    text: "Layanan koridor 1 dialihkan sementara di sekitar Halte Bundaran Senayan.",
    publishedAt: new Date().toISOString(),
  },
  research?: MonitorOptions["research"],
) {
  const monitor = new DisruptionMonitor({
    db,
    cache,
    classify,
    concurrency: 1,
    sweepLimit: 0,
    ...(research ? { research } : {}),
  });
  return { monitor, announcement };
}

/** The stream hands the monitor one Post, then the queue is drained. */
async function deliver(
  monitor: DisruptionMonitor,
  announcement: Announcement,
  systemId = "transjakarta",
) {
  const post: XPost & { systemId: string; accountId: string | null } = {
    id: announcement.id,
    text: announcement.text,
    createdAt: announcement.publishedAt,
    authorId: "104556071",
    authorHandle: handle,
    url: `https://x.example/${handle}/${announcement.id}`,
    systemId,
    accountId: "104556071",
  };
  const ingested = await monitor.ingest(post);
  const result = await monitor.tick();
  return { ...result, fresh: result.fresh + ingested.fresh };
}

beforeAll(async () => {
  // The network rows are seeded; this test only needs its own place names.
});

afterAll(async () => {
  await db.execute(`DELETE FROM social_posts WHERE author_handle = '${handle}'`);
  await db.execute(`DELETE FROM disruptions WHERE source = '${source}' OR source = 'x:test:${run}'`);
  // A test that ran while the worker was alive could have turned a fixture
  // into a real notice. Remove those rows by their fixture prefix.
  await db.execute("DELETE FROM disruptions WHERE event_key LIKE 'test-%' OR source LIKE 'x:test_%'");
  await db.execute("DELETE FROM social_posts WHERE author_handle LIKE 'test\\_%'");
  await db.$client.end({ timeout: 5 });
});

describe("DisruptionMonitor", () => {
  it("stores a new announcement and the disruption it describes", async () => {
    const { monitor, announcement } = buildMonitor(
      buildClassifier({
        analysis,
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
        targetDisruptionId: null,
        eventKey: analysis.eventKey,
        startsAt: null,
        endsAt: null,
        mark: null,
      }),
    );

    const result = await deliver(monitor, announcement);

    expect(result.fresh).toBe(1);
    expect(result.disruptions).toBe(1);
    expect(result.errors).toEqual([]);

    const stored = await db.execute<{ count: number }>(
      `SELECT count(*)::int AS count FROM social_posts WHERE external_id = '${externalId}'`,
    );
    expect(stored[0]?.count).toBe(1);

    const disruptions = await db.execute<{ title: string; severity: string }>(
      `SELECT title, severity FROM disruptions WHERE source = '${source}'`,
    );
    expect(disruptions.length).toBe(1);
    expect(disruptions[0]?.title).toBe("Koridor 1 dialihkan");
    expect(disruptions[0]?.severity).toBe("severe");
  });

  it("does not store the same announcement twice", async () => {
    const { monitor, announcement } = buildMonitor(
      buildClassifier({
        analysis,
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
        targetDisruptionId: null,
        eventKey: analysis.eventKey,
        startsAt: null,
        endsAt: null,
        mark: null,
      }),
    );

    const result = await deliver(monitor, announcement);

    expect(result.fresh).toBe(0);
    expect(result.disruptions).toBe(0);
  });

  it("keeps the systemId that the matching rule carried", async () => {
    const { monitor, announcement } = buildMonitor(
      buildClassifier({
        analysis,
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
        targetDisruptionId: null,
        eventKey: analysis.eventKey,
        startsAt: null,
        endsAt: null,
        mark: null,
      }),
      {
        id: `${externalId}9`,
        text: "Koridor 1 dialihkan.",
        publishedAt: new Date().toISOString(),
      },
    );

    await deliver(monitor, announcement, "transjakarta");
    const rows = await db.execute<{ metadata: { systemId?: string } }>(
      `SELECT metadata FROM social_posts WHERE external_id = '${externalId}9'`,
    );
    expect(rows[0]?.metadata.systemId).toBe("transjakarta");
  });

  it("closes an open disruption when the operator says so", async () => {
    const open = await db.execute<{ id: string }>(
      "INSERT INTO disruptions (source, source_type, external_id, severity, status, kind, title, published_at, observed_at, last_seen_at, confidence) " +
        `VALUES ('x:test:${run}', 'social', 'external-open-${run}', 'warning', 'active', 'delay', 'Keterlambatan', now(), now(), now() - interval '2 minutes', 0.8) RETURNING id`,
    );
    const disruptionId = open[0]?.id;
    expect(disruptionId).toBeTruthy();

    const { monitor, announcement } = buildMonitor(
      async () => ({
        analysis: {
          ...analysis,
          isDisruption: false,
          resolvesDisruptionIds: [disruptionId ?? ""],
        },
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [disruptionId ?? ""],
        targetDisruptionId: null,
        eventKey: null,
        startsAt: null,
        endsAt: null,
        diversion: null,
        mark: null,
        scope: "line",
        lineCodes: [],
        roads: [],
      }),
      {
        id: `${externalId}2`,
        text: "Layanan kembali normal.",
        publishedAt: new Date().toISOString(),
      },
    );

    const result = await deliver(monitor, announcement);

    expect(result.resolved).toBe(1);

    const closed = await db.execute<{ status: string }>(
      `SELECT status FROM disruptions WHERE id = '${disruptionId ?? ""}'`,
    );
    expect(closed[0]?.status).toBe("resolved");
  });

  it("fills the schedule from the researcher when the post gives no hours", async () => {
    const eventKey = `test-${run}-schedule`;
    const scheduled = {
      ...analysis,
      eventKey,
      title: "Koridor 1 dialihkan untuk acara lari",
      needsSchedule: true,
    };
    const { monitor, announcement } = buildMonitor(
      buildClassifier({
        analysis: scheduled,
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
        targetDisruptionId: null,
        eventKey,
        startsAt: null,
        endsAt: null,
        mark: null,
      }),
      {
        id: `${externalId}4`,
        text: "Koridor 1 dialihkan untuk acara lari. Jam penutupan menyusul.",
        publishedAt: new Date().toISOString(),
      },
      async () => ({
        event: "Jakarta Running Festival 2026",
        startsAt: "2026-10-25T02:30:00+07:00",
        endsAt: "2026-10-25T09:15:00+07:00",
        location: "Gatot Subroto",
        quote: "Penutupan 02.30-09.15 WIB",
        sourceUrl: "https://example.test/jrf",
        confidence: 0.7,
      }),
    );

    const result = await deliver(monitor, announcement);
    expect(result.disruptions).toBe(1);

    const rows = await db.execute<{ ends_at: Date | null; metadata: unknown }>(
      `SELECT ends_at, metadata FROM disruptions WHERE event_key = '${eventKey}'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(new Date(String(rows[0]?.ends_at)).toISOString()).toBe("2026-10-25T02:15:00.000Z");
    expect(JSON.stringify(rows[0]?.metadata)).toContain("Jakarta Running Festival");
  });

  it("marks a post needs_review after the last failed attempt", async () => {
    const { monitor, announcement } = buildMonitor(
      async () => {
        throw new Error("provider unavailable");
      },
      {
        id: `${externalId}8`,
        text: "Koridor 1 dialihkan.",
        publishedAt: new Date().toISOString(),
      },
    );
    await monitor.ingest({
      id: announcement.id,
      text: announcement.text,
      createdAt: announcement.publishedAt,
      authorId: "104556071",
      authorHandle: handle,
      url: `https://x.example/${handle}/${announcement.id}`,
      systemId: "transjakarta",
      accountId: null,
    });
    await db.execute(
      `UPDATE social_posts SET classification_attempts = 7, next_attempt_at = now() - interval '1 minute' WHERE external_id = '${announcement.id}'`,
    );
    await monitor.tick();
    const rows = await db.execute<{ classification_status: string }>(
      `SELECT classification_status FROM social_posts WHERE external_id = '${announcement.id}'`,
    );
    expect(rows[0]?.classification_status).toBe("needs_review");
  });

  it("merges two announcements about the same event", async () => {
    const { monitor, announcement } = buildMonitor(
      buildClassifier({
        analysis,
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
        targetDisruptionId: null,
        eventKey: analysis.eventKey,
        startsAt: null,
        endsAt: null,
        mark: null,
      }),
      {
        id: `${externalId}3`,
        text: "Koridor 1 masih dialihkan sampai malam.",
        publishedAt: new Date(Date.now() + 1_000).toISOString(),
      },
    );

    const result = await deliver(monitor, announcement);
    expect(result.updated).toBe(1);

    const rows = await db.execute<{ count: number }>(
      `SELECT count(*)::int AS count FROM disruptions WHERE source = '${source}' AND event_key = '${analysis.eventKey}'`,
    );
    expect(rows[0]?.count).toBe(1);
  });
});
