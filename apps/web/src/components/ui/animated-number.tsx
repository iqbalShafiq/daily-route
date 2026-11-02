import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/cn.js";

/**
 * A number that settles into place.
 *
 * The duration is the one large number on the screen. Counting it up over
 * a few hundred milliseconds makes the arrival of an answer legible
 * without delaying the rider: the final value is on screen in half a
 * second, and the motion is removed entirely when the reader asks for
 * less.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // The value is already on screen; only a later change needs to
      // settle. A frame callback keeps this out of the effect body.
      frame.current = requestAnimationFrame(() => setDisplay(value));
      return () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }

    const start = performance.now();
    const duration = 520;

    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / duration);
      // A quick start, a soft landing.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return (
    <span className={cn("tabular-nums", className)}>
      {format(display)}
    </span>
  );
}
