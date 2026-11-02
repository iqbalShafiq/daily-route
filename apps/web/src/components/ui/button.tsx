import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The button.
 *
 * One component covers every action in the app: the variants encode
 * hierarchy and the sizes encode density. The primary button has a hard
 * lower edge, so pressing it feels like a key on a ticket machine rather
 * than a coloured rectangle.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-accent-hover bg-accent text-accent-ink shadow-[0_2px_0_0_var(--accent-hover)] " +
    "hover:-translate-y-px hover:bg-accent-hover hover:shadow-[0_3px_0_0_var(--accent-hover)] " +
    "active:translate-y-[2px] active:shadow-none",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-surface-2 active:translate-y-px",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink active:translate-y-px",
  subtle: "bg-surface-2 text-ink hover:bg-surface-3 active:translate-y-px",
  danger:
    "border border-danger/60 bg-danger text-white hover:brightness-105 active:translate-y-px",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px] gap-2 rounded-md",
  md: "h-10 px-4 text-[13px] gap-2 rounded-lg",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-lg",
  icon: "size-9 rounded-lg",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center font-semibold tracking-[-0.01em] " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 " +
  "cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element instead of a `<button>`. */
  asChild?: boolean;
  children?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", asChild = false, type, children, ...props },
  ref,
) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(classes, child.props.className) });
  }

  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...props}>
      {children}
    </button>
  );
});
