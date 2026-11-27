import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellRing,
  MessageSquare,
  Navigation,
  Share2,
  ShieldCheck,
} from "lucide-react";

import {
  M3Button,
  M3Card,
  M3Chip,
  M3ExtendedFab,
  M3FloatingToolbar,
  M3IconButton,
  M3Snackbar,
} from "../../components/m3e/index.js";
import { LegList } from "../../components/transit/leg-list.js";
import { formatRupiah } from "../../lib/format.js";
import { cn } from "../../lib/cn.js";
import type { DisruptionSummary, FareQuote, Itinerary, PlanResult } from "../../lib/api.js";
import { legendEntries } from "../../lib/route-colors.js";
import { closedStationIds, routeIsBlocked } from "../../lib/route-choice.js";

import { formatJakartaSpan } from "./route-sort.js";

function fareLabelOf(route: Itinerary): string | null {
  return route.fare.available && route.fare.totalIdr !== null
    ? formatRupiah(route.fare.totalIdr)
    : null;
}

function transfersOf(route: Itinerary): string {
  if (route.transferCount === 0) return "tanpa transit";
  return `${route.transferCount} transit`;
}

function blockingNoticeOf(
  route: Itinerary,
  notices: readonly DisruptionSummary[],
): DisruptionSummary | null {
  return (
    notices.find((notice) => notice.blocksService && routeIsBlocked(route, [notice])) ??
    null
  );
}

/**
 * Detail rute.
 *
 * The board is hidden here and the floating toolbar takes its place, per
 * the M3 Expressive rule that a navigation bar and a floating toolbar never
 * share the screen. The timeline is the real itinerary; the fare card is
 * the published quote; the legend points at the same map lines the list
 * does.
 */
