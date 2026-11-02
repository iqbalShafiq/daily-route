/**
 * The fare of a journey.
 *
 * The rules come from the operators' own published tariffs, which the
 * research report records in `research/data/fares.json`. The pipeline
 * shapes that document into the rules below, and this module does the
 * arithmetic: what a rider pays for one journey, leg by leg, and when a
 * combined ticket is cheaper than paying separately.
 *
 * Every rule is a published tariff, and every rule that is not confirmed
 * by the operator is marked as such and left out of the total.
 */

import type { Itinerary, ServiceClass } from "./types.js";

/** A fare that does not depend on the distance. */
export type FlatFare = {
  kind: "flat";
  /** The amount in rupiah, the price the operator charges as a rule. */
  amount: number;
  /**
   * The amount in rupiah during the cheaper hours, when there are any.
   *
   * Transjakarta charges less in the early morning, and the name says
   * so: it is not an "off-peak" that happens to be early.
   */
  earlyMorningAmount?: number;
  /** The hours the cheaper amount applies, in local time. */
  earlyMorningHours?: string;
};

/** A fare that is free for the passenger, with a reason. */
export type FreeFare = {
  kind: "free";
  /** Why it is free, and until when. */
  note: string;
};

/** A fare that counts the stations the vehicle passes. */
export type StationFare = {
  kind: "perStation";
  /** The amount for the first station. */
  base: number;
  /** The amount for every further station. */
  perStation: number;
  /** The highest amount the operator charges. */
  max: number;
};

/** A fare that counts the distance travelled. */
export type DistanceFare = {
  kind: "perKm";
  /** The amount for the first `baseKm` kilometres. */
  base: number;
  /** How many kilometres the base covers. */
  baseKm: number;
  /** The amount for every further kilometre. */
  perKm: number;
  /** How many kilometres one step of `perKm` covers. */
  perKmStepKm: number;
  /** The lowest amount the operator charges. */
  min: number;
  /** The highest amount the operator charges, when there is one. */
  max?: number;
  /** The highest amount during the peak hours, when it is lower. */
  offPeakMax?: number;
  /** The hours the peak applies, in local time. */
  peakHours?: string;
};

export type FareRule = FlatFare | FreeFare | StationFare | DistanceFare;

/** A rule per operator. */
export type FareRules = {
  modes: Record<string, FareRule>;
  /** The combined tickets that cover more than one operator. */
  integrations: IntegrationRule[];
  /**
   * What a rider has to do to pay, per operator.
   *
   * The sentence is the operator's own rule — where to tap, the balance
   * the gate asks for — and it is shown with the price.
   */
  access?: Record<string, string>;
  /**
   * A tariff the research recorded but the operator has not confirmed.
   *
   * The amount is not added to the journey. The sentence says why.
   */
  withheld?: Record<string, string>;
  /**
   * The public holidays, as ISO dates.
   *
   * The LRT Jabodebek charges the cheaper fare on a public holiday even
   * when it falls on a working day, so the calendar decides the price.
   */
  holidays: readonly string[];
};

/**
 * A combined ticket.
 *
 * Two kinds exist, and they are not the same thing. The multimodal ticket
 * joins different operators and its price grows with the distance of the
 * whole journey. The continuation ticket keeps one operator's own
 * services together and caps what a rider pays when they change vehicles
 * inside a window; that price only exists when the rider holds the card
 * the operator names.
 */
export type IntegrationRule =
  | {
      kind: "multiModal";
      id: string;
      label: string;
      /** The amount that starts the journey. */
      boardingAmount: number;
      /** The amount for every kilometre of the whole journey. */
      perKm: number;
      /** The highest amount for the whole journey. */
      max: number;
      /** The operators the ticket covers. */
      covers: string[];
      /** How long the ticket is valid, in minutes. */
      durationMinutes: number;
      /** The note that explains the limits. */
      note: string;
    }
  | {
      kind: "operatorContinuation";
      id: string;
      label: string;
      /** The highest amount for the whole journey. */
      max: number;
      /** The operators the ticket covers. */
      covers: string[];
      /** How long the ticket is valid, in minutes. */
      durationMinutes: number;
      /** The note that explains the limits. */
      note: string;
      /** The card the rider has to hold for this price. */
      requiresCard: string;
    };

