import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";

import { createDb, deleteTemporaryService, loadNetwork } from "@daily-route/db";
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
import { createXClient } from "./x.js";

/**
 * A stubbed X API, shaped like the real v2 recent-search response.
 *
 * The point is not to mock `fetch`: a real HTTP server returns the exact
 * envelope (data, includes.media, meta) with four media keys and a
 * `note_post`. The real X client parses it, then a recorded agent decision
 * goes through the real validator and planner.
 *
 * The model decision is recorded because this environment has no X top-up and
 * the configured text model is not a vision model. It is the object the
 * production agent's output schema produces, not a hand edit of the network.
 */

const note = `Sahabat TiJe, mulai 31 Oktober 2026 pukul 05:00 WIB, akan berlangsung pekerjaan perbaikan JPO Grogol.

Selama pekerjaan perbaikan berlangsung, Transjakarta mengoperasikan rute shuttle 9ST: Grogol Reformasi - Roxy pada pukul 05:00-22:00 WIB.

Lihat informasi selengkapnya pada gambar di bawah ini.`;

const media = [1, 2, 3, 4].map((index) => ({
  media_key: `3_${index}`,
  type: "photo",
  url: `https://pbs.twimg.com/media/stub-9st-${index}.jpg`,
  alt_text: `Informasi layanan 9ST, gambar ${index}`,
}));

const payload = {
  data: [
    {
      id: "1999999999999999999",
      text: note.slice(0, 280),
      note_post: { text: note },
      created_at: "2026-10-29T09:00:00.000Z",
      author_id: "104556071",
      lang: "id",
      conversation_id: "1999999999999999999",
      attachments: { media_keys: media.map((entry) => entry.media_key) },
    },
  ],
  includes: { media },
  meta: {
    newest_id: "1999999999999999999",
    oldest_id: "1999999999999999999",
    result_count: 1,
  },
};

let urlSeen = "";
const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  urlSeen = request.url ?? "";
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const network = await loadNetwork(db);

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

const IDs = {
  reformasi: "transjakarta:grogol-reformasi",
  roxy: "transjakarta:roxy",
  grogol: "transjakarta:grogol",
  tanjungDuren: "transjakarta:tanjung-duren",
} as const;

const resolver = {
  async resolve(text: string): Promise<PlaceCandidate[]> {
    const name = text.trim().toLowerCase();
    if (name === "grogol reformasi") return [candidate(IDs.reformasi)];
    if (name === "roxy") return [candidate(IDs.roxy)];
    if (name === "grogol") return [candidate(IDs.grogol)];
    if (name === "tanjung duren") return [candidate(IDs.tanjungDuren)];
    return [];
  },
} as unknown as PlaceResolver;

/** The structured decision the service-change agent is asked to produce. */
const agentDecision: TemporaryServiceProposal = {
  isTemporaryService: true,
  code: "9ST",
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
  startsAt: "2026-10-31T05:00:00+07:00",
  endsAt: null,
  windows: [{ days: [1, 2, 3, 4, 5, 6, 7], startMinute: 300, endMinute: 1320, headwayMinutes: 10 }],
  sourceQuote: "Transjakarta mengoperasikan rute shuttle 9ST: Grogol Reformasi - Roxy pada pukul 05:00-22:00 WIB.",
  confidence: 0.93,
  notes: ["Gambar peta menunjukkan loop; halte akhir mengulang halte awal."],
};

afterAll(async () => {
  await deleteTemporaryService(db, "temporary-transjakarta-9st-2026-10-31");
  await db.$client.end({ timeout: 5 });
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("stubbed X API to temporary service trial", () => {
  it("reads four images, keeps the long note, and plans the announced 9ST", async () => {
    const client = createXClient({ bearerToken: "stub-token", baseUrl });
    const page = await client.searchPosts("from:PT_Transjakarta -is:retweet -is:reply", {
      includeAuthors: false,
      authorHandle: "PT_Transjakarta",
      maxPages: 1,
      maxResults: 10,
    });

    expect(page.posts).toHaveLength(1);
    const post = page.posts[0]!;
    expect(post.text).toContain("shuttle 9ST");
    expect(post.text.length).toBe(note.length);
    expect(post.media).toHaveLength(4);
    expect(post.media?.map((entry) => entry.url)).toEqual(media.map((entry) => entry.url));
    expect(post.authorHandle).toBe("PT_Transjakarta");

    expect(urlSeen).toContain("/2/tweets/search/recent");
    expect(urlSeen).toContain("expansions=attachments.media_keys");
    expect(urlSeen).not.toContain("expansions=author_id");
    expect(urlSeen).toContain("media.fields=url%2Cpreview_image_url%2Calt_text%2Ctype");
    expect(urlSeen).toContain("note_post");
    expect(urlSeen).not.toContain("note_tweet");

    const writer = new TemporaryServiceWriter({ db, resolver });
    const written = await writer.write(
      agentDecision,
      {
        text: post.text,
        url: post.url,
        publishedAt: new Date(post.createdAt),
        externalId: post.id,
        authorHandle: post.authorHandle,
        systemId: "transjakarta",
        images: post.media ?? [],
      },
      network,
      { model: "stub-recorded-agent" },
    );
    expect(written.status).toBe("saved");
    if (written.status !== "saved") return;
    expect(written.service.source.images).toHaveLength(4);

    const overlay = withTemporaryServices(network, [written.service]);
    const at = new Date("2026-10-31T06:00:00+07:00");
    const trips = planRoutes(overlay, IDs.reformasi, IDs.roxy, { at });
    const direct = trips.find((trip) => linesUsedBy(trip).some((id) => id.startsWith("temp:")));
    expect(direct).toBeDefined();
    expect(direct?.legs.some((leg) => leg.lineCode === "9ST" && leg.temporary === true)).toBe(true);
    expect(direct?.durationMinutes).toBeGreaterThan(0);
  });
});
