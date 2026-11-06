import { useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Route as RouteIcon,
} from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { QuietScroll } from "../../components/ui/quiet-scroll.js";
import { Headsign } from "../../components/ui/headsign.js";
import { iconWellClass } from "../../components/ui/icon-well.js";
import { IncidentIcon } from "../../components/transit/incident-icon.js";
import { RideIdentity } from "../../components/map/operator-mark.js";
import { LegList } from "../../components/transit/leg-list.js";
import { PayHint } from "../../components/transit/pay-hint.js";
import { cn } from "../../lib/cn.js";
import {
  ApiError,
  type DisruptionSummary,
  type FareQuote,
  type Itinerary,
  type PlanResult,
} from "../../lib/api.js";
import {
  DISRUPTION_KIND_LABEL,
  SERVICE_CLASS_COLOR,
  formatDistance,
  formatDuration,
  formatRupiah,
  formatTime,
  type ServiceClass,
} from "../../lib/format.js";
import { legendEntries, type RouteLegendEntry } from "../../lib/route-colors.js";
import {
  closedStationIds,
  planChoices,
  routeIsBlocked,
  visibleChoiceIndexes,
} from "../../lib/route-choice.js";

import type { UsePlanResult } from "./use-plan.js";

/** The one ride that names the headsign, and its operator colour. */
function primaryRideOf(route: Itinerary | undefined) {
  return route?.legs.find((leg) => leg.kind === "ride");
}

/** The corridor code of the first ride, or null when the way starts on foot. */
function codeOf(route: Itinerary | undefined): string | null {
  return primaryRideOf(route)?.lineCode ?? null;
}

/** The colour of the vehicle the headsign belongs to. */
function colorOf(route: Itinerary | undefined): string | null {
  const ride = primaryRideOf(route);
  if (!ride) return null;
  return SERVICE_CLASS_COLOR[ride.serviceClass as ServiceClass] ?? "var(--mode-bus)";
}

/**
 * The result of the search.
 *
 * It is a printed route board: one black headsign that names the way, a
 * perforation, and the paper slip with the alternatives and the legs under
 * it. The board can be empty, loading or broken, and it says which.
 */
