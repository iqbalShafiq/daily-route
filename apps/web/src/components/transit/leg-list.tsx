import { ArrowRight, Footprints } from "lucide-react";
import { useEffect, useState } from "react";

import { M3ModeBadge, M3Shape } from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";
import {
  MODE_LABEL,
  SERVICE_CLASS_COLOR,
  SERVICE_CLASS_LABEL,
  formatDistance,
  formatDuration,
} from "../../lib/format.js";
import type { ItineraryLeg } from "../../lib/api.js";
import { MarqueeText } from "../ui/marquee-text.js";
import { Tooltip } from "../ui/tooltip.js";
import { StopPopover } from "./stop-popover.js";
import { ServiceChip } from "./service-chip.js";

import { estimateArrivalIso, formatJakartaClock } from "../../lib/jakarta-time.js";

/**
 * The legs of one itinerary.
 *
 * The timeline is the M3 Expressive version of the printed journey: a 44px
 * time column, a 28px rail in the colour of the vehicle, and the line, its
 * stops and its service under it. The rail is dotted for a walk and solid
 * for a ride, so the two are told apart before the label is read.
 */
export function LegList({
  legs,
  startIso,
  dense = false,
  onLegSelect,
  onStopHover,
  activeLegId,
  closedStationIds,
}: {
  legs: readonly ItineraryLeg[];
  /** The departure instant, so the time column can name each stop. */
  startIso?: string | undefined;
  dense?: boolean;
  onLegSelect?: ((legId: string | null) => void) | undefined;
  /** Pointing at a stop in the list points at that stop on the map. */
  onStopHover?: ((stationId: string | null) => void) | undefined;
  activeLegId?: string | null | undefined;
  /** Stops the journey must not use, because a notice removed them. */
  closedStationIds?: ReadonlySet<string> | undefined;
}) {
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

  const rows = legs.map((leg, index) => {
    const before = legs
      .slice(0, index)
      .reduce((total, entry) => total + entry.durationMinutes, 0);
    const start = startIso ? formatJakartaClock(estimateArrivalIso(startIso, before)) : null;
    return { leg, index, start };
  });

  return (
    <>
      <ol
        aria-label="Journey legs"
        className={cn("m3-leg-list", dense ? "m3-bs" : "m3-bm")}
      >
        {rows.map(({ leg, index, start }) => (
          <LegRow
            key={`${leg.fromName}-${leg.toName}-${index}`}
            leg={leg}
            last={index === rows.length - 1}
            startClock={start}
            previousMode={legs[index - 1]?.kind === "ride" ? (legs[index - 1]?.mode ?? null) : null}
            nextMode={legs[index + 1]?.kind === "ride" ? (legs[index + 1]?.mode ?? null) : null}
            legId={legIdOf(leg, index)}
            active={activeLegId === legIdOf(leg, index)}
            onSelect={onLegSelect}
            onStopHover={onStopHover}
            onStopEnter={(stationId, name, anchor) => setPointed({ stationId, name, anchor })}
            onStopLeave={() => setPointed(null)}
            closed={
              closedStationIds?.has(leg.fromStationId ?? "") ||
              closedStationIds?.has(leg.toStationId ?? "") ||
              leg.stops.some((stop) => closedStationIds?.has(stop.stationId))
            }
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
  startClock,
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
  startClock: string | null;
  legId: string;
  active: boolean;
  previousMode?: string | null | undefined;
  nextMode?: string | null | undefined;
  onSelect?: ((legId: string | null) => void) | undefined;
  onStopHover?: ((stationId: string | null) => void) | undefined;
  onStopEnter?: ((stationId: string, name: string, anchor: DOMRect) => void) | undefined;
  onStopLeave?: (() => void) | undefined;
  closed?: boolean | undefined;
  closedStationIds?: ReadonlySet<string> | undefined;
}) {
  const isWalk = leg.kind === "walk";
  const walkText = isWalk ? walkSummary(leg, previousMode, nextMode) : null;
  const noun = stopNounId(isWalk ? "walk" : leg.mode);
  const nounLabel = noun;
  const color = isWalk
    ? "var(--walk)"
    : (SERVICE_CLASS_COLOR[(leg.serviceClass as never) ?? "brt"] ?? "var(--ink-2)");

  return (
    <li
      className={cn("m3-leg-row", active && "m3-leg-row--active")}
      onClick={() => onSelect?.(active ? null : legId)}
    >
      <div className="m3-leg-time">
        <span className="m3-ts m3-num text-m3-on-surface">
          {startClock ?? formatDuration(leg.durationMinutes)}
        </span>
        {startClock ? (
          <span className="m3-bs m3-num text-m3-on-surface-variant">
            {formatDuration(leg.durationMinutes)}
          </span>
        ) : null}
      </div>

      <div className="m3-leg-rail">
        <span className="m3-leg-plate">
          {isWalk ? (
            <M3Shape
              shape="cookie6"
              size={28}
              className="bg-m3-secondary-container text-m3-on-secondary-container"
            >
              <Footprints aria-hidden className="size-4" />
            </M3Shape>
          ) : (
            <M3ModeBadge
              size="icon"
              systemId={leg.lineId ? (leg.lineId.split(":")[0] ?? null) : null}
              serviceClass={leg.serviceClass}
              lineCode={leg.lineCode}
            />
          )}
        </span>
        {!last ? (
          <span
            aria-hidden
            className={cn("m3-leg-line", isWalk && "m3-leg-line--walk")}
            style={isWalk ? undefined : { backgroundColor: color }}
          />
        ) : null}
      </div>

      <div className="m3-leg-detail min-w-0">
        {isWalk ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="m3-ll shrink-0 text-m3-on-surface">
                {walkText?.title ?? "Jalan"}
              </span>
              <span className="m3-bs min-w-0 flex-1 truncate text-m3-on-surface-variant">
                {walkText?.detail}
              </span>
              <span className="m3-ts m3-num shrink-0 text-m3-on-surface-variant">
                {formatDuration(leg.durationMinutes)}
              </span>
            </div>
            {leg.jpo && leg.jpo.length > 0 ? (
              <span className="m3-chip m3-chip--suggestion mt-2 inline-flex">
                Via JPO {leg.jpo.map((jpo) => jpo.name).join(", ")}
              </span>
            ) : null}
            {closed ? (
              <p className="m3-bs mt-1 text-m3-error">Tutup</p>
            ) : null}
            {leg.detour ? <DetourLine detour={leg.detour} /> : null}
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <MarqueeText
                text={leg.lineName ?? MODE_LABEL[leg.mode as keyof typeof MODE_LABEL] ?? "Journey"}
                className="m3-ll min-w-0 flex-1 text-m3-on-surface"
              />
              {leg.lineCode ? <LinePatternChip leg={leg} color={color} /> : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {leg.serviceClass ? (
                <span className="m3-bs text-m3-on-surface-variant">
                  {SERVICE_CLASS_LABEL[leg.serviceClass as never] ?? leg.serviceClass}
                </span>
              ) : null}
              {leg.temporary ? (
                <span className="m3-chip m3-chip--suggestion pointer-events-none">
                  Layanan sementara
                </span>
              ) : null}
              {closed ? (
                <span className="m3-bs font-semibold text-m3-error">Tutup</span>
              ) : null}
              <ServiceChip leg={leg} />
              <span className="m3-ts m3-num ml-auto shrink-0 text-m3-on-surface-variant">
                {formatDuration(leg.durationMinutes)}
              </span>
            </div>

            {leg.directionLabel || (leg.fromPlatform && leg.fromPlatform.name !== leg.fromName) ? (
              <p className="m3-bs mt-1 truncate text-m3-on-surface-variant">
                {leg.directionLabel ? `Arah ${towardsOf(leg.directionLabel)}` : null}
                {leg.fromPlatform && leg.fromPlatform.name !== leg.fromName
                  ? `${leg.directionLabel ? " · " : ""}Naik di ${leg.fromPlatform.name}`
                  : null}
              </p>
            ) : null}

            {patternSentenceOf(leg) ? (
              <p className="m3-bs mt-1 text-m3-on-surface-variant">{patternSentenceOf(leg)}</p>
            ) : null}

            {leg.detour ? <DetourLine detour={leg.detour} /> : null}

            <p className="m3-bs mt-1 flex min-w-0 items-center gap-1 text-m3-on-surface-variant">
              {leg.changedFrom ? (
                <span className="truncate">
                  Ganti dari {leg.changedFrom} di {leg.changedAt}
                </span>
              ) : leg.fromName === leg.toName ? (
                <span className="truncate">Berhenti di {leg.fromName}</span>
              ) : (
                <>
                  <span className="truncate">{leg.fromName}</span>
                  <ArrowRight aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{leg.toName}</span>
                </>
              )}
            </p>
          </>
        )}

        {leg.stops.length > 2 ? (
          <details className="m3-leg-stops group mt-2" open={!isWalk ? true : undefined}>
            <summary className="m3-bs inline-flex min-h-9 cursor-pointer list-none items-center gap-2 text-m3-on-surface-variant transition-colors hover:text-m3-on-surface">
              <ChevronSmall />
              {leg.stops.length} {nounLabel} · {formatDistance(leg.distanceKm)}
              {!isWalk && leg.waitMinutes > 0 ? ` · tunggu ${leg.waitMinutes} mnt` : ""}
            </summary>

            {leg.stops.some((stop) => stop.skipped) ? (
              <p className="m3-bs mt-2 text-m3-error">
                Titik merah dilewati tanpa berhenti. Arahkan penunjuk ke halte untuk membaca
                pengumumannya.
              </p>
            ) : null}

            <ol className="mt-2 grid gap-0.5">
              {leg.stops.map((stop, index) => {
                const first = index === 0;
                const lastStop = index === leg.stops.length - 1;
                const skipped =
                  stop.skipped === true || closedStationIds?.has(stop.stationId) === true;
                const skipNote = skipped
                  ? `${stop.skippedNotice ?? "This stop is closed."} The vehicle passes without stopping.`
                  : undefined;
                const minutes = Math.round(
                  (leg.durationMinutes * index) / Math.max(leg.stops.length - 1, 1),
                );
                return (
                  <li
                    key={`${stop.stationId}-${index}`}
                    title={skipNote}
                    className="flex items-center gap-2 rounded-[4px] py-1 transition-colors hover:bg-m3-surface-mid"
                    onMouseEnter={(event) => {
                      onStopHover?.(stop.stationId);
                      onStopEnter?.(
                        stop.stationId,
                        stop.name,
                        event.currentTarget.getBoundingClientRect(),
                      );
                    }}
                    onMouseLeave={() => {
                      onStopHover?.(null);
                      onStopLeave?.();
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full border",
                        skipped || first || lastStop
                          ? "border-transparent"
                          : "border-m3-outline",
                      )}
                      style={{
                        backgroundColor: skipped
                          ? "var(--e)"
                          : first || lastStop
                            ? color
                            : "var(--srf)",
                      }}
                    />
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
                        text={skipped ? `${stop.name} · skipped` : stop.name}
                        className={cn(
                          "min-w-0 flex-1",
                          skipped
                            ? "m3-bs font-medium text-m3-error line-through decoration-m3-error/70"
                            : first || lastStop
                              ? "m3-bs font-medium text-m3-on-surface"
                              : "m3-bs text-m3-on-surface-variant",
                        )}
                      />
                    </button>
                    <span className="m3-bs m3-num shrink-0 text-m3-on-surface-variant">
                      {first ? "0" : `${minutes} mnt`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </details>
        ) : (
          <p className="m3-bs mt-1 text-m3-on-surface-variant">
            {isWalk
              ? formatDistance(leg.distanceKm)
              : [
                  `${leg.stops.length} ${nounLabel}`,
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

/** The pattern a ride boards, said as a sentence rather than a second chip. */
function patternSentenceOf(leg: ItineraryLeg): string | null {
  const variants = leg.variants ?? [];
  const selected = variants.find((variant) => variant.id === leg.patternId) ?? null;
  if (!selected) return null;
  if (selected.toll) return "Via jalan tol";
  if (selected.patternType === "express") return "Layanan ekspres";
  if (selected.patternType === "short-turn") return "Perjalanan dipersingkat";
  return null;
}

function towardsOf(directionLabel: string): string {
  return directionLabel.split(" → ").at(-1) ?? directionLabel;
}

/** The corridor code. The pattern it boards is a sentence under it. */
function LinePatternChip({ leg, color }: { leg: ItineraryLeg; color: string }) {
  const variants = leg.variants ?? [];
  const selected = variants.find((variant) => variant.id === leg.patternId) ?? null;
  const code = leg.lineCode ?? "";
  const chip = (
    <span
      tabIndex={variants.length > 0 ? 0 : undefined}
      className="m3-chip m3-chip--suggestion m3-num shrink-0"
      style={{ color }}
    >
      {code}
    </span>
  );
  if (variants.length === 0) return chip;

  return (
    <Tooltip
      variant="panel"
      label={
        <div>
          <p className="text-[12px] font-semibold leading-[1.35] text-ink-3">
            Pola koridor
          </p>
          <p className="mt-1 text-[12px] leading-[1.45] text-ink-2">
            {leg.lineName ?? code} · {selected?.headsign ?? "Pilih pola"}
          </p>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
            {variants.map((variant) => {
              const current = variant.id === leg.patternId;
              return (
                <li
                  key={variant.id}
                  className={cn(
                    "rounded-[4px] border px-2 py-2 transition-colors",
                    current ? "border-line bg-surface-2" : "border-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn("text-[12px] font-medium", current ? "text-ink" : "text-ink-2")}>
                      {variant.headsign}
                    </span>
                    {current ? (
                      <span className="text-[12px] font-medium text-ink">perjalanan ini</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {variant.serviceLabel}
                    {variant.toll ? " · tol" : ""}
                    {variant.situational ? " · situasional" : ""}
                    {variant.activeNow ? "" : " · tidak hari ini"}
                  </p>
                  {variant.skipped.length > 0 ? (
                    <p className="mt-0.5 text-[12px] text-danger">
                      Melewati {variant.skipped.slice(0, 4).join(" · ")}
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
      ? ` · lewati ${detour.skipped.slice(0, 3).join(", ")}${
          detour.skipped.length > 3 ? ` +${detour.skipped.length - 3}` : ""
        }`
      : "";
  return (
    <p className="m3-bs mt-1 text-m3-on-surface-variant">
      <span className="font-medium text-m3-on-surface">Dialihkan</span>
      {detour.viaLineCodes.length > 0 ? ` via ${detour.viaLineCodes.join("/")}` : ""}
      {via.length > 0 ? ` · ${via.slice(0, 3).join(" → ")}${via.length > 3 ? " …" : ""}` : ""}
      {detour.approximate ? " · jalur perkiraan" : ""}
      {skipped}
    </p>
  );
}

/** The Indonesian word for the place a vehicle stops at. */
function stopNounId(mode: string | null | undefined): "halte" | "stasiun" {
  return mode === "metro" || mode === "tram" || mode === "rail" ? "stasiun" : "halte";
}

/**
 * What a walk on the way is for.
 *
 * The title and the rest of the sentence are separate so the row can read
 * as one line: "Jalan ke stasiun Grogol". Walking to the first vehicle and
 * walking from the last one are part of the journey. Only the walk in
 * between asks the rider to change vehicle, and it is titled "Transit".
 */
function walkSummary(
  leg: ItineraryLeg,
  previousMode: string | null | undefined,
  nextMode: string | null | undefined,
): { title: string; detail: string } {
  switch (leg.walkReason) {
    case "access":
      return { title: "Jalan", detail: `ke ${stopNounId(nextMode)} ${leg.toName}` };
    case "egress":
      return { title: "Jalan", detail: `dari ${stopNounId(previousMode)} ${leg.fromName}` };
    case "transfer":
      return {
        title: "Transit",
        detail: leg.nextLineName
          ? `ke ${leg.nextLineName} di ${leg.fromName}`
          : `ganti kendaraan di ${leg.fromName}`,
      };
    default:
      return { title: "Jalan", detail: `${leg.fromName} → ${leg.toName}` };
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
