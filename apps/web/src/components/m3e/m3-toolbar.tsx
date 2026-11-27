import type { ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The floating M3 Expressive toolbar.
 *
 * A 64px pill that floats over the content. The standard tone is a quiet
 * surface; the vibrant tone is a primary container and uses a filled
 * selected icon button inside it.
 */

export type M3FloatingToolbarProps = {
  variant?: "standard" | "vibrant";
  ariaLabel: string;
  className?: string;
  children: ReactNode;
};

export function M3FloatingToolbar({
  variant = "standard",
  ariaLabel,
  className,
  children,
}: M3FloatingToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn("m3-toolbar", variant === "vibrant" && "m3-toolbar--vibrant", className)}
    >
      {children}
    </div>
  );
}
