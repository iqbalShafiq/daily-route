import { bboxClause, overpass, type OverpassElement } from "./overpass.js";
import { systemForRelation, type SystemId } from "./classify.js";
import { appendWay, type Coordinate } from "./geometry.js";

/**
 * Extraction of the transit network from OpenStreetMap.
 *
 * OSM models a transit line as a *route relation* whose members are the
 * stops in travel order, plus the ways that carry the geometry. That ordered
 * member list is exactly what a router needs, which is why OSM — and not the
 * operators' own websites, none of which publish a machine-readable feed — is
 * the backbone of this dataset.
 */

export type OsmStop = {
  nodeId: number;
  name: string;
  latitude: number;
  longitude: number;
  /** The operator's own code for the stop, e.g. "NS08" or "1-3". */
  code: string | null;
  /** The routes that serve this stop, from the `route_ref` tag. */
  routeRefs: string[];
  tags: Record<string, string>;
  wikidata: string | null;
  wikipedia: string | null;
};

export type OsmRoute = {
  relationId: number;
  systemId: SystemId;
  /** The route code, e.g. "1", "JAK.06", "C", "NS". */
  code: string;
  /** The raw relation name, which carries the service class. */
  rawName: string;
  /** The human route name without the class prefix, e.g. "Blok M → Kali Besar". */
  routeName: string;
  from: string | null;
  to: string | null;
  via: string | null;
  colour: string | null;
  operator: string | null;
  stops: OsmStop[];
  /** The path the vehicles travel, in order. */
  polyline: Coordinate[];
  /** The index in the polyline of every stop, by OpenStreetMap node id. */
  stopOffsets: Map<number, number>;
};

/**
 * The route relations of every system this platform covers.
 *
 * The query asks for the geometry (`out geom`), because the ways of a
 * relation are what the vehicles actually travel on. The bus relations are
 * fetched separately from the rail ones: the bus payload is large, and two
 * smaller responses are more reliable than one big one.
 */
const ROUTE_QUERIES = [
  `[out:json][timeout:280];
relation["type"="route"]["route"="bus"]["network"~"Transjakarta|Trans Jakarta"]${bboxClause()};
out geom;`,
  `[out:json][timeout:280];
(
  relation["type"="route"]["route"="subway"]${bboxClause()};
  relation["type"="route"]["route"="light_rail"]${bboxClause()};
  relation["type"="route"]["route"="train"]["network"~"KAI|KAI Commuter"]${bboxClause()};
);
out geom;`,
];

/** The text the route-relation cache is named after. */
export const ROUTE_QUERY_FINGERPRINT = ROUTE_QUERIES.join("\n");

/** Fetch every route relation of interest, with its geometry. */
export async function fetchRouteRelations(): Promise<OverpassElement[]> {
  const elements: OverpassElement[] = [];
  for (const query of ROUTE_QUERIES) {
    elements.push(...(await overpass(query, { attemptsPerEndpoint: 3 })));
  }
  return elements;
}

/**
 * Fetch the nodes of a list of ids.
 *
 * Overpass accepts many ids in one statement; the chunk size keeps the
 * request string within the server's URL limits.
 */
export async function fetchNodes(nodeIds: readonly number[]): Promise<Map<number, OverpassElement>> {
  const map = new Map<number, OverpassElement>();
  const unique = [...new Set(nodeIds)];
  const chunkSize = 2000;

  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const elements = await overpass(`[out:json][timeout:280];node(id:${chunk.join(",")});out body;`);
    for (const element of elements) {
      map.set(element.id, element);
    }
  }

  return map;
}

/** Stop members of a relation, in travel order. */
function stopMembers(relation: OverpassElement): number[] {
  return (relation.members ?? [])
    .filter((member) => member.type === "node" && member.role === "stop")
    .map((member) => member.ref);
}

/**
 * Platform members of a relation, in travel order.
 *
 * A platform carries the shelter, the `route_ref` list and the official stop
 * name, so it is preferred over the bare stop position whenever it exists.
 */
function platformMembers(relation: OverpassElement): number[] {
  return (relation.members ?? [])
    .filter((member) => member.type === "node" && member.role.startsWith("platform"))
    .map((member) => member.ref);
}

