import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * A scrolling region with the panel's own thumb.
 *
 * The platform bar fades and uses its own colour. This one stays, in
 * the strong line colour, and only while there is something to scroll.
 */
export function QuietScroll({ className, children }: { className?: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = scroller.current;
    const bar = thumb.current;
    if (!el || !bar) return;

    const place = (): void => {
      const { scrollHeight, clientHeight, scrollTop } = el;
      const overflow = scrollHeight - clientHeight;
      if (overflow <= 1 || clientHeight <= 0) {
        bar.style.opacity = "0";
        return;
      }
      const inset = 8;
      const track = clientHeight - inset * 2;
      const height = Math.min(track, Math.max(36, (clientHeight / scrollHeight) * track));
      const top = inset + (scrollTop / overflow) * (track - height);
      bar.style.opacity = "1";
      bar.style.height = `${height}px`;
      bar.style.transform = `translate3d(0, ${top}px, 0)`;
    };

    place();
    el.addEventListener("scroll", place, { passive: true });
    const observer = new ResizeObserver(place);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", place);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className={cn("relative min-h-0", className)}>
      <div ref={scroller} className="quiet-scroll h-full overflow-y-auto">
        {children}
      </div>
      <span
        ref={thumb}
        aria-hidden
        className="pointer-events-none absolute top-0 right-1 w-2 rounded-[4px] bg-line-strong opacity-0"
      />
    </div>
  );
}
