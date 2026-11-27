import {
  BellRing,
  CalendarClock,
  ChevronRight,
  MessageSquare,
  Search,
  Sun,
  Moon,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { PwaInstallBanner } from "../pwa/index.js";
import {
  M3BottomSheet,
  M3Card,
  M3Chip,
  M3IconButton,
  M3ModeBadge,
  M3Shape,
  M3SplitButton,
  type M3BottomSheetDetent,
} from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";
import type { PlanResult } from "../../lib/api.js";

import type { ChosenPlace } from "./place-memory.js";

/** The mode filter of the map home. */
export type HomeModeFilter = "all" | "krl" | "mrt" | "lrt" | "brt" | "mikro";

export const HOME_MODE_FILTERS: readonly { id: HomeModeFilter; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "krl", label: "KRL" },
  { id: "mrt", label: "MRT" },
  { id: "lrt", label: "LRT" },
  { id: "brt", label: "TransJakarta" },
  { id: "mikro", label: "Mikrotrans" },
];

export type HomeFeatured = {
  originName: string;
  destinationName: string;
  origin: ChosenPlace | null;
  destination: ChosenPlace | null;
  /** Why this pair is on the card: a habit, a recent journey, or an example. */
  reason: "alert" | "recent" | "example";
  /** The stored notices that touch a usual journey, when any. */
  alertCount: number;
  /** The real plan for the pair, when the API answered. */
  plan: PlanResult | undefined;
  loading: boolean;
};

export type HomeQuickPlace = {
  label: string;
  detail: string;
  place: ChosenPlace;
};

export type MapHomeOverlayProps = {
  desktop: boolean;
  modeFilter: HomeModeFilter;
  onModeFilterChange: (filter: HomeModeFilter) => void;
  noticeCount: number;
  personalAlertCount: number;
  noticeHeadline: string | null;
  onOpenNotices: () => void;
  greeting: string;
  riderName: string;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  featured: HomeFeatured;
  onStartFeatured: () => void;
  onOpenChoices: () => void;
  onChooseDeparture: () => void;
  onOpenChat: () => void;
  quickPlaces: readonly HomeQuickPlace[];
  onPickQuickPlace: (place: HomeQuickPlace) => void;
};

function modeBadgesOf(plan: PlanResult | undefined) {
  const seen = new Set<string>();
  const badges: { key: string; systemId: string | null; serviceClass: string | null; lineCode: string | null; mode: string }[] = [];
  for (const leg of plan?.itineraries[0]?.legs ?? []) {
    if (leg.kind !== "ride") continue;
    const key = leg.lineId ?? leg.lineCode ?? leg.mode;
    if (seen.has(key)) continue;
    seen.add(key);
    badges.push({
      key,
      systemId: leg.lineId ? (leg.lineId.split(":")[0] ?? null) : null,
      serviceClass: leg.serviceClass,
      lineCode: leg.lineCode,
      mode: leg.mode,
    });
  }
  return badges.slice(0, 3);
}

function featuredStatus(featured: HomeFeatured): {
  tone: "ok" | "error" | "neutral";
  label: string;
} {
  const notices = featured.plan?.disruptions.filter((notice) => notice.activeNow) ?? [];
  if (featured.plan?.routeBlocked) {
    return { tone: "error", label: "Rute utama sedang terganggu" };
  }
  if (featured.alertCount > 0 || notices.length > 0) {
    return { tone: "error", label: "Ada gangguan di jalur ini" };
  }
  if (featured.plan) return { tone: "ok", label: "Aman: jalur lancar" };
  return { tone: "neutral", label: "Rencanakan perjalanan" };
}

