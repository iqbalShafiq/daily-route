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
 *
 * Every field carries a placeholder. The label names the field; the
 * placeholder says what to type, so an empty field is not a blank box.
 */
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "placeholder"> & {
  label: string;
  /** Shown while the field is empty. Required, so a form cannot omit it. */
  placeholder: string;
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
  { className, label, icon, trailing, hint, invalid, variant = "field", id, placeholder, ...props },
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
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          {...props}
        />
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="font-mono text-[12px] font-medium uppercase leading-[1.2] tracking-[0.08em] text-ink-3"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-lg border bg-surface px-3",
          "transition-colors duration-150",
          invalid
            ? "border-danger focus-within:border-danger"
            : "border-line-strong focus-within:border-accent",
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
          placeholder={placeholder}
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
