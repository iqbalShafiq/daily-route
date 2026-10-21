import { MessageSquare, Route as RouteIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { RouteMap, type MapLeg, type MapMarker } from "../components/map/route-map.js";
import { legIdOf } from "../components/transit/leg-list.js";
import { ChatPanel } from "../features/chat/chat-panel.js";
import { RoutePlanner } from "../features/route-planner/route-planner.js";
import { usePlan } from "../features/route-planner/use-plan.js";
import { Tab, Tabs } from "../components/ui/tabs.js";
import { cn } from "../lib/cn.js";
import { MODE_WIDTH, SERVICE_CLASS_COLOR, type ServiceClass } from "../lib/format.js";
import { useTheme } from "../lib/theme.js";

/**
 * The planner page.
 *
 * On a phone the map sits above the controls and the two views — planner
 * and assistant — are tabs. From a laptop upwards the map takes the right
 * half of the window and the controls stay in a column on the left.
 */
export function PlannerPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [submitted, setSubmitted] = useState<{ origin: string; destination: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState("route");
  const { theme } = useTheme();

  const plan = usePlan(
    submitted?.origin ?? "",
    submitted?.destination ?? "",
    submitted !== null,
  );

  /**
   * The leg of the journey the reader is pointing at.
   *
   * The list and the map are one system: pointing at a leg in the list
   * keeps that leg bright on the map, and pointing at a leg on the map
   * lights it up in the list.
   */
  const [activeLeg, setActiveLeg] = useState<string | null>(null);

  const { legs: mapLegs, markers } = useMemo(() => {
    const data = plan.data;
    if (!data) return { legs: [] as MapLeg[], markers: [] as MapMarker[] };

    const primary = data.itineraries[activeIndex] ?? data.itineraries[0];

    // Every leg is drawn in the colour of its own mode, so a journey that
    // changes mode is readable on the map without a legend.
    const legs: MapLeg[] = [];
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.geometry.length < 2) continue;
      legs.push({
        id: legIdOf(leg, index),
        highlighted: activeLeg === legIdOf(leg, index),
        coordinates: leg.geometry,
        color:
          leg.kind === "walk"
            ? "var(--ink-3)"
            : (SERVICE_CLASS_COLOR[leg.serviceClass as ServiceClass] ?? "var(--accent)"),
        width: leg.kind === "walk" ? 3 : (MODE_WIDTH[leg.mode] ?? 4),
        kind: leg.kind,
        label: leg.kind === "walk" ? "Jalan kaki" : (leg.lineName ?? leg.lineCode ?? ""),
        order: index + 1,
      });
    }

    const markers: MapMarker[] = [
      {
        id: "origin",
        latitude: data.origin.latitude,
        longitude: data.origin.longitude,
        label: data.origin.name,
        detail: "Titik asal",
        kind: "origin",
        order: 1,
      },
    ];

    // The points where the rider changes vehicle. They are marked first,
    // because they sit on a stop of the line before and after it.
    const transfers: MapMarker[] = [];
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.kind !== "walk") continue;
      const first = leg.stops[0];
      const last = leg.stops[leg.stops.length - 1];
      if (!first || !last) continue;
      const isTransfer = leg.walkReason === "transfer";
      transfers.push({
        id: `transfer-${index}`,
        latitude: (first.latitude + last.latitude) / 2,
        longitude: (first.longitude + last.longitude) / 2,
        label: first.name === last.name ? first.name : `${first.name} → ${last.name}`,
        detail: isTransfer
          ? `Pindah ke ${leg.nextLineName ?? "kendaraan lain"}`
          : leg.walkReason === "access"
            ? "Berjalan kaki ke halte pertama"
            : "Berjalan kaki dari halte terakhir",
        kind: isTransfer ? "transfer" : "stop",
        order: index + 1,
      });
    }

    // The stops of every ride, except the ones a transfer already marks.
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.kind !== "ride") continue;
      for (const stop of leg.stops) {
        const alreadyMarked = transfers.some(
          (transfer) =>
            Math.abs(transfer.latitude - stop.latitude) < 0.0003 &&
            Math.abs(transfer.longitude - stop.longitude) < 0.0003,
        );
        if (alreadyMarked) continue;
        markers.push({
          id: `${stop.stationId}-${index}`,
          latitude: stop.latitude,
          longitude: stop.longitude,
          label: stop.name,
          detail: leg.lineName ?? undefined,
          kind: "stop",
        });
      }
    }

    markers.push(...transfers);

    if (primary) {
      const lastLeg = primary.legs[primary.legs.length - 1];
      const lastStop = lastLeg?.stops[lastLeg.stops.length - 1];
      if (lastStop) {
        markers.push({
          id: "destination",
          latitude: lastStop.latitude,
          longitude: lastStop.longitude,
          label: lastStop.name,
          detail: "Titik tujuan",
          kind: "destination",
          order: primary.legs.length + 1,
        });
      }
    }

    return { legs, markers };
  }, [plan.data, activeIndex, activeLeg]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-cols-1 grid-rows-[42vh_minmax(0,1fr)]",
        "lg:grid-cols-[minmax(380px,440px)_1fr] lg:grid-rows-1",
      )}
    >
      <div className="order-2 flex min-h-0 flex-col border-line lg:order-1 lg:border-r">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Tabs value={view} onValueChange={setView}>
            <Tab value="route">
              <RouteIcon aria-hidden className="size-3.5" />
              Rute
            </Tab>
            <Tab value="chat">
              <MessageSquare aria-hidden className="size-3.5" />
              Tanya
            </Tab>
          </Tabs>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {view === "route" ? (
            <RoutePlanner
              origin={origin}
              destination={destination}
              onOriginChange={setOrigin}
              onDestinationChange={setDestination}
              onSubmit={() => {
                setActiveIndex(0);
                setSubmitted({ origin: origin.trim(), destination: destination.trim() });
              }}
              plan={plan}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              activeLeg={activeLeg}
              onLegHover={setActiveLeg}
              onLegSelect={setActiveLeg}
            />
          ) : (
            <ChatPanel />
          )}
        </div>
      </div>

      <div className="relative order-1 min-h-0 border-b border-line lg:order-2 lg:border-b-0">
        <RouteMap
          legs={mapLegs}
          markers={markers}
          theme={theme}
          onMarkerClick={(marker) => {
            // A point on the map points at a leg of the journey.
            const primary = plan.data?.itineraries[activeIndex] ?? plan.data?.itineraries[0];
            const index = (primary?.legs ?? []).findIndex((leg) =>
              leg.stops.some(
                (stop) =>
                  Math.abs(stop.latitude - marker.latitude) < 0.0004 &&
                  Math.abs(stop.longitude - marker.longitude) < 0.0004,
              ),
            );
            if (index >= 0 && primary?.legs[index]) {
              setActiveLeg(legIdOf(primary.legs[index] as never, index));
            }
          }}
        />
        <MapLegend legs={mapLegs} />
      </div>
    </div>
  );
}

/**
 * The legend of the map.
 *
 * It lists the vehicles the journey uses, in the colour they are drawn in,
 * so the rider can read the map without guessing what a colour means.
 */
function MapLegend({ legs }: { legs: readonly MapLeg[] }) {
  const entries = useMemo(() => {
    const seen = new Map<string, { color: string; label: string }>();
    for (const leg of legs) {
      if (leg.kind !== "ride" || seen.has(leg.color)) continue;
      seen.set(leg.color, { color: leg.color, label: leg.label });
    }
    return [...seen.values()];
  }, [legs]);

  const hasTransfer = legs.some((leg) => leg.kind === "walk");

  if (entries.length === 0 && !hasTransfer) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface/85 px-4 py-2 text-[11px] text-ink-2 backdrop-blur">
      {entries.map((entry) => (
        <span key={entry.color} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-[3px] w-5 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="truncate">{entry.label}</span>
        </span>
      ))}
      {hasTransfer ? (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full border-2"
            style={{ borderColor: "var(--warn)" }}
          />
          <span className="truncate">Pindah kendaraan</span>
        </span>
      ) : null}
    </div>
  );
}

