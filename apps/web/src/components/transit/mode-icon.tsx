import { Bus, Footprints, Train, TrainFront, TramFront, type LucideIcon } from "lucide-react";

/**
 * The mode icon.
 *
 * Each transport mode gets its own pictogram, so a rider reads the mode
 * before reading the label. The colour comes from the mode token, which
 * follows the theme.
 */

const ICONS: Record<string, LucideIcon> = {
  bus: Bus,
  minibus: Bus,
  metro: TrainFront,
  tram: TramFront,
  rail: Train,
  walk: Footprints,
};

export function ModeIcon({
  mode,
  className,
  style,
}: {
  mode: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = ICONS[mode] ?? Bus;
  return <Icon aria-hidden className={className} style={style} />;
}
