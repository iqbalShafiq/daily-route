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
   * The public holidays, as ISO dates.
   *
   * The LRT Jabodebek charges the cheaper fare on a public holiday even
   * when it falls on a working day, so the calendar decides the price.
   */
  holidays: readonly string[];
};

export type IntegrationRule = {
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
};

/** One leg of a journey, as the fare engine sees it. */
export type FareLeg = {
  kind: "walk" | "ride";
  /** The operator the leg belongs to, e.g. "transjakarta-brt". */
  operator: string | null;
  /** The distance of the leg, in kilometres. */
  distanceKm: number;
  /** The number of stations the vehicle passes. */
  stopCount: number;
};

export type FareBreakdownItem = {
  label: string;
  amountIdr: number;
  detail?: string;
};

export type FareQuote = {
  /** The amount the rider pays, in rupiah. */
  totalIdr: number;
  breakdown: FareBreakdownItem[];
  /** The combined ticket, when it is the better way to travel. */
  integration: { id: string; label: string; amountIdr: number; note: string } | null;
  /** The remarks the rider should know. */
  notes: string[];
  /** The rules that could not be confirmed by the operator. */
  unverified: string[];
};

const RUPIAH = "Rp";

/** Format an amount the way a ticket does. */
export function formatRupiah(amount: number): string {
  return `${RUPIAH} ${Math.round(amount).toLocaleString("id-ID")}`;
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
          detail: `pagi hari (${rule.earlyMorningHours ?? ""})`,
        };
      }
      return { amount: rule.amount };
    }

    case "perStation": {
      // The first station is the base, every further one costs more.
      const stations = Math.max(1, leg.stopCount - 1);
      const amount = Math.min(rule.max, rule.base + stations * rule.perStation);
      return { amount, detail: `${leg.stopCount} stasiun dilalui` };
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
        detail: `${distance.toFixed(1)} km`,
      };
    }
  }
}

/**
 * The price of a journey.
 *
 * The combined ticket is offered when it covers every vehicle of the
 * journey and costs less than paying for each one separately. Walking
 * between the vehicles is free, and the ticket stays valid for the whole
 * window the operator allows.
 */
export function quoteFare(input: {
  legs: readonly FareLeg[];
  rules: FareRules;
  /** The moment the journey starts, which decides the time-of-day rules. */
  at: Date;
  /** The labels of the operators, for the breakdown. */
  labels?: Record<string, string>;
}): FareQuote {
  const rides = input.legs.filter((leg) => leg.kind === "ride" && leg.operator);
  const breakdown: FareBreakdownItem[] = [];
  const notes: string[] = [];
  const unverified: string[] = [];

  let separateTotal = 0;

  for (const leg of rides) {
    const operator = leg.operator;
    if (!operator) continue;
    const rule = input.rules.modes[operator];
    if (!rule) {
      unverified.push(operator);
      continue;
    }

    const fare = fareOfLeg(rule, leg, input.at, input.rules.holidays);
    separateTotal += fare.amount;
    const label = input.labels?.[operator] ?? operator;
    breakdown.push({
      label,
      amountIdr: fare.amount,
      ...(fare.detail ? { detail: fare.detail } : {}),
    });
  }

  // The combined ticket, when every vehicle of the journey is covered.
  let integration: FareQuote["integration"] = null;
  const totalDistance = rides.reduce((total, leg) => total + leg.distanceKm, 0);

  for (const candidate of input.rules.integrations) {
    const covered = rides.every((leg) => leg.operator && candidate.covers.includes(leg.operator));
    if (!covered) continue;
    // The scheme exists to combine modes, so it is only offered when the
    // journey really does use more than one vehicle.
    if (rides.length < 2) continue;

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

  const total = integration ? integration.amountIdr : separateTotal;

  if (!integration && separateTotal > 0) {
    notes.push(
      "Setiap kendaraan ditagih sendiri; tiket integrasi tidak berlaku untuk kombinasi ini.",
    );
  }

  return {
    totalIdr: Math.round(total),
    breakdown: integration
      ? [
          {
            label: integration.label,
            amountIdr: integration.amountIdr,
            detail: `${totalDistance.toFixed(1)} km`,
          },
        ]
      : breakdown,
    integration,
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
  // The Royaltrans to Serpong is more than double the usual price, and
  // the Transbandara to the airport was set at its own tariff.
  if (leg.serviceClass === "royaltrans" && code === "S13") {
    return "transjakarta-royaltrans-s13";
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
  "transjakarta-royaltrans-s13": "Royaltrans Summarecon Serpong - Tomang",
  "transjakarta-transbandara": "Transbandara Blok M - Bandara Soekarno-Hatta",
  "transjakarta-brt": "Transjakarta BRT (Jakpro)",
  "transjakarta-non-brt": "Transjakarta Metrotrans / Minitrans",
  "transjakarta-feeder": "Transjakarta Mikrotrans",
  "transjakarta-royaltrans": "Transjakarta Royaltrans",
  "mrt-jakarta": "MRT Jakarta",
  "lrt-jakarta": "LRT Jakarta",
  "lrt-jabodebek": "LRT Jabodebek",
  "krl-jabodetabek": "KRL Jabodetabek",
};
