import { useCallback, useEffect, useState } from "react";

import type { CompletedTripRecord } from "../route-planner/live-trip.js";
import type { RouteSortMode } from "../route-planner/route-sort.js";

/**
 * The rider's preferences and the transit-card ledger.
 *
 * Both are browser memory, not an account: they live in `localStorage`
 * and survive a reload without a session. A preference is a choice the
 * rider made in Pengaturan or in the onboarding; the ledger is a record
 * of balances the rider typed or a tap that really happened.
 *
 * Nothing here invents a number. A balance is either `null`, a value the
 * rider wrote, or a value a real Web NFC read reported. The simulated tap
 * replays the stored balance and is always labelled as a simulation.
 */

/* -------------------------------------------------------------------------
 * Preferences
 * ---------------------------------------------------------------------- */

export const RIDER_PREFERENCES_KEY = "daily-route.preferences";

const PREFERENCES_EVENT = "daily-route:preferences-changed";

/** How loudly the agent reports what it finds. */
export type AlertSensitivity = "important" | "balanced" | "all";

export const ALERT_SENSITIVITY_OPTIONS: readonly {
  value: AlertSensitivity;
  label: string;
}[] = [
  { value: "important", label: "Penting" },
  { value: "balanced", label: "Seimbang" },
  { value: "all", label: "Semua" },
];

/** The seven modes the onboarding asks the rider to prefer. */
export type PreferredMode =
  | "krl"
  | "mrt"
  | "lrtj"
  | "lrtk"
  | "brt"
  | "nonbrt"
  | "mikro";

export const PREFERRED_MODES: readonly {
  id: PreferredMode;
  label: string;
  hint: string;
}[] = [
  { id: "krl", label: "KRL", hint: "Commuter rail" },
  { id: "mrt", label: "MRT", hint: "Rapid transit" },
  { id: "lrtj", label: "LRT Jakarta", hint: "Light rail" },
  { id: "lrtk", label: "LRT Jabodebek", hint: "Light rail" },
  { id: "brt", label: "BRT", hint: "Transjakarta corridor" },
  { id: "nonbrt", label: "Non-BRT", hint: "Transjakarta feeder" },
  { id: "mikro", label: "Mikrotrans", hint: "Neighbourhood minibus" },
];

const PREFERRED_MODE_IDS = new Set<string>(PREFERRED_MODES.map((mode) => mode.id));

export type RiderPreferences = {
  /** The order the route list opens with. */
  priority: RouteSortMode;
  /** The longest walk the rider accepts, in metres. */
  maxWalkMeters: number;
  /** Whether the planner should prefer step-free access. */
  wheelchairFriendly: boolean;
  /** Whether the agent may read citizens' reports on X. */
  includeCitizenX: boolean;
  alertSensitivity: AlertSensitivity;
  /** The modes the rider prefers, in the order the onboarding lists them. */
  preferredModes: PreferredMode[];
  /** Whether the live journey may wake the rider one stop before alighting. */
  wakeBeforeAlight: boolean;
  /** Whether the onboarding asked for the device position. */
  shareLocation: boolean;
  /** Whether the onboarding asked for notifications. */
  notifications: boolean;
  /** Whether the intro has been completed on this browser. */
  onboardingCompleted: boolean;
};

export const MAX_WALK_MIN_METERS = 200;
export const MAX_WALK_MAX_METERS = 1500;
export const MAX_WALK_DEFAULT_METERS = 800;

export const DEFAULT_RIDER_PREFERENCES: RiderPreferences = {
  priority: "fastest",
  maxWalkMeters: MAX_WALK_DEFAULT_METERS,
  wheelchairFriendly: false,
  includeCitizenX: true,
  alertSensitivity: "balanced",
  preferredModes: [],
  wakeBeforeAlight: true,
  shareLocation: false,
  notifications: false,
  onboardingCompleted: false,
};

const SORT_MODES: readonly RouteSortMode[] = [
  "fastest",
  "cheapest",
  "fewest-transfers",
];

function isSortMode(value: unknown): value is RouteSortMode {
  return typeof value === "string" && (SORT_MODES as readonly string[]).includes(value);
}

function isSensitivity(value: unknown): value is AlertSensitivity {
  return value === "important" || value === "balanced" || value === "all";
}

function isPreferredMode(value: unknown): value is PreferredMode {
  return typeof value === "string" && PREFERRED_MODE_IDS.has(value);
}

/** Clamp a walk to the range the settings surface offers. */
export function clampMaxWalk(value: number): number {
  if (!Number.isFinite(value)) return MAX_WALK_DEFAULT_METERS;
  return Math.min(MAX_WALK_MAX_METERS, Math.max(MAX_WALK_MIN_METERS, Math.round(value)));
}

