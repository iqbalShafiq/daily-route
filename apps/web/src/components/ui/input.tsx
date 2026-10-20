import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The text field.
 *
 * The icon is decorative and the label is always visible, so the field is
 * readable without a placeholder that disappears.
 */
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  icon?: ReactNode | undefined;
  /** Rendered inside the field on the right, such as a clear button. */
  trailing?: ReactNode | undefined;
  /** A short hint under the field. */
  hint?: string | undefined;
  invalid?: boolean | undefined;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, icon, trailing, hint, invalid, id, ...props },
  ref,
) {
  const inputId = id ?? `field-${props.name ?? label.replace(/\s+/g, "-").toLowerCase()}`;
  const describedBy = hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
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
        <p id={describedBy} className="text-[12px] leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
