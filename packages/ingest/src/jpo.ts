import { readFile, writeFile } from "node:fs/promises";

import {
  type Coordinate,
  type Jpo,
  type JpoDocument,
  type JpoStationLink,
  type TransitNetwork,
} from "@daily-route/transit";

import { distanceToPathKm, polylineLengthKm, simplifyPolyline } from "./geometry.js";

/**
 * The JPO and footbridge registry.
 *
 * Two sources are merged:
 *
 * - the Dinas Bina Marga DKI Jakarta `JPO Bina Marga 2024` layer, which is
 *   the official point per bridge and its address, type and remark;
 * - OpenStreetMap footway and pedestrian bridges, which hold the line the
 *   bridge actually follows.
 *
 * An official point is matched to the nearest OSM bridge line. An OSM
 * bridge with no official point is kept only when it is named as a JPO or
 * stands beside a transit stop, because a park bridge is not access to the
 * network. The result is a transit-access registry, not every footbridge in
 * Jabodetabek.
 */

const OFFICIAL_URL =
  "https://jakartasatu.jakarta.go.id/server/rest/services/Dinas_Bina_Marga/JPO_Bina_Marga_2024/FeatureServer/0/query" +
  "?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=2000&f=geojson";

const OFFICIAL_NAME = "Dinas Bina Marga DKI Jakarta — JPO Bina Marga 2024";
const OSM_NAME = "OpenStreetMap footway and pedestrian bridges";

export type OfficialJpoFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

export type OsmBridge = {
  id: number;
  nodes: number[];
  geometry: Coordinate[];
  tags: Record<string, string>;
};

type OfficialJpo = {
  id: string;
  name: string;
  kind: "jpo" | "skywalk";
  point: Coordinate;
  address: string | null;
  city: string | null;
  remark: string | null;
  updatedAt: string | null;
};

/** Fetch the official DKI Jakarta points. */
export async function fetchOfficialJpos(): Promise<OfficialJpoFeature[]> {
  const response = await fetch(OFFICIAL_URL, {
    headers: {
      "User-Agent": "daily-route/0.1 (Jakarta transit data pipeline)",
      Accept: "application/geo+json, application/json",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`The official JPO layer answered ${response.status}`);
  }
  const payload = (await response.json()) as { features?: OfficialJpoFeature[] };
  if (!Array.isArray(payload.features)) {
    throw new Error("The official JPO layer did not return features");
  }
  return payload.features;
}

/** Fetch spacing because the Overpass query is long. */
export const OSM_JPO_QUERY = `[out:json][timeout:280];
(
  way["highway"~"^(footway|pedestrian)$"]["bridge"](-6.7,106.4,-6.05,107.2);
  way["highway"~"^(footway|pedestrian)$"]["tunnel"](-6.7,106.4,-6.05,107.2);
  way["highway"~"^(footway|pedestrian)$"]["layer"~"^-"](-6.7,106.4,-6.05,107.2);
);
out body geom;`;

/** Convert the Overpass elements into the small bridge shape. */
export function osmBridgesOf(
  elements: readonly {
    type: string;
    id: number;
    nodes?: number[];
    geometry?: { lat: number; lon: number }[];
    tags?: Record<string, string>;
  }[],
): OsmBridge[] {
  return elements.flatMap((element) => {
    if (element.type !== "way" || !element.geometry || element.geometry.length < 2) return [];
    return [
      {
        id: element.id,
        nodes: element.nodes ?? [],
        geometry: element.geometry.map((point) => ({
          latitude: point.lat,
          longitude: point.lon,
        })),
        tags: element.tags ?? {},
      },
    ];
  });
}

/** Build the committed registry from the two raw sources. */
export function buildJpoDocument(input: {
  officialFeatures: readonly OfficialJpoFeature[];
  osmBridges: readonly OsmBridge[];
  network: TransitNetwork;
  officialRetrievedAt: string;
  osmRetrievedAt: string;
}): JpoDocument {
  const official = input.officialFeatures
    .map(officialOf)
    .filter((entry): entry is OfficialJpo => entry !== null);
  const stations = input.network.stations;
  const usedBridges = new Set<number>();
  const jpos: Jpo[] = [];

  for (const entry of official) {
    const match = nearestBridge(entry.point, input.osmBridges, usedBridges);
    if (match) usedBridges.add(match.bridge.id);
    const geometry = match ? simplifyPolyline(match.bridge.geometry, 0.003) : [];
    jpos.push({
      id: `jpo:${entry.id}`,
      name: entry.name,
      kind: entry.kind,
      source: "jakarta-bina-marga",
      official: true,
      city: entry.city,
      address: entry.address,
      remark: entry.remark,
      lengthM:
        geometry.length >= 2 ? Number((polylineLengthKm(geometry) * 1000).toFixed(0)) : null,
      geometry,
      startsAt: geometry[0] ?? null,
      endsAt: geometry[geometry.length - 1] ?? null,
      officialPoint: entry.point,
      stations: stationsNear(geometry, entry.point, stations),
      confidence: match ? "official-line" : "official-point",
      updatedAt: entry.updatedAt,
    });
  }

  for (const bridge of input.osmBridges) {
    if (usedBridges.has(bridge.id)) continue;
    const name = bridge.tags["name"] ?? "";
    const isNamed = /jpo|skywalk|penyeberangan|penyebrangan|busway/i.test(name);
    const linked = stationsNear(bridge.geometry, null, stations);
    if (!isNamed && linked.length === 0) continue;
    const geometry = simplifyPolyline(bridge.geometry, 0.003);
    if (geometry.length < 2) continue;
    const underpass =
      bridge.tags["tunnel"] !== undefined || (bridge.tags["layer"] ?? "").startsWith("-");
    jpos.push({
      id: `osm:way/${bridge.id}`,
      name: name.length > 0 ? name : underpass ? "Underpass" : "Footbridge",
      kind: underpass ? "underpass" : "footbridge",
      source: "osm",
      official: false,
      city: null,
      address: null,
      remark: bridge.tags["description"] ?? null,
      lengthM: Number((polylineLengthKm(geometry) * 1000).toFixed(0)),
      geometry,
      startsAt: geometry[0] ?? null,
      endsAt: geometry[geometry.length - 1] ?? null,
      officialPoint: null,
      stations: linked,
      confidence: "osm",
      updatedAt: input.osmRetrievedAt,
    });
  }

  jpos.sort((left, right) => left.id.localeCompare(right.id));

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      official: {
        name: OFFICIAL_NAME,
        url: OFFICIAL_URL.split("?")[0] ?? OFFICIAL_URL,
        retrievedAt: input.officialRetrievedAt,
        count: official.length,
      },
      osm: {
        name: OSM_NAME,
        licence: "ODbL 1.0",
        retrievedAt: input.osmRetrievedAt,
        count: input.osmBridges.length,
      },
    },
    jpos,
  };
}

