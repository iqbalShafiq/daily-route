import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive card.
 *
 * A card groups content; it is not itself an action. A card that opens a
 * journey wraps its content in a button or an anchor, so the keyboard and the
 * screen reader get a real control. The container tones are the M3 role
 * containers, never an operator colour.
 */

export type M3CardVariant =
  | "filled"
  | "elevated"
  | "outlined"
  | "primary-container"
  | "secondary-container"
  | "tertiary-container"
  | "error-container"
  | "ok-container";

export type M3CardRadius = "lg" | "lgi" | "xl" | "xli" | "2xl";

export type M3CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: M3CardVariant;
  radius?: M3CardRadius;
};

export function M3Card({ variant = "filled", radius = "lg", className, ...props }: M3CardProps) {
  return (
    <div
      className={cn("m3-card", `m3-card--${variant}`, `m3-card--radius-${radius}`, className)}
      {...props}
    />
  );
}
