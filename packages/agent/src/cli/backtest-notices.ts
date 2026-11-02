/**
 * Replay stored announcements through the notice pipeline.
 *
 * The corpus is what the monitor actually read: every post in
 * `social_posts`, with the time it was published. The command classifies
 * them again with the real models, prints what each one was grounded to, and
 * can write the new scope back to the notice the post produced.
 *
 * It is a backtest, not a second monitor: it does not fetch, it does not
 * create a notice, and it does not move a queue item.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDb, listRecentPosts, updateNoticeGrounding } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver, RoadLookup } from "@daily-route/semantic";
import { isActiveAt, type Disruption, type TransitNetwork } from "@daily-route/transit";

import { noticeCandidatesForPost } from "../candidates.js";
import { createClassifierAgent, DisruptionClassifier } from "../classify.js";
import { NetworkCache } from "../context.js";
import { NoticeGrounder } from "../ground.js";
import { modelConfigFromEnv } from "../model.js";
import { createAnnouncementScreen } from "../screen.js";
import { flushTracing } from "../tracing.js";

type Row = {
  externalId: string;
  url: string;
  publishedAt: string;
  source: string;
  systemHint: string | null;
  noticeId: string | null;
  title: string;
  scope: string;
  stations: string[];
  lines: string[];
  roads: string[];
  unresolved: string[];
  ms: number;
  error: string | null;
};

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);
  const provider = createEmbeddingProvider(env);
  const resolver = new PlaceResolver(db, provider);
  const cache = new NetworkCache({ db, resolver });
  const config = modelConfigFromEnv(env);
  const screen = createAnnouncementScreen(env);
  const grounder = new NoticeGrounder({
    config,
    env,
    resolver,
    cache,
    roads: new RoadLookup(),
  });
  const classifier = new DisruptionClassifier(
    createClassifierAgent(config, env),
    resolver,
    cache,
    screen,
    grounder,
  );

  const since = new Date(Date.now() - flags.sinceDays * 24 * 3_600_000);
  const posts = (await listRecentPosts(db, { since, limit: 2_000 }))
    .filter((post) => post.text.trim().length > 24)
    .filter((post) => !flags.match || post.text.toLowerCase().includes(flags.match))
    .filter((post) => !flags.linked || post.disruptionId !== null)
    .slice(0, flags.limit);
  if (posts.length === 0) {
    console.log("No stored announcements to replay.");
    return;
  }

  const { network, disruptions } = await cache.get();
  const rows: Row[] = [];
  console.log(`· replaying ${posts.length} announcements (real models, ${env.AGENT_MODEL})`);

  for (const [index, post] of posts.entries()) {
    const systemHint = metadataString(post.metadata, "systemId");
    const started = Date.now();
    const row: Row = {
      externalId: post.externalId,
      url: post.url,
      publishedAt: post.publishedAt.toISOString(),
      source: `x:${post.authorHandle}`,
      systemHint,
      noticeId: post.disruptionId,
      title: "",
      scope: "skipped",
      stations: [],
      lines: [],
      roads: [],
      unresolved: [],
      ms: 0,
      error: null,
    };
    try {
      const candidates = noticeCandidatesForPost({
        text: post.text,
        systemHint,
        disruptions,
        network,
      });
      const result = await classifier.classify({
        text: post.text,
        url: post.url,
        publishedAt: post.publishedAt,
        source: `x:${post.authorHandle}`,
        sourceType: "social",
        externalId: post.externalId,
        systemHint,
        candidates,
        pollId: flags.pollId,
      });
      row.title = result.analysis.title;
      row.scope = result.analysis.isDisruption ? result.scope : "not-a-notice";
      row.stations = result.stationIds.map((id) => stationName(network, id));
      row.lines = result.lineCodes;
      row.roads = result.roads.map((road) => road.name);
      row.unresolved = result.analysis.affectedStationNames.filter(
        (name) => !result.stationIds.some((id) => stationName(network, id) === name),
      );
      if (flags.write && post.disruptionId && result.analysis.isDisruption) {
        await updateNoticeGrounding(db, post.disruptionId, {
          scope: result.scope,
          lineCodes: result.lineCodes,
          roads: result.roads,
          affectedStationIds: result.stationIds,
          affectedLineIds: result.lineIds,
          stationId: result.stationIds[0] ?? null,
          lineId: result.lineIds[0] ?? null,
        });
        cache.invalidate();
      }
    } catch (error) {
      row.error = error instanceof Error ? error.message : String(error);
    }
    row.ms = Date.now() - started;
    rows.push(row);
    console.log(
      `${String(index + 1).padStart(3)}/${posts.length} ${row.scope.padEnd(12)} ${row.ms
        .toString()
        .padStart(6)}ms  ${row.stations.length > 0 ? row.stations.join(", ") : row.lines.join(", ")}${
        row.roads.length > 0 ? ` @ ${row.roads.join(", ")}` : ""
      }  | ${row.title.slice(0, 70)}`,
    );
    if (row.error) console.log(`      ! ${row.error.slice(0, 160)}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    at: flags.at?.toISOString() ?? null,
    model: env.AGENT_MODEL,
    jev: screen ? env.JEV_MODEL : null,
    written: flags.write,
    counts: countScopes(rows),
    rows,
  };
  const directory = resolve(import.meta.dirname, "../../../..", "research/backtest");
  await mkdir(directory, { recursive: true });
  const output = resolve(
    directory,
    `notices-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`✓ ${output}`);
  console.log(
    `· ${report.counts.stop} stop · ${report.counts.line} line · ${report.counts.network} network · ${report.counts.skipped} not a notice${flags.write ? " · written" : " · dry run"}`,
  );
  if (flags.at) {
    console.log(`· at ${flags.at.toISOString()}: ${activeAt(disruptions, flags.at)} notices in force`);
  }

  await flushTracing();
}

function countScopes(rows: readonly Row[]): Record<string, number> {
  return {
    stop: rows.filter((row) => row.scope === "stop").length,
    line: rows.filter((row) => row.scope === "line").length,
    network: rows.filter((row) => row.scope === "network").length,
    skipped: rows.filter((row) => row.scope === "not-a-notice" || row.scope === "skipped").length,
    failed: rows.filter((row) => row.error !== null).length,
  };
}

function activeAt(disruptions: readonly Disruption[], at: Date): number {
  return disruptions.filter((disruption) => isActiveAt(disruption, at)).length;
}

function stationName(network: TransitNetwork, id: string): string {
  return network.stations.find((station) => station.id === id)?.name ?? id;
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseFlags(argv: readonly string[]): {
  limit: number;
  sinceDays: number;
  write: boolean;
  at: Date | null;
  match: string | null;
  linked: boolean;
  pollId: string;
} {
  const value = (name: string): string | null => {
    const prefix = `--${name}=`;
    const entry = argv.find((argument) => argument.startsWith(prefix));
    return entry ? entry.slice(prefix.length) : null;
  };
  const atRaw = value("at");
  const at = atRaw ? new Date(atRaw) : null;
  return {
    limit: Number(value("limit") ?? 20),
    sinceDays: Number(value("since") ?? 14),
    write: argv.includes("--write"),
    at: at && !Number.isNaN(at.getTime()) ? at : null,
    match: value("match")?.toLowerCase() ?? null,
    linked: argv.includes("--linked"),
    pollId: `backtest-${Date.now()}`,
  };
}

main().catch((error: unknown) => {
  console.error("backtest failed:", error);
  process.exitCode = 1;
});
