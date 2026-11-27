import {
  AlertCircle,
  Bell,
  ChevronDown,
  ChevronRight,
  Layers,
  RotateCcw,
  Search,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  M3Card,
  M3Chip,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3LoadingIndicator,
  M3ModeBadge,
} from "../../components/m3e/index.js";
import { NETWORK_SYSTEMS } from "../../components/map/operator-mark.js";
import type { DisruptionSummary, LineSummary } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { SERVICE_CLASS_LABEL, type ServiceClass } from "../../lib/format.js";

import {
  LINE_STATUS_LABEL,
  classifyLineStatuses,
  lineFilterGroupOf,
  type LineStatus,
} from "./followed-lines.js";

type LineFilter = "all" | "followed" | "krl" | "rail" | "brt" | "mikro";

const FILTERS: { value: LineFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "followed", label: "Diikuti" },
  { value: "krl", label: "KRL" },
  { value: "rail", label: "MRT & LRT" },
  { value: "brt", label: "TransJakarta" },
  { value: "mikro", label: "Mikrotrans" },
];

const PAGE_SIZE = 40;

function serviceLabelOf(line: LineSummary): string {
  return SERVICE_CLASS_LABEL[line.serviceClass as ServiceClass] ?? line.serviceClass;
}

function statusOf(
  byLine: Record<string, { status: LineStatus; notices: DisruptionSummary[] }>,
  lineId: string,
): { status: LineStatus; notices: DisruptionSummary[] } {
  return byLine[lineId] ?? { status: "lancar", notices: [] };
}

function StatusPill({ status }: { status: LineStatus }) {
  return (
    <span className={cn("m3-status-pill", `m3-status-pill--${status}`)}>
      {LINE_STATUS_LABEL[status]}
    </span>
  );
}

export type LineStatusViewProps = {
  lines: readonly LineSummary[];
  notices: readonly DisruptionSummary[];
  loading: boolean;
  error: boolean;
  followed: readonly string[];
  unreadCount: number;
  hiddenSystems: ReadonlySet<string>;
  onToggleSystem: (systemId: string) => void;
  onOpenLine: (lineId: string) => void;
  onOpenInbox: () => void;
  onRetry: () => void;
};

/**
 * Status jalur.
 *
 * The counts and the pills are derived from the stored notices that are in
 * force now. A line with no live notice is "Lancar"; the screen never makes
 * up a delay, a crowd or a vehicle position.
 */