export function RouteDetailView({
  plan,
  route,
  activeLeg,
  onLegSelect,
  onStopHover,
  hoveredLine,
  onHoverLine,
  watching,
  onToggleWatch,
  onBack,
  onStart,
  onAsk,
}: {
  plan: PlanResult;
  route: Itinerary;
  activeLeg: string | null;
  onLegSelect: (legId: string | null) => void;
  onStopHover: (stationId: string | null) => void;
  hoveredLine: string | null;
  onHoverLine: (lineKey: string | null) => void;
  watching: boolean;
  onToggleWatch: () => void;
  onBack: () => void;
  onStart: () => void;
  onAsk: () => void;
}) {
  const [snack, setSnack] = useState<string | null>(null);
  const [showNotices, setShowNotices] = useState(false);
  const notices = plan.disruptions;
  const blocked = routeIsBlocked(route, notices);
  const blocking = blockingNoticeOf(route, notices);
  const closed = closedStationIds(notices);
  const legend = useMemo(() => legendEntries(route), [route]);
  const span = formatJakartaSpan(
    plan.quotedAt ?? plan.computedAt,
    route.durationMinutes,
  );
  const fare = fareLabelOf(route);

  const share = async (): Promise<void> => {
    const text = `${plan.origin.name} ke ${plan.destination.name} · ${route.durationMinutes} mnt${
      fare ? ` · ${fare}` : ""
    }`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        const shareData: ShareData = { title: "Daily Route", text };
        if (typeof window !== "undefined") shareData.url = window.location.href;
        await navigator.share(shareData);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${text} ${typeof window === "undefined" ? "" : window.location.href}`,
        );
        setSnack("Rute disalin ke papan klip.");
        return;
      }
      setSnack("Perangkat ini tidak bisa membagikan rute.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setSnack("Rute tidak bisa dibagikan sekarang.");
    }
  };

  return (
    <section
      aria-label="Detail rute"
      className={cn(
        "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-m3-surface",
        "pt-[env(safe-area-inset-top)] pb-[calc(112px+env(safe-area-inset-bottom))]",
        "lg:inset-y-0 m3-stage-panel lg:right-auto lg:w-[420px] lg:border-r lg:border-m3-outline-variant",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-3">
        <M3IconButton label="Kembali ke pilihan rute" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </M3IconButton>
        <h1 className="m3-tm min-w-0 flex-1 truncate text-m3-on-surface">Detail rute</h1>
        <M3IconButton label="Tanya Daily" onClick={onAsk}>
          <MessageSquare aria-hidden />
        </M3IconButton>
      </header>

      <div className="grid gap-4 px-4 pb-4">
        <M3Card variant="filled" radius="xl" className="grid gap-2">
          <p className="m3-lm text-m3-on-surface-variant">
            {plan.origin.name} ke {plan.destination.name}
          </p>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="m3-dl m3-em m3-num text-m3-on-surface">
              {route.durationMinutes}
            </span>
            <span className="m3-tm text-m3-on-surface-variant">mnt</span>
          </p>
          <p className="m3-bm text-m3-on-surface-variant">
            {span}
            {fare ? ` · ${fare}` : ""} · {transfersOf(route)}
          </p>
        </M3Card>

        <M3Card
          variant={blocked ? "error-container" : "ok-container"}
          radius="xl"
          className="grid gap-2"
        >
          <p className="m3-tm flex items-start gap-2">
            {blocked ? (
              <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
            ) : (
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              {blocked
                ? blocking?.title ?? "Rute ini melewati gangguan aktif"
                : "Tidak ada gangguan aktif di rute ini"}
            </span>
          </p>
          {blocked ? (
            <p className="m3-bm">
              Rute ini mungkin tidak bisa dijalankan. Periksa papan jalur sebelum
              berangkat.
            </p>
          ) : notices.length > 0 ? (
            <p className="m3-bs">
              {notices.length} gangguan aktif di jaringan tidak melewati rute ini.
            </p>
          ) : null}
          {notices.length > 0 ? (
            <>
              <M3Button
                variant="text"
                size="xs"
                onClick={() => setShowNotices((open) => !open)}
                aria-expanded={showNotices}
              >
                {showNotices ? "Sembunyikan detail gangguan" : "Lihat detail gangguan"}
              </M3Button>
              {showNotices ? (
                <ul className="grid gap-2">
                  {notices.map((notice) => (
                    <li key={notice.id} className="m3-bs">
                      <p className="m3-ll">{notice.title}</p>
                      <p className="mt-1">{notice.body}</p>
                      {notice.url ? (
                        <a
                          href={notice.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block underline underline-offset-2"
                        >
                          Sumber
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </M3Card>

        {legend.length > 0 ? (
          <div className="grid gap-2">
            <p className="m3-lm text-m3-on-surface-variant">Rute di peta</p>
            <div className="flex flex-wrap gap-2">
              {legend.map((entry) => (
                <M3Chip
                  key={entry.key}
                  variant="elevated"
                  selected={hoveredLine === entry.key}
                  leadingDotColor={entry.color}
                  onClick={() => onHoverLine(hoveredLine === entry.key ? null : entry.key)}
                  onMouseEnter={() => onHoverLine(entry.key)}
                  onMouseLeave={() => onHoverLine(null)}
                >
                  {entry.label}
                </M3Chip>
              ))}
            </div>
          </div>
        ) : null}

        {route.fare.available &&
        (route.fare.breakdown.length > 0 || route.fare.alternatives.length > 0) ? (
          <M3Card variant="outlined" radius="xl" className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="m3-tm text-m3-on-surface">Tarif</p>
              <p className="m3-ts m3-num text-m3-on-surface">{route.fare.label}</p>
            </div>
            <ul className="grid gap-2">
              {route.fare.breakdown.map((item, index) => (
                <li key={`${item.label}-${index}`} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="m3-bm min-w-0 flex-1">{item.label}</span>
                    <span className="m3-ts m3-num shrink-0">
                      {formatRupiah(item.amountIdr)}
                    </span>
                  </div>
                  {item.detail ? (
                    <p className="m3-bs text-m3-on-surface-variant">{item.detail}</p>
                  ) : null}
                </li>
              ))}
              {route.fare.alternatives.map((alternative) => (
                <li
                  key={alternative.label}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="m3-bs min-w-0 flex-1 text-m3-on-surface-variant">
                    {alternative.label}
                  </span>
                  <span className="m3-ts m3-num shrink-0">
                    {formatRupiah(alternative.amountIdr)}
                  </span>
                </li>
              ))}
            </ul>
            <FareCapNote fare={route.fare} />
          </M3Card>
        ) : null}

        <div className="min-w-0">
          <LegList
            legs={route.legs}
            startIso={plan.quotedAt ?? plan.computedAt}
            activeLegId={activeLeg}
            onLegSelect={onLegSelect}
            onStopHover={onStopHover}
            closedStationIds={closed}
          />
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3",
          "px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3",
          "bg-gradient-to-t from-m3-surface via-m3-surface/95 to-transparent",
          "m3-stage-panel lg:right-auto lg:w-[420px]",
        )}
      >
        <M3FloatingToolbar variant="vibrant" ariaLabel="Aksi rute">
          <M3IconButton
            label={watching ? "Berhenti memantau rute" : "Simpan rute"}
            toggleable
            selected={watching}
            onClick={onToggleWatch}
          >
            {watching ? <BellRing aria-hidden /> : <Bell aria-hidden />}
          </M3IconButton>
          <M3IconButton label="Bagikan rute" onClick={() => void share()}>
            <Share2 aria-hidden />
          </M3IconButton>
          <M3IconButton label="Tanya Daily" onClick={onAsk}>
            <MessageSquare aria-hidden />
          </M3IconButton>
        </M3FloatingToolbar>
        <M3ExtendedFab
          tone="primary"
          icon={<Navigation aria-hidden />}
          label="Mulai"
          onClick={onStart}
        />
      </div>

      <M3Snackbar open={snack !== null} message={snack ?? ""} onDismiss={() => setSnack(null)} />
    </section>
  );
}

/** The card price, when a JakLingko card changes it. */
function FareCapNote({ fare }: { fare: FareQuote }) {
  const alternative = fare.alternatives.find(
    (entry) => /jaklingko|cap|integrasi/i.test(entry.label) && fare.totalIdr !== null,
  );
  if (!alternative || alternative.amountIdr >= (fare.totalIdr ?? 0)) return null;
  return (
    <p className="m3-bs text-m3-on-surface-variant">
      Dengan kartu JakLingko: {formatRupiah(alternative.amountIdr)}
      {fare.totalIdr !== null
        ? ` · hemat ${formatRupiah(fare.totalIdr - alternative.amountIdr)}`
        : ""}
      . {alternative.note}
    </p>
  );
}
