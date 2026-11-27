import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";
import { wrapIndex } from "./m3e-utils.js";

/**
 * Button groups.
 *
 * A standard group is a row of independent actions. A connected group is the
 * M3E replacement for segmented buttons: the active option expands to 1.7×
 * and becomes a full pill, so the choice is legible from shape as well as
 * colour.
 */

export type M3ConnectedOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type M3ButtonGroupSize = "xs" | "s" | "m";
export type M3ConnectedGroupVariant = "filled" | "tonal";

export type M3ConnectedButtonGroupProps = {
  options: readonly M3ConnectedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: M3ButtonGroupSize;
  variant?: M3ConnectedGroupVariant;
  ariaLabel: string;
  className?: string;
};

export function M3ConnectedButtonGroup({
  options,
  value,
  onChange,
  size = "s",
  variant = "filled",
  ariaLabel,
  className,
}: M3ConnectedButtonGroupProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  // If the caller's value matches nothing, the first enabled option still
  // takes the Tab stop, so the group never becomes unreachable.
  const focusableIndex =
    selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);

  const select = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    optionRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (options.length === 0) return;

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const from = event.key === "Home" ? 0 : options.length - 1;
      const delta = event.key === "Home" ? 1 : -1;
      let candidate = from;
      for (let step = 0; step < options.length; step += 1) {
        const option = options[candidate];
        if (option && !option.disabled) {
          select(candidate);
          return;
        }
        candidate = wrapIndex(candidate, options.length, delta);
      }
      return;
    }

    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowUp"
    ) {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    for (let step = 1; step <= options.length; step += 1) {
      const candidate = wrapIndex(index, options.length, delta * step);
      const option = options[candidate];
      if (option && !option.disabled) {
        select(candidate);
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("m3-connected", `m3-connected--${size}`, `m3-connected--${variant}`, className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === focusableIndex ? 0 : -1}
            disabled={option.disabled}
            className={cn("m3-connected__option", selected && "is-selected")}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type M3StandardButtonGroupProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
};

/** A row of independent buttons: a pressed button widens slightly. */
export function M3StandardButtonGroup({
  ariaLabel,
  children,
  className,
}: M3StandardButtonGroupProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("m3-btn-group", "m3-btn-group--standard", className)}
    >
      {children}
    </div>
  );
}
