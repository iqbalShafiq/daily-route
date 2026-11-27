import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  MapPin,
  MessageSquare,
  Route as RouteIcon,
  RotateCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  M3Card,
  M3Chip,
  M3IconButton,
  M3LoadingIndicator,
  M3ModeBadge,
  M3Shape,
  M3SplitButton,
} from "../../components/m3e/index.js";
import {
  getNoticeEvidence,
  type DisruptionSummary,
  type NoticeSource,
  type PersonalAlert,
} from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import {
  formatDateTime,
  formatTime,
} from "../../lib/format.js";
import type { RoutineRecord } from "../route-planner/live-trip.js";

const SOURCE_LABEL: Record<NoticeSource["type"], string> = {
  x: "X",
  news: "Berita",
  link: "Resmi",
};

const SEVERITY_TEXT: Record<string, string> = {
  info: "Info",
  warning: "Pantau",
  severe: "Serius",
  critical: "Kritis",
};

const KIND_TEXT: Record<string, string> = {
  diversion: "Pengalihan",
  closure: "Penutupan",
  delay: "Keterlambatan",
  "service-change": "Perubahan layanan",
  maintenance: "Perawatan",
  strike: "Aksi mogok",
  weather: "Cuaca",
  unknown: "Pemberitahuan",
};

function sourceTimeOf(source: NoticeSource): string | null {
  if (!source.publishedAt) return null;
  return `${formatTime(source.publishedAt)} WIB`;
}

function severityTone(severity: string): string {
  return severity === "severe" || severity === "critical"
    ? "m3-status-pill--terganggu"
    : "m3-status-pill--tersendat";
}

export type DisruptionDetailViewProps = {
  notice: DisruptionSummary | null;
  loading: boolean;
  error: boolean;
  personalAlerts: readonly PersonalAlert[];
  routines: readonly RoutineRecord[];
  onBack: () => void;
  onOpenAlternatives: () => void;
  onShowOnMap: () => void;
  onAsk: (question: string) => void;
  onRetry: () => void;
};

/**
 * Detail gangguan.
 *
 * The notice, its scope, its diversion and its stored sources are the
 * monitor's data. The verification card reports the freshness it stores and
 * never upgrades silence to "service restored".
 */
