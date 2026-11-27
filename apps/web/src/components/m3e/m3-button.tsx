import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive button.
 *
 * Five sizes, seven tones and two corner families. Pressing the button
 * morphs its corners squarer instead of moving it, which is the expressive
 * feedback in the kit. The transition uses `--sp-fast`, so the shape follows
 * the same spring as the rest of the interface.
 */

export type M3ButtonSize = "xs" | "s" | "m" | "l" | "xl";

export type M3ButtonVariant =
  "filled" | "tonal" | "outlined" | "text" | "elevated" | "vibrant" | "inverse";

export type M3ButtonShape = "round" | "square";

export type M3ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: M3ButtonSize;
  variant?: M3ButtonVariant;
  shape?: M3ButtonShape;
  fullWidth?: boolean;
  /** A leading icon. It is hidden from assistive technology; the label names the action. */
  icon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const M3Button = forwardRef<HTMLButtonElement, M3ButtonProps>(function M3Button(
  {
    className,
    size = "s",
    variant = "filled",
    shape = "round",
    fullWidth = false,
    icon,
    trailingIcon,
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
      className={cn(
        "m3-btn",
        `m3-btn--${size}`,
        `m3-btn--${variant}`,
        shape === "square" && "m3-btn--square",
        fullWidth && "m3-btn--block",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="m3-btn__icon">
          {icon}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span aria-hidden="true" className="m3-btn__icon">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
});