export function RouteResult({
  plan,
  activeIndex,
  onActiveIndexChange,
  activeLeg,
  onLegSelect,
  onStopHover,
  onRetry,
  watching = false,
  onToggleWatch,
  onClose,
  hoveredLine = null,
  onHoverLine,
  pendingDestination,
  className,
}: {
  plan: UsePlanResult;
  activeIndex: number | null;
  onActiveIndexChange: (index: number | null) => void;
  activeLeg?: string | null | undefined;
  onLegSelect?: ((legId: string | null) => void) | undefined;
  /** Pointing at a stop in the list points at that stop on the map. */
  onStopHover?: ((stationId: string | null) => void) | undefined;
  /** Ask for the answer again. */
  onRetry?: (() => void) | undefined;
  /** Keep this journey on the rider's watch list. */
  watching?: boolean | undefined;
  onToggleWatch?: (() => void) | undefined;
  /** Dismiss the route and return to the empty board. */
  onClose?: (() => void) | undefined;
  /** The line the reader is pointing at in the legend, if any. */
  hoveredLine?: string | null | undefined;
  onHoverLine?: ((lineKey: string | null) => void) | undefined;
  /** The destination being planned, for the loading headsign. */
  pendingDestination?: string | undefined;
  className?: string;
}) {
  const data: PlanResult | undefined = plan.data;
  const routes = data ? planChoices(data) : [];
  const current = activeIndex === null ? undefined : routes[activeIndex];
  const notices = data?.disruptions ?? [];
  const closed = closedStationIds(notices);

  if (plan.isFetching && !data) {
    return <RouteLoading destination={pendingDestination ?? ""} className={className} />;
  }

  if (plan.isError) {
    return (
      <section className={cn("panel rise-in rounded-[4px] p-4", className)} role="alert">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />
          The route could not be calculated
        </p>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">{reasonOf(plan.error)}</p>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  if (data && data.itineraries.length === 0) {
    if (data.routeBlocked) {
      return (
        <section
          className={cn("rise-in overflow-hidden rounded-[4px]", className)}
          role="alert"
        >
          <Headsign
            destination={data.destination.name}
            closed
            onClose={onClose}
            meta={
              <span>
                {data.origin.name} to {data.destination.name} is closed or
                diverted on every way we found.
              </span>
            }
          />
          <div className="panel rounded-none border-t-0 px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />
              No open journey
            </p>
            <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
              Check the service board before you travel.
            </p>
            {data.disruptions[0] ? (
              <p className="mt-2 text-[13px] leading-[1.45] text-ink-3">
                {data.disruptions[0].title}
              </p>
            ) : null}
          </div>
        </section>
      );
    }
    return (
      <section className={cn("panel rise-in rounded-[4px] p-4", className)}>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <RouteIcon aria-hidden className="size-4 shrink-0 text-ink-3" />
          No connected journey
        </p>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
          Nothing connects {data.origin.name} and {data.destination.name}. Try a
          larger place, such as a stop where lines meet.
        </p>
      </section>
    );
  }

  if (!data || routes.length === 0) return null;

  const blocked = current ? routeIsBlocked(current, notices) : false;
  const fare = current?.fare;

  return (
    <div className={cn("relative flex min-h-0 flex-col lg:flex-1", className)}>
      <section
        key={`${data.origin.stationId}:${data.destination.stationId}`}
        className="rise-in panel ticket-bite relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px]"
        aria-live="polite"
        aria-busy={plan.isFetching}
      >
        <Chads />

        <Headsign
          code={codeOf(current)}
          codeColor={colorOf(current)}
          destination={data.destination.name}
          closed={blocked}
          loading={plan.isFetching}
          onClose={onClose}
          meta={
            <>
              <span>{formatDuration(current?.durationMinutes ?? 0)}</span>
              <span aria-hidden>·</span>
              <span>
                {current && current.transferCount > 0
                  ? `${current.transferCount} ${current.transferCount === 1 ? "change" : "changes"}`
                  : "no changes"}
              </span>
              {fare?.available && fare.label ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Fare</span>
                  <span>{fare.label}</span>
                </>
              ) : null}
            </>
          }
        />

        <div aria-hidden className="ticket-perforation shrink-0" />

        {data.disruptions.length > 0 ? <RouteAlerts disruptions={data.disruptions} /> : null}

        <QuietScroll className="min-h-0 flex-1">
          {routes.length > 1 ? (
            <RouteChoices
              routes={routes}
              activeIndex={activeIndex}
              notices={notices}
              onChange={onActiveIndexChange}
            />
          ) : null}

          {current ? (
            <JourneyDetail
              data={data}
              route={current}
              activeLeg={activeLeg}
              onLegSelect={onLegSelect}
              onStopHover={onStopHover}
              closed={closed}
              hoveredLine={hoveredLine}
              onHoverLine={onHoverLine}
            />
          ) : (
            <p className="px-4 py-4 text-[13px] leading-[1.5] text-ink-3">
              Choose a journey to see its stops and fare.
            </p>
          )}
        </QuietScroll>

        {current ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <p className="min-w-0 truncate text-[12px] leading-[1.45] text-ink-3">
              Last calculated {formatTime(data.computedAt)} WIB
            </p>
            {onToggleWatch ? (
              <button
                type="button"
                onClick={onToggleWatch}
                aria-pressed={watching}
                className={cn(
                  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-[4px] border px-2 text-[12px] font-medium transition-colors",
                  watching
                    ? "border-accent-hover bg-accent text-accent-ink hover:bg-accent-hover"
                    : "border-line bg-surface text-ink hover:bg-surface-2",
                )}
              >
                {watching ? (
                  <BellRing aria-hidden className="size-3.5" />
                ) : (
                  <Bell aria-hidden className="size-3.5" />
                )}
                {watching ? "Watching" : "Watch"}
              </button>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Three paper discs fall once from the ticket bite, then they are gone.
 *
 * They are the punch chad of a ticket, not sparkles: no loop, no pointer
 * tracking, and nothing on the map. A reader who asked for less motion
 * never sees them.
 */
function Chads() {
  return (
    <span aria-hidden className="pointer-events-none absolute left-0 top-[84px] z-10">
      {[
        { x: "-6px", spin: "-28deg", delay: "0ms", color: "var(--surface)" },
        { x: "5px", spin: "34deg", delay: "36ms", color: "var(--line-strong)" },
        { x: "12px", spin: "12deg", delay: "72ms", color: "var(--surface-3)" },
      ].map((chad) => (
        <span
          key={chad.x}
          className="chad absolute size-2 rounded-full"
          style={{
            backgroundColor: chad.color,
            animationDelay: chad.delay,
            ["--chad-x" as string]: chad.x,
            ["--chad-spin" as string]: chad.spin,
          }}
        />
      ))}
    </span>
  );
}

/** The board while the geometry is being computed. */
function RouteLoading({
  destination,
  className,
}: {
  destination: string;
  className?: string | undefined;
}) {
  return (
    <section
      className={cn("rise-in panel flex min-h-0 flex-col overflow-hidden rounded-[4px]", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <p className="sr-only">Calculating the route</p>
      <Headsign destination={destination} loading />
      <div aria-hidden className="ticket-perforation shrink-0" />
      <div className="min-h-24 flex-1" />
    </section>
  );
}

/**
 * The ways of getting there.
 *
 * A row of tabs hides the comparison: the rider sees three names and no
 * difference. A list of rows shows what each way costs and what it buys,
 * the way a departure board does. The chosen row is paper with an ink rail
 * on its left.
 */
function RouteChoices({
  routes,
  activeIndex,
  notices,
  onChange,
}: {
  routes: readonly Itinerary[];
  activeIndex: number | null;
  notices: PlanResult["disruptions"];
  onChange: (index: number | null) => void;
}) {
  const visible = visibleChoiceIndexes(routes, notices);
  return (
    <section aria-label="Ways to go" className="px-4 pb-1 pt-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="eyebrow">Ways to go</p>
        <p className="text-[12px] leading-[1.35] tabular-nums text-ink-3">
          {visible.length} {visible.length === 1 ? "option" : "options"}
        </p>
      </div>
      <ul className="flex flex-col">
        {visible.map((index, order) => {
          const route = routes[index];
          if (!route) return null;
          const label = labelOfRoute(route, routes, index, notices);
          const chosen = index === activeIndex;
          const ride = route.legs.find((leg) => leg.kind === "ride");
          const color = ride
            ? (SERVICE_CLASS_COLOR[ride.serviceClass as ServiceClass] ?? "var(--mode-bus)")
            : "var(--ink-3)";
          return (
            <li
              key={index}
              className="rise-in"
              style={{ animationDelay: `${80 + order * 55}ms` }}
            >
              <PayHint notes={payLines(route.fare)}>
                <button
                  type="button"
                  onClick={() => onChange(chosen ? null : index)}
                  aria-pressed={chosen}
                  className={cn(
                    "press relative flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 border-b border-line/70 px-1 py-2 text-left last:border-b-0",
                    chosen ? "border-l-2 border-l-ink bg-surface-2" : "",
                  )}
                >
                  <span className={iconWellClass} style={{ color }}>
                    <RideIdentity
                      lineId={ride?.lineId}
                      serviceClass={ride?.serviceClass}
                      className="size-4"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[15px] font-semibold",
                          label.blocked ? "text-danger line-through" : "text-ink",
                        )}
                      >
                        {label.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] leading-[1.45] text-ink-3">
                      {label.detail || "Direct"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-[15px] font-semibold leading-[1.2] tabular-nums text-ink">
                      {formatDuration(route.durationMinutes)}
                    </span>
                    {route.fare.available && route.fare.label ? (
                      <span className="text-[12px] leading-[1.45] tabular-nums text-ink-2">
                        {route.fare.label}
                      </span>
                    ) : null}
                  </span>
                </button>
              </PayHint>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The colours of this journey.
 *
 * Each vehicle keeps its operator's colour, and walking keeps a dashed ink
 * line. Pointing at a row lights that line on the map, so the board and the
 * map share one reading.
 */
function RouteLegend({
  route,
  hoveredLine,
  onHoverLine,
}: {
  route: Itinerary;
  hoveredLine: string | null;
  onHoverLine?: ((lineKey: string | null) => void) | undefined;
}) {
  const entries = useMemo(() => legendEntries(route), [route]);
  if (entries.length === 0) return null;

  return (
    <section aria-label="Route colours" className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Route colours</p>
        <p className="text-[12px] leading-[1.35] text-ink-3">Point to follow</p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {entries.map((entry) => {
          const active = hoveredLine === entry.key;
          return (
            <li key={entry.key}>
              <Tooltip
                variant="panel"
                side="top"
                label={<RouteLegendDetail entry={entry} />}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`${entry.label}${entry.name && entry.name !== entry.label ? `, ${entry.name}` : ""}, ${formatDuration(entry.durationMinutes)}`}
                  onMouseEnter={() => onHoverLine?.(entry.key)}
                  onMouseLeave={() => onHoverLine?.(null)}
                  onFocus={() => onHoverLine?.(entry.key)}
                  onBlur={() => onHoverLine?.(null)}
                  onClick={() => onHoverLine?.(active ? null : entry.key)}
                  className={cn(
                    "press flex min-h-11 cursor-pointer items-center gap-2 rounded-[4px] border px-2 py-1 text-left transition-colors",
                    active
                      ? "border-l-2 border-l-ink bg-surface-2"
                      : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  <span aria-hidden className="flex w-5 shrink-0 items-center">
                    {entry.kind === "walk" ? (
                      <span
                        className="h-0 w-5 border-t-2 border-dashed"
                        style={{ borderColor: entry.color }}
                      />
                    ) : (
                      /* The enamel route: a thick operator line with a
                         paper casing, not a thin swatch. */
                      <span
                        className="h-[6px] w-5 rounded-full border-2"
                        style={{
                          backgroundColor: entry.color,
                          borderColor: "var(--surface)",
                        }}
                      />
                    )}
                  </span>
                  <span className="text-[13px] font-semibold leading-[1.2] text-ink">
                    {entry.label}
                  </span>
                  <span className="text-[12px] leading-[1.45] tabular-nums text-ink-3">
                    {formatDuration(entry.durationMinutes)}
                  </span>
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RouteLegendDetail({ entry }: { entry: RouteLegendEntry }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] font-semibold leading-[1.3] text-ink">
        {entry.label}
        {entry.name && entry.name !== entry.label ? ` · ${entry.name}` : ""}
      </p>
      <p className="text-[12px] leading-[1.45] text-ink-2">
        {entry.fromName} → {entry.toName}
      </p>
      <p className="text-[12px] leading-[1.45] tabular-nums text-ink-3">
        {entry.kind === "walk"
          ? `Walk · ${formatDuration(entry.durationMinutes)}`
          : `${entry.stopCount} stops · ${formatDuration(entry.durationMinutes)}`}
      </p>
      {entry.directionLabel ? (
        <p className="text-[12px] leading-[1.45] text-ink-2">Towards {entry.directionLabel}</p>
      ) : null}
      {entry.temporary ? (
        <p className="text-[12px] leading-[1.45] text-ink-3">Temporary service</p>
      ) : null}
    </div>
  );
}

function JourneyDetail({
  data,
  route,
  activeLeg,
  onLegSelect,
  onStopHover,
  closed,
  hoveredLine,
  onHoverLine,
}: {
  data: PlanResult;
  route: Itinerary;
  activeLeg?: string | null | undefined;
  onLegSelect?: ((legId: string | null) => void) | undefined;
  onStopHover?: ((stationId: string | null) => void) | undefined;
  closed: ReadonlySet<string>;
  hoveredLine?: string | null | undefined;
  onHoverLine?: ((lineKey: string | null) => void) | undefined;
}) {
  const patternLabel = route.legs.find((leg) => leg.kind === "ride" && leg.patternLabel)
    ?.patternLabel;
  return (
    <>
      <div className="px-4 pb-3 pt-3">
        <p className="text-[13px] leading-[1.5] text-ink-2">
          <span className="text-ink-3">From</span> {data.origin.name}
          <span className="mx-2 text-ink-3">·</span>
          <span className="text-ink-3">To</span> {data.destination.name}
        </p>

        <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
          {formatDistance(route.distanceKm)} ·{" "}
          {route.transferCount > 0
            ? `${route.transferCount} ${route.transferCount === 1 ? "change" : "changes"}`
            : "no changes"}
          {route.walkingKm > 0 ? ` · walk ${formatDistance(route.walkingKm)}` : ""}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-[1.45] text-ink-3">
          <span>Schedule-based</span>
          {patternLabel ? <span>{patternLabel}</span> : null}
          <span className="ml-auto tabular-nums text-ink-2">
            {data.quotedAt ? `${formatTime(data.quotedAt)} WIB` : ""}
          </span>
        </div>

        <RouteLegend
          route={route}
          hoveredLine={hoveredLine ?? null}
          onHoverLine={onHoverLine}
        />

        <Verdict route={route} plan={data} />

        {route.fare.available &&
        (route.fare.breakdown.length > 0 || route.fare.alternatives.length > 0) ? (
          <div className="mt-4 rounded-[4px] border border-dashed border-line-strong px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Ticket</p>
              <p className="text-[12px] font-medium tabular-nums text-ink">
                {route.fare.label}
              </p>
            </div>
            <ul className="mt-2 space-y-2">
              {route.fare.breakdown.map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  className="perforation pt-2 first:border-0 first:pt-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink">
                      {formatRupiah(item.amountIdr)}
                    </span>
                  </div>
                  {item.detail ? (
                    <p className="mt-0.5 text-[12px] leading-[1.45] text-ink-3">{item.detail}</p>
                  ) : null}
                </li>
              ))}
              {route.fare.alternatives.map((alternative) => (
                <li
                  key={alternative.label}
                  className="flex items-baseline justify-between gap-3 border-t border-dashed border-line-strong/60 pt-2"
                >
                  <span className="min-w-0 flex-1 text-[12px] leading-[1.45] text-ink-3">
                    {alternative.label}
                  </span>
                  <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink">
                    {formatRupiah(alternative.amountIdr)}
                  </span>
                </li>
              ))}
            </ul>
            <FareCapNote fare={route.fare} />
          </div>
        ) : null}
      </div>

      <LegList
        legs={route.legs}
        activeLegId={activeLeg}
        onLegSelect={onLegSelect}
        onStopHover={onStopHover}
        closedStationIds={closed}
      />
    </>
  );
}

/**
 * The card price, when the card changes it.
 *
 * The fare engine already knows the JakLingko cap and the card it needs;
 * this line makes the difference visible instead of leaving the rider to
 * compare two numbers.
 */
function FareCapNote({ fare }: { fare: FareQuote }) {
  const alternative = fare.alternatives.find(
    (entry) => /jaklingko|cap|integrasi/i.test(entry.label) && fare.totalIdr !== null,
  );
  if (!alternative || alternative.amountIdr >= (fare.totalIdr ?? 0)) return null;
  return (
    <p className="mt-2 border-t border-dashed border-line-strong/60 pt-2 text-[12px] leading-[1.5] text-ink-2">
      With a JakLingko card: {formatRupiah(alternative.amountIdr)}
      {fare.totalIdr !== null
        ? ` · save ${formatRupiah(fare.totalIdr - alternative.amountIdr)}`
        : ""}
      . {alternative.note}
    </p>
  );
}

function payLines(fare: FareQuote): string[] {
  if (fare.notes.length > 0) return fare.notes;
  return fare.breakdown.map((item) =>
    item.detail
      ? `${item.label}, ${formatRupiah(item.amountIdr)}. ${item.detail}`
      : `${item.label}, ${formatRupiah(item.amountIdr)}.`,
  );
}

function reasonOf(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "That place was not found. Pick a suggestion, or type a more specific stop name.";
    }
    if (error.status >= 500) {
      return "The server did not answer. Try again in a moment.";
    }
    return error.message;
  }
  return "Something went wrong while calculating the route. Try again in a moment.";
}

function Verdict({ route, plan }: { route: Itinerary; plan: PlanResult }) {
  const blocked = routeIsBlocked(route, plan.disruptions);
  const watched = plan.watch ?? [];
  if (blocked) {
    const place =
      plan.disruptions.find((item) => item.blocksService)?.stationName ?? "a closed stop";
    return (
      <p className="mt-3 flex items-start gap-2 text-[13px] leading-[1.5] text-danger">
        <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Blocked at {place}. This journey uses a stop that is not in service.
      </p>
    );
  }
  if (
    plan.disruptions.some((item) => item.blocksService) ||
    watched.some((item) => item.blocksService)
  ) {
    const name =
      plan.disruptions.find((item) => item.stationName)?.stationName ??
      watched.find((item) => item.stationName)?.stationName ??
      "a watched stop";
    return (
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-2">
        Open for this journey. It does not pass the notice at {name}.
      </p>
    );
  }
  return null;
}

/**
 * The service alerts for the chosen journey, one at a time.
 *
 * The route is the answer, so the alerts are a compact strip rather than
 * a stack of coloured cards. A rider can read the next one without losing
 * the fare and the distance below it.
 */
function RouteAlerts({ disruptions }: { disruptions: readonly DisruptionSummary[] }) {
  const [index, setIndex] = useState(0);
  const active = Math.min(index, Math.max(0, disruptions.length - 1));
  const alert = disruptions[active];
  if (!alert) return null;

  const tone =
    alert.severity === "critical" || alert.severity === "severe"
      ? "danger"
      : alert.severity === "warning"
        ? "warn"
        : "info";
  const rail = { danger: "bg-danger", warn: "bg-warn", info: "bg-info" }[tone];
  const ink = { danger: "text-danger", warn: "text-warn", info: "text-info" }[tone];
  const window = impactWindow(alert);

  return (
    <section
      aria-label="Service alerts on this route"
      className="relative shrink-0 bg-surface-2/40 px-4 py-2"
    >
      <span aria-hidden className={cn("absolute inset-y-2 left-0 w-[3px]", rail)} />
      <div className="flex items-start gap-2">
        <IncidentIcon
          mark={alert.mark}
          kind={alert.kind}
          className={cn("mt-0.5 size-4 shrink-0", ink)}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-[1.35] text-ink">
            {alert.title}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12px] leading-[1.45] text-ink-3">
              {DISRUPTION_KIND_LABEL[alert.kind] ?? alert.kind}
              {alert.stationName ? ` · ${alert.stationName}` : ""}
              {window ? ` · ${window}` : ""}
              {alert.url ? (
                <>
                  {" · "}
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-ink-2"
                  >
                    Source
                  </a>
                </>
              ) : null}
            </p>
            {disruptions.length > 1 ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Previous alert"
                  onClick={() =>
                    setIndex((active - 1 + disruptions.length) % disruptions.length)
                  }
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[4px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <ChevronLeft aria-hidden className="size-3.5" />
                </button>
                <span className="text-[12px] tabular-nums text-ink-3">
                  {active + 1}/{disruptions.length}
                </span>
                <button
                  type="button"
                  aria-label="Next alert"
                  onClick={() => setIndex((active + 1) % disruptions.length)}
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[4px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <ChevronRight aria-hidden className="size-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function impactWindow(alert: DisruptionSummary): string | null {
  const now = Date.now();
  const current = alert.validityWindows.find((window) => {
    const start = Date.parse(window.startsAt);
    const end = window.endsAt ? Date.parse(window.endsAt) : Number.POSITIVE_INFINITY;
    return start <= now && end > now;
  });
  if (current?.endsAt) return `until ${formatTime(current.endsAt)} WIB`;
  const next = alert.validityWindows
    .filter((window) => Date.parse(window.startsAt) > now)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0];
  if (next) {
    const start = formatTime(next.startsAt);
    const end = next.endsAt ? `-${formatTime(next.endsAt)}` : "";
    return `next ${start}${end} WIB`;
  }
  return null;
}

/**
 * How an alternative route is named.
 *
 * "Alternative 1" tells the rider nothing. The corridors it uses do, and
 * the difference in time says whether the change is worth it.
 */
function labelOfRoute(
  route: Itinerary,
  all: readonly Itinerary[],
  index: number,
  disruptions: PlanResult["disruptions"],
): { name: string; detail: string; blocked: boolean } {
  const codes = route.legs
    .filter((leg) => leg.kind === "ride" && leg.lineCode)
    .map((leg) => leg.lineCode as string);
  const unique = [...new Set(codes)];

  const blocked = routeIsBlocked(route, disruptions);
  const anyBlocked = all.some((entry) => routeIsBlocked(entry, disruptions));
  const fastest = Math.min(...all.map((entry) => entry.durationMinutes));
  const fewestTransfers = Math.min(...all.map((entry) => entry.transferCount));
  const difference = route.durationMinutes - fastest;
  const leastWalking = Math.min(...all.map((entry) => entry.walkingKm));
  const open = all.filter((entry) => !routeIsBlocked(entry, disruptions));
  const fastestOpen =
    open.length > 0 ? Math.min(...open.map((entry) => entry.durationMinutes)) : fastest;
  const openFares = open
    .map((entry) => (entry.fare.available ? entry.fare.totalIdr : null))
    .filter((amount): amount is number => amount !== null);
  const lowestOpenFare = openFares.length > 0 ? Math.min(...openFares) : null;

  let name = "Suggested";
  if (blocked) name = "Blocked";
  else if (anyBlocked && route.durationMinutes === fastestOpen) name = "Still open";
  else if (
    anyBlocked &&
    lowestOpenFare !== null &&
    route.fare.totalIdr === lowestOpenFare &&
    route.durationMinutes !== fastestOpen
  ) {
    name = "Lower fare";
  } else if (index === 0) name = "Fastest";
  else if (route.transferCount === fewestTransfers) name = "Fewest changes";
  else if (route.walkingKm === leastWalking) name = "Least walking";

  const parts: string[] = [];
  if (unique.length > 0) parts.push(unique.slice(0, 3).join(" · "));
  if (!blocked && difference > 0) parts.push(`+${difference} min`);
  if (route.transferCount > fewestTransfers) {
    const extra = route.transferCount - fewestTransfers;
    parts.push(extra === 1 ? "1 more change" : `${extra} more changes`);
  }

  return { name, detail: parts.join(" · "), blocked };
}
