import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * A tooltip.
 *
 * Icon-only controls carry a tooltip so the interface is usable without
 * guessing. The tooltip is headless: this wrapper only decides how it
 * looks.
 */
export function Tooltip({
  label,
  children,
  side = "bottom",
  className,
  variant = "label",
}: {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  /** A label tooltip is a small headsign; a panel is a paper surface with its own layout. */
  variant?: "label" | "panel";
}) {
  return (
    <BaseTooltip.Provider delay={250}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner
            side={side}
            sideOffset={6}
            className={variant === "panel" ? "z-[70]" : "z-[60]"}
          >
            <BaseTooltip.Popup
              role="tooltip"
              className={cn(
                variant === "panel"
                  ? "z-[70] w-[320px] max-w-[calc(100vw-24px)] rounded-[4px] border border-line bg-surface p-3 text-[12px] leading-[1.45] text-ink shadow-pop"
                  : "z-[60] max-w-64 rounded-[4px] bg-accent px-2 py-2 text-[12px] leading-[1.3] text-accent-ink",
                className,
              )}
            >
              {label}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
