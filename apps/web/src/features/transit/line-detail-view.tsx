import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellRing,
  CalendarClock,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import {
  M3Card,
  M3ConnectedButtonGroup,
  M3ExtendedFab,
  M3IconButton,
  M3LoadingIndicator,
  M3ModeBadge,
  M3Shape,
} from "../../components/m3e/index.js";
import type { DisruptionSummary, LineDetail } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { SERVICE_CLASS_LABEL, transitModeTokenOf, type ServiceClass } from "../../lib/format.js";

export type LineDetailViewProps = {
  line: LineDetail | null;
  loading: boolean;
  error: boolean;
  notices: readonly DisruptionSummary[];
  followed: boolean;
  onToggleFollow: () => void;
  onBack: () => void;
  onOpenNotice: (noticeId: string) => void;
  onOpenStation: (stationId: string) => void;
  onRetry: () => void;
};

function lineNoticesOf(
  line: LineDetail | null,
  notices: readonly DisruptionSummary[],
): DisruptionSummary[] {
  if (!line) return [];
  return notices.filter(
    (notice) =>
      notice.activeNow &&
      !notice.id.startsWith("contoh:") &&
      (notice.affectedLineIds.includes(line.id) ||
        notice.lineId === line.id ||
        notice.lines.some((entry) => entry.id === line.id)),
  );
}

/**
 * Detail jalur.
 *
 * The stop order, the platform and the notice are the graph's. The screen
 * draws the line's own direction and opens the station board for a stop;
 * it never fills a missing stop or a live vehicle position.
 */