export function isRiderPreferences(value: unknown): value is RiderPreferences {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const modes = row["preferredModes"];
  return (
    isSortMode(row["priority"]) &&
    typeof row["maxWalkMeters"] === "number" &&
    typeof row["wheelchairFriendly"] === "boolean" &&
    typeof row["includeCitizenX"] === "boolean" &&
    isSensitivity(row["alertSensitivity"]) &&
    Array.isArray(modes) &&
    modes.every(isPreferredMode) &&
    typeof row["wakeBeforeAlight"] === "boolean" &&
    typeof row["onboardingCompleted"] === "boolean" &&
    (row["shareLocation"] === undefined || typeof row["shareLocation"] === "boolean") &&
    (row["notifications"] === undefined || typeof row["notifications"] === "boolean")
  );
}

function browserStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Read the stored preferences.
 *
 * A partial or older object keeps every field it does know and takes the
 * default for the rest, so adding a preference never resets the others.
 */
export function readRiderPreferences(): RiderPreferences {
  const store = browserStorage();
  if (!store) return { ...DEFAULT_RIDER_PREFERENCES };
  try {
    const raw = store.getItem(RIDER_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_RIDER_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_RIDER_PREFERENCES };
    const row = parsed as Record<string, unknown>;
    const modes = Array.isArray(row["preferredModes"])
      ? row["preferredModes"].filter(isPreferredMode)
      : [];
    return {
      priority: isSortMode(row["priority"])
        ? row["priority"]
        : DEFAULT_RIDER_PREFERENCES.priority,
      maxWalkMeters:
        typeof row["maxWalkMeters"] === "number"
          ? clampMaxWalk(row["maxWalkMeters"])
          : DEFAULT_RIDER_PREFERENCES.maxWalkMeters,
      wheelchairFriendly:
        typeof row["wheelchairFriendly"] === "boolean"
          ? row["wheelchairFriendly"]
          : DEFAULT_RIDER_PREFERENCES.wheelchairFriendly,
      includeCitizenX:
        typeof row["includeCitizenX"] === "boolean"
          ? row["includeCitizenX"]
          : DEFAULT_RIDER_PREFERENCES.includeCitizenX,
      alertSensitivity: isSensitivity(row["alertSensitivity"])
        ? row["alertSensitivity"]
        : DEFAULT_RIDER_PREFERENCES.alertSensitivity,
      preferredModes: modes.filter(
        (mode, index, all) => all.indexOf(mode) === index,
      ),
      wakeBeforeAlight:
        typeof row["wakeBeforeAlight"] === "boolean"
          ? row["wakeBeforeAlight"]
          : DEFAULT_RIDER_PREFERENCES.wakeBeforeAlight,
      shareLocation:
        typeof row["shareLocation"] === "boolean"
          ? row["shareLocation"]
          : DEFAULT_RIDER_PREFERENCES.shareLocation,
      notifications:
        typeof row["notifications"] === "boolean"
          ? row["notifications"]
          : DEFAULT_RIDER_PREFERENCES.notifications,
      onboardingCompleted:
        typeof row["onboardingCompleted"] === "boolean"
          ? row["onboardingCompleted"]
          : DEFAULT_RIDER_PREFERENCES.onboardingCompleted,
    };
  } catch {
    return { ...DEFAULT_RIDER_PREFERENCES };
  }
}

function announcePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

/** Merge a patch into the stored preferences and return the result. */
export function saveRiderPreferences(
  patch: Partial<RiderPreferences>,
): RiderPreferences {
  const next: RiderPreferences = {
    ...readRiderPreferences(),
    ...patch,
    ...(patch.maxWalkMeters === undefined
      ? {}
      : { maxWalkMeters: clampMaxWalk(patch.maxWalkMeters) }),
  };
  const store = browserStorage();
  if (store) {
    try {
      store.setItem(RIDER_PREFERENCES_KEY, JSON.stringify(next));
    } catch {
      // A private window may refuse the write; this visit still uses the
      // value, because the caller owns the state it passed.
    }
  }
  announcePreferences();
  return next;
}

/**
 * The preferences, live.
 *
 * The onboarding writes through the same functions, so the settings
 * surface updates without a reload. A same-tab custom event covers this
 * window, and the `storage` event covers the other tabs.
 */
