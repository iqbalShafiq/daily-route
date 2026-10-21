import { describe, expect, it } from "vitest";

import { fareOperatorFor, formatRupiah, localTimeParts, quoteFare, type FareRules } from "./fare.js";

/**
 * The fare engine.
 *
 * Every figure here is a published operator tariff, so the test is about
 * the arithmetic and the boundaries: the hours the operators charge less,
 * the caps, and the combined ticket that only covers some of the modes.
 */

const rules: FareRules = {
  modes: {
    "transjakarta-brt": {
      kind: "flat",
      amount: 3500,
      offPeakAmount: 2000,
      offPeakHours: "05:00-07:00",
    },
    "transjakarta-feeder": { kind: "free", note: "Mikrotrans masih gratis." },
    "transjakarta-royaltrans": { kind: "flat", amount: 20_000 },
    "mrt-jakarta": { kind: "perStation", base: 3000, perStation: 1000, max: 14_000 },
    "lrt-jakarta": { kind: "flat", amount: 5000 },
    "lrt-jabodebek": {
      kind: "perKm",
      base: 5000,
      baseKm: 1,
      perKm: 700,
      perKmStepKm: 1,
      min: 5000,
      max: 20_000,
      offPeakMax: 10_000,
      peakHours: "06:00-09:00,16:00-20:00",
    },
    "krl-jabodetabek": {
      kind: "perKm",
      base: 3000,
      baseKm: 25,
      perKm: 1000,
      perKmStepKm: 10,
      min: 3000,
    },
  },
  integrations: [
    {
      id: "jakpro-multimodal",
      label: "Integrasi Multimodal (JakLingko)",
      boardingAmount: 2500,
      perKm: 250,
      max: 10_000,
      covers: ["transjakarta-brt", "mrt-jakarta", "lrt-jakarta"],
      durationMinutes: 180,
      note: "Satu tiket untuk BRT, MRT dan LRT Jakarta.",
    },
  ],
};

/** A moment in Jakarta local time. */
const at = (hour: number, minute = 0, weekday = 3): Date => {
  // Jakarta is UTC+7 all year round.
  const utcHour = hour - 7;
  const date = new Date(Date.UTC(2026, 9, 21, utcHour, minute));
  // Walk the day forward to the wanted weekday.
  const current = date.getUTCDay();
  const shift = (weekday - current + 7) % 7;
  date.setUTCDate(date.getUTCDate() + shift);
  return date;
};

