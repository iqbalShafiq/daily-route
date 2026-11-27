import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clock3,
  Map as MapIcon,
  MapPin,
  Navigation,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  M3Card,
  M3Chip,
  M3ConnectedButtonGroup,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3LoadingIndicator,
  M3ModeBadge,
} from "../../components/m3e/index.js";
import { api, type DepartureBoard } from "../../lib/api.js";
import { formatTime } from "../../lib/format.js";

type BoardChoice = "now" | "hour" | "today";

function jakartaDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function atOf(choice: BoardChoice): string | undefined {
  if (choice === "now") return undefined;
  if (choice === "hour") return new Date(Date.now() + 60 * 60_000).toISOString();
  // The operator calendar is a schedule, so "today" means the middle of the
  // service day rather than a predicted arrival.
  return `${jakartaDateKey()}T12:00:00+07:00`;
}

function platformTextOf(departure: DepartureBoard["lines"][number]): string | null {
  if (departure.platform) return `Peron ${departure.platform}`;
  return null;
}

export type StationDetailViewProps = {
  stationId: string;
  onBack: () => void;
  onOpenLine: (lineId: string) => void;
  onPlanFrom: (name: string) => void;
  onPlanTo: (name: string) => void;
  onShowOnMap: (station: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }) => void;
};

/**
 * Detail stasiun.
 *
 * The station, its serving lines and its departures are read from the API.
 * The departure list is a published schedule, never a live vehicle: the
 * note under it says so, and no row carries an invented countdown.
 */
