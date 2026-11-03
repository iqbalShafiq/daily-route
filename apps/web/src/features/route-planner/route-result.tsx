import { useState } from "react";
import {
  AlertCircle,
  Bell,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Route as RouteIcon,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { QuietScroll } from "../../components/ui/quiet-scroll.js";
import { AnimatedNumber } from "../../components/ui/animated-number.js";
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
import {
  closedStationIds,
  planChoices,
  routeIsBlocked,
  visibleChoiceIndexes,
} from "../../lib/route-choice.js";

import type { UsePlanResult } from "./use-plan.js";

/**
 * The result of the search.
 *
 * It is a printed route board: the way being followed at the top, the
 * alternatives as tickets under it, then the journey and the stops. The
 * board can be empty, loading or broken, and it says which.
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
  className?: string;
}) {
  const data: PlanResult | undefined = plan.data;
  const routes = data ? planChoices(data) : [];
  const current = activeIndex === null ? undefined : routes[activeIndex];
  const notices = data?.disruptions ?? [];
  const closed = closedStationIds(notices);

  if (plan.isFetching && !data) return <RouteLoading className={className} />;

  if (plan.isError) {
    return (
      <section
        className={cn("panel rise-in rounded-[12px] border-t-2 border-t-danger p-4", className)}
        role="alert"
      >
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
          className={cn("panel rise-in rounded-[12px] p-4", className)}
          role="alert"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />
            No open journey
          </p>
          <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
            Every way we found between {data.origin.name} and{" "}
            {data.destination.name} is closed or diverted. Check the service
            board before you travel.
          </p>
          {data.disruptions[0] ? (
            <p className="mt-2 text-[13px] leading-[1.45] text-ink-3">
              {data.disruptions[0].title}
            </p>
          ) : null}
        </section>
      );
    }
    return (
      <section className={cn("panel rise-in rounded-[12px] p-4", className)}>
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

  return (
    <div className={cn("flex min-h-0 flex-col lg:flex-1", className)}>
      <section
        key={`${data.origin.id}:${data.destination.id}`}
        className="rise-in panel relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border-t-2 border-t-ink"
        aria-live="polite"
        aria-busy={plan.isFetching}
      >
        {plan.isFetching ? (
          <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-line">
            <span className="route-loader" />
          </span>
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <RouteIcon aria-hidden className="size-3.5 text-accent" />
            <p className="eyebrow">Route board</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <p className="font-mono text-[12px] font-medium tabular-nums leading-[1.2] text-ink-3">
              {formatTime(data.computedAt)} WIB
            </p>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close the route"
                title="Close the route"
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

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
              routes={routes}
              activeLeg={activeLeg}
              onLegSelect={onLegSelect}
              onStopHover={onStopHover}
              closed={closed}
            />
          ) : (
            <p className="px-4 py-4 text-[13px] leading-[1.5] text-ink-3">
              Choose a journey to see its stops and fare.
            </p>
          )}
        </QuietScroll>

        {current ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-4 py-2">
            <p className="min-w-0 truncate font-mono text-[12px] leading-[1.2] text-ink-3">
              Last calculated {formatTime(data.computedAt)} WIB
            </p>
            {onToggleWatch ? (
              <button
                type="button"
                onClick={onToggleWatch}
                aria-pressed={watching}
                className={cn(
                  "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1 font-mono text-[12px] font-medium uppercase leading-[1.2] tracking-[0.04em] transition-colors",
                  watching
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink",
                )}
              >
                {watching ? (
                  <BellRing aria-hidden className="size-3" />
                ) : (
                  <Bell aria-hidden className="size-3" />
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

/** The board while the geometry is being computed. */
function RouteLoading({ className }: { className?: string | undefined }) {
  return (
    <section
      className={cn("panel rise-in rounded-[12px] border-t-2 border-t-ink p-4", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <p className="sr-only">Calculating the route…</p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RouteIcon aria-hidden className="size-3.5 text-accent" />
          <p className="eyebrow">Drawing the route</p>
        </div>
      </div>
      <div className="relative mt-5 h-px w-full overflow-hidden bg-line">
        <span aria-hidden className="route-loader" />
        <span
          aria-hidden
          className="absolute -top-1 left-0 size-2 rounded-full border-2 border-accent bg-surface"
        />
        <span aria-hidden className="absolute -top-1 right-0 size-2 rounded-[4px] bg-ink" />
      </div>
      <div className="mt-5 flex items-end gap-3">
        <span className="h-9 w-32 rounded-[4px] bg-surface-2" />
        <span className="h-4 w-20 rounded-[4px] bg-surface-2" />
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <span className="size-7 shrink-0 rounded-[4px] bg-surface-2" />
            <span className="h-3 flex-1 rounded-[4px] bg-surface-2" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The ways of getting there.
 *
 * A row of tabs hides the comparison: the rider sees three names and no
 * difference. A list of tickets shows what each way costs and what it
 * buys, the way a departure board does.
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
    <section aria-label="Ways to go" className="border-b border-line/70 px-3 pb-3 pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="eyebrow">Ways to go</p>
        <p className="font-mono text-[12px] leading-[1.2] text-ink-3">
          {visible.length} {visible.length === 1 ? "option" : "options"}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {visible.map((index, order) => {
          const route = routes[index];
          if (!route) return null;
          const label = labelOfRoute(route, routes, index, notices);
          const chosen = index === activeIndex;
          const ride = route.legs.find((leg) => leg.kind === "ride");
          const color = ride
            ? (SERVICE_CLASS_COLOR[ride.serviceClass as ServiceClass] ?? "var(--accent)")
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
                    "press relative flex w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left",
                    chosen
                      ? "border-ink bg-surface shadow-raised"
                      : "border-line-strong/70 bg-surface/60 hover:border-line-strong hover:bg-surface",
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ backgroundColor: chosen ? color : "transparent" }}
                  />
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface-2"
                    style={{ color }}
                  >
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
                          "truncate text-[13px] font-semibold",
                          label.blocked ? "text-danger" : "text-ink",
                        )}
                      >
                        {label.name}
                      </span>
                      {chosen ? (
                        <span className="hidden shrink-0 font-mono text-[12px] font-medium uppercase leading-[1.2] tracking-[0.04em] text-accent sm:inline">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                      {label.detail || "Direct"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-[15px] font-semibold leading-[1.2] tabular-nums text-ink">
                      {formatDuration(route.durationMinutes)}
                    </span>
                    {route.fare.available && route.fare.label ? (
                      <span className="font-mono text-[12px] leading-[1.2] tabular-nums text-ink-2">
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

function JourneyDetail({
  data,
  route,
  routes,
  activeLeg,
  onLegSelect,
  onStopHover,
  closed,
}: {
  data: PlanResult;
  route: Itinerary;
  routes: readonly Itinerary[];
  activeLeg?: string | null | undefined;
  onLegSelect?: ((legId: string | null) => void) | undefined;
  onStopHover?: ((stationId: string | null) => void) | undefined;
  closed: ReadonlySet<string>;
}) {
  const patternLabel = route.legs.find((leg) => leg.kind === "ride" && leg.patternLabel)
    ?.patternLabel;
  return (
    <>
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Journey</p>
            <div className="mt-1 flex items-start gap-2">
              <div aria-hidden className="flex flex-col items-center pt-1">
                <span className="size-2.5 rounded-full border-2 border-accent bg-surface" />
                <span className="my-1 h-6 w-px bg-line-strong/70" />
                <span className="size-2.5 rounded-[4px] bg-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">From</p>
                <p className="truncate text-[15px] font-semibold text-ink">
                  {data.origin.name}
                </p>
                <p className="eyebrow mt-2">To</p>
                <p className="truncate text-[15px] font-semibold text-ink">{data.destination.name}</p>
              </div>
            </div>
          </div>
          {route.fare.available && route.fare.label ? (
            <div className="shrink-0 text-right">
              <p className="eyebrow">Fare</p>
              {routes.length === 1 ? (
                <PayHint notes={payLines(route.fare)}>
                  <p className="mt-1 font-mono text-[20px] font-semibold leading-[1.3] tabular-nums text-ink">
                    {route.fare.label}
                  </p>
                </PayHint>
              ) : (
                <p className="mt-1 font-mono text-[20px] font-semibold leading-[1.3] tabular-nums text-ink">
                  {route.fare.label}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-line/70 pt-3">
          <div className="min-w-0">
            <p className="text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums text-ink">
              <AnimatedNumber value={route.durationMinutes} format={formatDuration} />
            </p>
            <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
              {formatDistance(route.distanceKm)} ·{" "}
              {route.transferCount > 0
                ? `${route.transferCount} ${route.transferCount === 1 ? "change" : "changes"}`
                : "no changes"}
              {route.walkingKm > 0 ? ` · walk ${formatDistance(route.walkingKm)}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[12px] font-medium leading-[1.2] tabular-nums text-ink-2">
              {data.quotedAt ? `${formatTime(data.quotedAt)} WIB` : ""}
            </p>
            <p className="mt-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
              {data.nightSafe ? "Night-safe" : data.scheduled ? "Leave at" : "Now"}
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-[4px] border border-line-strong px-2 py-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
            Schedule-based
          </span>
          {patternLabel ? (
            <span className="rounded-[4px] border border-line-strong px-2 py-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
              {patternLabel}
            </span>
          ) : null}
          {data.nightSafe ? (
            <span className="rounded-[4px] bg-accent-soft px-2 py-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-accent">
              Fewer night walks
            </span>
          ) : null}
        </div>

        <Verdict route={route} plan={data} />

        {route.fare.available &&
        (route.fare.breakdown.length > 0 || route.fare.alternatives.length > 0) ? (
          <div className="mt-3 rounded-lg border border-dashed border-line-strong bg-surface-2/40 px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Ticket</p>
              <p className="font-mono text-[12px] font-medium tabular-nums text-ink">
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
                    <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-ink">
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
                  <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-ink">
                    {formatRupiah(alternative.amountIdr)}
                  </span>
                </li>
              ))}
            </ul>
            <FareCapNote fare={route.fare} />
          </div>
        ) : null}
      </div>

      <div className="border-t border-line/70">
        <LegList
          legs={route.legs}
          activeLegId={activeLeg}
          onLegSelect={onLegSelect}
          onStopHover={onStopHover}
          closedStationIds={closed}
        />
      </div>
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
      <p className="mt-2 flex items-start gap-2 text-[13px] leading-[1.5] text-danger">
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
      <p className="mt-2 text-[13px] leading-[1.5] text-accent">
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
      className="relative shrink-0 border-b border-line/70 bg-surface-2/40"
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", rail)} />
      <div className="flex items-start gap-2 py-3 pl-4 pr-3">
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
            <p className="min-w-0 truncate font-mono text-[12px] leading-[1.2] text-ink-3">
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
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <ChevronLeft aria-hidden className="size-3.5" />
                </button>
                <span className="font-mono text-[12px] tabular-nums text-ink-3">
                  {active + 1}/{disruptions.length}
                </span>
                <button
                  type="button"
                  aria-label="Next alert"
                  onClick={() => setIndex((active + 1) % disruptions.length)}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
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
