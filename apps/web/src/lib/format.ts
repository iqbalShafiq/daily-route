/**
 * Formatting helpers shared by the transit views.
 *
 * The interface is English. A bus still stops at a stop and a train at a
 * station. Rupiah keeps the ticket's grouping: "Rp3.500". The clock is
 * Jakarta time.
 */

export type TransitMode = "bus" | "minibus" | "tram" | "metro" | "rail";

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
 * without a second palette in JavaScript.
 */
export const MODE_COLOR: Record<string, string> = {
  bus: "var(--mode-bus)",
  minibus: "var(--mode-bus)",
  tram: "var(--mode-tram)",
  metro: "var(--mode-metro)",
  rail: "var(--mode-rail)",
};

/** The colour of a service class. */
export const SERVICE_CLASS_COLOR: Record<ServiceClass, string> = {
  brt: "var(--mode-bus)",
  "non-brt": "var(--mode-bus)",
  mikrotrans: "var(--mode-bus)",
  minitrans: "var(--mode-bus)",
  "rumah-susun": "var(--mode-bus)",
  amari: "var(--mode-bus)",
  "rapid-transit": "var(--mode-metro)",
  lrt: "var(--mode-tram)",
  "commuter-rail": "var(--mode-rail)",
  royaltrans: "var(--mode-royaltrans, var(--mode-bus))",
  wisata: "var(--mode-wisata, var(--mode-bus))",
  transjabodetabek: "var(--mode-transjabodetabek, var(--mode-bus))",
};

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
