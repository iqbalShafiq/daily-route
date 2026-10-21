import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "../../lib/cn.js";

/**
 * A name that runs when it does not fit.
 *
 * A stop name can be longer than the line it stands in. Cutting it off
 * with three dots hides the part that tells one stop from another, so
 * the name runs instead: the way a headline runs along the bottom of a
 * news broadcast. It only runs when it has to, and it only runs while
 * the reader is pointing at it.
 */
export function MarqueeText({
  text,
  className,
}: {
  text: string;
  className?: string | undefined;
}) {
  const outerRef = useRef<HTMLSpanElement | null>(null);
  const copyRef = useRef<HTMLSpanElement | null>(null);
  const [metrics, setMetrics] = useState<{ copy: number; duration: number } | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const copy = copyRef.current;
    if (!outer || !copy) return;

    const measure = (): void => {
      // The gap is the room the name needs before it starts again.
      const gap = Number.parseFloat(getComputedStyle(copy).paddingRight) || 0;
      const textWidth = copy.getBoundingClientRect().width - gap;
      if (textWidth - outer.clientWidth <= 1) {
        setMetrics(null);
        return;
      }
      // The name crosses the line in about a second and a half.
      setMetrics({ copy: textWidth + gap, duration: Math.max(4, (textWidth + gap) / 28) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [text]);

  const style = metrics
    ? ({
        "--marquee-copy": `${metrics.copy}px`,
        "--marquee-duration": `${metrics.duration}s`,
      } as CSSProperties)
    : undefined;

  return (
    <span
      ref={outerRef}
      className={cn("marquee", metrics ? "marquee--overflow" : "", className)}
    >
      <span className="marquee__track" style={style}>
        <span ref={copyRef} className="marquee__copy">
          {text}
        </span>
        {/*
         * The second copy is what the name runs into. It is only there
         * when the name has to run, so a name that fits is never read
         * twice.
         */}
        {metrics ? (
          <span aria-hidden className="marquee__copy">
            {text}
          </span>
        ) : null}
      </span>
    </span>
  );
}
