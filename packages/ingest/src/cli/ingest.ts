import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadCurated, type CuratedDocument } from "../curated.js";
import { loadOfficialRoutes, OFFICIAL_ROUTES_PATH } from "../official.js";
import { mergeNetwork } from "../merge.js";
import { fetchNodes, fetchRouteRelations, fetchUnlinkedRailStations, toOsmRoute } from "../osm.js";
import type { SystemId } from "../classify.js";
import { readCache, writeCache } from "../cache.js";
import { loadFareRules, type FaresDocument } from "../fares.js";
import { queryFingerprint } from "../overpass.js";
import { ROUTE_QUERY_FINGERPRINT } from "../osm.js";
import type { OverpassElement } from "../overpass.js";

/**
 * Build the transit network snapshot.
 *
 * Run with `pnpm data:ingest`; add `--refresh` to ignore the cached
 * OpenStreetMap responses and fetch them again. The result is written to
 * `data/transit-network.json` and committed, so the database seed is
 * reproducible and every row can be traced back to its source.
 */

const ROOT = resolve(import.meta.dirname, "../../../..");
const CURATED_FILES = [
  resolve(ROOT, "research/data/transjakarta.json"),
  resolve(ROOT, "research/data/rail-jakarta.json"),
];
const OUTPUT = resolve(ROOT, "data/transit-network.json");
const CACHE_DIRECTORY = resolve(ROOT, "data/raw");

async function main(): Promise<void> {
  const refresh = process.argv.includes("--refresh");
  const cacheOptions = { directory: CACHE_DIRECTORY, refresh };

  console.log("· loading curated research documents");
  const curated: CuratedDocument = { lines: [], notes: [] };
  for (const file of CURATED_FILES) {
    try {
      const loaded = await loadCurated(file);
      console.log(`  ${file.replace(`${ROOT}/`, "")}: ${loaded.lines.length} lines`);
      curated.lines.push(...loaded.lines);
      curated.notes.push(...loaded.notes);
    } catch (error) {
      console.warn(`  ${file.replace(`${ROOT}/`, "")}: skipped (${String(error).slice(0, 120)})`);
    }
  }

  console.log("· fetching route relations from OpenStreetMap");
  const relationsCache = `route-relations-${queryFingerprint(ROUTE_QUERY_FINGERPRINT)}`;
  let relations = await readCache<OverpassElement[]>(relationsCache, cacheOptions);
  if (!relations) {
    relations = await fetchRouteRelations();
    await writeCache(relationsCache, relations, cacheOptions);
  }
  console.log(`  ${relations.length} relations`);

  const stopIds = relations.flatMap((relation) =>
    (relation.members ?? [])
      .filter((member) => member.type === "node" && member.role !== "")
      .map((member) => member.ref),
  );
  console.log(`· fetching ${stopIds.length} stop nodes`);
  let nodes = await readCache<OverpassElement[]>("stop-nodes", cacheOptions);
  if (!nodes) {
    nodes = [...(await fetchNodes(stopIds)).values()];
    await writeCache("stop-nodes", nodes, cacheOptions);
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  console.log(`  ${nodeMap.size} nodes`);

  const osmRoutes = relations
    .map((relation) => toOsmRoute(relation, nodeMap))
    .filter((route): route is NonNullable<typeof route> => route !== null);
  console.log(`  ${osmRoutes.length} usable routes`);

  console.log("· fetching rail stations without a route relation");
  let unlinked = await readCache<OverpassElement[]>("rail-stations", cacheOptions);
  if (!unlinked) {
    unlinked = await fetchUnlinkedRailStations();
    await writeCache("rail-stations", unlinked, cacheOptions);
  }
  const extraStations = unlinked
    .map((element) => {
      const tags = element.tags ?? {};
      const name = tags["name"] ?? tags["name:id"];
      if (!name || element.lat === undefined || element.lon === undefined) return null;
      const systemId = inferSystem(tags);
      if (!systemId) return null;
      return {
        systemId,
        name,
        latitude: element.lat,
        longitude: element.lon,
        code: tags["railway:ref"] ?? tags["ref"] ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  console.log(`  ${extraStations.length} stations`);

  console.log("· loading the fare rules");
  const fareDocument = JSON.parse(
    await readFile(`${ROOT}/research/data/fares.json`, "utf8"),
  ) as FaresDocument;
  const fareRules = loadFareRules(fareDocument);
  console.log(
    `  ${Object.keys(fareRules.modes).length} operator rules, ${fareRules.integrations.length} combined tickets`,
  );

  console.log("· merging");
  const officialRoutes = loadOfficialRoutes(`${ROOT}/${OFFICIAL_ROUTES_PATH}`);
  if (officialRoutes) {
    console.log(
      `  ${officialRoutes.corridors.length} koridor resmi (${officialRoutes.source})`,
    );
  } else {
    console.warn(`  daftar koridor resmi tidak ditemukan: ${OFFICIAL_ROUTES_PATH}`);
  }

  const network = mergeNetwork({
    curated: curated.lines,
    osmRoutes,
    extraStations,
    fareRules,
    officialRoutes,
    notes: curated.notes,
  });

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(network, null, 2)}\n`, "utf8");

  console.log(
    `✓ wrote ${OUTPUT.replace(`${ROOT}/`, "")}: ${network.lines.length} lines, ${network.stations.length} stations, ${network.lineStops.length} line stops, ${network.stationGroups.length} interchange hubs`,
  );
}

function inferSystem(tags: Record<string, string>): SystemId | null {
  const network = (tags["network"] ?? "").toLowerCase();
  const operator = (tags["operator"] ?? "").toLowerCase();
  if (network.includes("mrt")) return "mrt-jakarta";
  if (network.includes("jabodebek")) return "lrt-jabodebek";
  if (network.includes("lrt jakarta")) return "lrt-jakarta";
  if (network.includes("kai") || operator.includes("kereta api")) return "krl-jabodetabek";
  return null;
}

main().catch((error: unknown) => {
  console.error("ingest failed:", error);
  process.exitCode = 1;
});
