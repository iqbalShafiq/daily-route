import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  CheckCheck,
  ChevronRight,
  Clock3,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  M3Card,
  M3ConnectedButtonGroup,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3LoadingIndicator,
} from "../../components/m3e/index.js";
import type { DisruptionSummary, PersonalAlert } from "../../lib/api.js";
import { formatDateTime, formatTime } from "../../lib/format.js";
import type { RoutineRecord } from "../route-planner/live-trip.js";

import {
  buildInboxItems,
  filterInboxItems,
  groupInboxItems,
  markInboxRead,
  unreadInboxCount,
  type InboxFilter,
  type InboxItem,
} from "./inbox-items.js";

export type InboxViewProps = {
  notices: readonly DisruptionSummary[];
  personalAlerts: readonly PersonalAlert[];
  routines: readonly RoutineRecord[];
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  /** The rows the rider already read, owned by the page so the bell agrees. */
  readIds: readonly string[];
  onReadIdsChange: (ids: string[]) => void;
  onBack: () => void;
  onOpenNotice: (noticeId: string) => void;
  onOpenRoutine: (routineId: string) => void;
  onRefresh: () => void;
};

function timeOf(item: InboxItem): string {
  if (item.group === "Hari ini") return `${formatTime(item.at)} WIB`;
  return `${formatDateTime(item.at)} WIB`;
}

/**
 * Kotak masuk.
 *
 * The rows are stored notices and saved routines. A read mark is a local
 * memory: it changes the dot in this browser, not the notice in the monitor.
 */
export function InboxView({
  notices,
  personalAlerts,
  routines,
  loading,
  error,
  refreshing,
  readIds,
  onReadIdsChange,
  onBack,
  onOpenNotice,
  onOpenRoutine,
  onRefresh,
}: InboxViewProps) {
  const [filter, setFilter] = useState<InboxFilter>("all");

  const items = useMemo(
    () => buildInboxItems({ notices, personalAlerts, routines, readIds }),
    [notices, personalAlerts, routines, readIds],
  );
  const filtered = useMemo(() => filterInboxItems(items, filter), [items, filter]);
  const groups = useMemo(() => groupInboxItems(filtered), [filtered]);
  const unread = unreadInboxCount(items);

  const markAll = (): void => {
    onReadIdsChange(markInboxRead(items.map((item) => item.id)));
  };

  const open = (item: InboxItem): void => {
    onReadIdsChange(markInboxRead([item.id]));
    if (item.kind === "reminder" && item.routineId) {
      onOpenRoutine(item.routineId);
      return;
    }
    if (item.noticeId) {
      onOpenNotice(item.noticeId);
      return;
    }
    if (item.routineId) onOpenRoutine(item.routineId);
  };

  return (
    <section aria-label="Kotak masuk" className="m3-tab-panel">
      <header className="grid gap-3 px-4 pb-3 pt-4">
        <div className="flex items-start gap-2">
          <M3IconButton label="Kembali" onClick={onBack}>
            <ArrowLeft aria-hidden />
          </M3IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="m3-hm m3-em text-m3-on-surface">Kotak masuk</h1>
            <p className="m3-bs mt-1 text-m3-on-surface-variant">
              {unread > 0 ? `${unread} belum dibaca` : "Semua sudah dibaca"}
            </p>
          </div>
          <M3IconButton
            label="Muat ulang kotak masuk"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? (
              <M3LoadingIndicator size="sm" label="Memuat ulang" />
            ) : (
              <RefreshCw aria-hidden />
            )}
          </M3IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            className="m3-btn m3-btn--s m3-btn--tonal"
          >
            <CheckCheck aria-hidden className="size-4" />
            Tandai dibaca
          </button>
          <span className="m3-bs text-m3-on-surface-variant" aria-live="polite">
            {items.length} baris
          </span>
        </div>

        <M3ConnectedButtonGroup
          ariaLabel="Saring kotak masuk"
          size="xs"
          value={filter}
          onChange={(value) => {
            if (value === "all" || value === "disruption" || value === "reminder") {
              setFilter(value);
            }
          }}
          options={[
            { value: "all", label: "Semua" },
            { value: "disruption", label: "Gangguan" },
            { value: "reminder", label: "Pengingat" },
          ]}
        />
      </header>

      <div className="m3-detail-scroll">
        <div className="grid gap-4 px-4 pb-6">
          {error ? (
            <M3Card variant="error-container" radius="xl" className="grid gap-2">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5 shrink-0" />
                Kotak masuk tidak bisa dibaca
              </p>
              <p className="m3-bm">Gangguan tersimpan tidak menjawab. Coba muat ulang.</p>
            </M3Card>
          ) : loading && items.length === 0 ? (
            <div className="grid justify-items-center gap-3 py-10">
              <M3LoadingIndicator variant="contained" label="Membaca kotak masuk" />
              <p className="m3-bs text-m3-on-surface-variant">Membaca pemberitahuan...</p>
            </div>
          ) : filtered.length === 0 ? (
            <M3Card variant="filled" radius="xl" className="grid gap-2">
              <p className="m3-tm">
                {items.length === 0 ? "Kotak masuk kosong" : "Tidak ada baris pada saringan ini"}
              </p>
              <p className="m3-bm">
                {items.length === 0
                  ? "Belum ada gangguan aktif atau rutinitas tersimpan. Pemberitahuan baru muncul di sini setelah monitor menyimpannya."
                  : "Pilih Semua untuk melihat setiap baris."}
              </p>
            </M3Card>
          ) : (
            groups.map((group) => (
              <section key={group.group} aria-label={group.group} className="grid gap-2">
                <h2 className="m3-tm px-1 text-m3-on-surface">{group.group}</h2>
                <M3ExpressiveList ariaLabel={group.group}>
                  {group.items.map((item) => {
                    const disruption = item.kind === "disruption";
                    return (
                      <M3ExpressiveListItem
                        key={item.id}
                        leading={
                          disruption ? (
                            <TriangleAlert aria-hidden />
                          ) : item.noticeId ? (
                            <BellRing aria-hidden />
                          ) : (
                            <Clock3 aria-hidden />
                          )
                        }
                        leadingShape={disruption ? "softburst" : "clover4"}
                        leadingTone={disruption ? "tertiary" : "primary"}
                        title={item.title}
                        subtitle={item.subtitle}
                        trailing={
                          <span className="flex items-start gap-2">
                            {!item.read ? (
                              <span
                                className="m3-inbox-row__unread"
                                role="img"
                                aria-label="Belum dibaca"
                              />
                            ) : null}
                            <span className="grid gap-1 justify-items-end">
                              <span className="m3-bs m3-num whitespace-nowrap text-m3-on-surface-variant">
                                {timeOf(item)}
                              </span>
                              <ChevronRight aria-hidden className="size-4" />
                            </span>
                          </span>
                        }
                        onClick={() => open(item)}
                      />
                    );
                  })}
                </M3ExpressiveList>
              </section>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
