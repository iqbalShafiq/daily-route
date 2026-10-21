import { ArrowRightLeft, LocateFixed, Navigation, Route as RouteIcon } from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { Card, CardHeader } from "../../components/ui/card.js";
import { EmptyState, Spinner } from "../../components/ui/feedback.js";
import { Tab, Tabs } from "../../components/ui/tabs.js";
import { DisruptionBanner } from "../../components/transit/disruption-banner.js";
import { LegList } from "../../components/transit/leg-list.js";
import type { Itinerary, PlanResult, WalkRoute } from "../../lib/api.js";
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
  onWalkReady,
  onUseMyPosition,
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
  onWalkReady?: ((walk: WalkRoute) => void) | undefined;
  /** Ask the browser where the reader is, and plan from there. */
  onUseMyPosition?: (() => void) | undefined;
  /** The walk from the reader's place to the stop, when it is known. */
  walk?: WalkRoute | null | undefined;
}) {
  const data: PlanResult | undefined = plan.data;
  const itineraries = data?.itineraries ?? [];
  const alternatives = data?.alternatives ?? [];
  const routes = [...itineraries, ...alternatives];
  const current = routes[activeIndex];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Cari rute"
          description="Transjakarta, MRT, LRT Jakarta, LRT Jabodebek, dan KRL."
        />

        {onWalkReady ? (
          <div className="px-4 pb-3">
            <WalkPanel walk={walk ?? null} />
          </div>
        ) : null}

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
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
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
            description="Coba nama tempat yang lebih spesifik, misalnya halte terdekat dengan nama jalan."
          />
        </Card>
      ) : null}

      {data && itineraries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<RouteIcon aria-hidden className="size-5" />}
            title="Tidak ada rute terhubung"
            description={`Tidak ditemukan perjalanan antara ${data.origin.name} dan ${data.destination.name}. Coba tempat yang lebih umum, seperti halte interchange.`}
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

          {routes.length > 1 ? (
            <Tabs
              value={String(activeIndex)}
              onValueChange={(value) => onActiveIndexChange(Number(value))}
            >
              <Tab value="0" title="Rute tercepat">
                Tercepat
              </Tab>
              {routes.slice(1).map((route, index) => {
                const label = labelOfRoute(route, routes);
                return (
                  <Tab key={index + 1} value={String(index + 1)} title={label.title}>
                    {label.short}
                  </Tab>
                );
              })}
            </Tabs>
          ) : null}

          {current ? (
            <Card className="relative overflow-hidden">
              {plan.isPending ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent"
                />
              ) : null}
              <div className="px-4 pt-4 pb-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
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
              <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
                Data per {formatTimestamp(data.computedAt)}
              </p>
              {current.fare.available && current.fare.label ? (
                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-ink-2">Perkiraan tarif</span>
                    <span className="text-sm font-semibold tabular-nums text-ink">
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
function labelOfRoute(route: Itinerary, all: readonly Itinerary[]): { short: string; title: string } {
  const codes = route.legs
    .filter((leg) => leg.kind === "ride" && leg.lineCode)
    .map((leg) => leg.lineCode as string);
  const unique = [...new Set(codes)];

  const fastest = Math.min(...all.map((entry) => entry.durationMinutes));
  const difference = route.durationMinutes - fastest;
  const differenceLabel =
    difference > 0 ? ` · +${difference} mnt` : difference < 0 ? " · paling cepat" : "";

  const title = `${unique.join(" + ")}${differenceLabel}`;

  return {
    short: unique.length > 0 ? unique.slice(0, 2).join(" · ") : `Alternatif`,
    title,
  };
}
