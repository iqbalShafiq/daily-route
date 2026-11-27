import { useId, type CSSProperties } from "react";

import { cn } from "../../lib/cn.js";
import { clamp, percentOf, safeId } from "./m3e-utils.js";

/**
 * The M3 Expressive slider.
 *
 * A 16px split track: the travelled part is primary, the rest is the
 * secondary container. The handle is a 4px vertical bar carrying a stop dot,
 * which keeps the exact value visible against a thick track.
 */

export type M3SliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  /** The value written beside the label, for example "12 min". */
  valueLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function M3Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  valueLabel,
  disabled = false,
  className,
  id,
}: M3SliderProps) {
  const generatedId = useId();
  const inputId = id ?? `m3-slider-${safeId(generatedId)}`;
  const span = max - min;
  const progress = span > 0 ? clamp((value - min) / span, 0, 1) : 0;

  return (
    <div className={cn("m3-slider", className)}>
      <label className="m3-slider__head" htmlFor={inputId}>
        <span>{label}</span>
        <span className="m3-slider__value">{valueLabel ?? String(value)}</span>
      </label>
      <input
        id={inputId}
        className="m3-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueLabel}
        style={{ "--m3-slider-progress": percentOf(progress) } as CSSProperties}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
      />
    </div>
  );
}
