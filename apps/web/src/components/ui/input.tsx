import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The text field.
 *
 * Two shapes. The `field` shape stands on its own: a label above it, a
 * border around it, the way a form in a page reads. The `row` shape is
 * one line of a bigger surface: no border, no visible label, the label
 * kept for the screen reader only. The search on a map is built from
 * rows, so the two places it holds are one object and not two boxes
 * inside a box.
 */
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  icon?: ReactNode | undefined;
  /** Rendered inside the field on the right, such as a clear button. */
  trailing?: ReactNode | undefined;
  /** A short hint under the field. */
  hint?: string | undefined;
  invalid?: boolean | undefined;
  /** `field` stands alone, `row` is one line of a surface. */
  variant?: "field" | "row" | undefined;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, icon, trailing, hint, invalid, variant = "field", id, ...props },
  ref,
) {
  const inputId = id ?? `field-${props.name ?? label.replace(/\s+/g, "-").toLowerCase()}`;
  const describedBy = hint ? `${inputId}-hint` : undefined;

  if (variant === "row") {
    return (
      <div className={cn("flex min-w-0 flex-1 items-center gap-3", className)}>
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        {icon ? <span className="shrink-0 text-ink-3">{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          {...props}
        />
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[12px] font-medium tracking-[0.01em] text-ink-3">
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl border bg-surface px-3",
          "transition-colors duration-150",
          invalid
            ? "border-danger focus-within:border-danger"
            : "border-line focus-within:border-accent",
          "focus-within:ring-2 focus-within:ring-accent/15",
          className,
        )}
      >
        {icon ? <span className="shrink-0 text-ink-3">{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          {...props}
        />
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </div>
      {hint ? (
        <p id={describedBy} className="text-[12px] leading-[1.5] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