export function LineStatusView({
  lines,
  notices,
  loading,
  error,
  followed,
  unreadCount,
  hiddenSystems,
  onToggleSystem,
  onOpenLine,
  onOpenInbox,
  onRetry,
}: LineStatusViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LineFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { byLine, counts } = useMemo(
    () => classifyLineStatuses(lines, notices),
    [lines, notices],
  );

  const followedLines = useMemo(
    () => followed.map((id) => lines.find((line) => line.id === id)).filter(Boolean),
    [followed, lines],
  );

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return lines.filter((line) => {
      if (needle.length > 0) {
        const haystack = `${line.code} ${line.name} ${line.operator} ${serviceLabelOf(line)}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filter === "followed") return followed.includes(line.id);
      if (filter === "all") return true;
      return lineFilterGroupOf(line) === filter;
    });
  }, [lines, query, filter, followed]);

  const withoutFollowed = useMemo(
    () =>
      followed.length > 0 && query.trim().length === 0 && filter === "all"
        ? searched.filter((line) => !followed.includes(line.id))
        : searched,
    [searched, followed, query, filter],
  );

  const shown = withoutFollowed.slice(0, limit);
  const running = counts.lancar + counts.tersendat + counts.terganggu;

  return (
    <section aria-label="Status jalur" className="m3-tab-panel">
      <header className="grid gap-4 px-4 pb-3 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="m3-hm m3-em text-m3-on-surface">Status jalur</h1>
            <p className="m3-bs mt-1 text-m3-on-surface-variant">
              {error
                ? "Jaringan tidak menjawab"
                : loading
                  ? "Membaca jaringan"
                  : `${running} jalur · ${notices.filter((notice) => notice.activeNow).length} gangguan aktif`}
            </p>
          </div>
          <span className="m3-inbox-button">
            <M3IconButton
              label={
                unreadCount > 0
                  ? `Kotak masuk, ${unreadCount} belum dibaca`
                  : "Kotak masuk"
              }
              variant="tonal"
              onClick={onOpenInbox}
            >
              <Bell aria-hidden />
            </M3IconButton>
            {unreadCount > 0 ? (
              <span className="m3-inbox-button__badge" aria-hidden="true">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </span>
        </div>

        <label className="m3-search-field">
          <Search aria-hidden className="size-5 shrink-0 text-m3-on-surface-variant" />
          <span className="sr-only">Cari jalur</span>
          <input
            type="search"
            value={query}
            placeholder="Cari kode atau nama jalur"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </label>

        <div className="m3-status-summary" aria-label="Ringkasan status jalur">
          <div className="m3-status-cell m3-status-cell--ok">
            <span className="m3-hs m3-em m3-num">{loading ? "·" : counts.lancar}</span>
            <span className="m3-bs">Lancar</span>
          </div>
          <div className="m3-status-cell m3-status-cell--warn">
            <span className="m3-hs m3-em m3-num">{loading ? "·" : counts.tersendat}</span>
            <span className="m3-bs">Tersendat</span>
          </div>
          <div className="m3-status-cell m3-status-cell--error">
            <span className="m3-hs m3-em m3-num">{loading ? "·" : counts.terganggu}</span>
            <span className="m3-bs">Terganggu</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Saring jalur">
          {FILTERS.map((entry) => (
            <M3Chip
              key={entry.value}
              selected={filter === entry.value}
              onClick={() => {
                setFilter(entry.value);
                setLimit(PAGE_SIZE);
              }}
            >
              {entry.label}
            </M3Chip>
          ))}
        </div>
      </header>

      <div className="m3-detail-scroll">
        <div className="grid gap-4 px-4 pb-6">
          <details className="group">
            <summary className="m3-tm flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-m3-lg px-2 text-m3-on-surface">
              <Layers aria-hidden className="size-5 text-m3-on-surface-variant" />
              <span className="flex-1">Lapisan peta</span>
              <ChevronDown
                aria-hidden
                className="size-4 text-m3-on-surface-variant transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {NETWORK_SYSTEMS.map((system) => {
                const visible = !hiddenSystems.has(system.id);
                return (
                  <M3Chip
                    key={system.id}
                    selected={visible}
                    leadingDotColor={system.color}
                    onClick={() => onToggleSystem(system.id)}
                  >
                    {system.label}
                  </M3Chip>
                );
              })}
            </div>
            <p className="m3-bs mt-2 px-2 text-m3-on-surface-variant">
              Lapisan mengubah garis yang tampak di peta. Tidak mengubah data jalur.
            </p>
          </details>

          {error ? (
            <M3Card variant="error-container" radius="xl" className="grid gap-3">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5 shrink-0" />
                Status jalur tidak bisa dibaca
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
          ) : loading && lines.length === 0 ? (
            <div className="grid justify-items-center gap-3 py-10">
              <M3LoadingIndicator variant="contained" label="Membaca jalur" />
              <p className="m3-bs text-m3-on-surface-variant">Membaca jalur dan gangguan...</p>
            </div>
          ) : (
            <>
              {followedLines.length > 0 && query.trim().length === 0 && filter === "all" ? (
                <section aria-label="Jalur yang kamu ikuti" className="grid min-w-0 gap-2">
                  <div className="flex items-center gap-2">
                    <Star aria-hidden className="size-4 text-m3-tertiary" />
                    <h2 className="m3-tm text-m3-on-surface">Jalur yang kamu ikuti</h2>
                  </div>
                  <M3ExpressiveList surface="low" ariaLabel="Jalur yang kamu ikuti">
                    {followedLines.map((line) => {
                      if (!line) return null;
                      const state = statusOf(byLine, line.id);
                      return (
                        <M3ExpressiveListItem
                          key={`followed-${line.id}`}
                          leading={
                            <M3ModeBadge
                              size="icon"
                              systemId={line.systemId}
                              serviceClass={line.serviceClass}
                              lineCode={line.code}
                              label={line.code}
                            />
                          }
                          leadingShape="cookie4"
                          leadingTone={state.status === "terganggu" ? "tertiary" : "primary"}
                          title={`${line.code} ${line.name}`}
                          subtitle={
                            state.notices[0]?.title ??
                            `${line.operator} · ${serviceLabelOf(line)}`
                          }
                          trailing={
                            <span className="flex items-center gap-2">
                              <StatusPill status={state.status} />
                              <ChevronRight aria-hidden className="size-4" />
                            </span>
                          }
                          onClick={() => onOpenLine(line.id)}
                        />
                      );
                    })}
                  </M3ExpressiveList>
                </section>
              ) : null}

              <section aria-label="Semua jalur" className="grid min-w-0 gap-2">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="m3-tm text-m3-on-surface">
                    {filter === "all" && query.trim().length === 0
                      ? "Semua jalur"
                      : "Hasil"}
                  </h2>
                  <p className="m3-bs m3-num text-m3-on-surface-variant" aria-live="polite">
                    {withoutFollowed.length} jalur
                  </p>
                </div>

                {withoutFollowed.length === 0 ? (
                  <M3Card variant="filled" radius="xl" className="grid gap-2">
                    <p className="m3-tm">
                      {filter === "followed" && followed.length === 0
                        ? "Belum ada jalur yang kamu ikuti"
                        : "Tidak ada jalur yang cocok"}
                    </p>
                    <p className="m3-bm">
                      {filter === "followed" && followed.length === 0
                        ? "Buka detail jalur lalu tekan lonceng untuk mengikutinya."
                        : "Coba kode yang lain, atau pilih Semua untuk melihat seluruh jaringan."}
                    </p>
                  </M3Card>
                ) : (
                  <>
                    <M3ExpressiveList ariaLabel="Daftar jalur">
                      {shown.map((line) => {
                        const state = statusOf(byLine, line.id);
                        return (
                          <M3ExpressiveListItem
                            key={line.id}
                            leading={
                              <M3ModeBadge
                                size="icon"
                                systemId={line.systemId}
                                serviceClass={line.serviceClass}
                                lineCode={line.code}
                                label={line.code}
                              />
                            }
                            leadingShape="circle"
                            leadingTone={state.status === "terganggu" ? "tertiary" : "secondary"}
                            title={`${line.code} ${line.name}`}
                            subtitle={
                              state.notices[0]?.title ??
                              `${line.operator} · ${serviceLabelOf(line)}`
                            }
                            trailing={
                              <span className="flex items-center gap-2">
                                <StatusPill status={state.status} />
                                <ChevronRight aria-hidden className="size-4" />
                              </span>
                            }
                            onClick={() => onOpenLine(line.id)}
                          />
                        );
                      })}
                    </M3ExpressiveList>
                    {withoutFollowed.length > shown.length ? (
                      <button
                        type="button"
                        onClick={() => setLimit((current) => current + PAGE_SIZE)}
                        className="m3-btn m3-btn--s m3-btn--tonal justify-self-center"
                      >
                        Tampilkan {withoutFollowed.length - shown.length} jalur lagi
                      </button>
                    ) : null}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