function FeaturedCard({
  featured,
  onStartFeatured,
  onOpenChoices,
  onChooseDeparture,
  onOpenChat,
}: {
  featured: HomeFeatured;
  onStartFeatured: () => void;
  onOpenChoices: () => void;
  onChooseDeparture: () => void;
  onOpenChat: () => void;
}) {
  const status = featuredStatus(featured);
  const primary = featured.plan?.itineraries[0];
  const badges = modeBadgesOf(featured.plan);

  return (
    <M3Card variant="filled" radius="xl" className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="m3-lm text-m3-on-surface-variant">
            {featured.reason === "alert"
              ? "Rutinitas"
              : featured.reason === "recent"
                ? "Terakhir dicari"
                : "Coba perjalanan"}
          </p>
          <p className="m3-tm truncate text-m3-on-surface">
            {featured.originName} ke {featured.destinationName}
          </p>
          <p className="m3-bs text-m3-on-surface-variant">
            {featured.loading
              ? "Menghitung rute"
              : primary
                ? `${primary.durationMinutes} mnt · ${
                    primary.transferCount === 0
                      ? "tanpa transit"
                      : `${primary.transferCount} transit`
                  }`
                : "Mulai untuk melihat waktu dan tarif"}
          </p>
        </div>
        {primary ? (
          <div className="grid shrink-0 justify-items-end gap-1">
            <p className="m3-hs m3-em m3-num text-m3-on-surface">{primary.durationMinutes}</p>
            <p className="m3-bs text-m3-on-surface-variant">mnt lagi</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <M3ModeBadge
            key={badge.key}
            systemId={badge.systemId}
            serviceClass={badge.serviceClass}
            lineCode={badge.lineCode}
            {...(badge.mode === "walk" ? { mode: "walk" as const } : {})}
          />
        ))}
        <span
          className={cn(
            "m3-chip m3-chip--suggestion",
            status.tone === "ok" && "bg-m3-ok-container text-m3-on-ok-container",
            status.tone === "error" && "bg-m3-error-container text-m3-on-error-container",
          )}
          role="status"
        >
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {status.label}
        </span>
      </div>

      <M3SplitButton
        label="Mulai"
        size="m"
        variant="filled"
        onPrimaryClick={onStartFeatured}
        menuLabel="Pilihan perjalanan"
        menuItems={[
          {
            id: "choices",
            label: "Lihat pilihan rute",
            icon: <ChevronRight aria-hidden />,
            onSelect: onOpenChoices,
          },
          {
            id: "departure",
            label: "Ubah jam berangkat",
            icon: <CalendarClock aria-hidden />,
            onSelect: onChooseDeparture,
          },
          {
            id: "chat",
            label: "Tanya Daily",
            icon: <MessageSquare aria-hidden />,
            onSelect: onOpenChat,
          },
        ]}
      />
    </M3Card>
  );
}

/**
 * The map home: search, mode filter, notices and the sheet under it.
 *
 * The same content is a bottom sheet on a phone and a floating side panel
 * beside the map on a desktop, so the rider never has to learn two homes.
 */
