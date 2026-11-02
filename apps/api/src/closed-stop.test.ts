import { afterAll, describe, expect, it } from "vitest";

import { createDb, loadNetwork } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import {
  blocksJourney,
  matchDisruptions,
  planRoutes,
  stopsWithinWalk,
  type Disruption,
} from "@daily-route/transit";

/**
 * A closed halte is not a closed corridor.
 *
 * The cases are found in the loaded network rather than written down, so the
 * test follows the data: a stop in the middle of a line is closed, and the
 * journeys before it, through it and to it are judged.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);

const network = await loadNetwork(db);
afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

/**
 * A stretch of one corridor that the planner actually uses.
 *
 * The first corridor in the snapshot is not necessarily the one the
 * planner chooses between the two ends, so the stretch is found by
 * planning: the origin, the closed stop and the destination have to be
 * on the same journey.
 */
function scenario(): {
  lineId: string;
  origin: string;
  closed: string;
  destination: string;
} {
  for (const line of network.lines) {
    if (line.status !== "operating" || line.systemId !== "transjakarta") continue;
    const unique = [
      ...new Set(
        network.lineStops
          .filter((stop) => stop.lineId === line.id && stop.direction === "forward")
          .sort((left, right) => left.position - right.position)
          .map((stop) => stop.stationId),
      ),
    ];
    for (let index = 0; index + 4 < unique.length; index += 1) {
      const origin = unique[index];
      const closed = unique[index + 2];
      const destination = unique[index + 4];
      if (!origin || !closed || !destination) continue;
      const trips = planRoutes(network, origin, destination);
      const primary = trips[0];
      if (!primary) continue;
      const passes = primary.legs.some((leg) =>
        leg.stops.some((stop) => stop.stationId === closed),
      );
      if (passes) return { lineId: line.id, origin, closed, destination };
    }
  }
  throw new Error("No corridor on the snapshot passes a stop in the middle.");
}

function closure(stationId: string, lineId: string): Disruption {
  return {
    id: "closed-stop-fixture",
    source: "x:fixture_transjakarta",
    sourceType: "social",
    systemId: "transjakarta",
    lineId,
    stationId,
    stationGroupId: null,
    severity: "warning",
    status: "active",
    kind: "closure",
    title: "Halte ditutup",
    body: "",
    url: null,
    confidence: 1,
    publishedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    resolvedAt: null,
    affectedStationIds: [stationId],
    affectedLineIds: [lineId],
    scope: "stop",
    lineCodes: [],
    roads: [],
  };
}

describe("a closed stop on a corridor", () => {
  const { lineId, origin, closed, destination } = scenario();
  const notice = closure(closed, lineId);

  it("does not block a journey that only passes the closed stop", () => {
    const trips = planRoutes(network, origin, destination);
    expect(trips.length).toBeGreaterThan(0);
    const matches = matchDisruptions(trips[0]!, [notice]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => !blocksJourney(match))).toBe(true);
    expect(matches[0]?.role).toBe("pass-through");
  });

  it("blocks a journey that alights at the closed stop", () => {
    const trips = planRoutes(network, origin, closed);
    expect(trips.length).toBeGreaterThan(0);
    const matches = matchDisruptions(trips[0]!, [notice]);
    const blocking = matches.filter((match) => blocksJourney(match));
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking[0]?.role).toBe("destination");
  });

  it("offers a stop to walk to instead", () => {
    const closedStation = network.stations.find((station) => station.id === closed);
    expect(closedStation).toBeDefined();
    if (!closedStation) return;
    const nearby = stopsWithinWalk(network, closedStation, {
      maxKm: 1,
      limit: 3,
      exclude: new Set([closedStation.id]),
    });
    expect(nearby.length).toBeGreaterThan(0);
    const replacement = planRoutes(network, origin, nearby[0]?.station.id ?? "");
    expect(replacement.length).toBeGreaterThan(0);
  });
});