export function useRiderPreferences(): {
  preferences: RiderPreferences;
  update: (patch: Partial<RiderPreferences>) => void;
} {
  const [preferences, setPreferences] = useState<RiderPreferences>(() =>
    readRiderPreferences(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (): void => setPreferences(readRiderPreferences());
    window.addEventListener(PREFERENCES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<RiderPreferences>) => {
    setPreferences(saveRiderPreferences(patch));
  }, []);

  return { preferences, update };
}

/* -------------------------------------------------------------------------
 * The transit card
 * ---------------------------------------------------------------------- */

export const TRANSIT_CARD_KEY = "daily-route.transit-card";

export const LOW_BALANCE_DEFAULT_IDR = 20_000;
const CARD_HISTORY_LIMIT = 20;

export type TransitCardSource = "none" | "simulated" | "manual" | "nfc";

export type TransitCardHistoryEntry = {
  id: string;
  label: string;
  timestamp: string;
  /** The change from the balance before this entry. */
  deltaIdr: number;
  /** True only for a history row produced by the simulated tap. */
  simulated: boolean;
};

export type TransitCardState = {
  cardLabel: string;
  balanceIdr: number | null;
  lowBalanceThresholdIdr: number;
  remindLowBalance: boolean;
  lastReadAt: string | null;
  source: TransitCardSource;
  history: TransitCardHistoryEntry[];
};

export const DEFAULT_TRANSIT_CARD: TransitCardState = {
  cardLabel: "JakLingko",
  balanceIdr: null,
  lowBalanceThresholdIdr: LOW_BALANCE_DEFAULT_IDR,
  remindLowBalance: true,
  lastReadAt: null,
  source: "none",
  history: [],
};

function isCardSource(value: unknown): value is TransitCardSource {
  return (
    value === "none" ||
    value === "simulated" ||
    value === "manual" ||
    value === "nfc"
  );
}

function isHistoryEntry(value: unknown): value is TransitCardHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["id"] === "string" &&
    typeof row["label"] === "string" &&
    typeof row["timestamp"] === "string" &&
    typeof row["deltaIdr"] === "number" &&
    Number.isFinite(row["deltaIdr"]) &&
    typeof row["simulated"] === "boolean"
  );
}

export function readTransitCard(): TransitCardState {
  const store = browserStorage();
  if (!store) return { ...DEFAULT_TRANSIT_CARD };
  try {
    const raw = store.getItem(TRANSIT_CARD_KEY);
    if (!raw) return { ...DEFAULT_TRANSIT_CARD };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_TRANSIT_CARD };
    const row = parsed as Record<string, unknown>;
    const history = Array.isArray(row["history"])
      ? row["history"].filter(isHistoryEntry)
      : [];
    return {
      cardLabel:
        typeof row["cardLabel"] === "string" && row["cardLabel"].trim().length > 0
          ? row["cardLabel"]
          : DEFAULT_TRANSIT_CARD.cardLabel,
      balanceIdr:
        typeof row["balanceIdr"] === "number" && Number.isFinite(row["balanceIdr"])
          ? Math.max(0, Math.round(row["balanceIdr"]))
          : null,
      lowBalanceThresholdIdr:
        typeof row["lowBalanceThresholdIdr"] === "number" &&
        Number.isFinite(row["lowBalanceThresholdIdr"])
          ? Math.max(0, Math.round(row["lowBalanceThresholdIdr"]))
          : DEFAULT_TRANSIT_CARD.lowBalanceThresholdIdr,
      remindLowBalance:
        typeof row["remindLowBalance"] === "boolean"
          ? row["remindLowBalance"]
          : DEFAULT_TRANSIT_CARD.remindLowBalance,
      lastReadAt: typeof row["lastReadAt"] === "string" ? row["lastReadAt"] : null,
      source: isCardSource(row["source"]) ? row["source"] : "none",
      history: history.slice(0, CARD_HISTORY_LIMIT),
    };
  } catch {
    return { ...DEFAULT_TRANSIT_CARD };
  }
}

function writeTransitCard(state: TransitCardState): TransitCardState {
  const next: TransitCardState = {
    ...state,
    history: state.history.slice(0, CARD_HISTORY_LIMIT),
  };
  const store = browserStorage();
  if (store) {
    try {
      store.setItem(TRANSIT_CARD_KEY, JSON.stringify(next));
    } catch {
      // The ledger is a convenience; a refused write leaves this visit.
    }
  }
  return next;
}

let cardEntryCounter = 0;

function nextEntryId(): string {
  cardEntryCounter += 1;
  return `card-${Date.now()}-${cardEntryCounter}`;
}

export function saveTransitCard(patch: Partial<TransitCardState>): TransitCardState {
  return writeTransitCard({ ...readTransitCard(), ...patch });
}

/**
 * Record a balance the rider read from a machine or typed themselves.
 *
 * The change is measured against the balance already stored, so the
 * history says what moved and never guesses a top-up amount.
 */
export function recordManualBalance(
  balanceIdr: number,
  label: string,
): TransitCardState {
  const current = readTransitCard();
  const amount = Number.isFinite(balanceIdr) ? Math.max(0, Math.round(balanceIdr)) : 0;
  const previous = current.balanceIdr;
  const timestamp = new Date().toISOString();
  const entry: TransitCardHistoryEntry = {
    id: nextEntryId(),
    label: label.trim().length > 0 ? label.trim() : "Saldo tercatat",
    timestamp,
    deltaIdr: previous === null ? 0 : amount - previous,
    simulated: false,
  };
  return writeTransitCard({
    ...current,
    balanceIdr: amount,
    source: "manual",
    lastReadAt: timestamp,
    history: [entry, ...current.history],
  });
}

