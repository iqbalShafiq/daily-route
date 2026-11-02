/**
 * Fill the gaps in the committed network from the operator's GTFS feed.
 *
 * OpenStreetMap does not have a route relation for every Mikrotrans line, and
 * a route sheet alone is a schematic without coordinates. The operator's GTFS
 * feed is the source that has both: the stop sequence and the shape the
 * vehicle drives. This command only touches lines that have no stops or no
 * geometry; it does not replace a curated line that is already complete.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  haversineKm,
  platformId,
  serviceWindowsAreReliable,
  toFlatCoordinates,
  type Coordinate,
  type Line,
  type LineGeometry,
  type LineStop,
  type Station,
  type StationGroup,
} from "@daily-route/transit";

import { hasClampedRun, stopChainDistancesKm } from "../geometry.js";

type Snapshot = {
  generatedAt: string;
  sources: string[];
  systems: unknown[];
  lines: Line[];
  stations: Station[];
  lineStops: LineStop[];
  stationGroups: StationGroup[];
  lineGeometries: (LineGeometry & { stopDistancesKm?: number[] })[];
  fareRules: unknown;
  notes: string[];
};

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((entry) => entry.length === header.length)
    .map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index] ?? ""])));
}

function codeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(halte|sbr|simpang|jln|jl|gg|gang|stasiun|terminal)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type ServiceWindowRow = {
  days: number[];
  startMinute: number;
  endMinute: number;
  headwayMinutes: number;
  exactTimes?: boolean;
};

/**
 * Put the operator's service windows on the line.
 *
 * `frequencies.txt` is trip-based: one row says that a trip template runs
 * every N seconds between two times. The row is only useful together with
 * the trip's route, direction and calendar, so all four are joined here.
 */
function attachServiceWindows(
  snapshot: Snapshot,
  routes: readonly CsvRow[],
  trips: readonly CsvRow[],
  frequencies: readonly CsvRow[],
  calendar: readonly CsvRow[],
): void {
  const routeById = new Map(routes.map((route) => [route["route_id"] ?? "", route]));
  const tripById = new Map(trips.map((trip) => [trip["trip_id"] ?? "", trip]));
  const daysByService = new Map<string, number[]>();
  for (const row of calendar) {
    const id = row["service_id"] ?? "";
    if (!id) continue;
    const days: number[] = [];
    const names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    names.forEach((name, index) => {
      if (row[name] === "1") days.push(index + 1);
    });
    if (days.length > 0) daysByService.set(id, days);
  }

  const byCode = new Map<string, Map<"forward" | "backward", ServiceWindowRow[]>>();
  for (const row of frequencies) {
    const trip = tripById.get(row["trip_id"] ?? "");
    if (!trip) continue;
    const route = routeById.get(trip["route_id"] ?? "");
    if (!route) continue;
    const code = codeKey(route["route_short_name"] ?? "");
    if (!code) continue;
    const days = daysByService.get(trip["service_id"] ?? "");
    if (!days || days.length === 0) continue;
    const startMinute = clockMinute(row["start_time"] ?? "");
    const endMinute = clockMinute(row["end_time"] ?? "");
    const headwayMinutes = Math.max(1, Math.round(Number(row["headway_secs"]) / 60));
    if (startMinute === null || endMinute === null || endMinute <= startMinute) continue;
    const direction = trip["direction_id"] === "1" ? "backward" : "forward";
    const directions = byCode.get(code) ?? new Map<"forward" | "backward", ServiceWindowRow[]>();
    const list = directions.get(direction) ?? [];
    list.push({
      days: [...new Set(days)].sort((a, b) => a - b),
      startMinute,
      endMinute,
      headwayMinutes,
      ...(row["exact_times"] === "1" ? { exactTimes: true } : {}),
    });
    directions.set(direction, list);
    byCode.set(code, directions);
  }

  for (const line of snapshot.lines) {
    if (line.systemId !== "transjakarta") continue;
    const directions = byCode.get(codeKey(line.code));
    if (!directions) continue;
    const byDirection: Partial<Record<"forward" | "backward", ServiceWindowRow[]>> = {};
    const reliableByDirection: Partial<Record<"forward" | "backward", boolean>> = {};
    for (const [direction, rows] of directions) {
      const windows: ServiceWindowRow[] = [];
      for (const row of rows) {
        if (!windows.some((entry) => sameWindow(entry, row))) windows.push(row);
      }
      if (windows.length === 0) continue;
      byDirection[direction] = windows;
      const span = Math.max(
        0,
        ...windows.map((window) => window.endMinute - window.startMinute),
      );
      const headways = windows.map((window) => window.headwayMinutes).sort((a, b) => a - b);
      const median = headways[Math.floor(headways.length / 2)] ?? 0;
      // A single row can be a complete schedule (7R: 05:00-06:00, 30-minute
      // headway, two published departures), but a row of one trip every
      // half-day is a template artefact. The shared rule trusts a plausible
      // one-row window and keeps the stricter multi-row rule.
      reliableByDirection[direction] =
        serviceWindowsAreReliable(windows, line.metadata?.["oneWay"] === true) ||
        (windows.length >= 2 && span >= 240 && median > 0 && median <= 90);
    }
    if (Object.keys(byDirection).length === 0) continue;
    line.metadata = {
      ...(line.metadata ?? {}),
      service: {
        source: "gtfs",
        timezone: "Asia/Jakarta",
        byDirection,
        reliableByDirection,
        updatedAt: new Date().toISOString(),
      },
    };
  }
}

