import { describe, expect, it } from "vitest";

import type { Line } from "@daily-route/transit";

import { corridorCandidates, needsClassifier, systemOneBase } from "./screen.js";

function line(code: string, name: string): Line {
  return {
    id: `transjakarta:${code.toLowerCase()}`,
    systemId: "transjakarta",
    code,
    name,
    mode: "bus",
    serviceClass: "brt",
    operator: "Transjakarta",
    status: "operating",
    color: null,
    lengthKm: 1,
    description: "",
    aliases: [],
  };
}

describe("corridorCandidates", () => {
  const lines = [line("9", "Koridor 9"), line("9A", "Koridor 9A"), line("JAK.93", "JAK 93")];

  it("matches a short code only beside the word koridor", () => {
    expect(corridorCandidates("ada 9 halte yang sepi", lines).map((item) => item.code)).toEqual([]);
    expect(corridorCandidates("Koridor 9 dialihkan di Grogol", lines).map((item) => item.code)).toEqual(["9"]);
  });

  it("matches a code that mixes letters and digits", () => {
    expect(corridorCandidates("layanan 9A melewati Simprug", lines).map((item) => item.code)).toEqual(["9A"]);
    expect(corridorCandidates("JAK.93 dialihkan dari Hidup Baru", lines).map((item) => item.code)).toEqual([
      "JAK.93",
    ]);
  });
});

describe("needsClassifier", () => {
  it("skips a confident non-disruption", () => {
    expect(
      needsClassifier({
        disruptionProbability: 0.05,
        restoredProbability: 0.1,
        systemId: null,
      }),
    ).toBe(false);
  });

  it("keeps a possible disruption for the chat model", () => {
    expect(
      needsClassifier({
        disruptionProbability: 0.4,
        restoredProbability: 0,
        systemId: "transjakarta",
      }),
    ).toBe(true);
  });
});

describe("systemOneBase", () => {
  it("points the TypeSafe SDK at OpenRouter without a second /v1", () => {
    expect(systemOneBase("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api");
  });
});
