import { ArrowRightLeft, LocateFixed, Navigation, Route as RouteIcon } from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { Card, CardHeader } from "../../components/ui/card.js";
import { EmptyState, Spinner } from "../../components/ui/feedback.js";
import { cn } from "../../lib/cn.js";
import { DisruptionBanner } from "../../components/transit/disruption-banner.js";
import { LegList } from "../../components/transit/leg-list.js";
import type { Itinerary, PlanResult, PositionPlan } from "../../lib/api.js";
import { formatDistance, formatDuration, formatTimestamp } from "../../lib/format.js";

import { PlaceInput } from "./place-input.js";
import type { UsePlanResult } from "./use-plan.js";
import { WalkPanel } from "./walk-panel.js";

/**
 * The route planner.
 *
 * It is the deterministic half of the product: two places in, an itinerary
 * out, with the disruptions that affect it. The assistant in the chat tab
 * is the conversational half of the same data.
 *
 * The state lives in the page, because the map draws the same route.
 */
/**
 * The route planner.
 *
 * It is the deterministic half of the product: two places in, an itinerary
 * out, with the disruptions that affect it. The assistant in the chat tab
 * is the conversational half of the same data.
 *
 * The state lives in the page, because the map draws the same route.
 */
export function RoutePlanner({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSubmit,
  plan,
  activeIndex,
  onActiveIndexChange,
  activeLeg,
  onLegSelect,
  onStopHover,
  onUseMyPosition,
  onChooseOrigin,
  onExample,
  walk,
}: {
  origin: string;
  destination: string;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
  plan: UsePlanResult;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  activeLeg?: string | null | undefined;
  onLegSelect?: ((legId: string) => void) | undefined;
  /** Pointing at a stop in the list points at that stop on the map. */
  onStopHover?: ((stationId: string | null) => void) | undefined;
  /** Ask the browser where the reader is, and plan from there. */
  onUseMyPosition?: (() => void) | undefined;
  /** The walk from the reader's place to the stop, when it is known. */
  walk?: PositionPlan | null | undefined;
  /** Choose a different start: the fewest transfers, or the least walking. */
  onChooseOrigin?: ((profileId: string) => void) | undefined;
  /** Put an example place into the origin field. */
  onExample?: ((name: string) => void) | undefined;
}) {
  const data: PlanResult | undefined = plan.data;
  const itineraries = data?.itineraries ?? [];
  const alternatives = data?.alternatives ?? [];
  const routes = [...itineraries, ...alternatives];
  const current = routes[activeIndex];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Cari rute" />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-3 px-4 pb-4"
        >
          <PlaceInput
            label="Dari"
            value={origin}
            onValueChange={onOriginChange}
            placeholder="Stasiun, halte, atau landmark"
            icon={<Navigation aria-hidden className="size-4" />}
            trailingAction={
              <button
                type="button"
                aria-label="Gunakan posisi saya"
                title="Gunakan posisi saya"
                onClick={onUseMyPosition}
                className="flex size-8 max-md:size-11 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <LocateFixed aria-hidden className="size-4" />
              </button>
            }
          />

          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px flex-1 bg-line" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onOriginChange(destination);
                onDestinationChange(origin);
              }}
              aria-label="Tukar asal dan tujuan"
              className="border border-line bg-surface"
            >
              <ArrowRightLeft aria-hidden className="size-4" />
            </Button>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>

          <PlaceInput
            label="Ke"
            value={destination}
            onValueChange={onDestinationChange}
            placeholder="Stasiun, halte, atau landmark"
            icon={<RouteIcon aria-hidden className="size-4" />}
          />

          <Button type="submit" variant="primary" size="lg" className="w-full">
            Tampilkan rute
          </Button>
        </form>

        {walk !== undefined ? (
          <div className="px-4 pb-4">
            <WalkPanel plan={walk ?? null} onChoose={onChooseOrigin} />
          </div>
        ) : null}
      </Card>

      {plan.isFetching && !data ? (
        <Card>
          <div className="flex items-center justify-center px-4 py-10">
            <Spinner label="Menghitung rute…" />
          </div>
        </Card>
      ) : null}

      {plan.isError ? (
        <Card>
          <EmptyState
            title="Rute belum bisa dihitung"
            description="Coba nama halte yang lebih spesifik, misalnya Halte Bundaran HI."
            action={
              <Button type="button" variant="secondary" onClick={() => onExample?.("Bundaran HI")}>
                Pakai Halte Bundaran HI
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && itineraries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<RouteIcon aria-hidden className="size-5" />}
            title="Tidak ada perjalanan yang terhubung"
            description={`Tidak ditemukan perjalanan antara ${data.origin.name} dan ${data.destination.name}. Coba tempat yang lebih umum, seperti halte interchange.`}
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => onExample?.(data.destination.name)}
              >
                Coba lagi dari {data.destination.name}
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && itineraries.length > 0 ? (
        <div className="flex flex-col gap-3">
          {data.disruptions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.disruptions.map((disruption) => (
                <DisruptionBanner key={disruption.id} disruption={disruption} />
              ))}
            </div>
          ) : null}

          {/*
           * The ways of getting there.
           *
           * A row of tabs hides the comparison: the rider sees three
           * names and no difference. A list shows what each way costs
           * and what it buys, the way a list of routes does in every map
           * worth using.
           */}
          {routes.length > 1 ? (
            <ul className="flex flex-col gap-1">
              {routes.slice(0, 3).map((route, index) => {
                const label = labelOfRoute(route, routes, index);
                const chosen = index === activeIndex;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => onActiveIndexChange(index)}
                      aria-current={chosen ? "true" : undefined}
                      className={cn(
                        "flex w-full cursor-pointer items-baseline gap-2 rounded-md px-3 py-2 text-left transition-colors",
                        chosen ? "bg-accent-soft" : "hover:bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 text-[13px]",
                          chosen ? "font-semibold text-ink" : "font-medium text-ink-2",
                        )}
                      >
                        {label.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                        {label.detail}
                      </span>
                      <span className="shrink-0 tabular-nums text-[12px] text-ink-2">
                        {formatDuration(route.durationMinutes)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {current ? (
            <Card
              className="relative overflow-hidden"
              aria-live="polite"
              aria-busy={plan.isFetching}
            >
              {plan.isPending ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent"
                />
              ) : null}
              <div className="px-4 pt-4 pb-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  Perjalanan
                </p>
                <p className="mt-0.5 truncate text-[13px] text-ink-2">
                  {data.origin.name} → {data.destination.name}
                </p>
                <p className="mt-1 text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] tabular-nums text-ink">
                  {formatDuration(current.durationMinutes)}
                </p>
                <p className="mt-1 text-[13px] text-ink-2">
                  {formatDistance(current.distanceKm)} ·{" "}
                  {current.transferCount > 0
                    ? `${current.transferCount} kali pindah`
                    : "tanpa pindah"}
                </p>
              </div>
              <div className="border-t border-line">
                <LegList
                  legs={current.legs}
                  activeLegId={activeLeg}
                  onLegSelect={onLegSelect}
                  onStopHover={onStopHover}
                />
              </div>
              <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">
                Terakhir dihitung {formatTimestamp(data.computedAt)} WIB
              </p>
              {current.fare.available && current.fare.label ? (
                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-ink-2">Tarif</span>
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {current.fare.label}
                    </span>
                  </div>
                  {current.fare.breakdown.map((item, index) => (
                    <p key={index} className="mt-1 text-[12px] text-ink-3">
                      {item.label}
                      {item.detail ? ` · ${item.detail}` : ""}
                    </p>
                  ))}
                  {current.fare.notes.map((note, index) => (
                    <p key={index} className="mt-1 text-[12px] text-ink-3">
                      {note}
                    </p>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {data.disruptions.length === 0 ? (
            <p className="px-1 text-[12px] text-ink-3">
              Tidak ada pengalihan atau penutupan yang tercatat untuk rute ini.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * How an alternative route is named.
 *
 * "Alternatif 1" tells the rider nothing. The corridors it uses do, and
 * the difference in time says whether the change is worth it.
 */
function labelOfRoute(
  route: Itinerary,
  all: readonly Itinerary[],
  index: number,
): { name: string; detail: string } {
  const codes = route.legs
    .filter((leg) => leg.kind === "ride" && leg.lineCode)
    .map((leg) => leg.lineCode as string);
  const unique = [...new Set(codes)];

  const fastest = Math.min(...all.map((entry) => entry.durationMinutes));
  const fewestTransfers = Math.min(...all.map((entry) => entry.transferCount));
  const difference = route.durationMinutes - fastest;

  // The name says what the way optimises, the detail says what it
  // costs. A rider compares the two, and picks.
  const leastWalking = Math.min(...all.map((entry) => entry.walkingKm));

  let name = "Rekomendasi";
  if (index === 0) name = "Tercepat";
  else if (route.transferCount === fewestTransfers) name = "Paling sedikit pindah";
  else if (route.walkingKm === leastWalking) name = "Paling sedikit jalan kaki";

  const parts: string[] = [];
  if (difference > 0) parts.push(`+${difference} mnt`);
  if (route.transferCount > fewestTransfers) {
    parts.push(`${route.transferCount - fewestTransfers} pindah lebih banyak`);
  }
  if (parts.length === 0 && index === 0 && unique.length > 0) {
    parts.push(unique.slice(0, 2).join(" · "));
  }

  return { name, detail: parts.join(" · ") };
}
