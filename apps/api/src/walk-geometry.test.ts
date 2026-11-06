import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchWalkingRoute: vi.fn() }));

vi.mock("./routes/walk.js", () => ({
  fetchWalkingRoute: mocks.fetchWalkingRoute,
}));

const { followStreets } = await import("./routes/routes.js");

/**
 * The line on the map is the path a person can walk.
 *
 * The planner stores a walk as two points because it measures the distance
 * between them. The API asks the pedestrian router for the road between
 * them, and a router that has no answer must leave no line at all. A
 * straight line across a block would be a path that does not exist.
 */

const from = { latitude: -6.1952, longitude: 106.8211 };
const to = { latitude: -6.194, longitude: 106.823 };
const routed = [
  from,
  { latitude: -6.195, longitude: 106.822 },
  { latitude: -6.1944, longitude: 106.8226 },
  to,
];

function walkItinerary(geometry: { latitude: number; longitude: number }[]) {
  return {
    geometry,
    legs: [
      {
        kind: "walk" as const,
        geometry,
        distanceKm: 0.2,
      },
    ],
  };
}

beforeEach(() => {
  mocks.fetchWalkingRoute.mockReset();
});

describe("followStreets", () => {
  it("follows the pedestrian path instead of the straight line", async () => {
    mocks.fetchWalkingRoute.mockResolvedValue({
      distanceKm: 0.24,
      durationMinutes: 4,
      steps: [],
      geometry: routed,
    });

    const result = await followStreets(walkItinerary([from, to]));

    expect(result.legs[0]?.geometry).toEqual(routed);
    expect(result.geometry).toEqual(routed);
    expect(mocks.fetchWalkingRoute).toHaveBeenCalledWith(from, to);
  });

  it("leaves no line when the pedestrian router has no path", async () => {
    mocks.fetchWalkingRoute.mockResolvedValue(null);

    const result = await followStreets(walkItinerary([from, to]));

    expect(result.legs[0]?.geometry).toEqual([]);
    expect(result.geometry).toEqual([]);
  });

  it("keeps a path the router already drew", async () => {
    const result = await followStreets(walkItinerary(routed));

    expect(result.legs[0]?.geometry).toEqual(routed);
    expect(mocks.fetchWalkingRoute).not.toHaveBeenCalled();
  });

  it("keeps a two-point path that the router drew for an access walk", async () => {
    const result = await followStreets({
      legs: [
        {
          kind: "walk" as const,
          geometry: [from, to],
          distanceKm: 0.2,
          geometryRouted: true,
        },
      ],
    });

    expect(result.legs[0]?.geometry).toEqual([from, to]);
    expect(mocks.fetchWalkingRoute).not.toHaveBeenCalled();
  });

  it("joins a walk the router snapped away from the stop", async () => {
    // The pedestrian router put the start of the walk 50 m south of the
    // station, on the nearest footpath. The ride ends at the station, so
    // the dashed walk used to begin 50 m away from the train line.
    const snapped = [
      { latitude: -6.19565, longitude: 106.8211 },
      { latitude: -6.195, longitude: 106.822 },
      to,
    ];
    mocks.fetchWalkingRoute.mockResolvedValue({
      distanceKm: 0.24,
      durationMinutes: 4,
      steps: [],
      geometry: snapped,
    });

    const result = await followStreets(walkItinerary([from, to]));

    expect(result.legs[0]?.geometry[0]).toEqual(from);
    expect(result.legs[0]?.geometry.at(-1)).toEqual(to);
    expect(result.geometry[0]).toEqual(from);
  });
});