/** Turn a relation plus its stop nodes into an `OsmRoute`. */
export function toOsmRoute(
  relation: OverpassElement,
  nodes: Map<number, OverpassElement>,
): OsmRoute | null {
  const tags = relation.tags ?? {};
  const systemId = systemForRelation(tags);
  if (!systemId) return null;

  const code = (tags["ref"] ?? "").trim();
  const rawName = (tags["name"] ?? "").trim();
  if (!code && !rawName) return null;

  const platforms = platformMembers(relation);
  const stops = stopMembers(relation);
  // Some relations only list platforms, others only stop positions.
  const orderedIds = stops.length > 0 ? stops : platforms;

  const resolved: OsmStop[] = [];
  orderedIds.forEach((nodeId, index) => {
    const node = nodes.get(nodeId);
    if (!node || node.lat === undefined || node.lon === undefined) return;
    const nodeTags = node.tags ?? {};
    const name =
      nodeTags["name"] ??
      nodeTags["name:id"] ??
      nodeTags["ref"] ??
      `Stop ${index + 1}`;
    resolved.push({
      nodeId,
      name,
      latitude: node.lat,
      longitude: node.lon,
      code: nodeTags["ref"] ?? null,
      routeRefs: splitRefs(nodeTags["route_ref"]),
      tags: nodeTags,
      wikidata: nodeTags["wikidata"] ?? null,
      wikipedia: nodeTags["wikipedia"] ?? null,
    });
  });

  // The members are walked in order, because that order is the path: the
  // ways are the road, and a stop member says where along it the vehicle
  // stops. Walking them together yields the polyline and the offset of
  // every stop in one pass.
  const polyline: Coordinate[] = [];
  const stopOffsets = new Map<number, number>();
  const stopByNodeId = new Map(resolved.map((stop) => [stop.nodeId, stop]));

  for (const member of relation.members ?? []) {
    if (member.type === "way" && member.geometry && member.geometry.length > 0) {
      appendWay(
        polyline,
        member.geometry.map((point) => ({ latitude: point.lat, longitude: point.lon })),
      );
      continue;
    }
    if (member.type === "node" && member.role === "stop") {
      if (!stopByNodeId.has(member.ref)) continue;
      stopOffsets.set(member.ref, Math.max(0, polyline.length - 1));
    }
  }

  return {
    relationId: relation.id,
    systemId,
    code,
    rawName,
    routeName: stripClassPrefix(rawName),
    from: tags["from"] ?? null,
    to: tags["to"] ?? null,
    via: tags["via"] ?? null,
    colour: tags["colour"] ?? null,
    operator: tags["operator"] ?? null,
    stops: resolved,
    polyline,
    stopOffsets,
  };
}

function splitRefs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Remove the service-class prefix from a relation name.
 *
 * "Metrotrans 5F: Masjid Jami Al Makmur → Stasiun Tebet" becomes
 * "Masjid Jami Al Makmur → stasiun Tebet".
 */
export function stripClassPrefix(rawName: string): string {
  const withoutPrefix = rawName.replace(
    /^(mikrotrans|metrotrans|royaltrans|minitrans|amari|bus wisata|transjabodetabek|transjakarta)\s*(brt\s*)?[A-Z0-9.]*\s*:?\s*/i,
    "",
  );
  return withoutPrefix.trim() || rawName.trim();
}

/**
 * Rail stations that are not part of any route relation.
 *
 * Some KRL stations are mapped but never referenced by a route relation;
 * they still belong in the network as places a rider can board.
 */
export async function fetchUnlinkedRailStations(): Promise<OverpassElement[]> {
  return overpass(
    `[out:json][timeout:280];
(
  node["railway"="station"]["network"~"KAI|KAI Commuter|MRT Jakarta|LRT Jakarta|Jabodebek LRT"]${bboxClause()};
  node["railway"="halt"]["network"~"KAI|KAI Commuter|MRT Jakarta|LRT Jakarta|Jabodebek LRT"]${bboxClause()};
);
out body;`,
  );
}
