import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  MessageSquare,
  Pencil,
  RotateCcw,
  Route as RouteIcon,
  X,
} from "lucide-react";

import {
  M3Button,
  M3Card,
  M3ConnectedButtonGroup,
  M3IconButton,
  M3LoadingIndicator,
  M3ModeBadge,
  M3Shape,
} from "../../components/m3e/index.js";
import type { DisruptionSummary, Itinerary } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { formatDistance, formatRupiah } from "../../lib/format.js";
import { planChoices, routeIsBlocked } from "../../lib/route-choice.js";

import { ROUTE_SORT_LABELS, formatJakartaSpan, sortItineraries, type RouteSortMode } from "./route-sort.js";
import type { UsePlanResult } from "./use-plan.js";

function walkMinutesOf(route: Itinerary): number {
  return route.legs
    .filter((leg) => leg.kind === "walk")
    .reduce((total, leg) => total + leg.durationMinutes, 0);
}

function rideLegsOf(route: Itinerary) {
  const seen = new Set<string>();
  const rows: { key: string; systemId: string | null; serviceClass: string | null; lineCode: string | null }[] = [];
  for (const leg of route.legs) {
    if (leg.kind !== "ride") continue;
    const key = leg.lineId ?? `${leg.serviceClass}:${leg.lineCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      systemId: leg.lineId ? (leg.lineId.split(":")[0] ?? null) : null,
      serviceClass: leg.serviceClass,
      lineCode: leg.lineCode,
    });
  }
  return rows;
}

function blockingNoticeOf(
  route: Itinerary,
  notices: readonly DisruptionSummary[],
): DisruptionSummary | null {
  return (
    notices.find(
      (notice) => notice.blocksService && routeIsBlocked(route, [notice]),
    ) ?? null
  );
}

export type RouteChoicesViewProps = {
  plan: UsePlanResult;
  originName: string;
  destinationName: string;
  departureLabel: string;
  sortMode: RouteSortMode;
  onSortModeChange: (mode: RouteSortMode) => void;
  activeIndex: number | null;
  onOpenRoute: (index: number) => void;
  onEdit: () => void;
  onClose: () => void;
  onAsk: () => void;
  onRetry: () => void;
};

/**
 * Pilihan rute.
 *
 * The board lists the real itineraries the planner returned. The sort is a
 * view of the same list, never a second plan. The fastest open journey is
 * the best one; a journey a notice removes stays visible but is never
 * offered as the first choice.
 */
export function RouteChoicesView({
  plan,
  originName,
  destinationName,
  departureLabel,
  sortMode,
  onSortModeChange,
  activeIndex,
  onOpenRoute,
  onEdit,
  onClose,
  onAsk,
  onRetry,
}: RouteChoicesViewProps) {
  const data = plan.data;
  const routes = data ? planChoices(data) : [];
  const notices = data?.disruptions ?? [];
  const order = sortItineraries(routes, sortMode, notices);
  const bestIndex = order.find((index) => {
    const route = routes[index];
    return route ? !routeIsBlocked(route, notices) : false;
  });

  return (
    <section
      aria-label="Pilihan rute"
      className={cn(
        "fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 max-h-[76dvh] overflow-y-auto",
        "m3-choices-panel",
        "lg:inset-y-4 m3-stage-panel lg:right-auto lg:bottom-4 lg:max-h-none lg:w-[420px]",
      )}
    >
      <header className="grid gap-3 px-4 pb-3 pt-4">
        <div className="flex items-start gap-2">
          <M3IconButton label="Ubah pencarian" onClick={onEdit}>
            <Pencil aria-hidden />
          </M3IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="m3-hm m3-em truncate text-m3-on-surface">Pilihan rute</h1>
            <p className="m3-bm mt-1 flex min-w-0 items-center gap-1 text-m3-on-surface-variant">
              <span className="truncate">{originName}</span>
              <ArrowRight aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{destinationName}</span>
            </p>
            <p className="m3-bs mt-1 text-m3-on-surface-variant">{departureLabel}</p>
          </div>
          <M3IconButton label="Tutup pilihan rute" onClick={onClose}>
            <X aria-hidden />
          </M3IconButton>
        </div>

        <M3ConnectedButtonGroup
          size="xs"
          ariaLabel="Urutkan rute"
          value={sortMode}
          onChange={(value) => {
            if (value === "fastest" || value === "cheapest" || value === "fewest-transfers") {
              onSortModeChange(value);
            }
          }}
          options={(["fastest", "cheapest", "fewest-transfers"] as const).map((mode) => ({
            value: mode,
            label: ROUTE_SORT_LABELS[mode],
          }))}
        />
      </header>

      {plan.isFetching && !data ? (
        <div className="grid justify-items-center gap-3 px-4 py-12 text-center">
          <M3LoadingIndicator variant="contained" label="Menghitung rute terbaik" />
          <p className="m3-tm text-m3-on-surface">Menghitung rute terbaik...</p>
          <p className="m3-bs text-m3-on-surface-variant">
            Waktu, tarif, dan transit diambil dari jaringan.
          </p>
        </div>
      ) : plan.isError ? (
        <div className="px-4 pb-4">
          <M3Card variant="error-container" radius="xl" className="grid gap-3">
            <p className="m3-tm flex items-center gap-2">
              <AlertCircle aria-hidden className="size-5 shrink-0" />
              Rute tidak bisa dihitung
            </p>
            <p className="m3-bm">{reasonOf(plan.error)}</p>
            <M3Button variant="filled" icon={<RotateCcw aria-hidden />} onClick={onRetry}>
              Coba lagi
            </M3Button>
          </M3Card>
        </div>
      ) : !data || routes.length === 0 ? (
        <div className="px-4 pb-4">
          <M3Card variant="filled" radius="xl" className="grid gap-3">
            <div className="flex items-start gap-3">
              <M3Shape
                shape="softburst"
                size={44}
                className="bg-m3-primary-container text-m3-on-primary-container"
              >
                <RouteIcon aria-hidden className="size-5" />
              </M3Shape>
              <div className="grid gap-1">
                <p className="m3-tm text-m3-on-surface">
                  {data?.routeBlocked
                    ? "Tidak ada rute yang terbuka"
                    : "Tidak ada perjalanan yang terhubung"}
                </p>
                <p className="m3-bm text-m3-on-surface-variant">
                  {data?.routeBlocked
                    ? "Semua rute yang ditemukan melewati jalur atau halte yang sedang terganggu. Periksa papan jalur sebelum berangkat."
                    : "Coba tempat yang lebih besar, misalnya halte atau stasiun tempat beberapa jalur bertemu."}
                </p>
              </div>
            </div>
            <M3Button variant="tonal" icon={<MessageSquare aria-hidden />} onClick={onAsk}>
              Tanya Daily
            </M3Button>
          </M3Card>
        </div>
      ) : (
        <ol className="m3-route-list px-4 pb-4">
          {order.map((index, position) => {
            const route = routes[index];
            if (!route) return null;
            const blocked = routeIsBlocked(route, notices);
            const best = index === bestIndex;
            const blocking = blocked ? blockingNoticeOf(route, notices) : null;
            const chosen = activeIndex === index;
            const span = formatJakartaSpan(
              data?.quotedAt ?? data?.computedAt,
              route.durationMinutes,
            );
            const fare =
              route.fare.available && route.fare.totalIdr !== null
                ? formatRupiah(route.fare.totalIdr)
                : null;
            const walk = walkMinutesOf(route);
            const rides = rideLegsOf(route);

            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onOpenRoute(index)}
                  aria-current={chosen ? "true" : undefined}
                  className={cn(
                    "m3-route-card",
                    best && "m3-route-card--best",
                    blocked && "m3-route-card--blocked",
                  )}
                  style={{ animationDelay: `${40 + position * 45}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m3-bs text-m3-on-surface-variant">{span}</p>
                      <p className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="m3-hs m3-em m3-num text-m3-on-surface">
                          {route.durationMinutes}
                        </span>
                        <span className="m3-bs text-m3-on-surface-variant">mnt</span>
                        {best ? (
                          <span className="m3-chip m3-chip--suggestion bg-m3-ok-container text-m3-on-ok-container">
                            Terbaik untukmu
                          </span>
                        ) : null}
                        {blocked ? (
                          <span className="m3-chip m3-chip--suggestion bg-m3-error-container text-m3-on-error-container">
                            Terdampak gangguan
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <ChevronRight
                      aria-hidden
                      className="mt-1 size-5 shrink-0 text-m3-on-surface-variant"
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {rides.map((ride) => (
                      <M3ModeBadge
                        key={ride.key}
                        systemId={ride.systemId}
                        serviceClass={ride.serviceClass}
                        lineCode={ride.lineCode}
                      />
                    ))}
                    {walk > 0 ? <M3ModeBadge mode="walk" /> : null}
                  </div>

                  <p className="m3-bm mt-2 text-m3-on-surface-variant">
                    {fare ? `${fare} · ` : ""}
                    {route.transferCount === 0
                      ? "tanpa transit"
                      : `${route.transferCount} transit`}
                    {walk > 0
                      ? ` · jalan ${walk} mnt · ${formatDistance(route.walkingKm)}`
                      : ""}
                  </p>

                  {blocking ? (
                    <p className="m3-bs mt-2 line-clamp-2 text-m3-on-error-container">
                      {blocking.title}
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Server tidak menjawab. Coba lagi sebentar lagi.";
}
