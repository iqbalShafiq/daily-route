import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompletedTripRecord } from "../route-planner/live-trip.js";

import {
  DEFAULT_RIDER_PREFERENCES,
  DEFAULT_TRANSIT_CARD,
  LOW_BALANCE_DEFAULT_IDR,
  MAX_WALK_MAX_METERS,
  MAX_WALK_MIN_METERS,
  RIDER_PREFERENCES_KEY,
  TRANSIT_CARD_KEY,
  clampMaxWalk,
  computeMonthlyRecap,
  readRiderPreferences,
  readTransitCard,
  recordManualBalance,
  recordNfcTap,
  resetTransitCard,
  saveRiderPreferences,
  saveTransitCard,
  simulateCardTap,
} from "./rider-preferences.js";

function memoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    get length() {
      return rows.size;
    },
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    key: (index) => [...rows.keys()][index] ?? null,
    removeItem: (key) => {
      rows.delete(key);
    },
    setItem: (key, value) => {
      rows.set(key, value);
    },
  };
}

function trip(
  overrides: Partial<CompletedTripRecord> = {},
): CompletedTripRecord {
  return {
    originName: "Rumah",
    destinationName: "Kantor",
    durationMinutes: 40,
    fareIdr: 3500,
    walkKm: 0.8,
    crowdRating: "lumayan",
    completedAt: "2026-11-20T01:00:00.000Z",
    ...overrides,
  };
}

describe("rider preferences", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("window", {
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      localStorage,
    });
  });

  it("starts from the documented defaults", () => {
    expect(readRiderPreferences()).toEqual(DEFAULT_RIDER_PREFERENCES);
    expect(DEFAULT_RIDER_PREFERENCES.priority).toBe("fastest");
    expect(DEFAULT_RIDER_PREFERENCES.maxWalkMeters).toBe(800);
    expect(DEFAULT_RIDER_PREFERENCES.alertSensitivity).toBe("balanced");
    expect(DEFAULT_RIDER_PREFERENCES.wakeBeforeAlight).toBe(true);
    expect(DEFAULT_RIDER_PREFERENCES.onboardingCompleted).toBe(false);
  });

  it("merges a patch and keeps the other choices", () => {
    saveRiderPreferences({ priority: "cheapest", wheelchairFriendly: true });
    saveRiderPreferences({ alertSensitivity: "important" });

    const stored = readRiderPreferences();
    expect(stored.priority).toBe("cheapest");
    expect(stored.wheelchairFriendly).toBe(true);
    expect(stored.alertSensitivity).toBe("important");
    expect(stored.includeCitizenX).toBe(true);
    expect(localStorage.getItem(RIDER_PREFERENCES_KEY)).toContain("important");
  });

  it("clamps the walk to the range the settings offer", () => {
    expect(clampMaxWalk(50)).toBe(MAX_WALK_MIN_METERS);
    expect(clampMaxWalk(9000)).toBe(MAX_WALK_MAX_METERS);
    expect(clampMaxWalk(Number.NaN)).toBe(800);

    saveRiderPreferences({ maxWalkMeters: 40 });
    expect(readRiderPreferences().maxWalkMeters).toBe(200);
    saveRiderPreferences({ maxWalkMeters: 9000 });
    expect(readRiderPreferences().maxWalkMeters).toBe(1500);
  });

  it("ignores a stored value of the wrong shape", () => {
    localStorage.setItem(
      RIDER_PREFERENCES_KEY,
      JSON.stringify({
        priority: "teleport",
        maxWalkMeters: "long",
        preferredModes: ["krl", "hoverboard"],
        alertSensitivity: "loud",
      }),
    );
    const stored = readRiderPreferences();
    expect(stored.priority).toBe("fastest");
    expect(stored.maxWalkMeters).toBe(800);
    expect(stored.preferredModes).toEqual(["krl"]);
    expect(stored.alertSensitivity).toBe("balanced");
  });

  it("survives a corrupt string without throwing", () => {
    localStorage.setItem(RIDER_PREFERENCES_KEY, "{not json");
    expect(readRiderPreferences()).toEqual(DEFAULT_RIDER_PREFERENCES);
  });

  it("keeps the seven preferred modes unique", () => {
    saveRiderPreferences({
      preferredModes: ["krl", "brt", "krl", "mikro"],
      onboardingCompleted: true,
    });
    const stored = readRiderPreferences();
    expect(stored.preferredModes).toEqual(["krl", "brt", "mikro"]);
    expect(stored.onboardingCompleted).toBe(true);
  });
});