/**
 * A tap that is a rehearsal, not a reading.
 *
 * It replays the balance the rider already recorded and marks the row as
 * simulated. With no balance yet, it says so and invents nothing.
 */
export function simulateCardTap(): TransitCardState {
  const current = readTransitCard();
  const timestamp = new Date().toISOString();
  const entry: TransitCardHistoryEntry = {
    id: nextEntryId(),
    label: "Simulasi tap",
    timestamp,
    deltaIdr: 0,
    simulated: true,
  };
  return writeTransitCard({
    ...current,
    source: "simulated",
    lastReadAt: timestamp,
    history: [entry, ...current.history],
  });
}

/**
 * Record a tap that a real Web NFC scan reported.
 *
 * The scan proving the card exists is honest; the balance is not read
 * from the card, so it stays what the rider last recorded.
 */
export function recordNfcTap(): TransitCardState {
  const current = readTransitCard();
  const timestamp = new Date().toISOString();
  const entry: TransitCardHistoryEntry = {
    id: nextEntryId(),
    label: "Kartu terbaca lewat NFC",
    timestamp,
    deltaIdr: 0,
    simulated: false,
  };
  return writeTransitCard({
    ...current,
    source: "nfc",
    lastReadAt: timestamp,
    history: [entry, ...current.history],
  });
}

export function resetTransitCard(): TransitCardState {
  return writeTransitCard({ ...DEFAULT_TRANSIT_CARD });
}

/* -------------------------------------------------------------------------
 * The monthly recap
 * ---------------------------------------------------------------------- */

export type MonthlyRecap = {
  /** The Jakarta month the numbers describe, such as "November 2026". */
  monthLabel: string;
  totalTrips: number;
  /** The distance walked, rounded to one decimal place in kilometres. */
  walkKm: number;
  /** The mean duration of a recorded journey, or `null` with no trips. */
  averageDurationMinutes: number | null;
  /** The destination the rider finished at most often this month. */
  topDestination: { name: string; count: number } | null;
  /** The share of rated journeys that were roomy or acceptable, 0..1. */
  comfortShare: number | null;
  /** How many of the journeys carry a crowd rating at all. */
  ratedTrips: number;
};

const JAKARTA = "Asia/Jakarta";

function jakartaMonthKey(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
  }).format(instant);
}

/**
 * The month the rider sees, from the completed journeys in the browser.
 *
 * A trip is counted in the Jakarta month it ended in, not the UTC month:
 * a journey finished at 01:00 WIB on the first belongs to the new month.
 * With no trips the function returns zeroes and `null` averages, so the
 * surface can show an honest empty state instead of a plausible number.
 */
export function computeMonthlyRecap(
  trips: readonly CompletedTripRecord[],
  now: Date = new Date(),
): MonthlyRecap {
  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA,
    month: "long",
    year: "numeric",
  }).format(now);
  const wanted = jakartaMonthKey(now);
  const current = trips.filter((trip) => {
    const at = new Date(trip.completedAt);
    if (Number.isNaN(at.getTime())) return false;
    return jakartaMonthKey(at) === wanted;
  });

  if (current.length === 0) {
    return {
      monthLabel,
      totalTrips: 0,
      walkKm: 0,
      averageDurationMinutes: null,
      topDestination: null,
      comfortShare: null,
      ratedTrips: 0,
    };
  }

  const walkKm = Math.round(
    current.reduce((total, trip) => total + trip.walkKm, 0) * 10,
  ) / 10;
  const totalMinutes = current.reduce(
    (total, trip) => total + trip.durationMinutes,
    0,
  );
  const counts = new Map<string, number>();
  for (const trip of current) {
    if (trip.destinationName.trim().length === 0) continue;
    counts.set(trip.destinationName, (counts.get(trip.destinationName) ?? 0) + 1);
  }
  let topDestination: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (topDestination === null || count > topDestination.count) {
      topDestination = { name, count };
    }
  }

  const rated = current.filter(
    (trip) => trip.crowdRating === "lega" || trip.crowdRating === "lumayan" ||
      trip.crowdRating === "desak-desakan",
  );
  const comfortable = rated.filter(
    (trip) => trip.crowdRating === "lega" || trip.crowdRating === "lumayan",
  ).length;

  return {
    monthLabel,
    totalTrips: current.length,
    walkKm,
    averageDurationMinutes: Math.round(totalMinutes / current.length),
    topDestination,
    comfortShare: rated.length > 0 ? comfortable / rated.length : null,
    ratedTrips: rated.length,
  };
}