function sameWindow(a: ServiceWindowRow, b: ServiceWindowRow): boolean {
  return (
    a.startMinute === b.startMinute &&
    a.endMinute === b.endMinute &&
    a.headwayMinutes === b.headwayMinutes &&
    a.days.join(",") === b.days.join(",")
  );
}

function clockMinute(value: string): number | null {
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

async function main(): Promise<void> {
  const root = process.env["INIT_CWD"] ?? process.cwd();
  const gtfsDir = process.argv[2] ?? join(root, "data", "gtfs");
  const snapshotPath = join(root, "data", "transit-network.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as Snapshot;

  const routes = parseCsv(await readFile(join(gtfsDir, "routes.txt"), "utf8"));
  const stops = parseCsv(await readFile(join(gtfsDir, "stops.txt"), "utf8"));
  const trips = parseCsv(await readFile(join(gtfsDir, "trips.txt"), "utf8"));
  const stopTimes = parseCsv(await readFile(join(gtfsDir, "stop_times.txt"), "utf8"));
  const shapeRows = parseCsv(await readFile(join(gtfsDir, "shapes.txt"), "utf8"));
  const frequencyRows = parseCsv(await readFile(join(gtfsDir, "frequencies.txt"), "utf8"));
  const calendarRows = parseCsv(await readFile(join(gtfsDir, "calendar.txt"), "utf8"));

  const routeByCode = new Map<string, CsvRow>();
  for (const route of routes) routeByCode.set(codeKey(route["route_short_name"] ?? ""), route);
  const stopById = new Map(stops.map((stop) => [stop["stop_id"] ?? "", stop]));
  const timesByTrip = new Map<string, CsvRow[]>();
  for (const time of stopTimes) {
    const id = time["trip_id"] ?? "";
    const list = timesByTrip.get(id) ?? [];
    list.push(time);
    timesByTrip.set(id, list);
  }
  for (const list of timesByTrip.values()) {
    list.sort((a, b) => Number(a["stop_sequence"]) - Number(b["stop_sequence"]));
  }
  const tripsByRoute = new Map<string, CsvRow[]>();
  for (const trip of trips) {
    const id = trip["route_id"] ?? "";
    const list = tripsByRoute.get(id) ?? [];
    list.push(trip);
    tripsByRoute.set(id, list);
  }
  const shapeById = new Map<string, CsvRow[]>();
  for (const point of shapeRows) {
    const id = point["shape_id"] ?? "";
    const list = shapeById.get(id) ?? [];
    list.push(point);
    shapeById.set(id, list);
  }
  for (const list of shapeById.values()) {
    list.sort((a, b) => Number(a["shape_pt_sequence"]) - Number(b["shape_pt_sequence"]));
  }

  const stations = snapshot.stations;
  const byName = new Map<string, Station[]>();
  const byId = new Map(stations.map((station) => [station.id, station]));
  for (const station of stations) {
    if (station.systemId !== "transjakarta") continue;
    const key = nameKey(station.name);
    const list = byName.get(key) ?? [];
    list.push(station);
    byName.set(key, list);
  }

  const createdStations: Station[] = [];
  const stationForGtfs = (stopId: string): Station | null => {
    const stop = stopById.get(stopId);
    if (!stop) return null;
    const latitude = Number(stop["stop_lat"]);
    const longitude = Number(stop["stop_lon"]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const name = (stop["stop_name"] ?? "").trim() || `GTFS ${stopId}`;
    const key = nameKey(name);
    const candidates = key.length >= 3 ? (byName.get(key) ?? []) : [];
    if (candidates.length > 0) {
      const first = candidates[0];
      if (!first) return null;
      let best = first;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const distance = haversineKm(
          { latitude, longitude },
          { latitude: candidate.latitude, longitude: candidate.longitude },
        );
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      // A name match more than two kilometres away is a different place
      // with the same label; creating a suffix would split the stop, so the
      // unique constraint wins and the existing place is used only nearby.
      if (bestDistance <= 2) return best;
    }
    const existingId = `transjakarta:gtfs-${stopId.toLowerCase()}`;
    const existing = byId.get(existingId);
    if (existing) return existing;
    // `stations` has a unique (system, name) key. A same-named place that
    // is far away is a different stop; keep its GTFS id in the label so the
    // insert does not collide with the existing place.
    let uniqueName = name;
    if (stations.some((candidate) => candidate.systemId === "transjakarta" && nameKey(candidate.name) === key)) {
      uniqueName = `${name} (${stopCodeOf(stop) || stopId})`;
    }
    const station: Station = {
      id: existingId,
      systemId: "transjakarta",
      name: uniqueName,
      code: stopCodeOf(stop),
      latitude,
      longitude,
      stationType: "stop",
      zone: null,
      isInterchange: false,
      description: "",
      area: null,
      aliases: [],
    };
    stations.push(station);
    byId.set(station.id, station);
    createdStations.push(station);
    if (key.length >= 3) {
      const list = byName.get(key) ?? [];
      list.push(station);
      byName.set(key, list);
    }
    return station;
  };

  const replacedLines: string[] = [];
  const report: { code: string; stops: number; geometry: boolean; reason?: string }[] = [];

  for (const line of snapshot.lines) {
    if (line.systemId !== "transjakarta" || line.status !== "operating") continue;
    const hasStops = snapshot.lineStops.some((stop) => stop.lineId === line.id);
    // This pass is for lines with no stop list at all. A line that already
    // has curated stops is left alone; its stops are the reviewed source.
    if (hasStops) continue;
    const route = routeByCode.get(codeKey(line.code));
    if (!route) {
      report.push({ code: line.code, stops: 0, geometry: false, reason: "no GTFS route" });
      continue;
    }
    const routeTrips = tripsByRoute.get(route["route_id"] ?? "") ?? [];
    const directions: { direction: "forward" | "backward"; trip: CsvRow }[] = [];
    for (const [directionId, direction] of [
      ["0", "forward"],
      ["1", "backward"],
    ] as const) {
      const candidates = routeTrips
        .filter((trip) => trip["direction_id"] === directionId && (timesByTrip.get(trip["trip_id"] ?? "")?.length ?? 0) >= 2)
        .sort((a, b) => (timesByTrip.get(b["trip_id"] ?? "")?.length ?? 0) - (timesByTrip.get(a["trip_id"] ?? "")?.length ?? 0));
      const trip = candidates[0];
      if (trip) directions.push({ direction, trip });
    }
    if (directions.length === 0) {
      report.push({ code: line.code, stops: 0, geometry: false, reason: "no GTFS trip" });
      continue;
    }

    const lineStops: LineStop[] = [];
    const geometries: (LineGeometry & { stopDistancesKm?: number[] })[] = [];
    let rejected = "";
    for (const { direction, trip } of directions) {
      const times = timesByTrip.get(trip["trip_id"] ?? "") ?? [];
      const shape = shapeById.get(trip["shape_id"] ?? "") ?? [];
      const points: Coordinate[] = shape.map((point) => ({
        latitude: Number(point["shape_pt_lat"]),
        longitude: Number(point["shape_pt_lon"]),
      })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
      const cumulative: number[] = [0];
      for (let index = 1; index < points.length; index += 1) {
        const previousPoint = points[index - 1];
        const point = points[index];
        const distance =
          previousPoint && point ? haversineKm(previousPoint, point) : 0;
        cumulative.push((cumulative[index - 1] ?? 0) + distance);
      }
      const lengthKm = cumulative[cumulative.length - 1] ?? 0;

      // The nearest shape vertex for each stop, kept monotonic along the
      // direction of travel. A trip whose shape starts at the other end of
      // the line would give every stop the same offset near the end.
      const offsets: number[] = [];
      const stopPoints: { latitude: number; longitude: number }[] = [];
      let lastOffset = 0;
      for (const time of times) {
        const stop = stopById.get(time["stop_id"] ?? "");
        if (!stop) continue;
        const latitude = Number(stop["stop_lat"]);
        const longitude = Number(stop["stop_lon"]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        let best = lastOffset;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let pointIndex = lastOffset; pointIndex < points.length; pointIndex += 1) {
          const point = points[pointIndex];
          if (!point) continue;
          const distance = haversineKm({ latitude, longitude }, point);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = pointIndex;
          }
        }
        offsets.push(best);
        stopPoints.push({ latitude, longitude });
        lastOffset = best;
      }
      if (offsets.length < 2) {
        rejected = `${direction}: too few stops`;
        continue;
      }
      const firstOffset = offsets[0] ?? 0;
      const lastOffsetKm = offsets[offsets.length - 1] ?? 0;
      const firstKm = firstOffset === 0 ? 0 : cumulative[firstOffset] ?? 0;
      const lastKm = cumulative[lastOffsetKm] ?? 0;
      const monotonic = offsets.every(
        (offset, index) => index === 0 || offset >= (offsets[index - 1] ?? 0),
      );
      if (points.length >= 2 && (!monotonic || firstKm > 2 || lastKm < 1)) {
        rejected = `${direction}: shape does not follow the stop order`;
        continue;
      }

      // The shape can be a loop, or stop short of the last stops. When the
      // projection collapses, the distance follows the stops instead of
      // staying at the last point of the shape.
      const chains = hasClampedRun(offsets, stopPoints)
        ? stopChainDistancesKm(stopPoints)
        : null;

      let position = 0;
      for (const time of times) {
        const stop = stopById.get(time["stop_id"] ?? "");
        if (!stop) continue;
        const station = stationForGtfs(time["stop_id"] ?? "");
        if (!station) continue;
        position += 1;
        const offset = offsets[position - 1] ?? 0;
        const platformLatitude = Number(stop["stop_lat"]);
        const platformLongitude = Number(stop["stop_lon"]);
        lineStops.push({
          lineId: line.id,
          stationId: station.id,
          direction,
          position,
          distanceFromOriginKm: Number(
            (chains ? (chains[position - 1] ?? 0) : points.length > 0 ? cumulative[offset] ?? 0 : 0).toFixed(3),
          ),
          ...(Number.isFinite(platformLatitude) && Number.isFinite(platformLongitude)
            ? {
                platform: {
                  id: platformId(station.id, platformLatitude, platformLongitude),
                  name: stop["stop_name"] ?? station.name,
                  latitude: platformLatitude,
                  longitude: platformLongitude,
                  code: stopCodeOf(stop),
                },
              }
            : {}),
        });
      }
      if (points.length >= 2) {
        geometries.push({
          lineId: line.id,
          direction,
          coordinates: toFlatCoordinates(points),
          stopOffsets: offsets,
          stopDistancesKm:
            chains ?? offsets.map((offset) => Number((cumulative[offset] ?? 0).toFixed(3))),
          lengthKm: Number(lengthKm.toFixed(3)),
        });
        line.lengthKm = Number(lengthKm.toFixed(3));
      }
    }
    if (rejected && lineStops.length === 0) {
      report.push({ code: line.code, stops: 0, geometry: false, reason: rejected });
      continue;
    }
    if (lineStops.length < 2) {
      report.push({ code: line.code, stops: lineStops.length, geometry: false, reason: "too few matched stops" });
      continue;
    }
    snapshot.lineStops = snapshot.lineStops.filter((stop) => stop.lineId !== line.id);
    snapshot.lineStops.push(...lineStops);
    snapshot.lineGeometries = snapshot.lineGeometries.filter((geometry) => geometry.lineId !== line.id);
    snapshot.lineGeometries.push(...geometries);
    replacedLines.push(line.id);
    report.push({ code: line.code, stops: lineStops.length, geometry: geometries.length > 0 });
  }

  // 8A is a Sunday/CFD route that has no OSM relation and no curated line in
  // the snapshot. It must be a separate line, not a pattern of 8; without
  // this pass `data:ingest` would leave the committed 8A patterns pointing
  // at a line that no longer exists.
  if (!snapshot.lines.some((line) => line.code === "8A")) {
    const route = routeByCode.get("8A");
    const routeTrips = route ? (tripsByRoute.get(route["route_id"] ?? "") ?? []) : [];
    const trip = routeTrips.find((candidate) => candidate["shape_id"] === "8A-R03_shp")
      ?? routeTrips.find((candidate) => (timesByTrip.get(candidate["trip_id"] ?? "")?.length ?? 0) >= 2);
    const times = trip ? (timesByTrip.get(trip["trip_id"] ?? "") ?? []) : [];
    const shape = trip ? (shapeById.get(trip["shape_id"] ?? "") ?? []) : [];
    const points: Coordinate[] = shape
      .map((point) => ({ latitude: Number(point["shape_pt_lat"]), longitude: Number(point["shape_pt_lon"]) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    const stationsForTrip = times
      .map((time) => ({ time, station: stationForGtfs(time["stop_id"] ?? "") }))
      .filter((entry): entry is { time: CsvRow; station: Station } => entry.station !== null);
    if (trip && points.length >= 2 && stationsForTrip.length >= 2) {
      const lineId = "transjakarta:8a";
      const cumulative: number[] = [0];
      for (let index = 1; index < points.length; index += 1) {
        const previousPoint = points[index - 1];
        const point = points[index];
        cumulative.push((cumulative[index - 1] ?? 0) + (previousPoint && point ? haversineKm(previousPoint, point) : 0));
      }
      const makeStops = (direction: "forward" | "backward", ordered: typeof stationsForTrip, coordinates: Coordinate[]) => {
        const offsets: number[] = [];
        let last = 0;
        for (const entry of ordered) {
          let best = last;
          let bestDistance = Number.POSITIVE_INFINITY;
          for (let pointIndex = last; pointIndex < coordinates.length; pointIndex += 1) {
            const point = coordinates[pointIndex];
            if (!point) continue;
            const distance = haversineKm(entry.station, point);
            if (distance < bestDistance) { bestDistance = distance; best = pointIndex; }
          }
          offsets.push(best);
          last = best;
        }
        const cumulativeFor = [0];
        for (let index = 1; index < coordinates.length; index += 1) {
          const previousPoint = coordinates[index - 1];
          const point = coordinates[index];
          cumulativeFor.push(
            (cumulativeFor[index - 1] ?? 0) +
              (previousPoint && point ? haversineKm(previousPoint, point) : 0),
          );
        }
        const distances = offsets.map((offset) => Number((cumulativeFor[offset] ?? 0).toFixed(3)));
        return {
          stops: ordered.map((entry, index) => ({
            lineId,
            stationId: entry.station.id,
            direction,
            position: index + 1,
            distanceFromOriginKm: distances[index] ?? 0,
          })),
          geometry: {
            lineId,
            direction,
            coordinates: toFlatCoordinates(coordinates),
            stopOffsets: offsets,
            stopDistancesKm: distances,
            lengthKm: Number((cumulativeFor[cumulativeFor.length - 1] ?? 0).toFixed(3)),
          },
        };
      };
      const forward = makeStops("forward", stationsForTrip, points);
      const backward = makeStops("backward", [...stationsForTrip].reverse(), [...points].reverse());
      const line: Line = {
        id: lineId,
        systemId: "transjakarta",
        code: "8A",
        name: "Jelambar - Juanda",
        mode: "bus",
        serviceClass: "brt",
        operator: "PT Transportasi Jakarta",
        status: "operating",
        color: null,
        lengthKm: forward.geometry.lengthKm,
        description: "Sunday and car-free-day service; not a weekday alignment of corridor 8.",
        aliases: ["Jelambar → Juanda", "Juanda – Jelambar"],

      };
      snapshot.lines.push(line);
      snapshot.lineStops.push(...forward.stops, ...backward.stops);
      snapshot.lineGeometries.push(forward.geometry, backward.geometry);
      replacedLines.push(lineId);
      report.push({ code: "8A", stops: forward.stops.length, geometry: true });
    }
  }

  snapshot.generatedAt = new Date().toISOString();
  const enriched = enrichPlatformCodes(snapshot, stops);
  attachServiceWindows(snapshot, routes, trips, frequencyRows, calendarRows);

await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`· ${enriched} platform codes filled from GTFS`);
  console.log(`· ${replacedLines.length} lines filled from GTFS`);
  console.log(`· ${createdStations.length} new stations`);
  console.log(`· ${report.filter((entry) => entry.reason).length} lines still missing a source`);
  for (const entry of report.filter((item) => item.reason)) {
    console.log(`  ! ${entry.code}: ${entry.reason}`);
  }
}

await main();

/** The rider-facing code: `platform_code` is a bay, `stop_code` a stop. */
function stopCodeOf(row: CsvRow): string | null {
  const code = (row["platform_code"] || row["stop_code"] || "").trim();
  return code.length > 0 ? code : null;
}

/**
 * Fill a platform code from the operator's GTFS stops.
 *
 * The feed names a bay (`platform_code`) for many stops that our OSM-derived
 * platform does not carry. A code is copied only when the GTFS stop is within
 * 12 m, or within 30 m and carries the same name; a nearby but differently
 * named stop is another place, and is left alone.
 */
function enrichPlatformCodes(snapshot: Snapshot, stops: CsvRow[]): number {
  const candidates = stops.flatMap((row) => {
    const code = stopCodeOf(row);
    const latitude = Number(row["stop_lat"]);
    const longitude = Number(row["stop_lon"]);
    if (!code || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ code, latitude, longitude, name: normalizeName(row["stop_name"] ?? "") }];
  });
  const buckets = new Map<string, typeof candidates>();
  const bucketKey = (latitude: number, longitude: number): string =>
    `${Math.floor(latitude * 1_000)}:${Math.floor(longitude * 1_000)}`;
  for (const candidate of candidates) {
    const key = bucketKey(candidate.latitude, candidate.longitude);
    const list = buckets.get(key) ?? [];
    list.push(candidate);
    buckets.set(key, list);
  }

  let updated = 0;
  for (const stop of snapshot.lineStops) {
    const platform = stop.platform;
    if (!platform || platform.code) continue;
    const lat = Math.floor(platform.latitude * 1_000);
    const lon = Math.floor(platform.longitude * 1_000);
    const name = normalizeName(platform.name);
    let best: { code: string; distance: number } | null = null;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (const candidate of buckets.get(`${lat + dy}:${lon + dx}`) ?? []) {
          const distance = haversineKm(platform, candidate);
          const sameName =
            name.length > 0 &&
            (candidate.name === name ||
              candidate.name.includes(name) ||
              name.includes(candidate.name));
          const accepted = distance <= 0.012 || (distance <= 0.03 && sameName);
          if (accepted && (!best || distance < best.distance)) {
            best = { code: candidate.code, distance };
          }
        }
      }
    }
    if (best) {
      platform.code = best.code;
      updated += 1;
    }
  }
  return updated;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(halte|stasiun|terminal|stop|station)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
