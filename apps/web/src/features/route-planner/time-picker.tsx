import { CalendarClock, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "../../lib/cn.js";

const LABEL_RADIUS = 84;
const TICK_RADIUS = 106;

function angleFor(index: number, count: number): number {
  return (index / count) * 360;
}

function placeAt(radius: number, angle: number): { left: string; top: string } {
  const radians = (angle * Math.PI) / 180;
  return {
    left: `calc(50% + ${Math.sin(radians) * radius}px)`,
    top: `calc(50% - ${Math.cos(radians) * radius}px)`,
  };
}

/**
 * Keep a hand on the shortest arc when it crosses twelve.
 *
 * A clock angle is 0..359, so moving from 359 to 1 must not spin almost all
 * the way around. The rendered hand keeps a continuous angle; each new
 * target is expressed as the equivalent angle nearest the previous one.
 */
function nearestEquivalent(previous: number, target: number): number {
  const normalizedPrevious = ((previous % 360) + 360) % 360;
  let delta = target - normalizedPrevious;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return previous + delta;
}

/**
 * A small analog time picker that belongs to the search surface.
 *
 * The native time input brings its own platform popup, which breaks the
 * paper-and-ink surface. This is a 12-hour clock with a period switch: choose
 * an hour, then a minute on the same face. Pointer drags and the labelled
 * numbers both work; every number is a real button, and the face itself is
 * keyboard adjustable with the arrow keys.
 */
export function TimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  // The picker mounts when the rider chooses "Leave at", so showing the
  // choices immediately is the expected next step. It can still be closed
  // with Escape, Done, or a click outside.
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const [hoverAngle, setHoverAngle] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText ?? "0") % 24;
  const minute = Number(minuteText ?? "0") % 60;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const period = hour >= 12 ? "PM" : "AM";
  const hourTarget = (hour12 % 12) * 30 + minute * 0.5;
  const minuteTarget = minute * 6;
  const [hourRotation, setHourRotation] = useState(hourTarget);
  const [minuteRotation, setMinuteRotation] = useState(minuteTarget);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setTime = (nextHour: number, nextMinute: number): void => {
    const nextHour12 = nextHour % 12 === 0 ? 12 : nextHour % 12;
    const nextHourTarget = (nextHour12 % 12) * 30 + nextMinute * 0.5;
    const nextMinuteTarget = nextMinute * 6;
    const hourBase = mode === "hour" && hoverAngle !== null ? hoverAngle : hourRotation;
    const minuteBase = mode === "minute" && hoverAngle !== null ? hoverAngle : minuteRotation;
    setHourRotation(nearestEquivalent(hourBase, nextHourTarget));
    setMinuteRotation(nearestEquivalent(minuteBase, nextMinuteTarget));
    onChange(`${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  };

  const previewAt = (angle: number): void => {
    setHoverAngle((previous) => {
      const base = previous ?? (mode === "hour" ? hourRotation : minuteRotation);
      return nearestEquivalent(base, angle);
    });
  };

  const clearPreview = (): void => {
    if (hoverAngle !== null) {
      if (mode === "hour") setHourRotation(nearestEquivalent(hoverAngle, hourTarget));
      else setMinuteRotation(nearestEquivalent(hoverAngle, minuteTarget));
    }
    setHoverAngle(null);
  };

  const setHour12 = (nextHour12: number, advance = true): void => {
    const base = nextHour12 === 12 ? 0 : nextHour12;
    setTime(base + (hour >= 12 ? 12 : 0), minute);
    if (advance) setMode("minute");
  };

  const setMinute = (nextMinute: number): void => {
    setTime(hour, (nextMinute + 60) % 60);
  };

  const togglePeriod = (): void => {
    setTime(hour >= 12 ? hour - 12 : hour + 12, minute);
  };

  const angleFromPointer = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  };

  const pickFromPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const normalized = angleFromPointer(event);
    if (mode === "hour") {
      const index = Math.round(normalized / 30) % 12;
      setHour12(index === 0 ? 12 : index, false);
    } else {
      setMinute(Math.round(normalized / 6) % 60);
    }
  };

  const onFacePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    pickFromPointer(event);
  };

  const onFacePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (draggingRef.current) {
      pickFromPointer(event);
      return;
    }
    if (event.pointerType === "mouse") previewAt(angleFromPointer(event));
  };

  const onFacePointerLeave = (): void => {
    if (!draggingRef.current) clearPreview();
  };

  const onFacePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    clearPreview();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (mode === "hour") setMode("minute");
  };

  const onFaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 1;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    if (mode === "hour") {
      const next = ((hour12 - 1 + step + 12) % 12) + 1;
      setHour12(next);
    } else {
      setMinute(minute + step);
    }
  };

  const labels = mode === "hour" ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 12 }, (_, index) => index * 5);
  const shownHourAngle = mode === "hour" && hoverAngle !== null ? hoverAngle : hourRotation;
  const shownMinuteAngle = mode === "minute" && hoverAngle !== null ? hoverAngle : minuteRotation;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Departure time ${value}`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-[12px] tabular-nums transition-colors",
          open ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )}
      >
        <CalendarClock aria-hidden className="size-3" />
        {value}
        <ChevronDown
          aria-hidden
          className={cn("size-3 transition-transform duration-200", open ? "rotate-180" : "")}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose departure time"
          className="fade-in absolute left-1/2 top-[calc(100%+6px)] z-50 w-[300px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-[12px] border border-line bg-surface p-4 shadow-pop"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 font-mono text-[12px] font-medium uppercase leading-[1.2] tracking-[0.08em] text-ink-3">
                <CalendarClock aria-hidden className="size-3.5" />
                Leave at · WIB
              </p>
              <div className="mt-1 flex items-baseline gap-1">
                <button
                  type="button"
                  onClick={() => setMode("hour")}
                  aria-label={`Edit hour, ${hour12}`}
                  className={cn(
                    "cursor-pointer rounded px-0.5 text-[28px] leading-[1.05] font-semibold tabular-nums transition-colors",
                    mode === "hour" ? "text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {String(hour12).padStart(2, "0")}
                </button>
                <span className="text-[28px] leading-[1.05] font-semibold text-ink-3">:</span>
                <button
                  type="button"
                  onClick={() => setMode("minute")}
                  aria-label={`Edit minute, ${String(minute).padStart(2, "0")}`}
                  className={cn(
                    "cursor-pointer rounded px-0.5 text-[28px] leading-[1.05] font-semibold tabular-nums transition-colors",
                    mode === "minute" ? "text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {String(minute).padStart(2, "0")}
                </button>
                <button
                  type="button"
                  onClick={togglePeriod}
                  aria-label={`Switch to ${period === "AM" ? "PM" : "AM"}`}
                  className="ml-1 cursor-pointer rounded px-1 text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft"
                >
                  {period}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <Check aria-hidden className="size-3" />
              Done
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
            <span>{mode === "hour" ? "Choose an hour" : "Choose a minute"}</span>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode("hour")}
                aria-pressed={mode === "hour"}
                className={cn(
                  "cursor-pointer rounded px-2 py-1 transition-colors",
                  mode === "hour" ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-2",
                )}
              >
                Hour
              </button>
              <button
                type="button"
                onClick={() => setMode("minute")}
                aria-pressed={mode === "minute"}
                className={cn(
                  "cursor-pointer rounded px-2 py-1 transition-colors",
                  mode === "minute" ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-2",
                )}
              >
                Minute
              </button>
            </span>
          </div>

          <div
            className="relative mx-auto mt-2 size-60 touch-none rounded-full border border-line bg-surface-2/40"
            onPointerMove={onFacePointerMove}
            onPointerLeave={onFacePointerLeave}
          >
            <div
              className="pointer-events-none absolute inset-0 transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={{ transform: `rotate(${shownHourAngle}deg)` }}
            >
              <span
                className={cn(
                  "absolute bottom-1/2 left-1/2 h-[56px] w-[2px] -translate-x-1/2 rounded-full",
                  mode === "hour" ? "bg-accent" : "bg-ink-3",
                )}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-0 transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={{ transform: `rotate(${shownMinuteAngle}deg)` }}
            >
              <span
                className={cn(
                  "absolute bottom-1/2 left-1/2 h-[82px] w-px -translate-x-1/2 rounded-full",
                  mode === "minute" ? "bg-accent" : "bg-ink-2",
                )}
              />
            </div>
            <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent" />
            {labels.map((label, index) => {
              const angle = angleFor(index, 12);
              const active = mode === "hour" ? label === hour12 : label === minute;
              return (
                <button
                  key={label}
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    if (mode === "hour") setHour12(label);
                    else setMinute(label);
                    clearPreview();
                  }}
                  aria-pressed={active}
                  aria-label={mode === "hour" ? `Hour ${label}` : `Minute ${String(label).padStart(2, "0")}`}
                  className={cn(
                    "absolute z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[12px] font-medium tabular-nums transition-colors",
                    active ? "bg-accent text-bg shadow-sm" : "text-ink-2 hover:bg-surface",
                  )}
                  style={placeAt(LABEL_RADIUS, angle)}
                >
                  {mode === "hour" ? label : String(label).padStart(2, "0")}
                </button>
              );
            })}
            <div
              role="group"
              aria-label="Clock face. Use the arrow keys to adjust the time."
              tabIndex={0}
              onPointerDown={onFacePointerDown}
              onPointerUp={onFacePointerUp}
              onPointerCancel={onFacePointerUp}
              onKeyDown={onFaceKeyDown}
              className="absolute inset-0 z-0 cursor-crosshair rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            {Array.from({ length: 60 }, (_, index) => {
              const major = index % 5 === 0;
              const tickLength = major ? 8 : 4;
              return (
                <span
                  key={index}
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-1/2 rounded-full",
                    major ? "h-2 w-0.5 bg-line-strong" : "h-1 w-px bg-line",
                  )}
                  style={{
                    ...placeAt(TICK_RADIUS, index * 6),
                    height: tickLength,
                    transform: `translate(-50%, -50%) rotate(${index * 6}deg)`,
                  }}
                />
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
            <button
              type="button"
              onClick={() => {
                const now = new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Jakarta",
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                }).format(new Date());
                const [nextHour, nextMinute] = now.split(":").map(Number);
                setTime(nextHour ?? 0, nextMinute ?? 0);
                setMode("minute");
              }}
              className="cursor-pointer rounded px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Now
            </button>
            <span>Hover to preview. Drag or tap to set.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
