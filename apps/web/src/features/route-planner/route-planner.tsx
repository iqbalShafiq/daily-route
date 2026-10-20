import { ArrowRightLeft, Navigation, Route as RouteIcon } from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { Card, CardHeader } from "../../components/ui/card.js";
import { EmptyState, Spinner } from "../../components/ui/feedback.js";
import { Tab, Tabs } from "../../components/ui/tabs.js";
import { DisruptionBanner } from "../../components/transit/disruption-banner.js";
import { LegList } from "../../components/transit/leg-list.js";
import type { PlanResult } from "../../lib/api.js";
import { formatDuration } from "../../lib/format.js";

import { PlaceInput } from "./place-input.js";
import type { UsePlanResult } from "./use-plan.js";

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
}: {
  origin: string;
  destination: string;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
  plan: UsePlanResult;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
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
          description="Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek, dan KRL Jabodetabek dalam satu pencarian."
        />

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

      {plan.isPending ? (
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
              <Tab value="0">Tercepat</Tab>
              {routes.slice(1).map((_route, index) => (
                <Tab key={index + 1} value={String(index + 1)}>
                  Alternatif {index + 1}
                </Tab>
              ))}
            </Tabs>
          ) : null}

          {current ? (
            <Card>
              <CardHeader
                title={`${formatDuration(current.durationMinutes)} · ${current.transferCount} transfer`}
                description={`${data.origin.name} → ${data.destination.name}`}
              />
              <div className="border-t border-line">
                <LegList legs={current.legs} />
              </div>
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
