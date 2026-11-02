import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { quoteFare } from "@daily-route/transit";
import { describe, expect, it } from "vitest";

import { loadFareRules, type FaresDocument } from "./fares.js";

/**
 * The published tariff, read from the research document.
 *
 * These figures are the ones the operators publish. The test fails when
 * the document and the engine disagree about them.
 */

const document = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../research/data/fares.json"), "utf8"),
) as FaresDocument;

const rules = loadFareRules(document);

/** 10.00 WIB on a Wednesday. */
const morning = new Date(Date.UTC(2026, 9, 21, 3, 0));

describe("published fares", () => {
  it("charges KRL Rp1.000 for every further 10 km", () => {
    const quote = quoteFare({
      at: morning,
      rules,
      legs: [{ kind: "ride", operator: "krl-jabodetabek", distanceKm: 40, stopCount: 10 }],
    });

    // Twenty-five kilometres at Rp3.000, then two blocks of ten.
    expect(quote.totalIdr).toBe(5_000);
    expect(quote.notes.some((note) => note.includes("Ganti jalur di dalam stasiun yang sama"))).toBe(true);
  });

  it("leaves an unconfirmed tariff out of the total", () => {
    expect(rules.modes["transjakarta-rumah-susun"]).toBeUndefined();
    expect(rules.withheld?.["transjakarta-rumah-susun"]).toBeTruthy();

    const quote = quoteFare({
      at: morning,
      rules,
      legs: [{ kind: "ride", operator: "transjakarta-rumah-susun", distanceKm: 4, stopCount: 5 }],
    });

    expect(quote.totalIdr).toBe(0);
    expect(quote.unverified).toEqual(["transjakarta-rumah-susun"]);
  });
});