/**
 * Where the operator takes the fare.
 *
 * A gate charges when the rider enters the paid area and again only when
 * they have left it. A vehicle charges every time they board, because the
 * reader is on the bus.
 */
export type Billing = "gate" | "vehicle";

/** One leg of a journey, as the fare engine sees it. */
export type FareLeg = {
  kind: "walk" | "ride";
  /** The operator the leg belongs to, e.g. "transjakarta-brt". */
  operator: string | null;
  /** The distance of the leg, in kilometres. */
  distanceKm: number;
  /** The number of stations the vehicle passes, including the ends. */
  stopCount: number;
  /** The station the leg starts at, when the planner knows it. */
  fromStationId?: string | null;
  /** The station the leg ends at, when the planner knows it. */
  toStationId?: string | null;
  /**
   * How this ride is charged.
   *
   * Absent means the caller does not know, and each ride is then charged
   * on its own. That keeps a quote without a station graph well defined.
   */
  billing?: Billing;
};

export type FareBreakdownItem = {
  label: string;
  amountIdr: number;
  detail?: string;
};

/**
 * Another price that is legal for the same journey.
 *
 * A price that depends on the card the rider holds is not one number but
 * two, and hiding the second one would tell the rider the wrong amount.
 */
export type FareAlternative = {
  label: string;
  amountIdr: number;
  note: string;
};

export type FareQuote = {
  /** The amount the rider pays, in rupiah. */
  totalIdr: number;
  breakdown: FareBreakdownItem[];
  /** The combined ticket, when it is the better way to travel. */
  integration: { id: string; label: string; amountIdr: number; note: string } | null;
  /** The other legal prices, each with the condition that makes it apply. */
  alternatives: FareAlternative[];
  /** The remarks the rider should know. */
  notes: string[];
  /** The rules that could not be confirmed by the operator. */
  unverified: string[];
};

const RUPIAH = "Rp";

/** Format an amount the way a ticket does. */
export function formatRupiah(amount: number): string {
  return `${RUPIAH}${Math.round(amount).toLocaleString("id-ID")}`;
}

