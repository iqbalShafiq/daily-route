/**
 * Give every stop its administrative address.
 *
 * The network knows where a stop stands, not which kelurahan it belongs to.
 * The boundary files in `data/admin` are the MIT-licensed
 * `cahyadsn/wilayah_boundaries` release (geometry derived from BIG), one SQL
 * dump per kabupaten/kota. Every stop is tested against the kelurahan
 * polygons of Greater Jakarta, and the code on the polygon names the whole
 * hierarchy: province, kota/kabupaten, kecamatan, kelurahan/desa.
 *
 * Run with `pnpm data:enrich`. It rewrites `data/transit-network.json`; the
 * database then takes it with `pnpm db:sync`.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Point = [number, number]; // [latitude, longitude]
type Polygon = Point[][]; // rings: outer first, then holes
type MultiPolygon = Polygon[];

type Boundary = {
  code: string;
  name: string;
  polygons: MultiPolygon;
  bbox: [number, number, number, number]; // west, south, east, north
};

type Snapshot = {
  generatedAt: string;
  stations: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    area: string | null;
    metadata: Record<string, unknown>;
  }[];
  [key: string]: unknown;
};

const ROOT = resolve(import.meta.dirname, "../../../..");
const SNAPSHOT = resolve(ROOT, "data/transit-network.json");
const ADMIN = resolve(ROOT, "data/admin");

/** `('code','name',lat,lng,'[[[lat,lng],…]]')` — the path has no quote. */
const ROW =
  /\('([0-9.]+)','([^']*)',(-?[\d.]+),(-?[\d.]+),'(\[.*?\])'\)/gs;

/** `('code','name'` — enough to read a name out of a kab/kec dump. */
const NAMED = /\('([0-9.]+)','([^']*)'/g;

async function main(): Promise<void> {
  const files = (await readdir(ADMIN)).filter((file) => file.endsWith(".sql")).sort();
  if (files.length === 0) {
    throw new Error(`No boundary files in ${ADMIN}. Download them first.`);
  }

  const names = new Map<string, string>();
  const boundaries: Boundary[] = [];
  for (const file of files) {
    const text = await readFile(resolve(ADMIN, file), "utf8");
    for (const match of text.matchAll(NAMED)) {
      const code = match[1];
      const name = match[2];
      if (code && name) names.set(code, name);
    }
    if (!file.startsWith("kel_")) continue;
    for (const match of text.matchAll(ROW)) {
      const [, code, name, , , path] = match;
      if (!code || !name || !path) continue;
      const polygons = toMultiPolygon(JSON.parse(path) as unknown);
      if (!polygons) continue;
      boundaries.push({ code, name, polygons, bbox: boundsOf(polygons) });
    }
  }

  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as Snapshot;
  console.log(`· ${boundaries.length} kelurahan polygons, ${snapshot.stations.length} stops`);

  const counts = { village: 0, district: 0, city: 0, nearest: 0, missing: 0 };
  for (const station of snapshot.stations) {
    const hit = findBoundary(boundaries, station.latitude, station.longitude);
    const boundary = hit ?? nearestBoundary(boundaries, station.latitude, station.longitude);
    if (!boundary) {
      counts.missing += 1;
      continue;
    }
    if (!hit) counts.nearest += 1;
    const village = boundary.code;
    const district = boundary.code.slice(0, 8);
    const city = boundary.code.slice(0, 5);
    const province = boundary.code.slice(0, 2);

    station.area = names.get(district) ?? station.area;
    station.metadata = {
      ...station.metadata,
      province: names.get(province) ?? null,
      city: names.get(city) ?? null,
      district: names.get(district) ?? null,
      village: names.get(village) ?? boundary.name,
      villageCode: village,
      ...(hit ? {} : { boundaryApproximate: true }),
    };
    if (station.metadata["village"]) counts.village += 1;
    if (station.metadata["district"]) counts.district += 1;
    if (station.metadata["city"]) counts.city += 1;
  }

  await writeFile(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log("✓ enriched");
  console.log(`  village  : ${counts.village}/${snapshot.stations.length}`);
  console.log(`  district : ${counts.district}/${snapshot.stations.length}`);
  console.log(`  city     : ${counts.city}/${snapshot.stations.length}`);
  console.log(`  nearest  : ${counts.nearest} (no polygon contained the point)`);
  console.log(`  missing  : ${counts.missing}`);
}

/** A Polygon in the dump is `[[lat,lng],…]`; a MultiPolygon one level deeper. */
function toMultiPolygon(value: unknown): MultiPolygon | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  if (!Array.isArray(first) || first.length === 0) return null;
  const second = first[0];
  if (!Array.isArray(second) || second.length === 0) return null;
  if (typeof second[0] === "number") return [value as Polygon];
  return value as MultiPolygon;
}

function boundsOf(polygons: MultiPolygon): [number, number, number, number] {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [latitude, longitude] of ring) {
        if (longitude < west) west = longitude;
        if (longitude > east) east = longitude;
        if (latitude < south) south = latitude;
        if (latitude > north) north = latitude;
      }
    }
  }
  return [west, south, east, north];
}

function findBoundary(
  boundaries: readonly Boundary[],
  latitude: number,
  longitude: number,
): Boundary | null {
  for (const boundary of boundaries) {
    const [west, south, east, north] = boundary.bbox;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    if (insideMultiPolygon(boundary.polygons, latitude, longitude)) return boundary;
  }
  return null;
}

/** The closest polygon within 300 m, for a stop on a boundary sliver. */
function nearestBoundary(
  boundaries: readonly Boundary[],
  latitude: number,
  longitude: number,
): Boundary | null {
  let best: Boundary | null = null;
  let bestDistance = 0.3; // km
  for (const boundary of boundaries) {
    const [west, south, east, north] = boundary.bbox;
    const dx = west > longitude ? west - longitude : east < longitude ? longitude - east : 0;
    const dy = south > latitude ? south - latitude : north < latitude ? latitude - north : 0;
    const distance = Math.hypot(dx * 111 * Math.cos((latitude * Math.PI) / 180), dy * 110.5);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = boundary;
    }
  }
  return best;
}

function insideMultiPolygon(
  polygons: MultiPolygon,
  latitude: number,
  longitude: number,
): boolean {
  for (const polygon of polygons) {
    const [outer, ...holes] = polygon;
    if (!outer || !insideRing(outer, latitude, longitude)) continue;
    if (holes.some((hole) => insideRing(hole, latitude, longitude))) continue;
    return true;
  }
  return false;
}

function insideRing(ring: Point[], latitude: number, longitude: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [yi, xi] = ring[index] ?? [0, 0];
    const [yj, xj] = ring[previous] ?? [0, 0];
    if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

main().catch((error: unknown) => {
  console.error("enrich gagal:", error);
  process.exitCode = 1;
});
