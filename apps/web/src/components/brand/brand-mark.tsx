import { cn } from "../../lib/cn.js";

/**
 * The Daily Route mark.
 *
 * A route with a bend: two ends, one intermediate stop, and the jade line
 * that joins them. It is drawn here, not imported, so the mark is ours and
 * the same geometry can be used at every size.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--ink)" />
      <path
        className="brand-mark__line"
        d="M8.5 25V18.4C8.5 16.5 10 15 11.9 15H20.1C22 15 23.5 13.5 23.5 11.6V7"
        stroke="var(--accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        pathLength="1"
      />
      <circle cx="8.5" cy="25.2" r="2.1" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.6" />
      <circle className="brand-mark__dot" cx="23.5" cy="6.8" r="2.1" fill="var(--accent)" />
      <circle cx="15.9" cy="15" r="1.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * The lockup: the mark, the name, and the city.
 *
 * The name is set in the interface face; the city is a station label in
 * the monospaced face, so the identity reads as part of the map rather
 * than as a logo pasted onto it.
 */
export function BrandLockup({
  className,
  aside,
  compact = false,
}: {
  className?: string;
  aside?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark className={compact ? "size-7" : "size-8"} />
        <div className="min-w-0">
          <p className="truncate text-[16px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink">
            Daily Route
          </p>
          <p className="mt-0.5 font-mono text-[12px] font-medium leading-[1.2] tracking-[0.08em] text-ink-3">
            Jabodetabek
          </p>
        </div>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