/** A distance the way a rider reads it: "9,3 km", "40 km". */
function formatFareDistance(distanceKm: number): string {
  const rounded = Math.round(distanceKm * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} km`;
}

/** A published clock window, with the Indonesian dot: "05.00-07.00". */
function formatClockWindow(window: string): string {
  return window.replaceAll(":", ".");
}

/**
 * The local time of a moment, in the operators' time zone.
 *
 * The operators publish their tariffs in Western Indonesian Time, and the
 * clock they use is the clock on the wall in Jakarta, whatever the time
 * zone of the device happens to be.
 */
export function localTimeParts(at: Date): {
  weekday: number;
  hour: number;
  minute: number;
  /** The date in Jakarta, as `YYYY-MM-DD`. */
  date: string;
} {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(at);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    weekday: weekdayMap[read("weekday")] ?? 1,
    hour: Number(read("hour")) % 24,
    minute: Number(read("minute")),
    date: `${read("year")}-${read("month")}-${read("day")}`,
  };
}

/** Whether a moment falls inside a window such as "05:00-07:00". */
function isWithinWindow(
  hour: number,
  minute: number,
  window: string | undefined,
): boolean {
  if (!window) return false;
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(window.trim());
  if (!match) return false;

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);
  const current = hour * 60 + minute;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (start <= end) return current >= start && current < end;
  // The window runs over midnight.
  return current >= start || current < end;
}

/**
 * Whether a moment falls inside a peak window such as
 * "06:00-09:00,16:00-20:00".
 *
 * The peak applies on working days only, and a public holiday counts as
 * a day off even when it falls on a Monday to Friday.
 */
function isPeak(
  at: Date,
  window: string | undefined,
  holidays: readonly string[],
): boolean {
  if (!window) return false;
  const { weekday, hour, minute, date } = localTimeParts(at);
  // The peak applies on working days only.
  if (weekday === 0 || weekday === 6) return false;
  if (holidays.includes(date)) return false;

  return window
    .split(",")
    .some((part) => isWithinWindow(hour, minute, part.trim()));
}

/** The fare of one leg, under the rule of its operator. */
function fareOfLeg(
  rule: FareRule,
  leg: FareLeg,
  at: Date,
  holidays: readonly string[],
): { amount: number; detail?: string } {
  switch (rule.kind) {
    case "free":
      return { amount: 0, detail: rule.note };

    case "flat": {
      const { hour, minute } = localTimeParts(at);
      const earlyMorning =
        rule.earlyMorningAmount !== undefined &&
        isWithinWindow(hour, minute, rule.earlyMorningHours);
      if (earlyMorning && rule.earlyMorningAmount !== undefined) {
        return {
          amount: rule.earlyMorningAmount,
          detail: `Early morning (${formatClockWindow(rule.earlyMorningHours ?? "")})`,
        };
      }
      return { amount: rule.amount };
    }

    case "perStation": {
      // The first station is the base, every further one costs more.
      const stations = Math.max(1, leg.stopCount - 1);
      const amount = Math.min(rule.max, rule.base + stations * rule.perStation);
      return { amount, detail: `${leg.stopCount} ${leg.stopCount === 1 ? "stop" : "stops"} on this ride` };
    }

    case "perKm": {
      const distance = Math.max(0, leg.distanceKm);
      let amount = rule.base;
      if (distance > rule.baseKm) {
        const extraKm = distance - rule.baseKm;
        const steps = Math.ceil(extraKm / rule.perKmStepKm);
        amount += steps * rule.perKm;
      }
      amount = Math.max(rule.min, amount);

      const peak = isPeak(at, rule.peakHours, holidays);
      const ceiling = peak ? rule.max : (rule.offPeakMax ?? rule.max);
      if (ceiling !== undefined) amount = Math.min(ceiling, amount);

      return {
        amount,
        detail: formatFareDistance(distance),
      };
    }
  }
}

const GATE_CLASSES = new Set<ServiceClass>([
  "brt",
  "rapid-transit",
  "lrt",
  "commuter-rail",
]);

/**
 * Whether a service charges at a gate or on the vehicle.
 *
 * BRT, MRT, LRT and KRL charge at the entrance of the paid area. Changing
 * platform or corridor inside that area is still the same ticket. A bus
 * with the reader at the door charges every boarding.
 */
export function billingFor(serviceClass: ServiceClass | null): Billing {
  if (serviceClass && GATE_CLASSES.has(serviceClass)) return "gate";
  return "vehicle";
}

/**
 * The rides of one itinerary, in the shape the fare engine reads.
 *
 * Station ids and the billing kind travel with the ride, so a change of
 * vehicle inside one halte is not priced as a second ticket.
 */
export function fareLegsOf(itinerary: Itinerary): FareLeg[] {
  return itinerary.legs.map((leg) => ({
    kind: leg.kind,
    operator:
      leg.kind === "ride" && leg.lineId
        ? fareOperatorFor({
            systemId: leg.lineId.split(":")[0] ?? "",
            serviceClass: leg.serviceClass,
            lineCode: leg.lineCode,
          })
        : null,
    distanceKm: leg.distanceKm,
    stopCount: leg.stops.length,
    fromStationId: leg.fromStationId,
    toStationId: leg.toStationId,
    ...(leg.kind === "ride" ? { billing: billingFor(leg.serviceClass) } : {}),
  }));
}

type FareSession = {
  operator: string;
  distanceKm: number;
  stopCount: number;
  rides: number;
  tail: FareLeg;
};

/**
 * One charge.
 *
 * Gate rides of the same operator that meet at the same station are one
 * stay in the paid area: the rider never passed an exit gate. A walk, a
 * different station, or a reader on the vehicle starts a new charge. When
 * the station is unknown the rides stay separate, which is the cautious
 * reading.
 */
function fareSessions(legs: readonly FareLeg[]): FareSession[] {
  const sessions: FareSession[] = [];
  let current: FareSession | null = null;
  let leftTheArea = false;

  for (const leg of legs) {
    if (leg.kind !== "ride" || !leg.operator) {
      if (leg.kind === "walk" && current) leftTheArea = true;
      continue;
    }

    if (current && !leftTheArea && samePaidArea(current.tail, leg)) {
      current.distanceKm += leg.distanceKm;
      current.stopCount += Math.max(0, leg.stopCount - 1);
      current.rides += 1;
      current.tail = leg;
    } else {
      current = {
        operator: leg.operator,
        distanceKm: leg.distanceKm,
        stopCount: Math.max(1, leg.stopCount),
        rides: 1,
        tail: leg,
      };
      sessions.push(current);
    }
    leftTheArea = false;
  }

  return sessions;
}

/** Two gate rides that meet inside one station, without leaving it. */
function samePaidArea(previous: FareLeg, next: FareLeg): boolean {
  if (previous.billing !== "gate" || next.billing !== "gate") return false;
  if (!previous.operator || previous.operator !== next.operator) return false;
  if (!previous.toStationId || !next.fromStationId) return false;
  return previous.toStationId === next.fromStationId;
}

function sessionLeg(session: FareSession): FareLeg {
  return {
    kind: "ride",
    operator: session.operator,
    distanceKm: session.distanceKm,
    stopCount: session.stopCount,
  };
}

/** Where a same-area change happens, in the operator's own word. */
function paidAreaWord(operator: string): string {
  return operator.startsWith("transjakarta") ? "stop" : "station";
}

/**
 * The price of a journey.
 *
 * A combined ticket is offered when it covers every charge and costs less
 * than paying each charge on its own. Walking is free. A change of vehicle
 * inside one paid area is one charge, not one charge per vehicle.
 */
export function quoteFare(input: {
  legs: readonly FareLeg[];
  rules: FareRules;
  /** The moment the journey starts, which decides the time-of-day rules. */
  at: Date;
  /** The labels of the operators, for the breakdown. */
  labels?: Record<string, string>;
}): FareQuote {
  const sessions = fareSessions(input.legs);
  const breakdown: FareBreakdownItem[] = [];
  const notes: string[] = [];
  const unverified: string[] = [];

  let separateTotal = 0;

  for (const session of sessions) {
    const operator = session.operator;
    const rule = input.rules.modes[operator];
    if (!rule) {
      unverified.push(operator);
      const withheld = input.rules.withheld?.[operator];
      if (withheld) notes.push(withheld);
      continue;
    }

    const fare = fareOfLeg(rule, sessionLeg(session), input.at, input.rules.holidays);
    separateTotal += fare.amount;
    const label = input.labels?.[operator] ?? operator;
    const stayed =
      session.rides > 1
        ? `Includes a change inside the same ${paidAreaWord(operator)}`
        : undefined;
    // The measure and the transfer are two facts. A comma makes them
    // read as one clause, so each one keeps its own sentence.
    const detail = [fare.detail, stayed].filter((part) => part && part.length > 0).join(". ");
    breakdown.push({
      label,
      amountIdr: fare.amount,
      ...(detail ? { detail } : {}),
    });
  }

  // The combined ticket, when every vehicle of the journey is covered.
  let integration: FareQuote["integration"] = null;
  const alternatives: FareAlternative[] = [];
  const totalDistance = sessions.reduce((total, session) => total + session.distanceKm, 0);

  for (const candidate of input.rules.integrations) {
    if (candidate.kind === "multiModal") {
      const covered = sessions.every((session) => candidate.covers.includes(session.operator));
      if (!covered || sessions.length === 0) continue;
      /*
       * The scheme exists to combine modes, not to make one mode cheaper.
       * Two charges of the same operator are that operator's own ticket,
       * so the scheme is only offered when the journey really does use
       * more than one operator.
       */
      const operators = new Set(sessions.map((session) => session.operator));
      if (operators.size < 2) continue;

      const amount = Math.min(
        candidate.max,
        candidate.boardingAmount + totalDistance * candidate.perKm,
      );
      if (amount >= separateTotal) continue;

      integration = {
        id: candidate.id,
        label: candidate.label,
        amountIdr: Math.round(amount),
        note: candidate.note,
      };
      notes.push(candidate.note);
      break;
    }

    /*
     * The continuation ticket caps what one operator charges when the
     * rider pays for a second boarding inside the window. Staying inside
     * one halte is not a second boarding. Every charge has to be one the
     * ticket covers, and the price only exists for a rider who holds the
     * card the operator names. Without that card every boarding is charged
     * on its own, so that price is offered as well.
     */
    const coveredSessions = sessions.filter((session) =>
      candidate.covers.includes(session.operator),
    );
    if (coveredSessions.length < 2) continue;
    const everyRideCovered = sessions.every((session) =>
      candidate.covers.includes(session.operator),
    );
    if (!everyRideCovered) continue;

    const amount = Math.min(candidate.max, separateTotal);
    if (amount >= separateTotal) continue;

    integration = {
      id: candidate.id,
      label: candidate.label,
      amountIdr: Math.round(amount),
      note: candidate.note,
    };
    notes.push(candidate.note);
    alternatives.push({
      label: `Without ${candidate.requiresCard}`,
      amountIdr: Math.round(separateTotal),
      note: "Each boarding is charged on its own.",
    });
    break;
  }

  const total = integration ? integration.amountIdr : separateTotal;

  if (!integration && separateTotal > 0 && sessions.length > 1) {
    notes.push(
      "Each boarding is charged on its own. An integrated ticket does not cover this combination.",
    );
  }

  const seen = new Set<string>();
  for (const session of sessions) {
    const operator = session.operator;
    if (seen.has(operator)) continue;
    seen.add(operator);
    const access = input.rules.access?.[operator];
    if (access) notes.push(access);
  }

  const explained = unverified.every((operator) => input.rules.withheld?.[operator]);
  if (unverified.length > 0 && !explained) {
    notes.push(
      "Part of this journey has no verified fare, so that part is not included in the total.",
    );
  }

  return {
    totalIdr: Math.round(total),
    breakdown: integration
      ? [
          {
            label: integration.label,
            amountIdr: integration.amountIdr,
            detail: formatFareDistance(totalDistance),
          },
        ]
      : breakdown,
    integration,
    alternatives,
    notes,
    unverified,
  };
}

/**
 * The operator whose tariff a leg is charged under.
 *
 * The service class says what kind of service it is, and the system says
 * who runs it; together they name the tariff that applies.
 */
export function fareOperatorFor(leg: {
  systemId: string;
  serviceClass: string | null;
  /** The code of the line, when the operator prices a route on its own. */
  lineCode?: string | null;
}): string | null {
  const code = (leg.lineCode ?? "").replace(/\./g, "").toUpperCase();

  // Two services are priced per route rather than per kind of service.
  // The Royaltrans to Summarecon Serpong is more than double the usual
  // price, and the Transbandara to the airport was set at its own tariff.
  if (leg.serviceClass === "royaltrans" && code === "S14") {
    return "transjakarta-royaltrans-s14";
  }
  if (leg.serviceClass === "transjabodetabek" && code === "SH2") {
    return "transjakarta-transbandara";
  }

  switch (leg.serviceClass) {
    case "brt":
      return "transjakarta-brt";
    case "non-brt":
    case "minitrans":
    // The night bus carries the same ticket as the daytime service.
    case "amari": // eslint-disable-line no-fallthrough
      return "transjakarta-non-brt";
    case "mikrotrans":
      return "transjakarta-mikrotrans";
    case "royaltrans":
      return "transjakarta-royaltrans";
    // The sightseeing buses and the buses that serve the housing blocks
    // are free for the passenger; the cross-border services carry the
    // regular fare.
    case "wisata":
      return "transjakarta-wisata";
    case "rumah-susun":
      return "transjakarta-rumah-susun";
    case "transjabodetabek":
      return "transjakarta-transjabodetabek";
    case "rapid-transit":
      return "mrt-jakarta";
    case "lrt":
      return leg.systemId === "lrt-jabodebek" ? "lrt-jabodebek" : "lrt-jakarta";
    case "commuter-rail":
      return "krl-jabodetabek";
    default:
      return null;
  }
}

/** The names the operators are known by, for the breakdown. */
export const FARE_OPERATOR_LABELS: Record<string, string> = {
  "transjakarta-royaltrans-s14": "Royaltrans Lebak Bulus - Summarecon Serpong",
  "transjakarta-transbandara": "Transbandara Blok M - Bandara Soekarno-Hatta",
  "transjakarta-brt": "Transjakarta BRT",
  "transjakarta-non-brt": "Transjakarta Metrotrans / Minitrans",
  "transjakarta-feeder": "Transjakarta Mikrotrans",
  "transjakarta-mikrotrans": "Transjakarta Mikrotrans",
  "transjakarta-wisata": "Bus Wisata Transjakarta",
  "transjakarta-rumah-susun": "Bus rusun Transjakarta",
  "transjakarta-transjabodetabek": "Transjabodetabek",
  "transjakarta-royaltrans": "Transjakarta Royaltrans",
  "mrt-jakarta": "MRT Jakarta",
  "lrt-jakarta": "LRT Jakarta",
  "lrt-jabodebek": "LRT Jabodebek",
  "krl-jabodetabek": "KRL Jabodetabek",
};
