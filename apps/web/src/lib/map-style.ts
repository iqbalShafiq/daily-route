/**
 * The map style.
 *
 * OpenFreeMap serves OpenMapTiles vector tiles without an API key, with no
 * request limit and no registration. The two styles below are the light and
 * the dark counterpart, so the map follows the interface theme.
 */

export const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
export const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/fiord";

export function mapStyleFor(theme: "light" | "dark"): string {
  return theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

/** The starting view: Greater Jakarta, centred between the city core and the east. */
export const JAKARTA_VIEW = {
  center: { longitude: 106.83, latitude: -6.21 },
  zoom: 10.5,
};

/** The bounding box of the whole network, used when a route is not focused. */
export const JAKARTA_BOUNDS = {
  minLongitude: 106.6,
  minLatitude: -6.42,
  maxLongitude: 107.25,
  maxLatitude: -5.95,
};
