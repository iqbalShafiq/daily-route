import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The floating action button.
 *
 * A FAB is a primary action that floats over the content. The tone is a
 * container role, never an operator colour: the operators own their colours
 * and the interface must not borrow one for a button.
 */

export type M3FabSize = "s" | "m" | "l";
export type M3FabTone = "primary-container" | "primary" | "tertiary-container";

export type M3FabProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  /** The accessible name. The icon is the only visual content. */
  label: string;
  size?: M3FabSize;
  tone?: M3FabTone;
  children: ReactNode;
};

export const M3Fab = forwardRef<HTMLButtonElement, M3FabProps>(function M3Fab(
  { className, label, size = "s", tone = "primary-container", children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      className={cn("m3-fab", `m3-fab--${size}`, `m3-fab--${tone}`, className)}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
});

export type M3ExtendedFabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  size?: "s" | "m";
  tone?: M3FabTone;
};

export const M3ExtendedFab = forwardRef<HTMLButtonElement, M3ExtendedFabProps>(
  function M3ExtendedFab(
    { className, icon, label, size = "m", tone = "primary-container", type, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "m3-extended-fab",
          size === "s" && "m3-extended-fab--s",
          `m3-extended-fab--${tone}`,
          className,
        )}
        {...props}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </button>
    );
  },
);
