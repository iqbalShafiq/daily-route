import { X } from "lucide-react";
import { cn } from "../../lib/cn.js";

/**
 * The headsign.
 *
 * A bus destination board: the route code on the left in the operator's
 * colour, the destination in the sign face, and the numbers underneath in
 * the interface face. It is the one black surface of the interface, in both
 * themes, and the journey result and a route answer in the assistant share
 * it.
 *
 * The letters of the destination flip in once, like a split-flap board, and
 * then stay still. `prefers-reduced-motion` shows them in place.
 */
export function Headsign({
  code,
  codeColor,
  destination,
  meta,
  closed = false,
  loading = false,
  onClose,
  className,
}: {
  /** The corridor or line code. Empty when the journey has no single one. */
  code?: string | null | undefined;
  /** The colour of the operating vehicle. The code sits on a plate of this colour. */
  codeColor?: string | null | undefined;
  destination: string;
  /** The numbers under the name: minutes, changes, fare. */
  meta?: React.ReactNode;
  /** The destination is not in service. */
  closed?: boolean | undefined;
  /** The answer is still being calculated: one slit, no skeleton. */
  loading?: boolean | undefined;
  onClose?: (() => void) | undefined;
  className?: string;
}) {
  return (
    <div className={cn("headsign relative px-4 pb-3 pt-3", className)}>
      <div className="flex items-start gap-3">
        {code ? (
          <p
            className="headsign__code grid h-11 min-w-11 shrink-0 place-items-center rounded-[4px] px-2 text-[16px] text-accent-ink"
            style={{ backgroundColor: codeColor ?? "var(--mode-bus)" }}
          >
            {code}
          </p>
        ) : null}
        <div className="min-w-0 flex-1 pt-1">
          <FlapText
            text={destination}
            className={cn(
              "headsign__name text-[28px] text-accent-ink",
              closed && "line-through decoration-danger decoration-2",
            )}
          />
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the route"
            title="Close the route"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-accent-ink/70 transition-colors hover:bg-accent-hover hover:text-accent-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      {meta ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] leading-[1.45] tabular-nums text-accent-ink/70">
          {meta}
        </div>
      ) : null}

      {closed ? (
        <p
          className="stamp absolute right-2 top-12 border-2 px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.04em]"
          style={{
            color: "color-mix(in oklab, var(--danger) 55%, var(--accent-ink))",
            borderColor: "color-mix(in oklab, var(--danger) 55%, var(--accent-ink))",
          }}
        >
          Closed
        </p>
      ) : null}

      {loading ? (
        <span
          aria-hidden
          className="absolute inset-x-4 bottom-2 h-1 overflow-hidden rounded-full bg-accent-hover"
        >
          <span className="slit block h-full w-1/4 rounded-full bg-accent-ink" />
        </span>
      ) : null}
    </div>
  );
}

/** A destination that flips in once, one letter at a time, and wraps on words. */
export function FlapText({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  const starts = words.map((_, wordIndex) =>
    words.slice(0, wordIndex).reduce((sum, item) => sum + item.length + 1, 0),
  );
  return (
    <span className={cn("relative block max-w-full", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="flap-line flex max-w-full flex-wrap">
        {words.map((word, wordIndex) => {
          const start = starts[wordIndex] ?? 0;
          return (
            <span key={`${word}-${wordIndex}`} className="inline-flex">
              {Array.from(word).map((character, index) => (
                <span
                  key={`${character}-${start + index}`}
                  className="flap"
                  style={{ animationDelay: `${(start + index) * 50}ms` }}
                >
                  {character}
                </span>
              ))}
              {wordIndex < words.length - 1 ? (
                <span className="flap" style={{ animationDelay: `${(start + word.length) * 50}ms` }}>
                  {"\u00A0"}
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
