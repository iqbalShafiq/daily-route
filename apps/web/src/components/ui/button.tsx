import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The button.
 *
 * One component covers every action in the app: the variants encode
 * hierarchy (primary, secondary, ghost, danger) and the sizes encode
 * density. Nothing in the codebase styles a raw `<button>` by hand.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover shadow-[0_1px_2px_rgb(0_0_0/0.08)] active:translate-y-px",
  secondary:
    "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 active:translate-y-px",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  subtle: "bg-surface-2 text-ink hover:bg-surface-3",
  danger: "bg-danger text-white hover:brightness-110 active:translate-y-px",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
  icon: "size-9 rounded-lg",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center font-medium tracking-[-0.01em] " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 " +
  "cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45";

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
