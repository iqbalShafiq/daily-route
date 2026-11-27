import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  MapPin,
  MessageSquare,
  Route as RouteIcon,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useMemo } from "react";

import {
  M3Button,
  M3Card,
  M3IconButton,
  M3LoadingIndicator,
  M3Shape,
  M3StandardButtonGroup,
} from "../../components/m3e/index.js";
import {
  api,
  type DisruptionSummary,
  type Itinerary,
  type PersonalAlert,
} from "../../lib/api.js";
import { formatDuration, formatRupiah } from "../../lib/format.js";
import { planChoices } from "../../lib/route-choice.js";
import type { ChosenPlace } from "../route-planner/place-memory.js";
import type { RoutineRecord } from "../route-planner/live-trip.js";

export type AlternativeJourney = {
  originName: string;
  destinationName: string;
  origin: ChosenPlace | null;
  destination: ChosenPlace | null;
};

export type AlternativeRouteViewProps = {
  notice: DisruptionSummary | null;
  journey: AlternativeJourney | null;
  personalAlerts: readonly PersonalAlert[];
  routines: readonly RoutineRecord[];
  onBack: () => void;
  onUseRoute: (journey: AlternativeJourney, lineCodes: string[]) => void;
  onAsk: (question: string) => void;
  onShowOnMap: () => void;
};

function affectedIdsOf(notice: DisruptionSummary | null): {
  lines: Set<string>;
  stations: Set<string>;
} {
  const lines = new Set<string>();
  const stations = new Set<string>();
  if (!notice) return { lines, stations };
  if (notice.lineId) lines.add(notice.lineId);
  for (const id of notice.affectedLineIds) lines.add(id);
  for (const line of notice.lines) lines.add(line.id);
  if (notice.stationId) stations.add(notice.stationId);
  for (const id of notice.affectedStationIds) stations.add(id);
  for (const station of notice.stations) stations.add(station.id);
  return { lines, stations };
}

function avoidsNotice(
  route: Itinerary,
  lines: ReadonlySet<string>,
  stations: ReadonlySet<string>,
): boolean {
  for (const leg of route.legs) {
    if (leg.kind !== "ride") continue;
    if (leg.lineId && lines.has(leg.lineId)) return false;
    if (leg.stops.some((stop) => stations.has(stop.stationId))) return false;
  }
  return true;
}

function rideLineCodes(route: Itinerary): string[] {
  const codes: string[] = [];
  for (const leg of route.legs) {
    if (leg.kind !== "ride" || !leg.lineCode) continue;
    if (!codes.includes(leg.lineCode)) codes.push(leg.lineCode);
  }
  return codes;
}

function fareTextOf(route: Itinerary): string {
  return route.fare.totalIdr === null ? "Tarif tidak tercatat" : formatRupiah(route.fare.totalIdr);
}

/**
 * Rute alternatif.
 *
 * The screen asks the planner, not the model: it takes the endpoints the
 * rider already has, or the endpoints of the affected line, and plans them
 * against the graph. A candidate is suggested only when it does not ride the
 * affected corridor or stop. The reasons are read from the itinerary itself.
 */
