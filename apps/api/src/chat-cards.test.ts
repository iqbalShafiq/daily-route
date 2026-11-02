import { describe, expect, it } from "vitest";

import { cardsFromTool } from "./chat-cards.js";

describe("cardsFromTool", () => {
  it("builds a route card from the planner result", () => {
    const cards = cardsFromTool("plan_journey", {
      asal: { name: "Grogol Reformasi" },
      tujuan: { name: "Simpang Kuningan" },
      status: "terbuka",
      catatan: [],
      gangguan: [],
      rute: [
        {
          durasiMenit: 41,
          jarakKm: 9.3,
          jarakJalanKakiKm: 0,
          jumlahTransfer: 0,
          tarif: { total: 3500, label: "Rp3.500" },
          legs: [
            {
              jenis: "ride",
              mode: "bus",
              lineCode: "9",
              lineName: "Pinang Ranti - Pluit",
              serviceClass: "brt",
              dari: "Grogol Reformasi",
              ke: "Simpang Kuningan",
              durasiMenit: 39,
              jarakKm: 9.3,
              tungguMenit: 4,
              frekuensi: "Frequent",
              headwayMinMenit: 4,
              headwayMaxMenit: 8,
              diLuarLayanan: false,
            },
          ],
        },
      ],
    });
    expect(cards[0]?.type).toBe("route");
    if (cards[0]?.type === "route") {
      expect(cards[0].primary.legs[0]).toMatchObject({ lineCode: "9", serviceLabel: "Frequent" });
      expect(cards[0].primary.fareLabel).toBe("Rp3.500");
    }
  });

  it("builds a stop card only when the station was found", () => {
    const cards = cardsFromTool("get_station", {
      ditemukan: true,
      stationId: "transjakarta:blok-m",
      name: "Blok M",
      latitude: -6.2,
      longitude: 106.8,
      lines: [{ code: "1", name: "Blok M - Kota" }],
    });
    expect(cards[0]).toMatchObject({ type: "stop", stationId: "transjakarta:blok-m" });
    expect(cardsFromTool("get_station", { ditemukan: false })).toEqual([]);
  });

  it("does not turn model prose into a card", () => {
    expect(cardsFromTool("plan_journey", { text: "Take the 9" })).toEqual([]);
  });
});
