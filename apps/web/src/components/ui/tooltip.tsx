import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

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
}: {
  label: string;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <BaseTooltip.Provider delay={250}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={side} sideOffset={6}>
            <BaseTooltip.Popup
              className={cn(
                "z-50 max-w-64 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-bg shadow-pop",
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
