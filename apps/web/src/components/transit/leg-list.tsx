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

import { operatorCompactForLine, RideIdentity } from "../map/operator-mark.js";
import { MarqueeText } from "../ui/marquee-text.js";
import { Tooltip } from "../ui/tooltip.js";
import { ModeIcon } from "./mode-icon.js";
import { StopPopover } from "./stop-popover.js";
import { ServiceChip } from "./service-chip.js";

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
  closedStationIds,
}: {
  legs: readonly ItineraryLeg[];
  dense?: boolean;
  onLegSelect?: ((legId: string | null) => void) | undefined;
  /** Pointing at a stop in the list points at that stop on the map. */
  onStopHover?: ((stationId: string | null) => void) | undefined;
  activeLegId?: string | null | undefined;
  /** Stops the journey must not use, because a notice removed them. */
  closedStationIds?: ReadonlySet<string> | undefined;
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
        This journey is too short to make by public transport.
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
          closed={closedStationIds?.has(leg.fromStationId ?? "") || closedStationIds?.has(leg.toStationId ?? "") || leg.stops.some((stop) => closedStationIds?.has(stop.stationId))}
          closedStationIds={closedStationIds}
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
  closed = false,
  closedStationIds,
}: {
  leg: ItineraryLeg;
  last: boolean;
  legId: string;
  active: boolean;
  /** The mode of the vehicle before this leg, and the one after it. */
  previousMode?: string | null | undefined;
  nextMode?: string | null | undefined;
  onSelect?: ((legId: string | null) => void) | undefined;
  onStopHover?: ((stationId: string | null) => void) | undefined;
  /** The reader points at a stop: its card opens beside the name. */
  onStopEnter?: ((stationId: string, name: string, anchor: DOMRect) => void) | undefined;
  onStopLeave?: (() => void) | undefined;
  /** This leg boards or alights at a stop that is out of service. */
  closed?: boolean | undefined;
  closedStationIds?: ReadonlySet<string> | undefined;
}) {
  const isWalk = leg.kind === "walk";
  const compact = !isWalk && operatorCompactForLine(leg.lineId);
  const noun = stopNoun(isWalk ? "walk" : leg.mode);
  const nounLabel = leg.stops.length === 1 ? noun : `${noun}s`;
  const color = isWalk
    ? "var(--ink-3)"
    : SERVICE_CLASS_COLOR[(leg.serviceClass as never) ?? "brt"] ?? "var(--accent)";

  return (
    <li
      className={cn(
        "group relative flex cursor-pointer gap-3 px-4 py-3 transition-colors",
        active ? "bg-surface-2" : "hover:bg-surface-2/70",
      )}
      onClick={() => onSelect?.(active ? null : legId)}
    >
      <div className="relative flex w-9 shrink-0 flex-col items-center">
        <span
          className={cn(
            "relative z-20 flex size-9 items-center justify-center rounded-[6px] border bg-surface transition-transform duration-200 group-hover:-translate-y-0.5",
            compact ? "border-line" : "",
          )}
          style={
            compact
              ? undefined
              : {
                  borderColor: `color-mix(in oklab, ${color} 55%, var(--line))`,
                  color,
                }
          }
        >
          {isWalk ? (
            <ModeIcon mode="walk" className="size-4" />
          ) : (
            <RideIdentity
              lineId={leg.lineId}
              serviceClass={leg.serviceClass}
              className={compact ? "size-7" : "size-4"}
            />
          )}
        </span>
        {!last ? (
          <span
            aria-hidden
            className="absolute bottom-[-30px] left-1/2 top-[30px] z-10 w-[2px] -translate-x-1/2 opacity-55"
            style={{
              backgroundImage: `linear-gradient(to bottom, ${color} 55%, transparent 55%)`,
              backgroundSize: "2px 6px",
            }}
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
            text={isWalk ? "Walk" : (leg.lineName ?? MODE_LABEL[leg.mode as keyof typeof MODE_LABEL] ?? "Journey")}
            className="min-w-0 flex-1 text-[15px] font-semibold text-ink"
          />
          {!isWalk && leg.lineCode ? <LinePatternChip leg={leg} color={color} /> : null}
        </div>

        <div className="mt-0.5 flex items-baseline gap-2">
          {!isWalk && leg.serviceClass ? (
            <span className="font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
              {SERVICE_CLASS_LABEL[leg.serviceClass as never] ?? leg.serviceClass}
            </span>
          ) : null}
          {!isWalk && leg.temporary ? (
            <span className="rounded-[4px] border border-ink/15 px-2 py-px font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-2">
              Temporary service
            </span>
          ) : null}
          {closed ? (
            <span className="font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-danger">
              Closed
            </span>
          ) : null}
          {!isWalk ? <ServiceChip leg={leg} /> : null}
          <span className="ml-auto shrink-0 font-mono text-[13px] tabular-nums text-ink-2">
            {formatDuration(leg.durationMinutes)}
          </span>
        </div>

        {!isWalk && (leg.directionLabel || (leg.fromPlatform && leg.fromPlatform.name !== leg.fromName)) ? (
          <p className="mt-0.5 truncate text-[12px] leading-[1.45] text-ink-3">
            {leg.directionLabel ? `Towards ${leg.directionLabel.split(" → ").at(-1)}` : null}
            {leg.fromPlatform && leg.fromPlatform.name !== leg.fromName
              ? `${leg.directionLabel ? " · " : ""}board at ${leg.fromPlatform.name}`
              : null}
          </p>
        ) : null}

        {leg.detour ? <DetourLine detour={leg.detour} /> : null}

        <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-2">
          {isWalk ? (
            <span className="truncate">{walkDescription(leg, previousMode, nextMode)}</span>
          ) : leg.changedFrom ? (
            <span className="truncate">
              Change from {leg.changedFrom} at {leg.changedAt}
            </span>
          ) : leg.fromName === leg.toName ? (
            <span className="truncate">Stops at {leg.fromName}</span>
          ) : (
            <>
              <span className="truncate">{leg.fromName}</span>
              <ArrowRight aria-hidden className="size-3 shrink-0 text-ink-3" />
              <span className="truncate">{leg.toName}</span>
            </>
          )}
        </p>

        {leg.stops.length > 2 ? (
          <details className="group mt-2" open={!isWalk ? true : undefined}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3 transition-colors hover:text-ink-2">
              <ChevronSmall />
              {leg.stops.length} {nounLabel} · {formatDistance(leg.distanceKm)}
              {!isWalk && leg.waitMinutes > 0 ? ` · wait ${leg.waitMinutes} min` : ""}
            </summary>

            {leg.stops.some((stop) => stop.skipped) ? (
              <p className="mt-2 text-[12px] leading-[1.45] text-danger">
                Red dots are passed without stopping. Hover a stop for the notice.
              </p>
            ) : null}
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
                const skipped = stop.skipped === true || closedStationIds?.has(stop.stationId) === true;
                const skipNote = skipped
                  ? `${stop.skippedNotice ?? "This stop is closed."} The vehicle passes without stopping.`
                  : undefined;
                const minutes = Math.round((leg.durationMinutes * index) / Math.max(leg.stops.length - 1, 1));
                return (
                  <li
                    key={`${stop.stationId}-${index}`}
                    title={skipNote}
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
                        "size-[6px] shrink-0 rounded-full border",
                        skipped || first || last ? "border-transparent" : "border-line-strong",
                      )}
                      style={{
                        backgroundColor: skipped
                          ? "var(--danger)"
                          : first || last
                            ? color
                            : "var(--surface)",
                      }}
                    />
                    {/*
                     * The name is a button, so that a reader with a
                     * keyboard can ask what the place is as well, and
                     * so that a finger can ask it on a phone.
                     */}
                    <button
                      type="button"
                      aria-label={
                        skipped
                          ? `${stop.name}, skipped: ${skipNote}`
                          : `Details for ${stop.name}`
                      }
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
                        text={
                          skipped
                            ? `${stop.name} · skipped`
                            : stop.name
                        }
                        className={cn(
                          "min-w-0 flex-1",
                          skipped
                            ? "font-medium text-danger line-through decoration-danger/70"
                            : first || last
                              ? "font-medium text-ink"
                              : "text-ink-2",
                        )}
                      />
                    </button>
                    <span className="shrink-0 font-mono tabular-nums text-ink-3">
                      {first ? "0" : `${minutes} min`}
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
                  `${leg.stops.length} ${nounLabel}`,
                  formatDistance(leg.distanceKm),
                  leg.waitMinutes > 0 ? `wait ${leg.waitMinutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

/** The corridor code, with its selected pattern and a detail popover. */
function LinePatternChip({ leg, color }: { leg: ItineraryLeg; color: string }) {
  const variants = leg.variants ?? [];
  const selected = variants.find((variant) => variant.id === leg.patternId) ?? null;
  const code = leg.lineCode ?? "";
  const label = selected?.toll
    ? `${code} via Tol`
    : selected?.patternType === "express"
      ? `${code} Express`
      : selected?.patternType === "short-turn"
        ? `${code} Short`
        : code;
  const chip = (
    <span
      tabIndex={variants.length > 0 ? 0 : undefined}
      className="shrink-0 cursor-default rounded-[4px] border px-2 py-px font-mono text-[12px] leading-[1.2] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
  if (variants.length === 0) return chip;

  return (
    <Tooltip
      variant="panel"
      label={
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            Corridor patterns
          </p>
          <p className="mt-1 text-[12px] leading-[1.45] text-ink-2">
            {leg.lineName ?? code} · {selected?.headsign ?? "Choose a pattern"}
          </p>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
            {variants.map((variant) => {
              const current = variant.id === leg.patternId;
              return (
                <li
                  key={variant.id}
                  className={cn(
                    "rounded-md border px-2 py-2 transition-colors",
                    current ? "border-accent/30 bg-accent-soft" : "border-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn("text-[12px] font-medium", current ? "text-ink" : "text-ink-2")}>
                      {variant.headsign}
                    </span>
                    {current ? (
                      <span className="text-[12px] font-medium text-accent">this journey</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {variant.serviceLabel}
                    {variant.toll ? " · toll" : ""}
                    {variant.situational ? " · situational" : ""}
                    {variant.activeNow ? "" : " · not today"}
                  </p>
                  {variant.skipped.length > 0 ? (
                    <p className="mt-0.5 text-[12px] text-danger">
                      Skips {variant.skipped.slice(0, 4).join(" · ")}
                      {variant.skipped.length > 4 ? ` +${variant.skipped.length - 4}` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      }
    >
      {chip}
    </Tooltip>
  );
}

/** The borrowed path of a diverted ride, stated in the list. */
function DetourLine({ detour }: { detour: NonNullable<ItineraryLeg["detour"]> }) {
  const served = detour.via.filter((via) => via.served).map((via) => via.name);
  const alignment = detour.via.filter((via) => !via.served).map((via) => via.name);
  const via = served.length > 0 ? served : alignment;
  const skipped =
    detour.skipped.length > 0
      ? ` · skips ${detour.skipped.slice(0, 3).join(", ")}${detour.skipped.length > 3 ? ` +${detour.skipped.length - 3}` : ""}`
      : "";
  return (
    <p className="mt-1 text-[12px] leading-[1.45] text-ink-3">
      <span className="font-medium text-ink-2">Diverted</span>
      {detour.viaLineCodes.length > 0 ? ` via ${detour.viaLineCodes.join("/")}` : ""}
      {via.length > 0 ? ` · ${via.slice(0, 3).join(" → ")}${via.length > 3 ? " …" : ""}` : ""}
      {detour.approximate ? " · approximate path" : ""}
      {skipped}
    </p>
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
      return `Walk to the ${stopNoun(nextMode)} ${leg.toName}`;
    case "egress":
      return `Walk from the ${stopNoun(previousMode)} ${leg.fromName}`;
    case "transfer":
      return leg.nextLineName
        ? `Change to ${leg.nextLineName} at ${leg.fromName}`
        : `Change vehicles at ${leg.fromName}`;
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