export function LineDetailView({
  line,
  loading,
  error,
  notices,
  followed,
  onToggleFollow,
  onBack,
  onOpenNotice,
  onOpenStation,
  onRetry,
}: LineDetailViewProps) {
  const [directionChoice, setDirectionChoice] = useState<"forward" | "backward">("forward");

  const direction = useMemo(() => {
    if (!line) return directionChoice;
    return line.directions.some((entry) => entry.direction === directionChoice)
      ? directionChoice
      : (line.directions[0]?.direction ?? directionChoice);
  }, [line, directionChoice]);

  const current = useMemo(() => {
    if (!line) return null;
    return (
      line.directions.find((entry) => entry.direction === direction) ??
      line.directions[0] ??
      null
    );
  }, [line, direction]);

  // The graph can carry a station twice at the same platform when two
  // relations of one direction overlap. A diagram draws one stop; the
  // duplicate is the same place, so it is not shown twice.
  const stops = useMemo(() => {
    if (!current) return [];
    return current.stops.filter((stop, index, all) => {
      const previous = all[index - 1];
      return !previous || previous.id !== stop.id || previous.platform !== stop.platform;
    });
  }, [current]);

  const token = useMemo(
    () =>
      transitModeTokenOf({
        systemId: line?.systemId,
        serviceClass: line?.serviceClass,
        mode: line?.mode,
        lineCode: line?.code,
      }),
    [line],
  );

  const activeNotices = useMemo(() => lineNoticesOf(line, notices), [line, notices]);

  const incidentStops = useMemo(() => {
    const ids = new Set<string>();
    for (const notice of activeNotices) {
      for (const station of notice.stations) ids.add(station.id);
      for (const id of notice.affectedStationIds) ids.add(id);
      if (notice.stationId) ids.add(notice.stationId);
    }
    return ids;
  }, [activeNotices]);

  const scheduleStop = useMemo(() => {
    if (!current) return null;
    return stops.find((stop) => stop.isInterchange) ?? stops[0] ?? null;
  }, [current, stops]);

  const railStyle = { "--rail-color": token.colorVar } as CSSProperties;
  const heroStyle = {
    backgroundColor: `color-mix(in oklab, ${token.colorVar} 16%, var(--srf))`,
  };

  if (error) {
    return (
      <section aria-label="Detail jalur" className="m3-detail-panel">
        <div className="m3-detail-scroll">
          <div className="m3-detail-inner">
            <M3IconButton label="Kembali" onClick={onBack}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
            <M3Card variant="error-container" radius="xl" className="grid gap-3">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5 shrink-0" />
                Jalur tidak bisa dibaca
              </p>
              <p className="m3-bm">Jaringan tidak menjawab. Coba lagi sebentar.</p>
              <button
                type="button"
                onClick={onRetry}
                className="m3-btn m3-btn--s m3-btn--filled justify-self-start"
              >
                <RotateCcw aria-hidden className="size-4" />
                Coba lagi
              </button>
            </M3Card>
          </div>
        </div>
      </section>
    );
  }

  if (loading || !line || !current) {
    return (
      <section aria-label="Detail jalur" className="m3-detail-panel">
        <div className="m3-detail-scroll">
          <div className="m3-detail-inner">
            <M3IconButton label="Kembali" onClick={onBack}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
            <div className="grid justify-items-center gap-3 py-12">
              <M3LoadingIndicator variant="contained" label="Membaca jalur" />
              <p className="m3-bs text-m3-on-surface-variant">Membaca urutan halte...</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={`Detail jalur ${line.code}`} className="m3-detail-panel">
      <div className="m3-detail-scroll">
        <header className="m3-line-hero" style={heroStyle}>
          <M3Shape
            shape="burst"
            size={196}
            className="m3-line-hero__shape m3-spin-slow opacity-10"
            style={{ backgroundColor: token.colorVar }}
          />
          <div className="relative grid gap-4">
            <div className="flex items-center justify-between gap-2">
              <M3IconButton label="Kembali" variant="tonal" onClick={onBack}>
                <ArrowLeft aria-hidden />
              </M3IconButton>
              <M3IconButton
                label={followed ? `Berhenti mengikuti jalur ${line.code}` : `Ikuti jalur ${line.code}`}
                variant="tonal"
                selected={followed}
                toggleable
                onClick={onToggleFollow}
              >
                {followed ? <BellRing aria-hidden /> : <Bell aria-hidden />}
              </M3IconButton>
            </div>

            <div className="grid gap-1">
              <p className="m3-lm uppercase text-m3-on-surface-variant">{line.operator}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <M3ModeBadge
                  systemId={line.systemId}
                  serviceClass={line.serviceClass}
                  lineCode={line.code}
                  label={line.code}
                />
                <h1 className="m3-hm m3-em min-w-0 text-m3-on-surface">{line.name}</h1>
              </div>
              <p className="m3-bs text-m3-on-surface-variant">
                {SERVICE_CLASS_LABEL[line.serviceClass as ServiceClass] ?? line.serviceClass}
                {line.lengthKm === null ? "" : ` · ${line.lengthKm.toFixed(1)} km`}
                {` · ${stops.length} ${token.id === "brt" || token.id === "nonbrt" || token.id === "mikro" ? "halte" : "stasiun"}`}
              </p>
            </div>

            {activeNotices[0] ? (
              <button
                type="button"
                onClick={() => {
                  const notice = activeNotices[0];
                  if (notice) onOpenNotice(notice.id);
                }}
                className={cn(
                  "m3-status-pill m3-status-pill--terganggu justify-self-start",
                  "min-h-11 max-w-full cursor-pointer px-3",
                )}
              >
                <AlertCircle aria-hidden className="size-4" />
                <span className="min-w-0 truncate">{activeNotices[0].title}</span>
                <ChevronRight aria-hidden className="size-4 shrink-0" />
              </button>
            ) : (
              <span className="m3-status-pill m3-status-pill--lancar justify-self-start">
                Lancar · tidak ada gangguan aktif
              </span>
            )}
          </div>
        </header>

        <div className="m3-detail-inner m3-detail-inner--fab">
          {line.directions.length > 1 ? (
            <M3ConnectedButtonGroup
              ariaLabel="Pilih arah jalur"
              size="s"
              className="line-direction-group"
              value={direction}
              onChange={(value) => {
                if (value === "forward" || value === "backward") setDirectionChoice(value);
              }}
              options={line.directions.map((entry) => ({
                value: entry.direction,
                label: `Arah ${entry.headsign ?? entry.label}`,
              }))}
            />
          ) : (
            <p className="m3-bs text-m3-on-surface-variant">Satu arah · {current.label}</p>
          )}

          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="m3-tm text-m3-on-surface">{current.label}</h2>
            <p className="m3-bs m3-num text-m3-on-surface-variant">
              {stops.length} perhentian
            </p>
          </div>

          <ol className="m3-stop-rail" style={railStyle} aria-label={`Perhentian ${line.code}`}>
            {stops.map((stop, index) => {
              const incident = incidentStops.has(stop.id);
              const first = index === 0;
              const last = index === stops.length - 1;
              return (
                <li key={`${stop.id}-${index}`}>
                  <button
                    type="button"
                    className="m3-stop-rail__item"
                    onClick={() => onOpenStation(stop.id)}
                  >
                    <span className="m3-stop-rail__rail">
                      <span className="m3-stop-rail__line" aria-hidden="true" />
                      <span
                        className={cn(
                          "m3-stop-rail__dot",
                          stop.isInterchange && "m3-stop-rail__dot--interchange",
                          incident && "m3-stop-rail__dot--incident",
                        )}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="m3-stop-rail__body">
                      <span className="m3-tm min-w-0 truncate text-m3-on-surface">{stop.name}</span>
                      <span className="m3-bs flex min-w-0 flex-wrap items-center gap-2 text-m3-on-surface-variant">
                        {stop.code ? <span className="font-mono">{stop.code}</span> : null}
                        {stop.area ? <span className="truncate">{stop.area}</span> : null}
                        {stop.platform ? <span>Peron {stop.platform}</span> : null}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {first ? (
                          <span className="m3-status-pill m3-status-pill--lancar">Awal</span>
                        ) : null}
                        {last ? (
                          <span className="m3-status-pill m3-status-pill--lancar">Akhir</span>
                        ) : null}
                        {stop.isInterchange ? (
                          <span className="m3-status-pill m3-status-pill--tersendat">Transit</span>
                        ) : null}
                        {incident ? (
                          <span className="m3-status-pill m3-status-pill--terganggu">Gangguan</span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="mt-3 size-4 text-m3-on-surface-variant" />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {scheduleStop ? (
        <M3ExtendedFab
          label={`Jadwal ${scheduleStop.name}`}
          icon={<CalendarClock aria-hidden />}
          className="m3-fab-schedule absolute bottom-4 right-4"
          onClick={() => onOpenStation(scheduleStop.id)}
        />
      ) : null}
    </section>
  );
}
