import { MessageSquare, Moon, Sun, X } from "lucide-react";
import { useMemo, useState } from "react";

import { RouteMap, type MapLeg, type MapMarker } from "../components/map/route-map.js";
import { legIdOf } from "../components/transit/leg-list.js";
import { ChatPanel } from "../features/chat/chat-panel.js";
import { RouteResult } from "../features/route-planner/route-result.js";
import { RouteSearch } from "../features/route-planner/route-search.js";
import { usePlan } from "../features/route-planner/use-plan.js";
import { api } from "../lib/api.js";
import type { PositionPlan } from "../lib/api.js";
import { Button } from "../components/ui/button.js";
import { cn } from "../lib/cn.js";
import { MODE_WIDTH, SERVICE_CLASS_COLOR, type ServiceClass } from "../lib/format.js";
import { useTheme } from "../lib/theme.js";
import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "../components/ui/tooltip.js";

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
  /**
   * The walk from the reader's place to the stop the journey starts
   * from. It is drawn on the map as the first part of the journey.
   */
  const [walk, setWalk] = useState<PositionPlan | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
    retry: false,
  });
  const agentReady = health.data?.agent === true;

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
  /** The stop the reader is pointing at in the list. */
  const [hoveredStation, setHoveredStation] = useState<string | null>(null);

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

    /*
     * The walk comes first: it is how the journey begins, and it is the
     * part the reader has to do on foot.
     */
    if (walk?.walk && walk.stationName) {
      legs.unshift({
        id: "walk-from-here",
        coordinates: walk.walk.geometry,
        color: "var(--ink-3)",
        width: 3,
        kind: "walk",
        label: `Berjalan ke ${walk.stationName}`,
        order: 0,
        dashed: true,
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
            ? "Berjalan kaki ke tempat naik pertama"
            : "Berjalan kaki dari tempat turun terakhir",
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
          stationId: stop.stationId,
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
  }, [plan.data, activeIndex, activeLeg, walk]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-1 overflow-hidden bg-bg">
      {/*
       * The map owns the window.
       *
       * The rider is looking at a city, and the controls float on top
       * of it. A bar across the top would take the map away from the
       * reader for the sake of a logo.
       */}
      <div className="col-start-1 row-start-1 min-h-0">
        <RouteMap
          legs={mapLegs}
          markers={markers}
          theme={theme}
          highlightedStationId={hoveredStation}
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

      {/*
       * The controls of the window.
       *
       * They sit in the top right corner, in the space the zoom control
       * used to have, and the zoom moved to the bottom right. The
       * assistant, the state of the model and the theme are one row:
       * three small things that belong to the window, not to a bar.
       */}
      <div className="pointer-events-none absolute top-[var(--bar-h)] right-3 mt-3 z-30 flex items-center gap-2 lg:top-3 lg:mt-0">
        <Tooltip label={view === "chat" ? "Tutup asisten" : "Tanya asisten"}>
          <Button
            variant="secondary"
            size="icon"
            aria-label={view === "chat" ? "Tutup asisten" : "Tanya asisten"}
            onClick={() => setView(view === "chat" ? "route" : "chat")}
            className="pointer-events-auto border-line bg-surface/90 shadow-raised backdrop-blur"
          >
            {view === "chat" ? (
              <X aria-hidden className="size-4" />
            ) : (
              <MessageSquare aria-hidden className="size-4" />
            )}
          </Button>
        </Tooltip>

        <Tooltip
          label={
            agentReady
              ? `Asisten aktif${health.data?.model ? `, model ${health.data.model}` : ""}`
              : "Asisten belum aktif: belum ada kunci model"
          }
        >
          <span
            aria-label={agentReady ? "Asisten aktif" : "Asisten belum aktif"}
            className="pointer-events-auto flex size-9 cursor-default items-center justify-center rounded-lg border border-line bg-surface/90 text-ink-3 shadow-raised backdrop-blur"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: agentReady ? "var(--accent)" : "var(--warn)" }}
            />
          </span>
        </Tooltip>

        <Tooltip label={theme === "dark" ? "Mode terang" : "Mode gelap"}>
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleTheme}
            aria-label="Ganti tema"
            className="pointer-events-auto border-line bg-surface/90 shadow-raised backdrop-blur"
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
          </Button>
        </Tooltip>
      </div>

      {/*
       * The controls float on the map.
       *
       * On a wide screen the search card sits in the top left corner and
       * the answer opens below it, so the map keeps the rest of the
       * window. On a phone the search card stays at the top and the
       * answer rises from the bottom as a sheet, the way every map on
       * a phone behaves.
       */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 col-start-1 row-start-1 z-20 flex flex-col justify-between p-0 pb-3",
          "lg:right-auto lg:w-[400px] lg:justify-start lg:gap-4 lg:p-4",
        )}
      >
        <div className="pointer-events-auto lg:shrink-0">
          <RouteSearch
            origin={origin}
            destination={destination}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onSubmit={() => {
              setActiveIndex(0);
              setSubmitted({ origin: origin.trim(), destination: destination.trim() });
            }}
            onUseMyPosition={async () => {
              if (typeof navigator === "undefined" || !navigator.geolocation) return;
              const position = await new Promise<GeolocationPosition | null>((resolve) => {
                navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
                  enableHighAccuracy: true,
                  timeout: 15_000,
                });
              });
              if (!position) return;
              const result = await api.planFromPosition(
                { latitude: position.coords.latitude, longitude: position.coords.longitude },
                destination.trim(),
              );
              setWalk(result);
              if (!result.stationName) return;
              setOrigin(result.stationName);
              setActiveIndex(0);
              setSubmitted({
                origin: result.stationName,
                destination: destination.trim(),
              });
            }}
            onChooseOrigin={(profileId) => {
              const profile = walk?.profiles.find((item) => item.id === profileId);
              if (!profile?.stationName) return;
              setOrigin(profile.stationName);
              setActiveIndex(0);
              setSubmitted({
                origin: profile.stationName,
                destination: destination.trim(),
              });
            }}
            walk={walk}
          />
        </div>

        {view === "route" ? (
          <div
            className={cn(
              "pointer-events-auto max-h-[40%] overflow-y-auto px-3 lg:min-h-0 lg:max-h-none lg:flex-1 lg:px-0",
            )}
          >
            <RouteResult
              plan={plan}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              activeLeg={activeLeg}
              onLegSelect={setActiveLeg}
              onStopHover={setHoveredStation}
              onExample={(name) => {
                setOrigin(name);
                setSubmitted({ origin: name, destination: destination.trim() });
              }}
              onRetry={() => {
                setSubmitted((current) =>
                  current ? { ...current } : null,
                );
              }}
            />
          </div>
        ) : null}

        {view === "chat" ? (
          <div className="pointer-events-auto absolute inset-x-3 bottom-3 top-[var(--bar-h)] mt-3 z-40 lg:left-auto lg:right-4 lg:top-16 lg:mt-0 lg:w-[400px]">
            <div className="relative h-full">
              <ChatPanel />
            </div>
          </div>
        ) : null}

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
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden max-w-[min(560px,calc(100%-24px))] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface/90 px-3 py-2 text-[12px] text-ink-2 shadow-pop backdrop-blur lg:flex">
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

