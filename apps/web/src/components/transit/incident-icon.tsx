import {
  ArrowRightLeft,
  Ban,
  Car,
  CircleAlert,
  Clock,
  CloudLightning,
  Flame,
  Megaphone,
  Users,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { incidentMarkOf, type IncidentMark } from "../../lib/incident-mark.js";

const ICON: Record<IncidentMark, LucideIcon> = {
  crash: Car,
  closure: Ban,
  diversion: ArrowRightLeft,
  delay: Clock,
  flood: Waves,
  fire: Flame,
  maintenance: Wrench,
  weather: CloudLightning,
  crowd: Users,
  strike: Megaphone,
  unknown: CircleAlert,
};

/** The case icon for a notice. Colour comes from the parent. */
export function IncidentIcon({
  mark,
  kind,
  className,
}: {
  mark?: string | null | undefined;
  kind?: string | undefined;
  className?: string | undefined;
}) {
  const Icon = ICON[incidentMarkOf(mark, kind ?? "")];
  return <Icon aria-hidden className={className} />;
}
