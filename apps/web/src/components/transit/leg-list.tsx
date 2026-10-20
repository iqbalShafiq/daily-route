import { ArrowRight } from "lucide-react";

import { cn } from "../../lib/cn.js";
import {
  MODE_LABEL,
  SERVICE_CLASS_COLOR,
  SERVICE_CLASS_LABEL,
  formatDistance,
  formatDuration,
} from "../../lib/format.js";
import type { ItineraryLeg } from "../../lib/api.js";

import { ModeIcon } from "./mode-icon.js";

/**
 * The legs of one itinerary.
 *
 * Each leg is a row: the mode icon, the line, the boarding and alighting
 * stops, and the time. The stop list is collapsible, because the full list
 * of every halte is rarely what a rider needs at a glance.
 */
export function LegList({ legs, dense = false }: { legs: readonly ItineraryLeg[]; dense?: boolean }) {
  if (legs.length === 0) {
    return (
      <p className="px-4 py-3 text-[13px] text-ink-3">
        Jarak terlalu dekat untuk dilalui dengan kendaraan umum.
      </p>
    );
  }

  return (
    <ol className={cn("space-y-0", dense ? "text-[13px]" : "text-sm")}>
      {legs.map((leg, index) => (
        <LegRow key={`${leg.fromName}-${leg.toName}-${index}`} leg={leg} last={index === legs.length - 1} />
      ))}
    </ol>
  );
}

function LegRow({ leg, last }: { leg: ItineraryLeg; last: boolean }) {
  const isWalk = leg.kind === "walk";
  const color = isWalk
    ? "var(--ink-3)"
    : SERVICE_CLASS_COLOR[(leg.serviceClass as never) ?? "brt"] ?? "var(--accent)";
  const mode = isWalk ? "walk" : leg.mode;

  return (
    <li className="relative flex gap-3 px-4 py-3">
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
            className="absolute top-9 bottom-[-12px] w-px"
            style={{ backgroundColor: "var(--line-strong)" }}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-ink">
            {isWalk ? "Jalan kaki" : (leg.lineName ?? MODE_LABEL[leg.mode as keyof typeof MODE_LABEL] ?? "Perjalanan")}
          </span>
          {!isWalk && leg.lineCode ? (
            <span
              className="rounded px-1.5 py-px text-[11px] font-semibold"
              style={{ backgroundColor: "var(--surface-2)", color }}
            >
              {leg.lineCode}
            </span>
          ) : null}
          {!isWalk && leg.serviceClass ? (
            <span className="text-[11px] text-ink-3">
              {SERVICE_CLASS_LABEL[leg.serviceClass as never] ?? leg.serviceClass}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[13px] tabular-nums text-ink-2">
            {formatDuration(leg.durationMinutes)}
          </span>
        </div>

        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
          {leg.fromName === leg.toName ? (
            <span className="truncate">Transfer di {leg.fromName}</span>
          ) : (
            <>
              <span className="truncate">{leg.fromName}</span>
              <ArrowRight aria-hidden className="size-3 shrink-0 text-ink-3" />
              <span className="truncate">{leg.toName}</span>
            </>
          )}
        </p>

        {leg.stops.length > 2 ? (
          <details className="group mt-1.5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-ink-3 hover:text-ink-2">
              <ChevronSmall />
              {leg.stops.length} halte · {formatDistance(leg.distanceKm)}
            </summary>
            <ol className="mt-1.5 space-y-1 border-l border-line pl-3">
              {leg.stops.slice(1, -1).map((stop) => (
                <li key={stop.stationId} className="text-[12px] text-ink-3">
                  {stop.name}
                </li>
              ))}
            </ol>
          </details>
        ) : (
          <p className="mt-1 text-[12px] text-ink-3">
            {isWalk ? "Transfer" : `${leg.stops.length} halte · ${formatDistance(leg.distanceKm)}`}
          </p>
        )}
      </div>
    </li>
  );
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

