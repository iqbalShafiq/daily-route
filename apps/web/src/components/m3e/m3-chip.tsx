import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive chip.
 *
 * A selected filter chip changes both tone and shape: the 8px corner becomes
 * a 16px pill. The dot is a leading affordance for a topic or a status, and it
 * never replaces the text label.
 */

export type M3ChipVariant = "filter" | "elevated" | "suggestion";

export type M3ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: M3ChipVariant;
  selected?: boolean;
  icon?: ReactNode;
  /** A small leading dot, for a topic colour. The text still names it. */
  leadingDotColor?: string;
  children: ReactNode;
};

export const M3Chip = forwardRef<HTMLButtonElement, M3ChipProps>(function M3Chip(
  {
    className,
    variant = "filter",
    selected = false,
    icon,
    leadingDotColor,
    children,
    type,
    onClick,
    style,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-pressed={selected}
      className={cn("m3-chip", `m3-chip--${variant}`, selected && "is-selected", className)}
      style={
        leadingDotColor ? ({ ...style, "--m3-chip-dot": leadingDotColor } as CSSProperties) : style
      }
      onClick={onClick}
      {...props}
    >
      {leadingDotColor ? <span className="m3-chip__dot" aria-hidden="true" /> : null}
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
});
