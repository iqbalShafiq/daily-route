import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * How a journey is paid for.
 *
 * The price is already on the row. The way the money is taken is the
 * next question, so it opens when the reader points at that row, and
 * stays open long enough to be read. There is no extra control: the
 * row is the control.
 */
export function PayHint({ notes, children }: { notes: readonly string[]; children: ReactNode }) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const place = (): void => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  };

  const cancelClose = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = (): void => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  const show = (): void => {
    cancelClose();
    place();
    setOpen(true);
  };

  useEffect(() => () => cancelClose(), []);

  if (notes.length === 0) return children;

  return (
    <div
      ref={anchorRef}
      className="min-w-0"
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && cardRef.current?.contains(next)) return;
        setOpen(false);
      }}
    >
      {children}
      {open && anchor
        ? createPortal(
            <div
              ref={cardRef}
              role="dialog"
              aria-label="How to pay"
              onMouseEnter={show}
              onMouseLeave={scheduleClose}
              style={positionOf(anchor)}
              className="fade-in fixed z-50 w-72 rounded-[4px] border border-line bg-surface p-3 shadow-pop"
            >
              <p className="text-[13px] font-semibold text-ink">How to pay</p>
              <div className="scroll-quiet mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
                {notes.map((note) => (
                  <p key={note} className="text-[12px] leading-[1.5] text-ink-2">
                    {note}
                  </p>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** The card stands to the right of the row, or below it when the map is narrow. */
function positionOf(anchor: DOMRect): { left: string; top: string } {
  const width = 288;
  const beside = window.innerWidth - anchor.right > width + 16;
  const left = beside
    ? anchor.right + 8
    : Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
  const top = beside ? Math.max(12, anchor.top - 8) : anchor.bottom + 8;
  return { left: `${left}px`, top: `${top}px` };
}
