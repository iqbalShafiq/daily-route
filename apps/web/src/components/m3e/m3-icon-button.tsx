import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive icon button.
 *
 * The default is a circle. A selected toggle becomes a filled rounded square
 * (12px), so the state survives a reader who cannot tell the container tone
 * apart. `narrow` and `wide` change the hit area without changing the
 * control's height.
 */

export type M3IconButtonWidth = "narrow" | "default" | "wide";
export type M3IconButtonSize = "s" | "m" | "l";
export type M3IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";

export type M3IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  /** The accessible name. An icon button has no visible text. */
  label: string;
  widthVariant?: M3IconButtonWidth;
  size?: M3IconButtonSize;
  variant?: M3IconButtonVariant;
  selected?: boolean;
  /** A toggle button exposes `aria-pressed`; a plain action does not. */
  toggleable?: boolean;
  children: ReactNode;
};

export const M3IconButton = forwardRef<HTMLButtonElement, M3IconButtonProps>(function M3IconButton(
  {
    className,
    label,
    widthVariant = "default",
    size = "s",
    variant = "standard",
    selected = false,
    toggleable = false,
    children,
    type,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      aria-pressed={toggleable ? selected : undefined}
      className={cn(
        "m3-icon-btn",
        `m3-icon-btn--${size}`,
        `m3-icon-btn--${variant}`,
        widthVariant !== "default" && `m3-icon-btn--${widthVariant}`,
        selected && "is-selected",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
});