/** Read the committed network, then write the registry. */
export async function writeJpoDocument(input: {
  officialFeatures: readonly OfficialJpoFeature[];
  osmBridges: readonly OsmBridge[];
  networkPath: string;
  outputPath: string;
  officialRetrievedAt: string;
  osmRetrievedAt: string;
}): Promise<JpoDocument> {
  const network = JSON.parse(await readFile(input.networkPath, "utf8")) as TransitNetwork;
  const document = buildJpoDocument({
    officialFeatures: input.officialFeatures,
    osmBridges: input.osmBridges,
    network,
    officialRetrievedAt: input.officialRetrievedAt,
    osmRetrievedAt: input.osmRetrievedAt,
  });
  await writeFile(input.outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return document;
}

function officialOf(feature: OfficialJpoFeature): OfficialJpo | null {
  const point = feature.geometry?.coordinates;
  if (!point || point.length < 2) return null;
  const properties = feature.properties;
  const id = stringOf(properties["NO_REG"]) ?? stringOf(properties["GLOBALID"]);
  const name =
    stringOf(properties["NAMOBJ"]) ??
    (stringOf(properties["ALAMAT"]) ? `JPO ${stringOf(properties["ALAMAT"])}` : null);
  if (!id || !name) return null;
  const rawType = stringOf(properties["TYPE"])?.toUpperCase() ?? "JPO";
  return {
    id,
    name,
    kind: rawType === "SKYWALK" ? "skywalk" : "jpo",
    point: { latitude: point[1], longitude: point[0] },
    address: stringOf(properties["ALAMAT"]),
    city: cityOf(stringOf(properties["WADMKK"])),
    remark: stringOf(properties["REMARK"]),
    updatedAt: dateOf(properties["LAST_EDITED_DATE"]),
  };
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function dateOf(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function cityOf(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/^Kota Adm\. /, "")
    .trim();
}

function nearestBridge(
  point: Coordinate,
  bridges: readonly OsmBridge[],
  used: ReadonlySet<number>,
): { bridge: OsmBridge; distanceKm: number } | null {
  let best: { bridge: OsmBridge; distanceKm: number } | null = null;
  for (const bridge of bridges) {
    if (used.has(bridge.id)) continue;
    const distanceKm = distanceToPathKm(bridge.geometry, point);
    if (!best || distanceKm < best.distanceKm) best = { bridge, distanceKm };
  }
  return best && best.distanceKm <= 0.08 ? best : null;
}

function stationsNear(
  geometry: readonly Coordinate[],
  fallback: Coordinate | null,
  stations: TransitNetwork["stations"],
): JpoStationLink[] {
  const line = geometry.length >= 2 ? geometry : fallback ? [fallback] : [];
  if (line.length === 0) return [];
  const links: JpoStationLink[] = [];
  for (const station of stations) {
    const point = { latitude: station.latitude, longitude: station.longitude };
    const distanceKm =
      line.length >= 2 ? distanceToPathKm(line, point) : haversine(line[0] as Coordinate, point);
    if (distanceKm > 0.12) continue;
    const first = line[0];
    const last = line[line.length - 1];
    if (!first || !last) continue;
    const startKm = haversine(first, point);
    const endKm = haversine(last, point);
    links.push({
      stationId: station.id,
      stationName: station.name,
      distanceM: Number((distanceKm * 1000).toFixed(0)),
      end: startKm <= endKm ? "start" : "end",
    });
  }
  return links.sort((left, right) => left.distanceM - right.distanceM).slice(0, 4);
}

function haversine(left: Coordinate, right: Coordinate): number {
  const earthKm = 6371.0088;
  const lat1 = (left.latitude * Math.PI) / 180;
  const lat2 = (right.latitude * Math.PI) / 180;
  const dLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const dLon = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthKm * Math.asin(Math.sqrt(a));
}
