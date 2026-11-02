/**
 * Verify the time windows of open notices.
 *
 * This is the batch entry point for the verification agent. It only touches
 * notices that have no verified window yet; a notice that already has one is
 * left alone unless it is reclassified.
 */
import { createDb, loadNetwork } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";

import { sql } from "drizzle-orm";

import { createNewsSearch } from "../news.js";
import { modelConfigFromEnv } from "../model.js";
import { cachedNewsSearch, SharedWork } from "../shared.js";
import { createXClient } from "../x.js";
import {
  createNoticeExtractor,
  createQueryPlanner,
  createWindowCritic,
  verifyNotice,
  type VerifyInput,
} from "../verify.js";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  source: string;
  source_type: string;
  published_at: Date | string;
  severity: string;
  kind: string;
  system_id: string | null;
  line_id: string | null;
  station_id: string | null;
  affected_line_ids: unknown;
  affected_station_ids: unknown;
};

function idsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);
  const network = await loadNetwork(db);
  const lineCode = new Map(network.lines.map((line) => [line.id, line.code]));
  const stationName = new Map(network.stations.map((station) => [station.id, station.name]));
  const stationIdByName = new Map(
    network.stations.map((station) => [normalizeName(station.name), station.id]),
  );
  const stationIdsByLine = new Map<string, Set<string>>();
  for (const stop of network.lineStops) {
    const set = stationIdsByLine.get(stop.lineId) ?? new Set<string>();
    set.add(stop.stationId);
    stationIdsByLine.set(stop.lineId, set);
  }

  const limit = Math.max(1, Math.min(10, Number(argument("limit") ?? 1)));
  const id = argument("id");
  const where = id ? `and id = '${id.replace(/'/g, "''")}'` : "";
  const rows = await db.execute<NoticeRow>(`
    select id, title, body, url, source, source_type, published_at, severity, kind,
           system_id, line_id, station_id, affected_line_ids, affected_station_ids
    from disruptions
    where status = 'active'
      and jsonb_array_length(validity_windows) = 0
      ${where}
    order by published_at desc
    limit ${limit}
  `);

  const config = modelConfigFromEnv(env);
  const work = new SharedWork(2);
  const search = cachedNewsSearch(createNewsSearch(env.TAVILY_API_KEY), work);
  const xClient = env.X_BEARER_TOKEN
    ? createXClient({ bearerToken: env.X_BEARER_TOKEN, baseUrl: env.X_API_BASE_URL })
    : null;
  const xSearch = xClient
    ? (query: string) => work.run(`x:${query}`, 15 * 60_000, () => xClient.searchPosts(query, { maxPages: 1 }))
    : null;
  const planner = createQueryPlanner(config, env);
  const extractor = createNoticeExtractor(config, env);
  const critic = createWindowCritic(config, env);

  for (const row of rows) {
    const lineIds = [...new Set([...(row.line_id ? [row.line_id] : []), ...idsOf(row.affected_line_ids)])];
    const stationIds = [
      ...new Set([...(row.station_id ? [row.station_id] : []), ...idsOf(row.affected_station_ids)]),
    ];
    const input: VerifyInput = {
      title: row.title,
      body: row.body,
      source: row.source,
      sourceType: row.source_type as VerifyInput["sourceType"],
      publishedAt: new Date(row.published_at),
      sourceUrls: row.url ? [row.url] : [],
      affectedLineCodes: lineIds
        .map((lineId) => lineCode.get(lineId))
        .filter((code): code is string => typeof code === "string"),
      affectedStationNames: stationIds
        .map((stationId) => stationName.get(stationId))
        .filter((name): name is string => typeof name === "string"),
      severity: row.severity as VerifyInput["severity"],
      kind: row.kind,
    };

    console.log(`· verify ${row.id}: ${row.title.slice(0, 80)}`);
    const result = await verifyNotice(input, {
      search,
      planner,
      extractor,
      critic,
      network,
      xSearch,
      traceId: `verify-${row.id}`,
    });
    console.log(
      `  → ${result.windows.length} windows, needsReview=${result.needsReview}, unresolved=${result.unresolved.length}`,
    );
    for (const window of result.windows) {
      console.log(`    ${window.label}: ${window.startsAt} → ${window.endsAt ?? "open"}`);
    }
    // The extractor can summarize a whole event page. A window is only
    // useful when its route actually serves a stop named by this notice,
    // or when it is one of the routes named by the notice.
    const affectedStationIds = new Set(
      input.affectedStationNames
        .map((name) => stationIdByName.get(normalizeName(name)))
        .filter((value): value is string => typeof value === "string"),
    );
    const affectedLineIds = new Set(lineIds);
    const windows = result.windows.filter((window) => {
      if (Date.parse(window.startsAt) >= Date.parse(window.endsAt ?? "9999-12-31")) return false;
      const scopedLines = window.scope?.lineIds ?? [];
      if (affectedLineIds.size > 0 && scopedLines.length > 0) {
        if (!scopedLines.some((lineId) => affectedLineIds.has(lineId))) return false;
      }
      if (affectedStationIds.size > 0 && scopedLines.length > 0) {
        return scopedLines.some((lineId) =>
          [...affectedStationIds].some((stationId) => stationIdsByLine.get(lineId)?.has(stationId)),
        );
      }
      return true;
    });
    if (windows.length !== result.windows.length) {
      console.log(
        `  · scope filter kept ${windows.length} of ${result.windows.length} windows`,
      );
    }
    if (windows.length === 0) {
      console.log("  ! no evidence-backed window for this notice; left unchanged");
      continue;
    }
    result.windows = windows;
    let maxEnd: string | null = null;
    for (const window of result.windows) {
      if (window.endsAt && (!maxEnd || window.endsAt > maxEnd)) maxEnd = window.endsAt;
    }
    await db.execute(sql`
      update disruptions
      set validity_windows = ${JSON.stringify(result.windows)}::jsonb,
          ends_at = case
            when ${maxEnd}::timestamptz is null then ends_at
            else greatest(ends_at, ${maxEnd}::timestamptz)
          end,
          last_checked_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'verification',
            ${JSON.stringify({
              verifiedAt: new Date().toISOString(),
              needsReview: result.needsReview,
              unresolved: result.unresolved,
              summary: result.summary,
            })}::jsonb
          )
      where id = ${row.id}
    `);
  }

  await db.$client.end({ timeout: 5 });
}

await main();
