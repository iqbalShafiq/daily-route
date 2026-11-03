import { describe, expect, it } from "vitest";

import { searchPlaces, type FetchLike } from "./geocode.js";

/**
 * The place search, without the two public indexes.
 *
 * The shape is what the tests check: Photon answers a name that is still
 * being typed, Nominatim fills an address, and the same place from both
 * is one row.
 */

function json(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function photonFeature(
  name: string,
  value: string,
  latitude: number,
  longitude: number,
  street?: string,
) {
  return {
    geometry: { coordinates: [longitude, latitude] },
    properties: {
      osm_type: "way",
      osm_id: Math.round(Math.abs(latitude * 1_000_000)),
      name,
      street,
      district: "Kebon Melati",
      osm_value: value,
      countrycode: "ID",
    },
  };
}

function nominatimPlace(
  placeId: number,
  name: string,
  latitude: number,
  longitude: number,
  type: string,
  road?: string,
) {
  return {
    place_id: placeId,
    lat: String(latitude),
    lon: String(longitude),
    name,
    type,
    address: { suburb: "Kebon Melati", road },
  };
}

describe("searchPlaces", () => {
  it("answers a prefix with the type of the place", async () => {
    const fetcher: FetchLike = (input) => {
      if (input.includes("photon.komoot.io")) {
        return json({
          features: [
            photonFeature("Grand Indonesia Shopping Town", "mall", -6.1958, 106.8215, "Jalan Teluk Betung"),
            photonFeature("Outside the box", "mall", -6.1958, 108.5),
          ],
        });
      }
      return json([]);
    };

    const places = await searchPlaces("grand prefix", { fetch: fetcher });

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      name: "Grand Indonesia Shopping Town",
      kind: "Mall",
      detail: "Jalan Teluk Betung",
      latitude: -6.1958,
      longitude: 106.8215,
    });
  });

  it("fills an exact address from Nominatim when Photon is thin", async () => {
    const calls: string[] = [];
    const fetcher: FetchLike = (input) => {
      calls.push(input);
      if (input.includes("photon.komoot.io")) {
        return json({ features: [] });
      }
      return json([
        nominatimPlace(71, "Jalan Teluk Betung", -6.1955, 106.821, "residential", "Jalan Teluk Betung"),
      ]);
    };

    const places = await searchPlaces("teluk betung", { fetch: fetcher });

    expect(calls).toHaveLength(2);
    expect(places[0]).toMatchObject({
      name: "Jalan Teluk Betung",
      kind: "Residential",
      detail: "Kebon Melati",
    });
  });

  it("does not show the same mall twice", async () => {
    const fetcher: FetchLike = (input) => {
      if (input.includes("photon.komoot.io")) {
        return json({
          features: [
            photonFeature("Grand Indonesia Shopping Town", "mall", -6.1958, 106.8215),
            photonFeature("Grand Indonesia Sky Bridge", "bridge", -6.1952, 106.8207),
          ],
        });
      }
      return json([
        nominatimPlace(12, "Grand Indonesia Shopping Town", -6.1958, 106.8215, "mall"),
        nominatimPlace(13, "Bundaran HI", -6.1949, 106.8228, "bus_stop"),
      ]);
    };

    const places = await searchPlaces("grand indonesia", { fetch: fetcher });

    expect(places.map((place) => place.name)).toEqual([
      "Grand Indonesia Shopping Town",
      "Grand Indonesia Sky Bridge",
      "Bundaran HI",
    ]);
  });

  it("keeps the station list when both indexes fail", async () => {
    const fetcher: FetchLike = () => Promise.reject(new Error("offline"));

    await expect(searchPlaces("a place that never answers", { fetch: fetcher })).resolves.toEqual(
      [],
    );
  });

  it("takes the coordinates from Google Places when a key is set", async () => {
    const calls: { url: string; init?: RequestInit | undefined }[] = [];
    const fetcher: FetchLike = (input, init) => {
      calls.push({ url: input, init });
      if (input === "https://places.googleapis.com/v1/places:searchText") {
        return json({
          places: [
            {
              id: "grand",
              displayName: { text: "Grand Indonesia" },
              shortFormattedAddress: "Jl. Teluk Betung No.1, Jakarta",
              location: { latitude: -6.1958, longitude: 106.8215 },
              primaryTypeDisplayName: { text: "Shopping mall" },
              types: ["shopping_mall"],
            },
            {
              id: "bandung",
              displayName: { text: "Outside Jakarta" },
              location: { latitude: -6.9, longitude: 107.6 },
            },
          ],
        });
      }
      return json({ features: [] });
    };

    const places = await searchPlaces("grand google test", {
      fetch: fetcher,
      googleKey: "secret",
    });

    const googleCall = calls.find((call) => call.url.includes("places.googleapis.com"));
    expect(googleCall?.init?.method).toBe("POST");
    expect(
      (googleCall?.init?.headers as Record<string, string>)["X-Goog-Api-Key"],
    ).toBe("secret");

    const body = JSON.parse(String(googleCall?.init?.body)) as {
      locationRestriction: { rectangle: { high: { latitude: number } } };
    };
    expect(body.locationRestriction.rectangle.high.latitude).toBeCloseTo(-6.05);

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      name: "Grand Indonesia",
      kind: "Shopping mall",
      detail: "Jl. Teluk Betung No.1, Jakarta",
      source: "google",
      latitude: -6.1958,
    });
  });

  it("falls back to OpenStreetMap when Google fails", async () => {
    const fetcher: FetchLike = (input) => {
      if (input.includes("places.googleapis.com")) {
        return Promise.reject(new Error("permission denied"));
      }
      if (input.includes("photon.komoot.io")) {
        return json({
          features: [photonFeature("Monas Park", "park", -6.1767, 106.8265)],
        });
      }
      return json([]);
    };

    const places = await searchPlaces("monas fallback google", {
      fetch: fetcher,
      googleKey: "secret",
    });

    expect(places[0]).toMatchObject({
      name: "Monas Park",
      source: "openstreetmap",
    });
  });

  it("does not ask the same question twice", async () => {
    let calls = 0;
    const fetcher: FetchLike = (input) => {
      calls += 1;
      if (input.includes("photon.komoot.io")) {
        return json({
          features: [photonFeature("Monas Park", "park", -6.1767, 106.8265)],
        });
      }
      return json([]);
    };

    await searchPlaces("monas park cached", { fetch: fetcher });
    const first = calls;
    await searchPlaces("monas park cached", { fetch: fetcher });

    expect(calls).toBe(first);
  });
});
