/**
 * Formatting helpers shared by the transit views.
 *
 * The interface is English. A bus still stops at a stop and a train at a
 * station. Rupiah keeps the ticket's grouping: "Rp3.500". The clock is
 * Jakarta time.
 */

import palette from "./m3e-palette.json";

export type TransitMode = "bus" | "minibus" | "tram" | "metro" | "rail" | "walk";

export type ServiceClass =
  | "brt"
  | "non-brt"
  | "mikrotrans"
  | "minitrans"
  | "royaltrans"
  | "wisata"
  | "rumah-susun"
  | "transjabodetabek"
  | "amari"
  | "rapid-transit"
  | "lrt"
  | "commuter-rail";

/** The label a rider would use for a mode. */
export const MODE_LABEL: Record<TransitMode, string> = {
  bus: "Bus",
  minibus: "Minibus",
  tram: "LRT",
  metro: "MRT",
  rail: "KRL",
  walk: "Walk",
};

/**
 * The width of a line on the map, in pixels.
 *
 * The width carries the mode as well as the colour does, so the route
 * stays readable for a reader who cannot tell the colours apart.
 */
export const MODE_WIDTH: Record<string, number> = {
  bus: 5,
  minibus: 5,
  tram: 5.5,
  metro: 6,
  rail: 6.5,
  walk: 3,
};

/**
 * The label for a service class, which is finer than the mode.
 *
 * The wording is the operator's own, so a rider recognises the service
 * they are being told about.
 */
export const SERVICE_CLASS_LABEL: Record<ServiceClass, string> = {
  brt: "BRT",
  "non-brt": "Feeder",
  mikrotrans: "Mikrotrans",
  minitrans: "MiniTrans",
  "rapid-transit": "MRT",
  lrt: "LRT",
  "commuter-rail": "KRL",
  royaltrans: "Royaltrans",
  wisata: "Sightseeing bus",
  "rumah-susun": "Housing bus",
  transjabodetabek: "Transjabodetabek",
  amari: "Night bus (Amari)",
};

/**
 * The colour of a mode.
 *
 * The colour comes from the CSS custom properties, so it follows the theme
 * and the seed without a second palette in JavaScript. The seven M3E mode
 * tokens are the only sources; a mode is never given an ad-hoc colour.
 */
export const MODE_COLOR: Record<string, string> = {
  bus: "var(--brt)",
  minibus: "var(--nonbrt)",
  tram: "var(--lrtj)",
  metro: "var(--mrt)",
  rail: "var(--krl)",
  walk: "var(--walk)",
};

/** The colour of a service class. */
export const SERVICE_CLASS_COLOR: Record<ServiceClass, string> = {
  brt: "var(--brt)",
  "non-brt": "var(--nonbrt)",
  mikrotrans: "var(--mikro)",
  minitrans: "var(--nonbrt)",
  "rumah-susun": "var(--nonbrt)",
  amari: "var(--nonbrt)",
  "rapid-transit": "var(--mrt)",
  // A service class alone cannot tell the two LRT operators apart. The
  // caller that knows the line passes its system id to `transitModeTokenOf`.
  lrt: "var(--lrtj)",
  "commuter-rail": "var(--krl)",
  royaltrans: "var(--nonbrt)",
  wisata: "var(--nonbrt)",
  transjabodetabek: "var(--nonbrt)",
};

/**
 * The seven mode tokens of the M3 Expressive sheet, plus the walk.
 *
 * The compact labels are the sheet's table: KRL, MRT, LRT, TJ, JAK and
 * Jalan. The rider-facing `label` is English, as the rest of the interface
 * is; the compact label is only used where the operator's own shorthand is
 * already understood.
 */
export type TransitModeTokenId =
  "krl" | "mrt" | "lrtj" | "lrtk" | "brt" | "nonbrt" | "mikro" | "walk";

/** Whether a string is one of the eight mode token ids. */
export function isTransitModeTokenId(value: string): value is TransitModeTokenId {
  return (
    value === "krl" ||
    value === "mrt" ||
    value === "lrtj" ||
    value === "lrtk" ||
    value === "brt" ||
    value === "nonbrt" ||
    value === "mikro" ||
    value === "walk"
  );
}

export type TransitModeToken = {
  id: TransitModeTokenId;
  label: string;
  shortLabel: string;
  /** The CSS custom property, ready for an inline `color` or `background`. */
  colorVar: string;
  /** The light-theme value, for a canvas or an image. */
  hexLight: string;
};

const MODE_TOKENS: Record<TransitModeTokenId, TransitModeToken> = {
  krl: {
    id: "krl",
    label: "KRL Commuter",
    shortLabel: "KRL",
    colorVar: "var(--krl)",
    hexLight: palette.modes.krl,
  },
  mrt: {
    id: "mrt",
    label: "MRT Jakarta",
    shortLabel: "MRT",
    colorVar: "var(--mrt)",
    hexLight: palette.modes.mrt,
  },
  lrtj: {
    id: "lrtj",
    label: "LRT Jabodebek",
    shortLabel: "LRT",
    colorVar: "var(--lrtj)",
    hexLight: palette.modes.lrtj,
  },
  lrtk: {
    id: "lrtk",
    label: "LRT Jakarta",
    shortLabel: "LRT",
    colorVar: "var(--lrtk)",
    hexLight: palette.modes.lrtk,
  },
  brt: {
    id: "brt",
    label: "TransJakarta BRT",
    shortLabel: "TJ",
    colorVar: "var(--brt)",
    hexLight: palette.modes.brt,
  },
  nonbrt: {
    id: "nonbrt",
    label: "TransJakarta non-BRT",
    shortLabel: "TJ",
    colorVar: "var(--nonbrt)",
    hexLight: palette.modes.nonbrt,
  },
  mikro: {
    id: "mikro",
    label: "Mikrotrans",
    shortLabel: "JAK",
    colorVar: "var(--mikro)",
    hexLight: palette.modes.mikro,
  },
  walk: {
    id: "walk",
    label: "Walk",
    shortLabel: "Jalan",
    colorVar: "var(--walk)",
    hexLight: palette.modes.walk,
  },
};

