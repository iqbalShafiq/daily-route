import { afterAll, describe, expect, it } from "vitest";

import { createDb, deleteTemporaryService, listTemporaryServices, loadNetwork } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import type { PlaceCandidate, PlaceResolver } from "@daily-route/semantic";
import {
  linesUsedBy,
  planRoutes,
  withTemporaryServices,
} from "@daily-route/transit";

import {
  TemporaryServiceWriter,
  type TemporaryServiceProposal,
} from "./temporary-service.js";

/**
 * One recorded agent decision through the real validation, persistence and
 * planner path. The decision is a fixture because the test has no provider
 * call; it is still produced by the agent's output schema, not by a hand edit
 * of the committed network.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const network = await loadNetwork(db);

const stationIds = [
  "transjakarta:grogol-reformasi",
  "transjakarta:roxy",
  "transjakarta:grogol",
  "transjakarta:tanjung-duren",
  "transjakarta:grogol-reformasi",
];

function candidate(stationId: string): PlaceCandidate {
  const station = network.stations.find((entry) => entry.id === stationId);
  if (!station) throw new Error(`missing fixture station ${stationId}`);
  return {
    stationId,
    name: station.name,
    systemId: station.systemId,
    systemName: "Transjakarta",
    mode: "bus",
    code: station.code,
    latitude: station.latitude,
    longitude: station.longitude,
    isInterchange: station.isInterchange,
    lineCount: 1,
    street: null,
    aliases: station.aliases,
    score: 0.99,
    signals: { vector: 0.99, lexical: 0.99, exact: 0.99 },
    matchedRanges: [],
  };
}

const resolver = {
  async resolve(text: string): Promise<PlaceCandidate[]> {
    const normalized = text.trim().toLowerCase();
    if (normalized === "grogol reformasi") return [candidate(stationIds[0]!)];
    if (normalized === "roxy") return [candidate(stationIds[1]!)];
    if (normalized === "grogol") return [candidate(stationIds[2]!)];
    if (normalized === "tanjung duren") return [candidate(stationIds[3]!)];
    return [];
  },
} as unknown as PlaceResolver;

const proposal: TemporaryServiceProposal = {
  isTemporaryService: true,
  code: "TS9",
  name: "Grogol Reformasi - Roxy",
  systemId: "transjakarta",
  serviceClass: "brt",
  directions: [
    {
      direction: "forward",
      headsign: "Roxy",
      stopNames: ["Grogol Reformasi", "Roxy", "Grogol", "Tanjung Duren", "Grogol Reformasi"],
    },
  ],
  startsAt: "2027-10-31T05:00:00+07:00",
  endsAt: null,
  windows: [{ days: [1, 2, 3, 4, 5, 6, 7], startMinute: 300, endMinute: 1320, headwayMinutes: 10 }],
  sourceQuote: "Transjakarta mengoperasikan rute shuttle TS9 pada pukul 05:00-22:00 WIB.",
  confidence: 0.92,
  notes: [],
};

const input = {
  text: "Transjakarta mengoperasikan rute shuttle TS9 pada pukul 05:00-22:00 WIB.",
  url: "https://x.com/PT_Transjakarta/status/1999999999999999999",
  publishedAt: new Date("2026-10-29T09:00:00+07:00"),
  externalId: "1999999999999999999",
  authorHandle: "PT_Transjakarta",
  systemId: "transjakarta",
  images: [],
};

afterAll(async () => {
  await deleteTemporaryService(db, "temporary-transjakarta-ts9-2027-10-31");
  await db.$client.end({ timeout: 5 });
});

describe("temporary service overlay", () => {
  it("writes a model decision as a line and plans on it after its start", async () => {
    const writer = new TemporaryServiceWriter({ db, resolver });
    const written = await writer.write(proposal, input, network);
    expect(written.status).toBe("saved");
    if (written.status !== "saved") return;

    expect(written.service.code).toBe("TS9");
    expect(written.service.directions[0]?.stationIds).toEqual(stationIds);
    expect(written.service.status).toBe("active");
    expect(written.service.source.quote).toContain("shuttle TS9");

    const rows = await listTemporaryServices(db);
    expect(rows.some((row) => row.code === "TS9" && row.status === "active")).toBe(true);

    const overlay = withTemporaryServices(network, [written.service]);
    const line = overlay.lines.find((entry) => entry.code === "TS9");
    expect(line?.metadata?.["temporary"]).toBe(true);

    const at = new Date("2027-10-31T06:00:00+07:00");
    const trips = planRoutes(overlay, stationIds[0]!, stationIds[1]!, { at });
    expect(trips.length).toBeGreaterThan(0);
    const withShuttle = trips.find((trip) => linesUsedBy(trip).some((id) => id.startsWith("temp:")));
    expect(withShuttle).toBeDefined();
    expect(withShuttle?.legs.some((leg) => leg.temporary === true)).toBe(true);

    const before = planRoutes(overlay, stationIds[0]!, stationIds[1]!, {
      at: new Date("2027-10-30T06:00:00+07:00"),
    });
    const beforeShuttle = before.find((trip) =>
      linesUsedBy(trip).some((id) => id.startsWith("temp:")),
    );
    expect(beforeShuttle).toBeUndefined();

    const after = planRoutes(overlay, stationIds[0]!, stationIds[1]!, {
      at: new Date("2027-10-31T23:00:00+07:00"),
    });
    const afterShuttle = after.find((trip) =>
      linesUsedBy(trip).some((id) => id.startsWith("temp:")),
    );
    expect(afterShuttle).toBeUndefined();
  });
});