export function MapHomeOverlay({
  desktop,
  modeFilter,
  onModeFilterChange,
  noticeCount,
  personalAlertCount,
  noticeHeadline,
  onOpenNotices,
  greeting,
  riderName,
  onOpenProfile,
  onOpenSearch,
  theme,
  onToggleTheme,
  featured,
  onStartFeatured,
  onOpenChoices,
  onChooseDeparture,
  onOpenChat,
  quickPlaces,
  onPickQuickPlace,
}: MapHomeOverlayProps) {
  const [detent, setDetent] = useState<M3BottomSheetDetent>("half");
  const hasBanner = noticeCount > 0 || personalAlertCount > 0;

  const body = (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m3-hm m3-em text-m3-on-surface">
            {greeting}, {riderName}
          </p>
          <p className="m3-bs text-m3-on-surface-variant">
            {noticeCount > 0
              ? `${noticeCount} gangguan aktif di jaringan`
              : "Jaringan berjalan tanpa gangguan yang tercatat"}
          </p>
        </div>
        <M3IconButton
          label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </M3IconButton>
      </div>

      <FeaturedCard
        featured={featured}
        onStartFeatured={onStartFeatured}
        onOpenChoices={onOpenChoices}
        onChooseDeparture={onChooseDeparture}
        onOpenChat={onOpenChat}
      />

      <div className="grid gap-2">
        <p className="m3-lm text-m3-on-surface-variant">Pintasan</p>
        <div className="flex flex-wrap gap-2">
          {quickPlaces.map((quick) => (
            <M3Chip
              key={`${quick.label}:${quick.place.id}`}
              variant="suggestion"
              className="max-w-full overflow-hidden"
              onClick={() => onPickQuickPlace(quick)}
            >
              <span className="min-w-0 truncate">{quick.label}</span>
            </M3Chip>
          ))}
          <M3Chip variant="suggestion" icon={<Search aria-hidden />} onClick={onOpenSearch}>
            Cari tujuan
          </M3Chip>
        </div>
      </div>

      <PwaInstallBanner />
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
      <div className="pointer-events-auto flex flex-col gap-3 p-3 pt-[calc(env(safe-area-inset-top)+8px)] lg:w-[420px] lg:p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-full bg-m3-surface-low px-4 text-left shadow-[0_2px_6px_2px_rgb(0_0_0_/_0.1),0_1px_2px_rgb(0_0_0_/_0.18)] transition-colors hover:bg-m3-surface-mid"
          >
            <Search aria-hidden className="size-5 shrink-0 text-m3-on-surface-variant" />
            <span className="m3-bl truncate text-m3-on-surface-variant">
              Mau ke mana hari ini?
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Buka Saya"
            className="grid size-14 shrink-0 cursor-pointer place-items-center"
          >
            <M3Shape
              shape="cookie9"
              size={52}
              className="bg-m3-primary-container text-m3-on-primary-container"
            >
              <UserRound aria-hidden className="size-5" />
            </M3Shape>
          </button>
        </div>

        <div
          role="group"
          aria-label="Saring moda di peta"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {HOME_MODE_FILTERS.map((filter) => (
            <M3Chip
              key={filter.id}
              variant="elevated"
              selected={modeFilter === filter.id}
              onClick={() => onModeFilterChange(filter.id)}
            >
              {filter.label}
            </M3Chip>
          ))}
        </div>

        {hasBanner ? (
          <button
            type="button"
            onClick={onOpenNotices}
            className="m3-card m3-card--error-container m3-card--radius-xl flex w-full cursor-pointer items-start gap-3 text-left"
          >
            <M3Shape
              shape="softburst"
              size={44}
              className="bg-m3-error text-m3-on-error"
            >
              <TriangleAlert aria-hidden className="size-5" />
            </M3Shape>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="m3-tm text-m3-on-error-container">
                {noticeHeadline ?? "Gangguan di jaringan"}
              </span>
              <span className="m3-bs text-m3-on-error-container">
                {noticeCount > 0
                  ? `${noticeCount} gangguan aktif`
                  : "Perjalanan rutinmu terdampak"}
                {personalAlertCount > 0
                  ? ` · ${personalAlertCount} perjalanan rutin`
                  : ""}
              </span>
            </span>
            <BellRing aria-hidden className="mt-1 size-4 shrink-0 text-m3-on-error-container" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1" aria-hidden />

      {desktop ? (
        <div className="pointer-events-auto mx-4 mb-4 w-[420px]">
          <div className="m3-home-panel">{body}</div>
        </div>
      ) : (
        <M3BottomSheet
          detent={detent}
          onDetentChange={setDetent}
          ariaLabel="Beranda peta"
          className="pointer-events-auto bottom-[calc(80px+env(safe-area-inset-bottom))] max-h-[calc(100dvh-80px-env(safe-area-inset-bottom))]"
        >
          {body}
        </M3BottomSheet>
      )}
    </div>
  );
}
