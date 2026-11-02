import { afterAll, describe, expect, it } from "vitest";

import { DisruptionMonitor, NetworkCache, expireStaleDisruptions, type ClassifyResult } from "@daily-route/agent";
import { createDb, deleteDisruptionsBySource, findDisruptionById, insertNotice, updateNotice } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";

/**
 * The review path is agent-decided, not a kind TTL. The agent callback is a
 * fake here; the real model is exercised by the live smoke/eval, not by this
 * deterministic database test.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });
const run = `review_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
const sources = [`x:${run}_a`, `x:${run}_b`, `x:${run}_c`, `x:${run}_d`];

const classify = async (): Promise<ClassifyResult> => ({
  analysis: {
    isDisruption: false,
    kind: "unknown",
    severity: "info",
    title: "",
    summary: "",
    eventKey: null,
    affectedStationNames: [],
    affectedLineCodes: [],
    affectedRoadNames: [],
    affectedTowards: null,
    affectedCompass: null,
    needsSchedule: false,
    viaToll: false,
    diversion: null,
    affectedSystemIds: [],
    confidence: 0,
    targetDisruptionId: null,
    resolvesDisruptionIds: [],
    startsAt: null,
    endsAt: null,
  },
  stationIds: [],
  lineIds: [],
  resolvesDisruptionIds: [],
  targetDisruptionId: null,
  eventKey: null,
  startsAt: null,
  endsAt: null,
  duration: null,
  mark: null,
  scope: "network",
  lineCodes: [],
  roads: [],
  diversion: null,
});

async function notice(source: string, title: string) {
  const row = await insertNotice(db, {
    source,
    sourceType: "social",
    externalId: `${source}:1`,
    status: "active",
    severity: "warning",
    kind: "maintenance",
    title,
    body: title,
    publishedAt: new Date(Date.now() - 7 * 24 * 3_600_000),
    observedAt: new Date(),
    lastSeenAt: new Date(Date.now() - 7 * 24 * 3_600_000),
    reviewAt: new Date(Date.now() - 60_000),
    reviewState: "scheduled",
    durationAssessment: { horizon: "weeks", reviewAfterHours: 168, reason: "pekerjaan", confidence: 0.8 },
  });
  if (!row) throw new Error("notice fixture not inserted");
  return row.id;
}

afterAll(async () => {
  await deleteDisruptionsBySource(db, sources);
  await db.$client.end({ timeout: 5 });
});

function monitor(review: (input: { id: string }) => Promise<{
  verdict: "active" | "ended" | "unknown";
  endsAt: string | null;
  reviewAfterHours: number | null;
  confidence: number;
  summary: string;
  evidence: { url: string; quote: string }[];
  usable: boolean;
}>) {
  return new DisruptionMonitor({
    db,
    cache,
    classify,
    reviewLimit: 1,
    reviewNotice: (input) => review(input),
  });
}

describe("notice review", () => {
  it("extends a long notice without changing its kind", async () => {
    const id = await notice(sources[0]!, "Revitalisasi halte");
    const result = await monitor(async () => ({
      verdict: "active",
      endsAt: null,
      reviewAfterHours: 168,
      confidence: 0.8,
      summary: "Pekerjaan masih berjalan.",
      evidence: [{ url: "https://transjakarta.co.id/x", quote: "masih berlangsung" }],
      usable: true,
    })).tick();
    expect(result.reviewed).toBe(1);
    const row = await findDisruptionById(db, id);
    expect(row?.status).toBe("active");
    expect(row?.reviewState).toBe("verified");
    expect(row?.reviewAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves only when the agent has evidence", async () => {
    const id = await notice(sources[1]!, "Perbaikan selesai");
    const result = await monitor(async () => ({
      verdict: "ended",
      endsAt: new Date().toISOString(),
      reviewAfterHours: null,
      confidence: 0.9,
      summary: "Halte kembali dibuka.",
      evidence: [{ url: "https://transjakarta.co.id/y", quote: "kembali beroperasi" }],
      usable: true,
    })).tick();
    expect(result.resolvedByReview).toBe(1);
    const row = await findDisruptionById(db, id);
    expect(row?.status).toBe("resolved");
    expect(row?.resolvedReason).toBe("review-agent");
  });

  it("keeps an unverified notice visible instead of closing it from silence", async () => {
    const id = await notice(sources[2]!, "Belum ada kabar");
    const result = await monitor(async () => ({
      verdict: "unknown",
      endsAt: null,
      reviewAfterHours: 6,
      confidence: 0.3,
      summary: "Tidak ada bukti.",
      evidence: [],
      usable: true,
    })).tick();
    expect(result.reviewed).toBe(1);
    const row = await findDisruptionById(db, id);
    expect(row?.status).toBe("active");
    expect(row?.reviewState).toBe("unverified");
    expect(row?.reviewAt?.getTime()).toBeGreaterThan(Date.now());
  });
});

  it("does not apply the legacy kind TTL to a model-scheduled review", async () => {
    const id = await notice(sources[3]!, "Revitalisasi jangka panjang");
    await updateNotice(db, id, {
      reviewAt: new Date(Date.now() + 7 * 24 * 3_600_000),
      lastSeenAt: new Date(Date.now() - 30 * 24 * 3_600_000),
      reviewState: "scheduled",
    });
    await expireStaleDisruptions(db);
    const row = await findDisruptionById(db, id);
    expect(row?.status).toBe("active");
  });
