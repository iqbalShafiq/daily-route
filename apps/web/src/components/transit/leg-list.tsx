import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../../lib/cn.js";
import {
  MODE_LABEL,
  SERVICE_CLASS_COLOR,
  SERVICE_CLASS_LABEL,
  formatDistance,
  formatDuration,
  stopNoun,
} from "../../lib/format.js";
import type { ItineraryLeg } from "../../lib/api.js";

import { MarqueeText } from "../ui/marquee-text.js";
import { ModeIcon } from "./mode-icon.js";
import { StopPopover } from "./stop-popover.js";

/**
 * The legs of one itinerary.
 *
 * Each leg is a row: the mode icon, the line, the boarding and alighting
 * stops, and the time. The stop list is collapsible, because the full list
 * of every halte is rarely what a rider needs at a glance.
 */
/**
 * The journey as a list.
 *
 * Every leg can be pointed at, and pointing at it tells the map which
 * leg of the journey the reader is looking at. The two are one system:
 * the list is the keyboard's way into the map.
 */
export function LegList({
  legs,
  dense = false,
  onLegSelect,
  onStopHover,
  activeLegId,
}: {
  legs: readonly ItineraryLeg[];
  dense?: boolean;
  onLegSelect?: ((legId: string) => void) | undefined;
  /** Pointing at a stop in the list points at that stop on the map. */
  onStopHover?: ((stationId: string | null) => void) | undefined;
  activeLegId?: string | null | undefined;
}) {
  /*
   * The stop the reader is pointing at. Its card stands beside the
   * name, and it closes as soon as the list moves under it.
   */
  const [pointed, setPointed] = useState<PointedStop | null>(null);

  useEffect(() => {
    if (!pointed) return;
    const close = (): void => setPointed(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [pointed]);

  if (legs.length === 0) {
    return (
      <p className="px-4 py-3 text-[13px] text-ink-3">
        Jarak terlalu dekat untuk dilalui dengan kendaraan umum.
      </p>
    );
  }

  return (
    <>
    <ol className={cn("space-y-0", dense ? "text-[13px]" : "text-[13px]")}>
      {legs.map((leg, index) => (
        <LegRow
          key={`${leg.fromName}-${leg.toName}-${index}`}
          leg={leg}
          last={index === legs.length - 1}
          previousMode={legs[index - 1]?.kind === "ride" ? (legs[index - 1]?.mode ?? null) : null}
          nextMode={
            legs[index + 1]?.kind === "ride" ? (legs[index + 1]?.mode ?? null) : null
          }
          legId={legIdOf(leg, index)}
          active={activeLegId === legIdOf(leg, index)}
          onSelect={onLegSelect}
          onStopHover={onStopHover}
          onStopEnter={(stationId, name, anchor) => setPointed({ stationId, name, anchor })}
          onStopLeave={() => setPointed(null)}
        />
      ))}
    </ol>
    <StopPopover
      stationId={pointed?.stationId ?? null}
      name={pointed?.name ?? ""}
      anchor={pointed?.anchor ?? null}
    />
    </>
  );
}

/** A stop the reader points at, and where its name stands. */
type PointedStop = {
  stationId: string;
  name: string;
  anchor: DOMRect;
};

/** The identifier of a leg, shared by the list and the map. */
export function legIdOf(leg: ItineraryLeg, index: number): string {
  return `${leg.kind}-${leg.lineId ?? "walk"}-${index}`;
}

function LegRow({
  leg,
  last,
  legId,
  active,
  onSelect,
  onStopHover,
  onStopEnter,
  onStopLeave,
  previousMode,
  nextMode,
}: {
  leg: ItineraryLeg;
  last: boolean;
  legId: string;
  active: boolean;
  /** The mode of the vehicle before this leg, and the one after it. */
  previousMode?: string | null | undefined;
  nextMode?: string | null | undefined;
  onSelect?: ((legId: string) => void) | undefined;
  onStopHover?: ((stationId: string | null) => void) | undefined;
  /** The reader points at a stop: its card opens beside the name. */
  onStopEnter?: ((stationId: string, name: string, anchor: DOMRect) => void) | undefined;
  onStopLeave?: (() => void) | undefined;
}) {
  const isWalk = leg.kind === "walk";
  const noun = stopNoun(isWalk ? "walk" : leg.mode);
  const color = isWalk
    ? "var(--ink-3)"
    : SERVICE_CLASS_COLOR[(leg.serviceClass as never) ?? "brt"] ?? "var(--accent)";
  const mode = isWalk ? "walk" : leg.mode;

  return (
    <li
      className={cn(
        "relative flex gap-3 px-4 py-3 transition-colors",
        active ? "bg-surface-2" : "",
      )}
      onClick={() => onSelect?.(legId)}
    >
      <div className="relative flex w-8 shrink-0 flex-col items-center">
        <span
          className="z-10 flex size-8 items-center justify-center rounded-full border"
          style={{
            borderColor: color,
            color,
            backgroundColor: "var(--surface)",
          }}
        >
          <ModeIcon mode={mode} className="size-4" />
        </span>
        {!last ? (
          <span
            aria-hidden
            className="absolute top-8 bottom-[-12px] w-0.5 rounded-full opacity-45"
            style={{ backgroundColor: color }}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        {/*
         * The name of the line stands on a line of its own, because it
         * is the longest thing here and the line is read first. The
         * kind of vehicle and the time stand below it, where they do
         * not push the name out of the row.
         */}
        <div className="flex items-baseline gap-2">
          <MarqueeText
            text={isWalk ? "Berjalan kaki" : (leg.lineName ?? MODE_LABEL[leg.mode as keyof typeof MODE_LABEL] ?? "Perjalanan")}
            className="min-w-0 flex-1 font-medium text-ink"
          />
          {!isWalk && leg.lineCode ? (
            <span
              className="shrink-0 rounded-md px-2 py-px font-mono text-[12px] leading-4 font-medium"
              style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`, color }}
            >
              {leg.lineCode}
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-baseline gap-2">
          {!isWalk && leg.serviceClass ? (
            <span className="text-[12px] text-ink-3">
              {SERVICE_CLASS_LABEL[leg.serviceClass as never] ?? leg.serviceClass}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[13px] tabular-nums text-ink-2">
            {formatDuration(leg.durationMinutes)}
          </span>
        </div>

        <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-2">
          {isWalk ? (
            <span className="truncate">{walkDescription(leg, previousMode, nextMode)}</span>
          ) : leg.changedFrom ? (
            <span className="truncate">
              Ganti dari {leg.changedFrom} di {leg.changedAt}
            </span>
          ) : leg.fromName === leg.toName ? (
            <span className="truncate">Berhenti di {leg.fromName}</span>
          ) : (
            <>
              <span className="truncate">{leg.fromName}</span>
              <ArrowRight aria-hidden className="size-3 shrink-0 text-ink-3" />
              <span className="truncate">{leg.toName}</span>
            </>
          )}
        </p>

        {leg.stops.length > 2 ? (
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[12px] text-ink-3 transition-colors hover:text-ink-2">
              <ChevronSmall />
              {leg.stops.length} {noun} · {formatDistance(leg.distanceKm)}
              {!isWalk && leg.waitMinutes > 0 ? ` · tunggu ${leg.waitMinutes} mnt` : ""}
            </summary>

            {/*
             * The stops of the ride, as a line the rider can follow:
             * the place, the moment the vehicle reaches it, and the
             * distance from the start. Every stop is a point on the map,
             * so pointing at one of them lights it up there.
             */}
            <ol className="mt-2 space-y-0">
              {leg.stops.map((stop, index) => {
                const first = index === 0;
                const last = index === leg.stops.length - 1;
                const minutes = Math.round((leg.durationMinutes * index) / Math.max(leg.stops.length - 1, 1));
                return (
                  <li
                    key={`${stop.stationId}-${index}`}
                    className="flex items-center gap-2 rounded-[4px] py-1 text-[12px] transition-colors hover:bg-surface-2"
                    onMouseEnter={(event) => {
                      onStopHover?.(stop.stationId);
                      onStopEnter?.(stop.stationId, stop.name, event.currentTarget.getBoundingClientRect());
                    }}
                    onMouseLeave={() => {
                      onStopHover?.(null);
                      onStopLeave?.();
                    }}
                  >
                    {/*
                     * The dot stands in the line of the text, in the
                     * middle of it, and it marks the two ends of the
                     * ride: the place it starts at and the place it
                     * ends at.
                     */}
                    <span
                      aria-hidden
                      className={cn(
                        "size-[5px] shrink-0 rounded-full border",
                        first || last ? "border-transparent" : "border-line",
                      )}
                      style={{ backgroundColor: first || last ? color : "var(--surface)" }}
                    />
                    {/*
                     * The name is a button, so that a reader with a
                     * keyboard can ask what the place is as well, and
                     * so that a finger can ask it on a phone.
                     */}
                    <button
                      type="button"
                      aria-label={`Detail ${stop.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onStopEnter?.(
                          stop.stationId,
                          stop.name,
                          event.currentTarget.getBoundingClientRect(),
                        );
                      }}
                      onFocus={(event) => {
                        onStopEnter?.(
                          stop.stationId,
                          stop.name,
                          event.currentTarget.getBoundingClientRect(),
                        );
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <MarqueeText
                        text={stop.name}
                        className={cn(
                          "min-w-0 flex-1",
                          first || last ? "font-medium text-ink" : "text-ink-2",
                        )}
                      />
                    </button>
                    <span className="shrink-0 tabular-nums text-ink-3">
                      {first ? "0" : `${minutes} mnt`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </details>
        ) : (
          <p className="mt-1 text-[12px] text-ink-3">
            {isWalk
              ? formatDistance(leg.distanceKm)
              : [
                  `${leg.stops.length} ${noun}`,
                  formatDistance(leg.distanceKm),
                  leg.waitMinutes > 0 ? `tunggu ${leg.waitMinutes} mnt` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * What a walk on the way is for.
 *
 * Walking to the first vehicle and walking from the last one are part of
 * the journey. Only the walk in between asks the rider to change vehicle,
 * and only that one is worth naming.
 */
function walkDescription(
  leg: ItineraryLeg,
  previousMode: string | null | undefined,
  nextMode: string | null | undefined,
): string {
  switch (leg.walkReason) {
    case "access":
      return `Berjalan kaki ke ${stopNoun(nextMode)} ${leg.toName}`;
    case "egress":
      return `Berjalan kaki dari ${stopNoun(previousMode)} ${leg.fromName}`;
    case "transfer":
      return leg.nextLineName
        ? `Pindah ke ${leg.nextLineName} di ${leg.fromName}`
        : `Pindah kendaraan di ${leg.fromName}`;
    default:
      return `${leg.fromName} → ${leg.toName}`;
  }
}

function ChevronSmall() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 transition-transform group-open:rotate-90">
      <path
        d="M4 2.5 L7.5 6 L4 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