describe("transit card ledger", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("window", {
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      localStorage,
    });
  });

  it("starts with no balance, which is not the same as zero", () => {
    const card = readTransitCard();
    expect(card.balanceIdr).toBeNull();
    expect(card.source).toBe("none");
    expect(card.history).toEqual([]);
    expect(card.lowBalanceThresholdIdr).toBe(LOW_BALANCE_DEFAULT_IDR);
  });

  it("records a manual balance and the change from the old one", () => {
    const first = recordManualBalance(50_000, "Saldo awal");
    expect(first.balanceIdr).toBe(50_000);
    expect(first.source).toBe("manual");
    expect(first.history[0]?.deltaIdr).toBe(0);
    expect(first.history[0]?.simulated).toBe(false);

    const second = recordManualBalance(72_000, "Isi ulang");
    expect(second.balanceIdr).toBe(72_000);
    expect(second.history[0]?.label).toBe("Isi ulang");
    expect(second.history[0]?.deltaIdr).toBe(22_000);
    expect(second.history[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("measures a spend as a negative change", () => {
    recordManualBalance(50_000, "Saldo awal");
    const spent = recordManualBalance(46_500, "Naik bus");
    expect(spent.history[0]?.deltaIdr).toBe(-3_500);
  });

  it("labels a simulated tap and never invents a balance", () => {
    const simulated = simulateCardTap();
    expect(simulated.balanceIdr).toBeNull();
    expect(simulated.source).toBe("simulated");
    expect(simulated.history[0]?.simulated).toBe(true);
    expect(simulated.history[0]?.label).toBe("Simulasi tap");
  });

  it("replays the recorded balance on a simulated tap", () => {
    recordManualBalance(50_000, "Saldo awal");
    const simulated = simulateCardTap();
    expect(simulated.balanceIdr).toBe(50_000);
    expect(simulated.history[0]?.simulated).toBe(true);
    expect(simulated.history[0]?.deltaIdr).toBe(0);
  });

  it("records a real NFC tap without changing the balance", () => {
    recordManualBalance(20_000, "Saldo awal");
    const tapped = recordNfcTap();
    expect(tapped.source).toBe("nfc");
    expect(tapped.balanceIdr).toBe(20_000);
    expect(tapped.history[0]?.simulated).toBe(false);
  });

  it("keeps the ledger and the reminder choice across a reload", () => {
    recordManualBalance(25_000, "Saldo awal");
    saveTransitCard({ remindLowBalance: false, cardLabel: "Kartu harian" });
    const stored = readTransitCard();
    expect(stored.balanceIdr).toBe(25_000);
    expect(stored.remindLowBalance).toBe(false);
    expect(stored.cardLabel).toBe("Kartu harian");
    expect(localStorage.getItem(TRANSIT_CARD_KEY)).toContain("Kartu harian");
  });

  it("resets to the empty ledger", () => {
    recordManualBalance(25_000, "Saldo awal");
    const reset = resetTransitCard();
    expect(reset).toEqual(DEFAULT_TRANSIT_CARD);
    expect(readTransitCard().balanceIdr).toBeNull();
  });

  it("ignores a stored row that is not a ledger", () => {
    localStorage.setItem(TRANSIT_CARD_KEY, JSON.stringify({ history: [{ id: 3 }] }));
    const card = readTransitCard();
    expect(card.history).toEqual([]);
    expect(card.balanceIdr).toBeNull();
  });
});

describe("computeMonthlyRecap", () => {
  const now = new Date("2026-11-27T03:00:00.000Z");

  it("returns an honest empty month", () => {
    const recap = computeMonthlyRecap([], now);
    expect(recap.totalTrips).toBe(0);
    expect(recap.walkKm).toBe(0);
    expect(recap.averageDurationMinutes).toBeNull();
    expect(recap.topDestination).toBeNull();
    expect(recap.comfortShare).toBeNull();
    expect(recap.monthLabel.toLowerCase()).toContain("november");
  });

  it("counts only the Jakarta month the rider is in", () => {
    // 31 October 18:00 UTC is 1 November 01:00 in Jakarta, so it belongs
    // to November even though its UTC month is October.
    const recap = computeMonthlyRecap(
      [
        trip({ completedAt: "2026-10-31T18:00:00.000Z" }),
        trip({ completedAt: "2026-11-02T01:00:00.000Z" }),
        trip({ completedAt: "2026-10-20T01:00:00.000Z" }),
      ],
      now,
    );
    expect(recap.totalTrips).toBe(2);
  });

  it("adds the walk, the mean duration and the top destination", () => {
    const recap = computeMonthlyRecap(
      [
        trip({ destinationName: "Kantor", walkKm: 0.8, durationMinutes: 40 }),
        trip({ destinationName: "Kantor", walkKm: 0.4, durationMinutes: 30 }),
        trip({ destinationName: "Blok M", walkKm: 1.1, durationMinutes: 50 }),
      ],
      now,
    );
    expect(recap.totalTrips).toBe(3);
    expect(recap.walkKm).toBe(2.3);
    expect(recap.averageDurationMinutes).toBe(40);
    expect(recap.topDestination).toEqual({ name: "Kantor", count: 2 });
  });

  it("measures comfort only against the journeys the rider rated", () => {
    const recap = computeMonthlyRecap(
      [
        trip({ crowdRating: "lega" }),
        trip({ crowdRating: "desak-desakan" }),
        trip({ crowdRating: null }),
      ],
      now,
    );
    expect(recap.ratedTrips).toBe(2);
    expect(recap.comfortShare).toBe(0.5);
  });

  it("does not rate an unrated month", () => {
    const recap = computeMonthlyRecap([trip({ crowdRating: null })], now);
    expect(recap.ratedTrips).toBe(0);
    expect(recap.comfortShare).toBeNull();
  });

  it("ignores a row whose instant cannot be read", () => {
    const recap = computeMonthlyRecap(
      [trip({ completedAt: "not a date" }), trip()],
      now,
    );
    expect(recap.totalTrips).toBe(1);
  });
});
