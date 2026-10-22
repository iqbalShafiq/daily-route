import type { FareRule, FareRules, IntegrationRule } from "@daily-route/transit";

/**
 * The fares, shaped for the application.
 *
 * The research report records what the operators publish. This module turns
 * that document into the rules the fare engine can apply, and it is the
 * only place where a published tariff becomes a number the code uses.
 */

/** The document the research report produced. */
export type FaresDocument = {
  updatedAt: string;
  modes: Record<string, Record<string, unknown>>;
  integrations: Record<string, unknown>[];
  notes: string[];
  /**
   * The public holidays, as ISO dates.
   *
   * The LRT Jabodebek charges the cheaper fare on a public holiday even
   * when it falls on a working day.
   */
  holidays?: string[];
};

type Amount = { amount: number; currency: string; note?: string; label?: string };

function amountOf(value: unknown): Amount | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const amount = record["amount"];
  if (typeof amount !== "number") return null;
  return {
    amount,
    currency: typeof record["currency"] === "string" ? record["currency"] : "IDR",
    ...(typeof record["note"] === "string" ? { note: record["note"] } : {}),
    ...(typeof record["label"] === "string" ? { label: record["label"] } : {}),
  };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The rule of one operator, from the published document. */
function ruleOf(mode: Record<string, unknown>): FareRule | null {
  const structure = text(mode["structure"]);
  const peak = amountOf(mode["peak"]);
  const offPeak = amountOf(mode["offPeak"]);
  // The number of kilometres the base covers and the size of every step
  // are stated by the operator, so they are read from the document and
  // never guessed from the wording of a note.
  const baseKm = numberOf(mode["baseKm"]);
  const stepKm = numberOf(mode["stepKm"]);
  const minimum = amountOf(mode["min"]);
  const maximum = amountOf(mode["max"]);
  const base = amountOf(mode["base"]);
  const perKm = amountOf(mode["perKm"]);

  // The MRT charges per station passed, not per kilometre, even though the
  // fare follows the distance.
  if (text(mode["chargeBy"]) === "station") {
    const perStation = amountOf(mode["perStation"]);
    if (!perStation || !minimum || !maximum) return null;
    return {
      kind: "perStation",
      base: base?.amount ?? minimum.amount,
      perStation: perStation.amount,
      max: maximum.amount,
    };
  }

  switch (structure) {
    case "free": {
      const note = text(mode["note"]);
      if (!note) return null;
      return { kind: "free", note };
    }

    case "flat": {
      if (!peak) return null;
      return {
        kind: "flat",
        amount: peak.amount,
        ...(offPeak && offPeak.amount !== peak.amount
          ? {
              earlyMorningAmount: offPeak.amount,
              earlyMorningHours: text(mode["earlyMorningHours"]) ?? "05:00-07:00",
            }
          : {}),
      };
    }

    case "distance": {
      if (!base || !perKm || !minimum) return null;
      // The base covers a number of kilometres that differs per operator:
      // the LRT Jabodebek charges for the first kilometre, the KRL for the
      // first twenty-five. The document states both numbers.
      if (baseKm === undefined || stepKm === undefined) return null;
      return {
        kind: "perKm",
        base: base.amount,
        baseKm,
        perKm: perKm.amount,
        perKmStepKm: stepKm,
        min: minimum.amount,
        ...(maximum && maximum.amount > 0 ? { max: maximum.amount } : {}),
        ...(offPeak && offPeak.amount !== peak?.amount
          ? {
              offPeakMax: offPeak.amount,
              peakHours: text(mode["peakHours"]) ?? "06:00-09:00,16:00-20:00",
            }
          : {}),
      };
    }

    default:
      return null;
  }
}

/** The combined tickets the operators sell. */
function integrationOf(entry: Record<string, unknown>): IntegrationRule | null {
  const id = text(entry["id"]);
  const label = text(entry["label"]);
  const price = amountOf(entry["price"]);
  const boarding = amountOf(entry["boardingAmount"]);
  const perKm = amountOf(entry["thenPerKm"]);
  if (!id || !label || !price) return null;
  // A scheme that is not confirmed by the operator, or that has no price
  // of its own, is not offered to the rider.
  if (entry["verified"] === false) return null;
  if (price.amount <= 0) return null;

  // The operators the scheme covers are named explicitly: the prose
  // mentions the operators it excludes just as often as the ones it
  // includes.
  const covers = Array.isArray(entry["covers"])
    ? entry["covers"].filter((value): value is string => typeof value === "string")
    : [];
  const durationMinutes =
    typeof entry["durationHours"] === "number" ? entry["durationHours"] * 60 : 180;
  const note = text(entry["note"]) ?? text(entry["includes"]) ?? "";

  if (text(entry["kind"]) === "operatorContinuation") {
    // The continuation ticket only has a price for the rider who holds
    // the card the operator names, so without that card the rule cannot
    // be offered.
    const requiresCard = text(entry["requiresCard"]);
    if (!requiresCard) return null;

    return {
      kind: "operatorContinuation",
      id,
      label,
      max: price.amount,
      covers,
      durationMinutes,
      note,
      requiresCard,
    };
  }

  return {
    kind: "multiModal",
    id,
    label,
    boardingAmount: boarding?.amount ?? price.amount,
    perKm: perKm?.amount ?? 0,
    max: price.amount,
    covers,
    durationMinutes,
    note,
  };
}

/** Shape the research document into the rules the engine applies. */
export function loadFareRules(document: FaresDocument): FareRules {
  const modes: Record<string, FareRule> = {};

  for (const [key, mode] of Object.entries(document.modes)) {
    const rule = ruleOf(mode);
    if (rule) modes[key] = rule;
  }

  // The Royaltrans service has one price, and the route to Serpong
  // another; the document states both.
  if (!modes["transjakarta-royaltrans"]) {
    modes["transjakarta-royaltrans"] = { kind: "flat", amount: 20_000 };
  }

  const integrations = document.integrations
    .map((entry) => integrationOf(entry as Record<string, unknown>))
    .filter((rule): rule is IntegrationRule => rule !== null)
    .filter((rule) => rule.covers.length > 0);

  return { modes, integrations, holidays: document.holidays ?? [] };
}
