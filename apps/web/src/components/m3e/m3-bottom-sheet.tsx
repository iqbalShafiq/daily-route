import {
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive bottom sheet.
 *
 * The surface is a 28px rounded sheet in the low surface tone. The handle is
 * a real button: a tap moves to the next detent, a vertical drag moves one
 * detent in the direction of the drag, and the keyboard can reach every
 * detent. The bottom inset is respected on a phone.
 */

export const M3_BOTTOM_SHEET_DETENTS = ["peek", "half", "expanded"] as const;

export type M3BottomSheetDetent = (typeof M3_BOTTOM_SHEET_DETENTS)[number];

export const M3_BOTTOM_SHEET_HEIGHTS: Record<M3BottomSheetDetent, string> = {
  peek: "96px",
  half: "50dvh",
  expanded: "90dvh",
};

/** The next detent in a direction; it wraps at the ends. */
export function nextDetent(detent: M3BottomSheetDetent, delta: 1 | -1): M3BottomSheetDetent {
  const index = M3_BOTTOM_SHEET_DETENTS.indexOf(detent);
  const count = M3_BOTTOM_SHEET_DETENTS.length;
  const next = (((index + delta) % count) + count) % count;
  return M3_BOTTOM_SHEET_DETENTS[next] ?? "peek";
}

export type M3BottomSheetProps = {
  detent: M3BottomSheetDetent;
  onDetentChange: (detent: M3BottomSheetDetent) => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
};

const DRAG_THRESHOLD = 56;

export function M3BottomSheet({
  detent,
  onDetentChange,
  children,
  ariaLabel,
  className,
}: M3BottomSheetProps) {
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    startY.current = event.clientY;
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (startY.current === null) return;
    if (Math.abs(event.clientY - startY.current) > 8) moved.current = true;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const start = startY.current;
    startY.current = null;
    if (start === null) return;

    const distance = event.clientY - start;
    if (moved.current && Math.abs(distance) >= DRAG_THRESHOLD) {
      // A drag up opens the sheet; a drag down closes it one detent.
      onDetentChange(nextDetent(detent, distance < 0 ? 1 : -1));
      return;
    }

    // A tap cycles upward, so the handle alone can reach the expanded sheet.
    onDetentChange(nextDetent(detent, 1));
  };

  const handlePointerCancel = (): void => {
    startY.current = null;
    moved.current = false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onDetentChange(nextDetent(detent, 1));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onDetentChange(nextDetent(detent, -1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onDetentChange("peek");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onDetentChange("expanded");
    }
  };

  return (
    <section
      className={cn("m3-sheet", className)}
      style={{ height: M3_BOTTOM_SHEET_HEIGHTS[detent] }}
      aria-label={ariaLabel}
      data-detent={detent}
    >
      <button
        type="button"
        className="m3-sheet__grab"
        aria-label={`Resize sheet, ${detent}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
      />
      <div className="m3-sheet__body">{children}</div>
    </section>
  );
}
