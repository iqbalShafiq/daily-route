import {
  BusFront,
  Footprints,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/cn.js";
import {
  isTransitModeTokenId,
  transitModeToken,
  transitModeTokenOf,
  type TransitModeToken,
  type TransitModeTokenId,
} from "../../lib/format.js";

/**
 * The transit mode badge.
 *
 * A mode is always encoded three ways: colour, icon and a text label. The
 * shape and the colour are decorative by themselves; the icon and the label
 * carry the meaning, so a reader who cannot distinguish the reds still reads
 * "KRL" beside the train. The `icon` size keeps the label in the accessible
 * tree even when it is visually hidden.
 */

export type M3ModeBadgeMode = TransitModeTokenId | "bus" | "minibus" | "tram" | "metro" | "rail";

const MODE_ICON: Record<TransitModeTokenId, LucideIcon> = {
  krl: TrainFront,
  mrt: TrainFrontTunnel,
  lrtj: TramFront,
  lrtk: TramFront,
  brt: BusFront,
  nonbrt: BusFront,
  mikro: BusFront,
  walk: Footprints,
};

function resolveToken(mode: M3ModeBadgeMode): TransitModeToken {
  return isTransitModeTokenId(mode) ? transitModeToken(mode) : transitModeTokenOf({ mode });
}

export type M3ModeBadgeProps = {
  /** A token id, or one of the raw transit modes the API returns. */
  mode?: M3ModeBadgeMode;
  /** Optional line facts. When given, they win over `mode`. */
  systemId?: string | null;
  serviceClass?: string | null;
  lineCode?: string | null;
  label?: string;
  size?: "sm" | "md" | "icon";
  className?: string;
};

export function M3ModeBadge({
  mode,
  systemId,
  serviceClass,
  lineCode,
  label,
  size = "sm",
  className,
}: M3ModeBadgeProps) {
  const hasLineFacts = Boolean(systemId ?? serviceClass ?? lineCode);
  const token = hasLineFacts
    ? transitModeTokenOf({ systemId, serviceClass, lineCode })
    : mode
      ? resolveToken(mode)
      : transitModeTokenOf({});
  const Icon = MODE_ICON[token.id];
  // The small badge wears the sheet's compact label (KRL, MRT, TJ, JAK); the
  // medium badge spells the operator out. The icon size keeps the full name
  // in the accessible tree.
  const text = label ?? (size === "sm" ? token.shortLabel : token.label);

  return (
    <span
      className={cn(
        "m3-mode-badge",
        size === "md" && "m3-mode-badge--md",
        size === "icon" && "m3-mode-badge--icon",
        className,
      )}
      style={{ backgroundColor: token.colorVar }}
      aria-label={size === "icon" ? text : undefined}
    >
      <Icon aria-hidden="true" />
      <span className={size === "icon" ? "m3-mode-badge__label--hidden" : undefined}>{text}</span>
    </span>
  );
}