describe("quoteFare", () => {
  it("charges the Transjakarta fare at the ordinary hours", () => {
    const quote = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "transjakarta-brt", distanceKm: 8, stopCount: 12 }],
    });

    expect(quote.totalIdr).toBe(3500);
    expect(quote.breakdown[0]?.amountIdr).toBe(3500);
  });

  it("charges the Transjakarta fare before seven in the morning", () => {
    const quote = quoteFare({
      at: at(6),
      rules,
      legs: [{ kind: "ride", operator: "transjakarta-brt", distanceKm: 8, stopCount: 12 }],
    });

    expect(quote.totalIdr).toBe(2000);
  });

  it("charges the Mikrotrans fare of nothing", () => {
    const quote = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "transjakarta-feeder", distanceKm: 6, stopCount: 9 }],
    });

    expect(quote.totalIdr).toBe(0);
  });

  it("charges the MRT per station, up to the cap", () => {
    const short = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "mrt-jakarta", distanceKm: 4, stopCount: 3 }],
    });
    expect(short.totalIdr).toBe(5000);

    const long = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "mrt-jakarta", distanceKm: 14, stopCount: 13 }],
    });
    expect(long.totalIdr).toBe(14_000);
  });

  it("charges the KRL per kilometre above twenty-five", () => {
    const near = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "krl-jabodetabek", distanceKm: 12, stopCount: 6 }],
    });
    expect(near.totalIdr).toBe(3000);

    const far = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "krl-jabodetabek", distanceKm: 40, stopCount: 20 }],
    });
    // Fifteen kilometres beyond the first twenty-five: two blocks of ten.
    expect(far.totalIdr).toBe(3000 + 2 * 1000);
  });

  it("caps the LRT Jabodebek fare, lower outside the peak", () => {
    const peak = quoteFare({
      at: at(7),
      rules,
      legs: [{ kind: "ride", operator: "lrt-jabodebek", distanceKm: 40, stopCount: 12 }],
    });
    expect(peak.totalIdr).toBe(20_000);

    const offPeak = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "lrt-jabodebek", distanceKm: 40, stopCount: 12 }],
    });
    expect(offPeak.totalIdr).toBe(10_000);
  });

  it("offers the combined ticket when it is cheaper", () => {
    const legs = [
      { kind: "ride" as const, operator: "transjakarta-brt", distanceKm: 5, stopCount: 6 },
      { kind: "ride" as const, operator: "mrt-jakarta", distanceKm: 5, stopCount: 4 },
      { kind: "ride" as const, operator: "lrt-jakarta", distanceKm: 5, stopCount: 5 },
    ];

    const withoutScheme = quoteFare({
      at: at(10),
      rules: { ...rules, integrations: [] },
      legs,
    });
    expect(withoutScheme.totalIdr).toBe(3500 + 6000 + 5000);
    expect(withoutScheme.integration).toBeNull();

    const integrated = quoteFare({ at: at(10), rules, legs });
    // Fifteen kilometres: 2,500 + 250 per kilometre, below the cap.
    expect(integrated.integration?.id).toBe("jakpro-multimodal");
    expect(integrated.totalIdr).toBe(2500 + 15 * 250);
  });

  it("does not offer the combined ticket for a single vehicle", () => {
    const quote = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "mrt-jakarta", distanceKm: 4, stopCount: 3 }],
    });

    expect(quote.integration).toBeNull();
    expect(quote.totalIdr).toBe(5000);
  });

  it("does not offer the combined ticket when a mode is not covered", () => {
    const quote = quoteFare({
      at: at(10),
      rules,
      legs: [
        { kind: "ride", operator: "transjakarta-brt", distanceKm: 5, stopCount: 6 },
        { kind: "ride", operator: "krl-jabodetabek", distanceKm: 20, stopCount: 10 },
      ],
    });

    expect(quote.integration).toBeNull();
    expect(quote.totalIdr).toBe(3500 + 3000);
  });

  it("never charges for walking", () => {
    const quote = quoteFare({
      at: at(10),
      rules,
      legs: [
        { kind: "walk", operator: null, distanceKm: 0.2, stopCount: 2 },
        { kind: "ride", operator: "lrt-jakarta", distanceKm: 4, stopCount: 4 },
      ],
    });

    expect(quote.totalIdr).toBe(5000);
  });

  it("reports an operator whose tariff is missing instead of charging nothing", () => {
    const quote = quoteFare({
      at: at(10),
      rules,
      legs: [{ kind: "ride", operator: "tidak-dikenal", distanceKm: 4, stopCount: 4 }],
    });

    expect(quote.unverified).toEqual(["tidak-dikenal"]);
  });
});

describe("fareOperatorFor", () => {
  it("maps every service class to the operator that charges for it", () => {
    expect(fareOperatorFor({ systemId: "transjakarta", serviceClass: "brt" })).toBe(
      "transjakarta-brt",
    );
    expect(fareOperatorFor({ systemId: "transjakarta", serviceClass: "feeder" })).toBe(
      "transjakarta-feeder",
    );
    expect(fareOperatorFor({ systemId: "transjakarta", serviceClass: "royaltrans" })).toBe(
      "transjakarta-royaltrans",
    );
    expect(fareOperatorFor({ systemId: "mrt-jakarta", serviceClass: "rapid-transit" })).toBe(
      "mrt-jakarta",
    );
    expect(fareOperatorFor({ systemId: "lrt-jakarta", serviceClass: "lrt" })).toBe("lrt-jakarta");
    expect(fareOperatorFor({ systemId: "lrt-jabodebek", serviceClass: "lrt" })).toBe(
      "lrt-jabodebek",
    );
    expect(fareOperatorFor({ systemId: "krl-jabodetabek", serviceClass: "commuter-rail" })).toBe(
      "krl-jabodetabek",
    );
  });
});

describe("localTimeParts", () => {
  it("reads the clock in Jakarta whatever the device says", () => {
    const parts = localTimeParts(new Date("2026-10-21T02:00:00.000Z"));
    expect(parts.hour).toBe(9);
    expect(parts.weekday).toBe(3);
  });
});

describe("formatRupiah", () => {
  it("writes the amount the way a ticket does", () => {
    expect(formatRupiah(3500)).toBe("Rp 3.500");
  });
});