export function DisruptionDetailView({
  notice,
  loading,
  error,
  personalAlerts,
  routines,
  onBack,
  onOpenAlternatives,
  onShowOnMap,
  onAsk,
  onRetry,
}: DisruptionDetailViewProps) {
  const [feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(null);

  const evidence = useQuery({
    queryKey: ["notice-evidence", notice?.id ?? "none"],
    queryFn: () => {
      if (!notice) throw new Error("No notice");
      return getNoticeEvidence(notice.id);
    },
    enabled: notice !== null,
    retry: false,
    staleTime: 60_000,
  });

  const affectedAlerts = useMemo(() => {
    if (!notice) return [];
    return personalAlerts.filter((alert) =>
      alert.notices.some((entry) => entry.id === notice.id),
    );
  }, [notice, personalAlerts]);

  const routineNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const routine of routines) {
      names.set(`${routine.originName}>${routine.destinationName}`, routine.id);
    }
    return names;
  }, [routines]);

  if (error || (!loading && !notice)) {
    return (
      <section aria-label="Detail gangguan" className="m3-detail-panel">
        <div className="m3-detail-scroll">
          <div className="m3-detail-inner">
            <M3IconButton label="Kembali" onClick={onBack}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
            <M3Card variant="error-container" radius="xl" className="grid gap-3">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5 shrink-0" />
                Gangguan tidak bisa dibaca
              </p>
              <p className="m3-bm">
                {error
                  ? "Pemberitahuan tersimpan tidak menjawab. Coba lagi sebentar."
                  : "Pemberitahuan ini tidak ada lagi di kotak masuk."}
              </p>
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

  if (loading || !notice) {
    return (
      <section aria-label="Detail gangguan" className="m3-detail-panel">
        <div className="m3-detail-scroll">
          <div className="m3-detail-inner">
            <M3IconButton label="Kembali" onClick={onBack}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
            <div className="grid justify-items-center gap-3 py-12">
              <M3LoadingIndicator variant="contained" label="Membaca gangguan" />
              <p className="m3-bs text-m3-on-surface-variant">Membaca pemberitahuan...</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const scopes =
    notice.scope === "stop"
      ? notice.stations.map((station) => station.name)
      : notice.lines.map((line) => line.code);
  const sources = evidence.data?.sources ?? [];

  return (
    <section aria-label={`Detail gangguan ${notice.title}`} className="m3-detail-panel">
      <div className="m3-detail-scroll">
        <header className="m3-notice-hero relative overflow-hidden rounded-b-m3-2xl bg-m3-error-container px-4 pb-6 text-m3-on-error-container">
          <M3Shape
            shape="burst"
            size={220}
            className="m3-spin-slow absolute -right-16 -top-12 bg-m3-error opacity-20"
          />
          <div className="relative grid gap-4">
            <div className="flex items-center justify-between gap-2">
              <M3IconButton label="Kembali" variant="tonal" onClick={onBack}>
                <ArrowLeft aria-hidden />
              </M3IconButton>
              <span className={cn("m3-status-pill", severityTone(notice.severity))}>
                {SEVERITY_TEXT[notice.severity] ?? notice.severity}
              </span>
            </div>

            {notice.lines.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Jalur terdampak">
                {notice.lines.map((line) => (
                  <M3ModeBadge
                    key={line.id}
                    systemId={line.systemId}
                    lineCode={line.code}
                    label={line.code}
                  />
                ))}
              </div>
            ) : notice.lineCodes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {notice.lineCodes.map((code) => (
                  <span key={code} className="m3-status-pill m3-status-pill--tersendat">
                    {code}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="grid gap-1">
              <p className="m3-lm uppercase">
                {KIND_TEXT[notice.kind] ?? notice.kind}
                {scopes.length > 0 ? ` · ${scopes.slice(0, 3).join(" · ")}` : ""}
              </p>
              <h1 className="m3-hm m3-em">{notice.title}</h1>
              <p className="m3-bm">{notice.body}</p>
              <p className="m3-bs">
                {formatDateTime(notice.publishedAt)} WIB
                {notice.endsAt ? ` · berakhir ${formatDateTime(notice.endsAt)} WIB` : ""}
              </p>
            </div>
          </div>
        </header>

        <div className="m3-detail-inner">
          <M3Card variant="filled" radius="xl" className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m3-tm flex items-center gap-2">
                <ShieldCheck aria-hidden className="size-5 text-m3-primary" />
                Pemeriksaan dan sumber
              </h2>
              {evidence.isFetching ? (
                <M3LoadingIndicator size="sm" label="Membaca sumber" />
              ) : null}
            </div>

            {evidence.isError ? (
              <p className="m3-bm text-m3-on-surface-variant">
                Sumber tersimpan tidak bisa dibaca sekarang.
              </p>
            ) : evidence.isLoading ? (
              <p className="m3-bm text-m3-on-surface-variant">Membaca sumber tersimpan...</p>
            ) : sources.length === 0 ? (
              <p className="m3-bm text-m3-on-surface-variant">
                Belum ada sumber tersimpan untuk pemberitahuan ini.
              </p>
            ) : (
              <p className="m3-bm text-m3-on-surface-variant">
                {sources.length} sumber tersimpan
                {notice.lastVerifiedAt
                  ? ` · diperiksa ${formatDateTime(notice.lastVerifiedAt)} WIB`
                  : ""}
                {notice.reviewAt
                  ? ` · pemeriksaan berikut ${formatDateTime(notice.reviewAt)} WIB`
                  : ""}
                .
              </p>
            )}
            {!notice.lastVerifiedAt ? (
              <p className="m3-bs text-m3-on-surface-variant">
                Belum ada pembaruan baru
                {notice.reviewAt
                  ? `. Pemeriksaan berikut ${formatDateTime(notice.reviewAt)} WIB.`
                  : "."}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="m3-bs text-m3-on-surface-variant">Berguna?</span>
              <M3Chip
                selected={feedback === "helpful"}
                icon={<ThumbsUp aria-hidden />}
                onClick={() => setFeedback(feedback === "helpful" ? null : "helpful")}
              >
                Berguna
              </M3Chip>
              <M3Chip
                selected={feedback === "not-helpful"}
                icon={<ThumbsDown aria-hidden />}
                onClick={() => setFeedback(feedback === "not-helpful" ? null : "not-helpful")}
              >
                Tidak
              </M3Chip>
            </div>
            {feedback ? (
              <p className="m3-bs text-m3-on-surface-variant" aria-live="polite">
                Masukan disimpan untuk sesi ini. Sumber tetap bisa dibaca di bawah.
              </p>
            ) : null}
          </M3Card>

          {notice.diversions && notice.diversions.length > 0 ? (
            <M3Card variant="tertiary-container" radius="xl" className="grid gap-3">
              <h2 className="m3-tm">Pengalihan sementara</h2>
              {notice.diversions.map((diversion) => {
                const line =
                  notice.lines.find((entry) => entry.id === diversion.lineId) ?? null;
                return (
                  <div key={`${diversion.lineId}-${diversion.direction}`} className="grid gap-1">
                    <p className="m3-lm uppercase">
                      {line?.code ?? diversion.lineId}
                      {diversion.approximate ? " · perkiraan" : ""}
                    </p>
                    <p className="m3-bm">
                      {diversion.skippedNames.length > 0
                        ? `Melewati ${diversion.skippedNames.join(" · ")}`
                        : "Tidak ada halte yang dilewati"}
                    </p>
                    <p className="m3-bs">
                      {diversion.via.length > 0
                        ? diversion.via
                            .map((stop) => `${stop.name}${stop.served ? "" : " (lewat)"}`)
                            .join(" · ")
                        : "Tidak ada titik jalan yang tersimpan"}
                    </p>
                  </div>
                );
              })}
            </M3Card>
          ) : notice.diversionDescription ? (
            <M3Card variant="tertiary-container" radius="xl" className="grid gap-2">
              <h2 className="m3-tm">Pengalihan</h2>
              {notice.diversionDescription.from || notice.diversionDescription.to ? (
                <p className="m3-bm">
                  {notice.diversionDescription.from ?? "Awal"}
                  {" ke "}
                  {notice.diversionDescription.to ?? "akhir"}
                </p>
              ) : null}
              {notice.diversionDescription.via.length > 0 ? (
                <p className="m3-bs">
                  Via {notice.diversionDescription.via.join(" · ")}
                </p>
              ) : null}
              {notice.diversionDescription.follows.length > 0 ? (
                <p className="m3-bs">
                  Mengikuti {notice.diversionDescription.follows.join(" · ")}
                </p>
              ) : null}
            </M3Card>
          ) : null}

          {affectedAlerts.length > 0 ? (
            <M3Card variant="primary-container" radius="xl" className="grid gap-3">
              <h2 className="m3-tm">Perjalanan rutin yang terdampak</h2>
              {affectedAlerts.map((alert) => {
                const routineId =
                  routineNames.get(
                    `${alert.habit.originName}>${alert.habit.destinationName}`,
                  ) ?? null;
                return (
                  <div key={`${alert.habit.originName}>${alert.habit.destinationName}`} className="grid gap-1">
                    <p className="m3-bm">
                      {alert.habit.originName} ke {alert.habit.destinationName}
                    </p>
                    <p className="m3-bs">
                      {alert.habit.count} perjalanan tersimpan
                      {routineId ? " · rutinitas tersimpan" : ""}
                    </p>
                  </div>
                );
              })}
            </M3Card>
          ) : null}

          <M3SplitButton
            size="m"
            label="Rute alternatif"
            icon={<RouteIcon aria-hidden />}
            onPrimaryClick={onOpenAlternatives}
            menuLabel="Pilihan lain untuk gangguan ini"
            menuItems={[
              {
                id: "map",
                label: "Lihat di peta",
                icon: <MapPin aria-hidden />,
                onSelect: onShowOnMap,
              },
              {
                id: "ask",
                label: "Tanya Daily",
                icon: <MessageSquare aria-hidden />,
                onSelect: () =>
                  onAsk(
                    `Gangguan "${notice.title}" di ${scopes.join(", ") || "jaringan"}. Rute alternatif apa yang masih terbuka?`,
                  ),
              },
            ]}
          />

          <section aria-label="Sumber tersimpan" className="grid gap-2">
            <h2 className="m3-tm px-1 text-m3-on-surface">Sumber tersimpan</h2>
            {evidence.isError ? (
              <M3Card variant="error-container" radius="xl" className="grid gap-2">
                <p className="m3-tm">Sumber tidak bisa dibaca</p>
                <p className="m3-bm">Coba lagi setelah koneksi pulih.</p>
              </M3Card>
            ) : evidence.isLoading ? (
              <div className="grid justify-items-center gap-2 py-6">
                <M3LoadingIndicator size="sm" label="Membaca sumber" />
                <p className="m3-bs text-m3-on-surface-variant">Membaca sumber...</p>
              </div>
            ) : sources.length === 0 ? (
              <M3Card variant="filled" radius="xl" className="grid gap-2">
                <p className="m3-tm">Belum ada sumber tersimpan</p>
                <p className="m3-bm">
                  Pemberitahuan ini tersimpan tanpa kutipan. Tautan aslinya tetap ada di
                  bawah.
                </p>
                {notice.url ? <SourceLink source={sourceFromNotice(notice)} /> : null}
              </M3Card>
            ) : (
              <ul className="grid gap-2">
                {sources.map((source) => (
                  <li key={`${source.url}-${source.publishedAt ?? ""}`}>
                    <SourceLink source={source} />
                  </li>
                ))}
              </ul>
            )}
            {notice.url && sources.length > 0 ? (
              <a
                href={notice.url}
                target="_blank"
                rel="noreferrer"
                className="m3-btn m3-btn--s m3-btn--text justify-self-start"
              >
                <ExternalLink aria-hidden className="size-4" />
                Buka pemberitahuan asli
              </a>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}

function sourceFromNotice(notice: DisruptionSummary): NoticeSource {
  return {
    type: notice.sourceType === "x" ? "x" : notice.sourceType === "news" ? "news" : "link",
    text: notice.body,
    authorHandle: null,
    authorName: null,
    publishedAt: notice.publishedAt,
    url: notice.url ?? "",
    title: notice.title,
  };
}

function SourceLink({ source }: { source: NoticeSource }) {
  const time = sourceTimeOf(source);
  return (
    <article className="m3-card m3-card--filled m3-card--radius-xl grid gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "m3-status-pill",
            source.type === "x"
              ? "m3-status-pill--terganggu"
              : source.type === "news"
                ? "m3-status-pill--tersendat"
                : "m3-status-pill--lancar",
          )}
        >
          {SOURCE_LABEL[source.type]}
        </span>
        {source.authorHandle ? (
          <span className="m3-bs text-m3-on-surface-variant">@{source.authorHandle}</span>
        ) : source.authorName ? (
          <span className="m3-bs text-m3-on-surface-variant">{source.authorName}</span>
        ) : null}
        {time ? <span className="m3-bs m3-num text-m3-on-surface-variant">{time}</span> : null}
      </div>
      {source.title ? <p className="m3-tm text-m3-on-surface">{source.title}</p> : null}
      {source.text ? <p className="m3-bm text-m3-on-surface-variant">{source.text}</p> : null}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="m3-btn m3-btn--s m3-btn--text justify-self-start"
      >
        <ExternalLink aria-hidden className="size-4" />
        Buka sumber
      </a>
    </article>
  );
}