export function StationDetailView({
  stationId,
  onBack,
  onOpenLine,
  onPlanFrom,
  onPlanTo,
  onShowOnMap,
}: StationDetailViewProps) {
  const [choice, setChoice] = useState<BoardChoice>("now");
  const at = useMemo(() => atOf(choice), [choice]);

  const station = useQuery({
    queryKey: ["station-detail", stationId],
    queryFn: ({ signal }) => api.station(stationId, signal),
    retry: false,
  });
  const departures = useQuery({
    queryKey: ["station-departures", stationId, at ?? "now"],
    queryFn: ({ signal }) => api.departures(stationId, at, signal),
    retry: false,
    refetchInterval: 60_000,
  });

  const data = station.data;
  const rail = useMemo(
    () =>
      (data?.lines ?? []).some(
        (line) => line.mode === "rail" || line.mode === "metro" || line.mode === "tram",
      ),
    [data],
  );
  const noun = rail ? "Stasiun" : "Halte";
  const board = departures.data;
  const rows = board?.lines ?? [];

  return (
    <section aria-label={`Detail ${noun.toLowerCase()} ${data?.name ?? ""}`} className="m3-detail-panel">
      <div className="m3-detail-scroll">
        <div className="m3-detail-inner">
          <div className="flex items-center justify-between gap-2">
            <M3IconButton label="Kembali" onClick={onBack}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
            <span className="m3-status-pill m3-status-pill--lancar">{noun}</span>
          </div>

          {station.isError ? (
            <M3Card variant="error-container" radius="xl" className="grid gap-3">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5 shrink-0" />
                {noun} tidak bisa dibaca
              </p>
              <p className="m3-bm">Jaringan tidak menjawab. Coba lagi sebentar.</p>
              <button
                type="button"
                onClick={() => void station.refetch()}
                className="m3-btn m3-btn--s m3-btn--filled justify-self-start"
              >
                <RotateCcw aria-hidden className="size-4" />
                Coba lagi
              </button>
            </M3Card>
          ) : station.isLoading || !data ? (
            <div className="grid justify-items-center gap-3 py-12">
              <M3LoadingIndicator variant="contained" label={`Membaca ${noun.toLowerCase()}`} />
              <p className="m3-bs text-m3-on-surface-variant">Membaca {noun.toLowerCase()}...</p>
            </div>
          ) : (
            <>
              <header className="grid gap-1">
                <h1 className="m3-hm m3-em text-m3-on-surface">{data.name}</h1>
                <p className="m3-bm text-m3-on-surface-variant">
                  {noun}
                  {data.area ? ` · ${data.area}` : ""}
                  {data.code ? ` · ${data.code}` : ""}
                </p>
                {data.description ? (
                  <p className="m3-bs text-m3-on-surface-variant">{data.description}</p>
                ) : null}
              </header>

              {data.lines.length > 0 ? (
                <div className="flex flex-wrap gap-2" aria-label="Jalur yang melayani">
                  {data.lines.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => onOpenLine(line.id)}
                      className="min-h-11 cursor-pointer rounded-m3-full bg-m3-surface-low px-2 transition-colors hover:bg-m3-surface-high"
                      aria-label={`Buka jalur ${line.code} ${line.name}`}
                    >
                      <span className="flex items-center gap-2">
                        <M3ModeBadge
                          systemId={line.id.split(":")[0] ?? null}
                          serviceClass={line.serviceClass}
                          lineCode={line.code}
                          label={line.code}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2" role="group" aria-label="Aksi cepat">
                <M3Chip
                  variant="suggestion"
                  icon={<MapPin aria-hidden />}
                  onClick={() => onPlanFrom(data.name)}
                >
                  Dari sini
                </M3Chip>
                <M3Chip
                  variant="suggestion"
                  icon={<Navigation aria-hidden />}
                  onClick={() => onPlanTo(data.name)}
                >
                  Ke sini
                </M3Chip>
                <M3Chip
                  variant="suggestion"
                  icon={<MapIcon aria-hidden />}
                  onClick={() =>
                    onShowOnMap({
                      id: data.id,
                      name: data.name,
                      latitude: data.latitude,
                      longitude: data.longitude,
                    })
                  }
                >
                  Lihat di peta
                </M3Chip>
              </div>

              <div
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
                aria-label="Ringkasan tempat"
              >
                <M3Card
                  variant="primary-container"
                  radius="xl"
                  className="grid w-[240px] shrink-0 snap-start content-start gap-2 p-4"
                >
                  <p className="m3-lm uppercase">Jalur</p>
                  <p className="m3-hs m3-em m3-num">{data.lines.length}</p>
                  <p className="m3-bs">jalur melayani {noun.toLowerCase()} ini</p>
                  <div className="flex flex-wrap gap-1">
                    {data.lines.slice(0, 4).map((line) => (
                      <span
                        key={line.id}
                        className="rounded-m3-sm bg-m3-surface-lowest/40 px-2 py-0.5 font-mono text-[12px] leading-[1.45]"
                      >
                        {line.code}
                      </span>
                    ))}
                  </div>
                </M3Card>

                <M3Card
                  variant="filled"
                  radius="xl"
                  className="grid w-[240px] shrink-0 snap-start content-start gap-2 p-4"
                >
                  <p className="m3-lm uppercase text-m3-on-surface-variant">Transit</p>
                  {data.interchangeWith.length === 0 ? (
                    <>
                      <p className="m3-tm text-m3-on-surface">Tidak ada stasiun transit</p>
                      <p className="m3-bs text-m3-on-surface-variant">
                        Tidak ada stasiun lain dalam satu kelompok jalan kaki.
                      </p>
                    </>
                  ) : (
                    <ul className="grid gap-1">
                      {data.interchangeWith.slice(0, 4).map((entry) => (
                        <li key={entry.id} className="m3-bs flex items-center gap-1 truncate">
                          <ArrowRight aria-hidden className="size-3 shrink-0" />
                          <span className="truncate">{entry.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </M3Card>

                <M3Card
                  variant="filled"
                  radius="xl"
                  className="grid w-[240px] shrink-0 snap-start content-start gap-2 p-4"
                >
                  <p className="m3-lm uppercase text-m3-on-surface-variant">Lokasi</p>
                  <p className="m3-tm text-m3-on-surface">{data.area ?? noun}</p>
                  <p className="m3-bs m3-num text-m3-on-surface-variant">
                    {data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}
                  </p>
                  {data.aliases.length > 0 ? (
                    <p className="m3-bs text-m3-on-surface-variant">
                      Juga ditulis {data.aliases.slice(0, 2).join(" · ")}
                    </p>
                  ) : null}
                </M3Card>
              </div>

              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m3-tm text-m3-on-surface">Jadwal keberangkatan</h2>
                  {departures.isFetching ? (
                    <M3LoadingIndicator size="sm" label="Memperbarui jadwal" />
                  ) : null}
                </div>

                <M3ConnectedButtonGroup
                  ariaLabel="Waktu jadwal"
                  size="xs"
                  value={choice}
                  onChange={(value) => {
                    if (value === "now" || value === "hour" || value === "today") setChoice(value);
                  }}
                  options={[
                    { value: "now", label: "Sekarang" },
                    { value: "hour", label: "1 jam" },
                    { value: "today", label: "Hari ini" },
                  ]}
                />

                <p className="m3-bs text-m3-on-surface-variant">
                  Berdasarkan jadwal, bukan kedatangan live
                  {board ? ` · dihitung ${formatTime(board.at)} WIB` : ""}
                </p>

                {departures.isError ? (
                  <M3Card variant="error-container" radius="xl" className="grid gap-2">
                    <p className="m3-tm flex items-center gap-2">
                      <AlertCircle aria-hidden className="size-5 shrink-0" />
                      Jadwal tidak bisa dibaca
                    </p>
                    <p className="m3-bm">Coba lagi sebentar.</p>
                    <button
                      type="button"
                      onClick={() => void departures.refetch()}
                      className="m3-btn m3-btn--s m3-btn--filled justify-self-start"
                    >
                      <RotateCcw aria-hidden className="size-4" />
                      Coba lagi
                    </button>
                  </M3Card>
                ) : departures.isLoading ? (
                  <div className="grid justify-items-center gap-2 py-6">
                    <M3LoadingIndicator variant="contained" label="Membaca jadwal" />
                    <p className="m3-bs text-m3-on-surface-variant">Membaca jadwal...</p>
                  </div>
                ) : rows.length === 0 ? (
                  <M3Card variant="filled" radius="xl" className="grid gap-2">
                    <p className="m3-tm">Tidak ada layanan pada jam ini</p>
                    <p className="m3-bm">
                      Jadwal operator tidak mencatat layanan pada waktu yang dipilih. Coba
                      Sekarang atau Hari ini.
                    </p>
                  </M3Card>
                ) : (
                  <M3ExpressiveList ariaLabel="Jadwal keberangkatan">
                    {rows.map((row, index) => {
                      const platform = platformTextOf(row);
                      const headway =
                        row.headwayMinMinutes === null
                          ? null
                          : row.headwayMaxMinutes !== null &&
                              Math.round(row.headwayMaxMinutes) !== Math.round(row.headwayMinMinutes)
                            ? `${Math.round(row.headwayMinMinutes)}-${Math.round(row.headwayMaxMinutes)} mnt`
                            : `${Math.round(row.headwayMinMinutes)} mnt`;
                      return (
                        <M3ExpressiveListItem
                          key={`${row.lineId}-${row.direction}-${index}`}
                          leading={
                            <M3ModeBadge
                              size="icon"
                              systemId={row.lineId.split(":")[0] ?? null}
                              serviceClass={row.serviceClass}
                              lineCode={row.code}
                              label={row.code}
                            />
                          }
                          leadingShape="cookie4"
                          title={`${row.code} · ${row.headsign ?? row.name}`}
                          subtitle={
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                              <span>{row.serviceLabel}</span>
                              {platform ? <span>{platform}</span> : null}
                              {headway ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock3 aria-hidden className="size-3" />~{headway}
                                </span>
                              ) : null}
                            </span>
                          }
                          trailing={<span className="m3-bs m3-num">Jadwal</span>}
                        />
                      );
                    })}
                  </M3ExpressiveList>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
