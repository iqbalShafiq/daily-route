import { describe, expect, it } from "vitest";

import { actionsFromTool, parseToolResult } from "./chat-actions.js";

describe("actionsFromTool", () => {
  it("offers the route and a located notice", () => {
    const actions = actionsFromTool("plan_journey", {
      asal: { text: "blok m", name: "Blok M" },
      tujuan: { text: "kota", name: "Kota" },
      gangguan: [
        {
          id: "notice-1",
          judul: "Corridor 1 diverted",
          latitude: -6.2,
          longitude: 106.8,
          url: "https://example.com/notice",
        },
      ],
    });
    expect(actions.map((action) => action.type)).toEqual([
      "show_route",
      "show_notice",
      "open_source",
    ]);
    expect(actions[0]).toMatchObject({ origin: "Blok M", destination: "Kota" });
    expect(actions[1]).toMatchObject({ disruptionId: "notice-1" });
  });

  it("skips a notice that has no place", () => {
    const actions = actionsFromTool("list_active_disruptions", {
      gangguan: [{ id: "notice-2", judul: "Somewhere", url: "https://example.com/a" }],
    });
    expect(actions).toEqual([
      {
        key: "source:https://example.com/a",
        type: "open_source",
        label: "Read the source",
        url: "https://example.com/a",
      },
    ]);
  });

  it("offers a stop as a place to start or finish", () => {
    const actions = actionsFromTool("get_station", {
      ditemukan: true,
      stationId: "transjakarta:blok-m",
      name: "Blok M",
      latitude: -6.24,
      longitude: 106.8,
    });
    expect(actions.map((action) => action.type)).toEqual([
      "show_stop",
      "set_origin",
      "set_destination",
    ]);
  });

  it("ignores a weak place match and a bad url", () => {
    expect(
      actionsFromTool("resolve_place", {
        candidates: [{ stationId: "a", name: "A", latitude: 1, longitude: 2, score: 0.2 }],
      }),
    ).toEqual([]);
    expect(
      actionsFromTool("list_active_disruptions", {
        gangguan: [{ id: "n", latitude: 1, longitude: 2, url: "javascript:alert(1)" }],
      }).some((action) => action.type === "open_source"),
    ).toBe(false);
  });

  it("parses a JSON tool result", () => {
    expect(parseToolResult("{\"asal\":1}")).toEqual({ asal: 1 });
    expect(parseToolResult("not json")).toBeNull();
  });
});
