import { useId, type CSSProperties, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";
import { clamp01, safeId } from "./m3e-utils.js";

/**
 * The M3 Expressive shape library.
 *
 * A shape is decorative, never semantic. It is a hero mask, an avatar, a
 * progress moment or a loading morph; it never stands in for a transit mode,
 * a severity or a line. The 22 polygons are the generated 64-point library
 * and live in `styles.css` as `--shp-*`, so a shape can also be used from
 * plain CSS.
 */

export const M3_SHAPE_NAMES = [
  "circle",
  "square",
  "oval",
  "pill",
  "pentagon",
  "gem",
  "diamond",
  "triangle",
  "arch",
  "cookie4",
  "cookie6",
  "cookie9",
  "cookie12",
  "sunny",
  "verysunny",
  "softburst",
  "burst",
  "clover4",
  "clover8",
  "flower",
  "puffy",
  "scallop",
] as const;

export type M3ShapeName = (typeof M3_SHAPE_NAMES)[number];

/** The CSS `clip-path` value of a shape. */
export function m3ShapeClipPath(shape: M3ShapeName): string {
  return `var(--shp-${shape})`;
}

export type M3ShapeProps = {
  shape: M3ShapeName;
  /** A number of pixels, or any CSS length. Defaults to 40px. */
  size?: number | string;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
  /**
   * A decorative shape is hidden from assistive technology. Pass `false`
   * together with an `aria-label` when the shape carries information (a
   * hero illustration, for example).
   */
  decorative?: boolean;
  role?: string;
  "aria-label"?: string;
};

export function M3Shape({
  shape,
  size = 40,
  className,
  children,
  style,
  decorative = true,
  role,
  "aria-label": ariaLabel,
}: M3ShapeProps) {
  return (
    <span
      className={cn("m3-shape", className)}
      style={{
        width: size,
        height: size,
        clipPath: m3ShapeClipPath(shape),
        ...style,
      }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : (role ?? "img")}
      aria-label={decorative ? undefined : ariaLabel}
      data-shape={shape}
    >
      {children}
    </span>
  );
}

export type M3LoadingIndicatorProps = {
  variant?: "plain" | "contained";
  size?: "sm" | "md" | "lg";
  /** What the process is doing. A loader is never decorative. */
  label: string;
  className?: string;
};

/**
 * The official seven-shape loading indicator.
 *
 * It is for a process that takes long enough to need an indicator but not
 * long enough for a progress value. It is indeterminate, so it carries
 * `role="progressbar"` without `aria-valuenow`, and the caller supplies the
 * label the rider hears.
 */
export function M3LoadingIndicator({
  variant = "plain",
  size = "md",
  label,
  className,
}: M3LoadingIndicatorProps) {
  return (
    <span
      className={cn(
        "m3-loader",
        variant === "contained" && "m3-loader--contained",
        size === "sm" && "m3-loader--sm",
        size === "lg" && "m3-loader--lg",
        className,
      )}
      role="progressbar"
      aria-label={label}
    >
      <span className="m3-loader__shape" aria-hidden="true" />
    </span>
  );
}

/** The top edge of the wavy bar: a quadratic wave with a flat bottom. */
const WAVE_PATH = `M0 6 q2.5 -4 5 0${" t5 0".repeat(19)} V12 H0 Z`;

export type M3LinearWavyProgressProps = {
  /** 0..1. Values outside the range are clamped. */
  value: number;
  className?: string;
  /** What the progress measures. Defaults to "Progress". */
  label?: string;
};

export function M3LinearWavyProgress({
  value,
  className,
  label = "Progress",
}: M3LinearWavyProgressProps) {
  const clipId = `m3-wave-${safeId(useId())}`;
  const progress = clamp01(value);

  return (
    <div
      className={cn("m3-wavy", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <span className="m3-wavy__track" aria-hidden="true" />
      <svg
        className="m3-wavy__svg"
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <clipPath id={clipId}>
          <rect x="0" y="0" width={progress * 100} height="12" />
        </clipPath>
        <path className="m3-wavy__fill" d={WAVE_PATH} clipPath={`url(#${clipId})`} />
      </svg>
    </div>
  );
}

export type M3CircularWavyProgressProps = {
  /** 0..1. Values outside the range are clamped. */
  value: number;
  /** The outer square of the component, in pixels. */
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  children?: ReactNode;
};

/**
 * A wavy ring. The wave is a real sinusoidal path, not a dashed circle, so it
 * reads as the expressive progress shape even when the value is small.
 */
function wavyCirclePath(
  size: number,
  strokeWidth: number,
  amplitude = 1.2,
  waves = 24,
  steps = 180,
): string {
  const radius = Math.max(1, (size - strokeWidth) / 2 - amplitude);
  const centre = size / 2;
  const points: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const r = radius + Math.sin(angle * waves) * amplitude;
    const x = centre + Math.cos(angle) * r;
    const y = centre + Math.sin(angle) * r;
    points.push(`${step === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${points.join(" ")} Z`;
}

export function M3CircularWavyProgress({
  value,
  size = 48,
  strokeWidth = 4,
  className,
  label = "Progress",
  children,
}: M3CircularWavyProgressProps) {
  const progress = clamp01(value);
  const path = wavyCirclePath(size, strokeWidth);
  const dash = progress * 100;

  return (
    <div
      className={cn("m3-circular-wavy", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <svg
        className="m3-circular-wavy__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <path
          className="m3-circular-wavy__track"
          d={path}
          strokeWidth={strokeWidth}
          pathLength={100}
        />
        {progress > 0 ? (
          <path
            className="m3-circular-wavy__fill"
            d={path}
            strokeWidth={strokeWidth}
            pathLength={100}
            strokeDasharray={`${dash} 100`}
          />
        ) : null}
      </svg>
      {children ? (
        <span className="m3-circular-wavy__label" aria-hidden="true">
          {children}
        </span>
      ) : null}
    </div>
  );
}