export type TransitModeInput = {
  systemId?: string | null | undefined;
  serviceClass?: string | null | undefined;
  mode?: string | null | undefined;
  lineCode?: string | null | undefined;
};

function normaliseModeKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, "-");
}

function token(id: TransitModeTokenId): TransitModeToken {
  return MODE_TOKENS[id];
}

/** The token for an id that is already known. */
export function transitModeToken(id: TransitModeTokenId): TransitModeToken {
  return MODE_TOKENS[id];
}

/**
 * Name the one M3E token a line belongs to.
 *
 * The system id is the strongest fact; the service class separates the
 * Transjakarta brands; the line code catches a Mikrotrans "JAK.01" when the
 * class is missing. An unknown bus defaults to the non-BRT token, which is
 * the generic Transjakarta colour, rather than inventing a new one.
 */
export function transitModeTokenOf(input: TransitModeInput): TransitModeToken {
  const system = normaliseModeKey(input.systemId);
  const serviceClass = normaliseModeKey(input.serviceClass);
  const mode = normaliseModeKey(input.mode);
  const lineCode = normaliseModeKey(input.lineCode);

  if (mode === "walk" || serviceClass === "walk" || system === "walk" || lineCode === "walk") {
    return token("walk");
  }

  if (system.includes("krl") || system.includes("commuter") || mode === "rail") {
    return token("krl");
  }

  if (serviceClass === "commuter-rail") {
    return token("krl");
  }

  if (system.includes("mrt") || mode === "metro") {
    return token("mrt");
  }

  if (serviceClass === "rapid-transit") {
    return token("mrt");
  }

  if (system.includes("jabodebek")) {
    return token("lrtj");
  }

  if (system.includes("lrt-jakarta") || system === "lrtk" || system === "lrt-jkt") {
    return token("lrtk");
  }

  if (system.includes("lrt") || serviceClass === "lrt" || mode === "tram") {
    // With no system id, an LRT is Jabodebek: it is the larger network and
    // the one a bare "LRT" line code in the snapshot refers to.
    return token("lrtj");
  }

  if (serviceClass === "brt") return token("brt");
  if (serviceClass === "mikrotrans" || lineCode.startsWith("jak")) return token("mikro");
  if (
    serviceClass === "non-brt" ||
    serviceClass === "minitrans" ||
    serviceClass === "royaltrans" ||
    serviceClass === "transjabodetabek" ||
    serviceClass === "wisata" ||
    serviceClass === "rumah-susun" ||
    serviceClass === "amari"
  ) {
    return token("nonbrt");
  }

  if (mode === "minibus") return token("nonbrt");
  if (mode === "bus") return token("brt");

  // A corridor code (1, 6A, 9) is a BRT corridor; anything else is a feeder.
  if (/^\d{1,2}[a-z]?$/.test(lineCode)) return token("brt");

  return token("nonbrt");
}

/**
 * The word for the place a vehicle stops at.
 *
 * A bus stops at a stop. A train stops at a station.
 */
export function stopNoun(mode: string | null | undefined): "stop" | "station" {
  return mode === "metro" || mode === "tram" || mode === "rail" ? "station" : "stop";
}

/**
 * The time of a moment, in Jakarta: "21 Oct 2026, 10:14".
 */
export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** `95` becomes "1 hr 35 min"; `8` becomes "8 min". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** `8` becomes "8 min". */
export function formatMinutesLong(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return total === 1 ? "1 min" : `${total} min`;
}

/** A distance in kilometres, without a trailing zero. */
export function formatDistance(kilometers: number): string {
  if (kilometers < 1) return `${Math.round(kilometers * 1000)} m`;
  const value = Math.round(kilometers * 10) / 10;
  return `${value.toLocaleString("en-GB")} km`;
}

/** An ISO timestamp as a Jakarta clock time. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/** An ISO timestamp as a short Jakarta date and time. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/** "3 min ago", "2 hr ago", "just now". */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** The label of a disruption severity. */
export const SEVERITY_LABEL: Record<string, string> = {
  info: "Info",
  warning: "Watch",
  severe: "Serious",
  critical: "Critical",
};

/** The label of a disruption kind. */
export const DISRUPTION_KIND_LABEL: Record<string, string> = {
  diversion: "Diversion",
  closure: "Closure",
  delay: "Delay",
  "service-change": "Service change",
  maintenance: "Maintenance",
  strike: "Strike",
  weather: "Weather",
  unknown: "Notice",
};

/** Format an amount of rupiah the way a ticket does. */
export function formatRupiah(amount: number): string {
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}