export function AlternativeRouteView({
  notice,
  journey,
  personalAlerts,
  routines,
  onBack,
  onUseRoute,
  onAsk,
  onShowOnMap,
}: AlternativeRouteViewProps) {
  const alert = notice
    ? personalAlerts.find((entry) =>
        entry.notices.some((item) => item.id === notice.id),
      )
    : undefined;
  const routine = alert
    ? (routines.find(
        (entry) =>
          entry.originName === alert.habit.originName &&
          entry.destinationName === alert.habit.destinationName,
      ) ?? null)
    : null;

  const lineId = notice?.lines[0]?.id ?? notice?.affectedLineIds[0] ?? notice?.lineId ?? null;
  const lineDetail = useQuery({
    queryKey: ["line-detail", lineId ?? "none"],
    queryFn: ({ signal }) => {
      if (!lineId) throw new Error("No line");
      return api.line(lineId, signal);
    },
    enabled: lineId !== null && journey === null && !alert,
    retry: false,
  });

  const endpoints = useMemo<AlternativeJourney | null>(() => {
    if (journey) return journey;
    if (alert) {
      return {
        originName: alert.habit.originName,
        destinationName: alert.habit.destinationName,
        origin: routine?.origin ?? null,
        destination: routine?.destination ?? null,
      };
    }
    const detail = lineDetail.data;
    const direction = detail?.directions[0] ?? null;
    const first = direction?.stops[0];
    const last = direction?.stops[direction.stops.length - 1];
    if (!detail || !first || !last) return null;
    return {
      originName: first.name,
      destinationName: last.name,
      origin: null,
      destination: null,
    };
  }, [journey, alert, routine, lineDetail.data]);

  const plan = useQuery({
    queryKey: [
      "alternative-plan",
      endpoints?.originName ?? "",
      endpoints?.destinationName ?? "",
      endpoints?.origin?.id ?? "",
      endpoints?.destination?.id ?? "",
    ],
    queryFn: () =>
      api.plan({
        origin: endpoints?.originName ?? "",
        destination: endpoints?.destinationName ?? "",
        ...(endpoints?.origin?.kind === "place"
          ? {
              originLatitude: endpoints.origin.latitude,
              originLongitude: endpoints.origin.longitude,
            }
          : {}),
        ...(endpoints?.destination?.kind === "place"
          ? {
              destinationLatitude: endpoints.destination.latitude,
              destinationLongitude: endpoints.destination.longitude,
            }
          : {}),
      }),
    enabled:
      endpoints !== null &&
      endpoints.originName.trim().length > 1 &&
      endpoints.destinationName.trim().length > 1,
    retry: false,
    staleTime: 60_000,
  });

  const { lines: affectedLines, stations: affectedStations } = useMemo(
    () => affectedIdsOf(notice),
    [notice],
  );

  const options = useMemo(
    () => (plan.data ? planChoices(plan.data) : []),
    [plan.data],
  );
  const affected = options.find(
    (route) => !avoidsNotice(route, affectedLines, affectedStations),
  );
  const current = affected ?? options[0] ?? null;
  const open = options
    .filter((route) => avoidsNotice(route, affectedLines, affectedStations))
    .slice()
    .sort(
      (a, b) =>
        a.durationMinutes - b.durationMinutes ||
        a.transferCount - b.transferCount ||
        a.walkingKm - b.walkingKm,
    );
  const suggested = open[0] ?? null;

  const affectedCodes = useMemo(() => {
    if (!notice) return [];
    const codes = notice.lines
      .filter((line) => affectedLines.has(line.id))
      .map((line) => line.code);
    return codes.length > 0 ? codes : notice.lineCodes;
  }, [notice, affectedLines]);

  const reasons = useMemo(() => {
    if (!suggested) return [];
    const rows: string[] = [];
    const avoided = affectedCodes.length > 0 ? affectedCodes.join(" · ") : null;
    rows.push(
      avoided
        ? `Tidak melewati jalur ${avoided}.`
        : "Tidak melewati titik gangguan.",
    );

    if (
      current &&
      current.fare.totalIdr !== null &&
      suggested.fare.totalIdr !== null
    ) {
      const difference = current.fare.totalIdr - suggested.fare.totalIdr;
      if (difference > 0) {
        rows.push(
          `Tarif ${formatRupiah(suggested.fare.totalIdr)}, ${formatRupiah(difference)} lebih murah daripada rute biasa.`,
        );
      } else if (difference < 0) {
        rows.push(
          `Tarif ${formatRupiah(suggested.fare.totalIdr)}, ${formatRupiah(-difference)} lebih mahal daripada rute biasa.`,
        );
      } else {
        rows.push(`Tarif ${formatRupiah(suggested.fare.totalIdr)}, sama dengan rute biasa.`);
      }
    } else {
      rows.push(
        suggested.fare.totalIdr === null
          ? "Tarif tidak tercatat di jaringan."
          : `Tarif ${formatRupiah(suggested.fare.totalIdr)}.`,
      );
    }

    const transfer =
      suggested.transferCount === 0
        ? "Tanpa transit"
        : `${suggested.transferCount} kali transit`;
    const walk =
      suggested.walkingKm > 0
        ? `${suggested.walkingKm.toFixed(1)} km berjalan kaki`
        : "tanpa jalan kaki";
    rows.push(`${transfer} dan ${walk}.`);
    return rows;
  }, [suggested, current, affectedCodes]);

  const askQuestion = useMemo(() => {
    const title = notice?.title ?? "gangguan ini";
    return `Kenapa rute alternatif ini lebih baik daripada rute biasa untuk "${title}"?`;
  }, [notice]);

  return (
    <section aria-label="Rute alternatif" className="m3-detail-panel">
      <div className="m3-detail-scroll">
        <div className="m3-detail-inner">
          <div className="flex items-center justify-between gap-2">
            <M3IconButton label="Kembali" onClick={onBack}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
          </div>

          <header className="grid gap-1">
            <h1 className="m3-hm m3-em text-m3-on-surface">Rute alternatif</h1>
            <p className="m3-bm text-m3-on-surface-variant">
              {endpoints
                ? `${endpoints.originName} ke ${endpoints.destinationName}`
                : "Endpoint perjalanan belum diketahui"}
            </p>
            {notice ? (
              <p className="m3-bs text-m3-on-surface-variant">
                Dari gangguan {notice.title}
              </p>
            ) : null}
          </header>

          {!endpoints ? (
            lineDetail.isLoading ? (
              <div className="grid justify-items-center gap-3 py-10">
                <M3LoadingIndicator variant="contained" label="Membaca jalur" />
                <p className="m3-bs text-m3-on-surface-variant">Membaca ujung jalur...</p>
              </div>
            ) : (
              <M3Card variant="filled" radius="xl" className="grid gap-2">
                <p className="m3-tm">Endpoint perjalanan tidak tersedia</p>
                <p className="m3-bm">
                  Pilih perjalanan lebih dulu, atau buka detail jalur untuk melihat
                  ujungnya. Rute tidak dibuat tanpa dua tempat yang nyata.
                </p>
              </M3Card>
            )
          ) : plan.isError ? (
            <M3Card variant="error-container" radius="xl" className="grid gap-3">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5 shrink-0" />
                Rute alternatif tidak bisa dihitung
              </p>
              <p className="m3-bm">Planner tidak menjawab. Coba lagi sebentar.</p>
              <button
                type="button"
                onClick={() => void plan.refetch()}
                className="m3-btn m3-btn--s m3-btn--filled justify-self-start"
              >
                <RotateCcw aria-hidden className="size-4" />
                Coba lagi
              </button>
            </M3Card>
          ) : plan.isLoading || !plan.data ? (
            <div className="grid justify-items-center gap-3 py-10">
              <M3LoadingIndicator variant="contained" label="Menghitung rute alternatif" />
              <p className="m3-bs text-m3-on-surface-variant">
                Menghitung rute yang menghindari gangguan...
              </p>
            </div>
          ) : !suggested ? (
            <M3Card variant="error-container" radius="xl" className="grid gap-2">
              <p className="m3-tm">Tidak ada rute terbuka yang tersisa</p>
              <p className="m3-bm">
                Semua perjalanan yang dihitung melewati jalur atau halte yang terdampak.
                Buka Detail Gangguan untuk membaca sumbernya, atau tanyakan pilihan lain
                ke Tanya Daily.
              </p>
            </M3Card>
          ) : (
            <>
              <div className="m3-compare" aria-label="Perbandingan rute">
                <div className="m3-compare__cell">
                  <p className="m3-lm uppercase">Rute biasa</p>
                  <p className="m3-tl m3-em m3-num">
                    {current ? formatDuration(current.durationMinutes) : "Terhalang"}
                  </p>
                  <p className="m3-bs">
                    {current
                      ? rideLineCodes(current).join(" · ") || "Berjalan kaki"
                      : affectedCodes.join(" · ") || notice?.title}
                  </p>
                  <p className="m3-bs m3-num">{current ? fareTextOf(current) : "Gangguan aktif"}</p>
                </div>
                <div className="m3-compare__cell">
                  <p className="m3-lm uppercase">Saran</p>
                  <p className="m3-tl m3-em m3-num">{formatDuration(suggested.durationMinutes)}</p>
                  <p className="m3-bs">{rideLineCodes(suggested).join(" · ") || "Berjalan kaki"}</p>
                  <p className="m3-bs m3-num">{fareTextOf(suggested)}</p>
                </div>
              </div>

              <section aria-label="Kenapa rute ini" className="grid gap-3">
                <h2 className="m3-tm text-m3-on-surface">Kenapa rute ini?</h2>
                {reasons.map((reason, index) => (
                  <div key={reason} className="m3-reason">
                    <M3Shape
                      shape="cookie9"
                      size={32}
                      className="bg-m3-secondary-container text-m3-on-secondary-container"
                    >
                      <span className="m3-bs m3-num">{index + 1}</span>
                    </M3Shape>
                    <p className="m3-bm text-m3-on-surface-variant">{reason}</p>
                  </div>
                ))}
              </section>

              {suggested.legs.some((leg) => leg.detour) ? (
                <M3Card variant="tertiary-container" radius="xl" className="grid gap-2">
                  <p className="m3-tm flex items-center gap-2">
                    <TriangleAlert aria-hidden className="size-5" />
                    Rute ini memakai pengalihan
                  </p>
                  <p className="m3-bm">
                    Detail jalur menandai titik yang dilayani dan titik yang hanya dilewati.
                  </p>
                </M3Card>
              ) : null}

              <M3StandardButtonGroup
                ariaLabel="Aksi rute alternatif"
                className="w-full flex-wrap"
              >
                <M3Button
                  variant="filled"
                  icon={<RouteIcon aria-hidden />}
                  onClick={() => onUseRoute(endpoints, rideLineCodes(suggested))}
                >
                  Pakai rute ini
                </M3Button>
                <M3Button
                  variant="tonal"
                  icon={<MessageSquare aria-hidden />}
                  onClick={() => onAsk(askQuestion)}
                >
                  Tanya alasannya
                </M3Button>
                <M3Button
                  variant="outlined"
                  icon={<MapPin aria-hidden />}
                  onClick={onShowOnMap}
                >
                  Lihat di peta
                </M3Button>
              </M3StandardButtonGroup>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
