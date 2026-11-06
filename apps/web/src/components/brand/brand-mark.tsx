import { cn } from "../../lib/cn.js";

/**
 * The compact mark.
 *
 * The brand object is a bus headsign, so the small form is a black board
 * with an operator-blue square and a cream slit where the destination
 * would be. It is drawn at 16 px only: the favicon, and the assistant
 * header. It is not a pause icon and it is not an app glyph.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="var(--accent)" />
      <rect x="2.5" y="3.5" width="2.5" height="9" rx="0.5" fill="var(--mode-bus)" />
      <rect x="6.5" y="6.75" width="7" height="2.5" rx="0.5" fill="var(--accent-ink)" />
    </svg>
  );
}

/**
 * The lockup: the headsign.
 *
 * "Daily Route" is set in the sign face, uppercase, the way a destination
 * board is printed. "Jabodetabek" sits under it in the interface face, in
 * sentence case. There is no icon beside the name.
 */
export function BrandLockup({
  className,
  aside,
}: {
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "headsign flex min-w-0 items-center justify-between gap-3 rounded-[4px] px-3 py-2",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="headsign__name truncate text-[28px] uppercase text-accent-ink">Daily Route</p>
        <p className="text-[13px] leading-[1.35] text-accent-ink/80">Jabodetabek</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
