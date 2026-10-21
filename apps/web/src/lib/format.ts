/**
 * Formatting helpers shared by the transit views.
 *
 * The wording follows what riders in Jakarta actually say: "halte", "stasiun",
 * "jika" for "if", and a clock time without a date.
 */

export type TransitMode = "bus" | "minibus" | "tram" | "metro" | "rail";

export type ServiceClass =
  | "brt"
  | "feeder"
  | "minitrans"
  | "non-brt"
  | "rapid-transit"
  | "lrt"
  | "commuter-rail"
  | "royaltrans";

/** The label a rider would use for a mode. */
export const MODE_LABEL: Record<TransitMode, string> = {
  bus: "Bus",
  minibus: "Minibus",
  tram: "LRT",
  metro: "MRT",
  rail: "KRL",
};

/** The label for a service class, which is finer than the mode. */
export const SERVICE_CLASS_LABEL: Record<ServiceClass, string> = {
  brt: "BRT",
  feeder: "Mikrotrans",
  minitrans: "MiniTrans",
  "non-brt": "Non-BRT",
  "rapid-transit": "MRT",
  lrt: "LRT",
  "commuter-rail": "KRL",
  "royaltrans": "Royaltrans",
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
  feeder: "var(--mode-bus)",
  minitrans: "var(--mode-bus)",
  "non-brt": "var(--mode-bus)",
  "rapid-transit": "var(--mode-metro)",
  lrt: "var(--mode-tram)",
  "commuter-rail": "var(--mode-rail)",
  "royaltrans": "var(--mode-royaltrans, var(--mode-bus))",
};

/** `95` becomes "1 jam 35 mnt"; `8` becomes "8 mnt". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} mnt`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} mnt`;
}

/** `8` becomes "8 menit". */
export function formatMinutesLong(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return total === 1 ? "1 menit" : `${total} menit`;
}

/** A distance in kilometres, without a trailing zero. */
export function formatDistance(kilometers: number): string {
  if (kilometers < 1) return `${Math.round(kilometers * 1000)} m`;
  const value = Math.round(kilometers * 10) / 10;
  // Indonesian notation: the decimal separator is a comma.
  return `${value.toLocaleString("id-ID")} km`;
}

/** An ISO timestamp as a local clock time. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/** An ISO timestamp as a short local date and time. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/** "3 minutes ago", "2 hours ago", "just now". */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "baru saja";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}

/** The label of a disruption severity. */
export const SEVERITY_LABEL: Record<string, string> = {
  info: "Informasi",
  warning: "Waspada",
  severe: "Serius",
  critical: "Kritis",
};

/** The label of a disruption kind. */
export const DISRUPTION_KIND_LABEL: Record<string, string> = {
  diversion: "Pengalihan rute",
  closure: "Penutupan",
  delay: "Keterlambatan",
  "service-change": "Perubahan layanan",
  maintenance: "Pemeliharaan",
  strike: "Mogok",
  weather: "Cuaca",
  unknown: "Pemberitahuan",
};
