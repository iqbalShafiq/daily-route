import type { Itinerary, ItineraryLeg } from "./api.js";
import { MODE_COLOR, SERVICE_CLASS_COLOR, type ServiceClass } from "./format.js";

/**
 * The colours of one journey.
 *
 * A ride wears the colour of its operator, because that is the taxonomy the
 * rider already knows: a bus is the bus colour, an MRT is the metro colour.
 * When a journey uses one operator twice, the second line takes a colour
 * from the fixed secondary palette, so two Transjakarta corridors on one
 * board are still two different lines.
 *
 * Walking is not in either palette. It keeps the quiet ink colour and a
 * dashed line, so a footpath never looks like a vehicle.
 */

export const WALK_LINE_KEY = "walk";

export const ROUTE_WALK_COLOR = "var(--route-walk)";

/**
 * Secondary colours, used only when one operator appears twice.
 *
 * These three are the tokens that are not a mode colour, so a repeated
 * corridor can never be mistaken for the operator's first line.
 */
const REPEAT_COLORS = ["var(--route-1)", "var(--route-4)", "var(--route-6)"] as const;

/** The key a leg shares with the legend row and the map line. */
export function lineKeyOf(leg: Pick<ItineraryLeg, "kind" | "lineId">): string {
  if (leg.kind === "walk") return WALK_LINE_KEY;
  return leg.lineId ?? "route";
}

function baseColorOf(leg: ItineraryLeg): string {
  return (
    SERVICE_CLASS_COLOR[leg.serviceClass as ServiceClass] ??
    MODE_COLOR[leg.mode] ??
    "var(--ink-2)"
  );
}

/**
 * One colour per line, stable across the alternatives.
 *
 * The map and the legend both read this, so the line being followed and the
 * row naming it can never drift apart.
 */
export function lineColorsOf(routes: readonly Itinerary[]): Map<string, string> {
  const colors = new Map<string, string>();
  const taken = new Set<string>();
  for (const route of routes) {
    for (const leg of route.legs) {
      if (leg.kind !== "ride" || !leg.lineId) continue;
      if (colors.has(leg.lineId)) continue;
      const base = baseColorOf(leg);
      let color = base;
      if (taken.has(color)) {
        color = REPEAT_COLORS.find((token) => !taken.has(token)) ?? base;
      }
      taken.add(color);
      colors.set(leg.lineId, color);
    }
  }
  return colors;
}

export type RouteLegendEntry = {
  key: string;
  /** The short name: a corridor code, or "Walk". */
  label: string;
  /** The long name of the line, when it has one. */
  name: string | null;
  fromName: string;
  toName: string;
  durationMinutes: number;
  stopCount: number;
  directionLabel: string | null;
  temporary: boolean;
  kind: "walk" | "ride";
  color: string;
};

/**
 * The rows of the legend for one itinerary.
 *
 * A line that is used twice is one row. The walk is one row too: the map
 * draws every footpath in the same quiet style, and the legend names the
 * part of the journey it belongs to.
 */
export function legendEntries(route: Itinerary): RouteLegendEntry[] {
  const entries: RouteLegendEntry[] = [];
  const walkLegs = route.legs.filter((leg) => leg.kind === "walk");
  if (walkLegs.length > 0) {
    const first = walkLegs[0];
    const last = walkLegs[walkLegs.length - 1];
    if (first && last) {
      entries.push({
        key: WALK_LINE_KEY,
        label: "Walk",
        name: null,
        fromName: first.fromName,
        toName: last.toName,
        durationMinutes: walkLegs.reduce((total, leg) => total + leg.durationMinutes, 0),
        stopCount: 0,
        directionLabel: null,
        temporary: false,
        kind: "walk",
        color: ROUTE_WALK_COLOR,
      });
    }
  }

  const seen = new Set<string>();
  const colors = lineColorsOf([route]);
  for (const leg of route.legs) {
    if (leg.kind !== "ride" || !leg.lineId || seen.has(leg.lineId)) continue;
    seen.add(leg.lineId);
    const legs = route.legs.filter((entry) => entry.lineId === leg.lineId);
    const first = legs[0] ?? leg;
    const last = legs[legs.length - 1] ?? leg;
    entries.push({
      key: leg.lineId,
      label: leg.lineCode ?? leg.lineName ?? "Transit",
      name: leg.lineName,
      fromName: first.fromName,
      toName: last.toName,
      durationMinutes: legs.reduce((total, entry) => total + entry.durationMinutes, 0),
      stopCount: legs.reduce((total, entry) => total + entry.stops.length, 0),
      directionLabel: leg.directionLabel ?? null,
      temporary: leg.temporary === true,
      kind: "ride",
      color: colors.get(leg.lineId) ?? baseColorOf(leg),
    });
  }

  return entries;
}
