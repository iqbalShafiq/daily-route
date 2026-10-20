import { MessageSquare, Route as RouteIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { RouteMap, type MapMarker, type MapRoute } from "../components/map/route-map.js";
import { ChatPanel } from "../features/chat/chat-panel.js";
import { RoutePlanner } from "../features/route-planner/route-planner.js";
import { usePlan } from "../features/route-planner/use-plan.js";
import { Tab, Tabs } from "../components/ui/tabs.js";
import { cn } from "../lib/cn.js";
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

  const { routes, markers } = useMemo(() => {
    const data = plan.data;
    if (!data) return { routes: [] as MapRoute[], markers: [] as MapMarker[] };

    const primary = data.itineraries[activeIndex] ?? data.itineraries[0];
    const alternative = data.alternatives[0];

    const mapRoutes: MapRoute[] = [];
    if (primary) {
      mapRoutes.push({ id: "primary", coordinates: primary.geometry, color: "var(--mode-bus)" });
    }
    if (alternative) {
      mapRoutes.push({
        id: "alternative",
        coordinates: alternative.geometry,
        color: "var(--warn)",
        dashed: true,
      });
    }

    const mapMarkers: MapMarker[] = [
      {
        id: "origin",
        latitude: data.origin.latitude,
        longitude: data.origin.longitude,
        label: data.origin.name,
        kind: "origin",
      },
      {
        id: "destination",
        latitude: data.destination.latitude,
        longitude: data.destination.longitude,
        label: data.destination.name,
        kind: "destination",
      },
    ];

    for (const leg of primary?.legs ?? []) {
      if (leg.kind !== "ride") continue;
      for (const stop of leg.stops) {
        mapMarkers.push({
          id: stop.stationId,
          latitude: stop.latitude,
          longitude: stop.longitude,
          label: stop.name,
          kind: "stop",
        });
      }
    }

    return { routes: mapRoutes, markers: mapMarkers };
  }, [plan.data, activeIndex]);

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
            />
          ) : (
            <ChatPanel />
          )}
        </div>
      </div>

      <div className="relative order-1 min-h-0 border-b border-line lg:order-2 lg:border-b-0">
        <RouteMap routes={routes} markers={markers} theme={theme} />
        <MapLegend />
      </div>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-xl border border-line bg-surface/90 px-2.5 py-2 text-[11px] text-ink-2 backdrop-blur">
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-1 w-4 rounded-full" style={{ backgroundColor: "var(--mode-bus)" }} />
        Rute utama
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: "var(--warn)" }}
        />
        Rute alternatif
      </span>
    </div>
  );
}

