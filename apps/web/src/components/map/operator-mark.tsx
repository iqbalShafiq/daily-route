import krl from "../../assets/operators/krl.svg";
import lrtJabodebek from "../../assets/operators/lrt-jabodebek.svg";
import lrtJabodebekMark from "../../assets/operators/lrt-jabodebek-mark.svg";
import lrtJakarta from "../../assets/operators/lrt-jakarta.svg";
import lrtJakartaMark from "../../assets/operators/lrt-jakarta-mark.svg";
import mrtJakarta from "../../assets/operators/mrt-jakarta.svg";
import mrtJakartaMark from "../../assets/operators/mrt-jakarta-mark.svg";
import krlMark from "../../assets/operators/krl-mark.svg";
import transjakarta from "../../assets/operators/transjakarta.svg";
import transjakartaMark from "../../assets/operators/transjakarta-mark.svg";
import { cn } from "../../lib/cn.js";
import { ServiceMark } from "../transit/service-mark.js";

/**
 * The operators' own marks.
 *
 * The files are the logos the operators publish. Each one is a simple
 * geometric mark that Wikimedia Commons records as free of copyright,
 * and each one is still the operator's trademark. They are shown here
 * only to name the service. Nothing in this file redraws them.
 *
 * Transjakarta: TransJakarta Logo.svg, transjakarta.go.id. The compact
 * file is that same symbol, cropped from the wordmark. It is not redrawn.
 * MRT Jakarta: MRT Jakarta (logo only).svg, annual report 2019.
 * LRT Jakarta: Jakarta LRT logo.svg, lrtjakarta.co.id annual report 2022.
 * LRT Jabodebek: Jabodebek LRT.svg, kai.id.
 * KRL: Logo KAI Commuter.svg, kai.id.
 */

export const NETWORK_SYSTEMS = [
  { id: "transjakarta", label: "Transjakarta", logo: transjakarta, color: "var(--mode-bus)" },
  { id: "mrt-jakarta", label: "MRT Jakarta", logo: mrtJakarta, color: "var(--mode-metro)" },
  { id: "lrt-jakarta", label: "LRT Jakarta", logo: lrtJakarta, color: "var(--mode-tram)" },
  { id: "lrt-jabodebek", label: "LRT Jabodebek", logo: lrtJabodebek, color: "var(--mode-lrt-jabodebek)" },
  { id: "krl-jabodetabek", label: "KRL", logo: krl, color: "var(--mode-rail)" },
] as const;

const MARK_OF = new Map(NETWORK_SYSTEMS.map((entry) => [entry.id, entry.logo]));

/** Compact symbols. The legend keeps the wordmark beside the name. */
const COMPACT_OF = new Map<string, string>([
  ["transjakarta", transjakartaMark],
  ["mrt-jakarta", mrtJakartaMark],
  ["lrt-jakarta", lrtJakartaMark],
  ["lrt-jabodebek", lrtJabodebekMark],
  ["krl-jabodetabek", krlMark],
]);

export function operatorCompact(systemId: string): string | null {
  return COMPACT_OF.get(systemId) ?? null;
}

/** The wordmark, for a row that has room to spell the operator's name. */
export function operatorLogo(systemId: string): string | null {
  return MARK_OF.get(systemId as (typeof NETWORK_SYSTEMS)[number]["id"]) ?? null;
}

/**
 * The mark on the map and in a journey row.
 *
 * A compact symbol wins where one is published, because a wordmark does
 * not fit a stop or a 32 px row.
 */
export function operatorMark(systemId: string): string | null {
  return operatorCompact(systemId) ?? operatorLogo(systemId);
}

/** The compact symbol for a line, when that operator publishes one. */
export function operatorCompactForLine(lineId: string | null | undefined): string | null {
  if (!lineId) return null;
  const system = NETWORK_SYSTEMS.find(
    (entry) => lineId === entry.id || lineId.startsWith(`${entry.id}:`),
  );
  return system ? operatorCompact(system.id) : null;
}

/**
 * The operator's own mark when it fits the row, otherwise the service glyph.
 *
 * The glyph stays for an operator whose only published file is a wordmark.
 */
export function RideIdentity({
  lineId,
  serviceClass,
  className,
}: {
  lineId: string | null | undefined;
  serviceClass: string | null | undefined;
  className?: string;
}) {
  const compact = operatorCompactForLine(lineId);
  if (compact) {
    return <img src={compact} alt="" className={cn("object-contain", className)} />;
  }
  return className ? (
    <ServiceMark serviceClass={serviceClass} className={className} />
  ) : (
    <ServiceMark serviceClass={serviceClass} />
  );
}

export function operatorLabel(systemId: string): string {
  return NETWORK_SYSTEMS.find((entry) => entry.id === systemId)?.label ?? systemId;
}

/** The image name MapLibre looks up for one operator. */
export function operatorImageId(systemId: string): string {
  return `op-${systemId}`;
}

/** The operator's logo, for the legend. */
export function OperatorBadge({
  logo,
  className,
}: {
  logo: string;
  className?: string;
}) {
  return <img src={logo} alt="" className={className} />;
}
