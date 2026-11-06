import { resolve } from "node:path";

import { readCache, writeCache } from "../cache.js";
import {
  fetchOfficialJpos,
  osmBridgesOf,
  OSM_JPO_QUERY,
  writeJpoDocument,
  type OfficialJpoFeature,
} from "../jpo.js";
import { overpass, queryFingerprint, type OverpassElement } from "../overpass.js";

/**
 * Build `data/jpo-network.json`.
 *
 * Run with `pnpm data:jpo`; add `--refresh` to ignore both caches. The
 * official layer is a point per bridge, OpenStreetMap holds the line. The
 * committed file is the transit access registry, so the map, the planner
 * and the assistant all read the same answer.
 */

const ROOT = resolve(import.meta.dirname, "../../../..");
const NETWORK_PATH = resolve(ROOT, "data/transit-network.json");
const OUTPUT_PATH = resolve(ROOT, "data/jpo-network.json");
const CACHE_DIRECTORY = resolve(ROOT, "data/raw");

async function main(): Promise<void> {
  const refresh = process.argv.includes("--refresh");
  const cacheOptions = { directory: CACHE_DIRECTORY, refresh };
  const now = new Date().toISOString();

  console.log("· reading the official JPO points");
  let official = await readCache<OfficialJpoFeature[]>("jpo-official", cacheOptions);
  if (!official) {
    official = await fetchOfficialJpos();
    await writeCache("jpo-official", official, cacheOptions);
  }
  console.log(`  ${official.length} official points`);

  console.log("· reading the OpenStreetMap footbridges");
  const osmCacheName = `jpo-osm-footbridges-${queryFingerprint(OSM_JPO_QUERY)}`;
  let elements = await readCache<OverpassElement[]>(osmCacheName, cacheOptions);
  if (!elements) {
    elements = await overpass(OSM_JPO_QUERY, { attemptsPerEndpoint: 2, timeoutMs: 280_000 });
    await writeCache(osmCacheName, elements, cacheOptions);
  }
  const bridges = osmBridgesOf(elements);
  console.log(`  ${bridges.length} OSM bridges and footbridges`);

  const document = await writeJpoDocument({
    officialFeatures: official,
    osmBridges: bridges,
    networkPath: NETWORK_PATH,
    outputPath: OUTPUT_PATH,
    officialRetrievedAt: now,
    osmRetrievedAt: now,
  });

  const counts = {
    total: document.jpos.length,
    official: document.jpos.filter((jpo) => jpo.official).length,
    officialLine: document.jpos.filter((jpo) => jpo.confidence === "official-line").length,
    officialPoint: document.jpos.filter((jpo) => jpo.confidence === "official-point").length,
    osm: document.jpos.filter((jpo) => jpo.source === "osm").length,
    besideStop: document.jpos.filter((jpo) => jpo.stations.length > 0).length,
  };
  console.log(`· wrote ${OUTPUT_PATH.replace(`${ROOT}/`, "")}`);
  console.log(`  ${JSON.stringify(counts)}`);

  const unmatched = document.jpos
    .filter((jpo) => jpo.official && jpo.confidence === "official-point")
    .map((jpo) => jpo.name);
  if (unmatched.length > 0) {
    console.log(`  ${unmatched.length} official points without a line:`);
    for (const name of unmatched.slice(0, 10)) console.log(`    ${name}`);
  }
}

main().catch((error: unknown) => {
  console.error("gagal membangun registry JPO:", error);
  process.exitCode = 1;
});
