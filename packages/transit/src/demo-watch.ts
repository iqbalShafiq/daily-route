/**
 * A labelled demonstration disruption.
 *
 * The monitor is not required for the screen to be readable. This record
 * is a scenario, not an announcement from an operator, and it is merged
 * into the active list under an id that starts with `contoh:`. The
 * station id is a real stop in the network. The coordinates are looked
 * up from that stop when the map draws it.
 */

import type { Disruption } from "./types.js";

export const DEMO_DISRUPTION_ID = "contoh:denpasar-pembatas";

export function demoDisruptions(now: Date = new Date()): Disruption[] {
  const published = new Date(now.getTime() - 12 * 60 * 1000).toISOString();
  return [
    {
      id: DEMO_DISRUPTION_ID,
      source: "Contoh pemantauan",
      sourceType: "news",
      systemId: "transjakarta",
      lineId: null,
      stationId: "transjakarta:denpasar",
      stationGroupId: null,
      severity: "severe",
      status: "active",
      kind: "closure",
      title: "Halte Denpasar ditutup",
      body:
        "Contoh pemantauan, bukan pengumuman operator. Sebuah truk menabrak pembatas jalan di Halte Denpasar, sehingga halte itu tidak melayani naik dan turun.",
      url: null,
      confidence: 1,
      publishedAt: published,
      observedAt: published,
      resolvedAt: null,
      affectedStationIds: ["transjakarta:denpasar"],
      affectedLineIds: [],
    },
  ];
}

/** Put the labelled scenario in front of the rows the database returned. */
export function mergeDemoDisruptions(
  rows: readonly Disruption[],
  now: Date = new Date(),
): Disruption[] {
  const present = new Set(rows.map((row) => row.id));
  const demos = demoDisruptions(now).filter((row) => !present.has(row.id));
  return [...demos, ...rows];
}

export function isDemonstration(disruption: Pick<Disruption, "id">): boolean {
  return disruption.id.startsWith("contoh:");
}
