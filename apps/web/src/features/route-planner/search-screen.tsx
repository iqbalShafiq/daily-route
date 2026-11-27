import { ArrowLeft, ArrowUpDown, ChevronRight, LocateFixed, MapPin, MessageSquare, Search } from "lucide-react";

import {
  M3Button,
  M3Chip,
  M3ConnectedButtonGroup,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3Shape,
} from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";

import { PlaceInput, type MemorySuggestion } from "./place-input.js";
import { TimePicker } from "./time-picker.js";
import type { ChosenPlace } from "./place-memory.js";
import type { HomeQuickPlace } from "./map-home-overlay.js";

export type SearchScreenProps = {
  origin: string;
  destination: string;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSelectOrigin: (place: ChosenPlace) => void;
  onSelectDestination: (place: ChosenPlace) => void;
  onSwap: () => void;
  originCanSave: boolean;
  destinationCanSave: boolean;
  originSaved: boolean;
  destinationSaved: boolean;
  onToggleSavedOrigin: () => void;
  onToggleSavedDestination: () => void;
  memory: MemorySuggestion[];
  departureMode: "now" | "at";
  departureTime: string;
  onDepartureModeChange: (mode: "now" | "at") => void;
  onDepartureTimeChange: (time: string) => void;
  onSubmit: () => void;
  locating: boolean;
  onUseMyPosition: () => void;
  walkError: string | null;
  quickPlaces: readonly HomeQuickPlace[];
  onPickQuickPlace: (place: HomeQuickPlace) => void;
  onOpenChat: () => void;
  onBack: () => void;
};

/**
 * Cari tujuan.
 *
 * The full-screen surface on a phone and the same 420px panel on a
 * desktop. The two place fields are one segmented object: the top field
 * has square bottom corners and the bottom field has square top corners,
 * so the pair reads as one place form rather than two boxes.
 */
export function SearchScreen({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSelectOrigin,
  onSelectDestination,
  onSwap,
  originCanSave,
  destinationCanSave,
  originSaved,
  destinationSaved,
  onToggleSavedOrigin,
  onToggleSavedDestination,
  memory,
  departureMode,
  departureTime,
  onDepartureModeChange,
  onDepartureTimeChange,
  onSubmit,
  locating,
  onUseMyPosition,
  walkError,
  quickPlaces,
  onPickQuickPlace,
  onOpenChat,
  onBack,
}: SearchScreenProps) {
  const canSearch = origin.trim().length > 0 && destination.trim().length > 0;

  return (
    <section
      aria-label="Cari tujuan"
      className={cn(
        "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-m3-surface",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        "lg:inset-y-0 m3-stage-panel lg:right-auto lg:w-[420px] lg:border-r lg:border-m3-outline-variant",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-3">
        <M3IconButton label="Kembali ke beranda" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </M3IconButton>
        <h1 className="m3-hm m3-em min-w-0 flex-1 truncate text-m3-on-surface">
          Cari tujuan
        </h1>
        <M3Shape
          shape="cookie6"
          size={40}
          className="bg-m3-primary-container text-m3-on-primary-container"
        >
          <MapPin aria-hidden className="size-4" />
        </M3Shape>
      </header>

      <div className="grid gap-4 px-4 pb-6">
        <div className="grid gap-2">
          <M3ConnectedButtonGroup
            size="xs"
            ariaLabel="Waktu berangkat"
            value={departureMode}
            onChange={(value) =>
              onDepartureModeChange(value === "at" ? "at" : "now")
            }
            options={[
              { value: "now", label: "Sekarang" },
              { value: "at", label: "Pilih jam" },
            ]}
            className="max-w-[240px]"
          />
          <div className="flex items-center">
            {departureMode === "at" ? (
              <TimePicker
                value={departureTime}
                onChange={onDepartureTimeChange}
                align="left"
              />
            ) : (
              <span className="m3-bs text-m3-on-surface-variant">Berangkat sekarang</span>
            )}
          </div>
        </div>

        <div className="grid">
          <div className="m3-place-field m3-place-field--from">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full border-2 border-m3-primary bg-m3-surface-lowest"
            />
            <PlaceInput
              variant="row"
              label="Dari"
              value={origin}
              onValueChange={onOriginChange}
              onSelectPlace={onSelectOrigin}
              memory={memory}
              canSave={originCanSave}
              saved={originSaved}
              onToggleSaved={onToggleSavedOrigin}
              placeholder="Dari halte, stasiun, atau tempat"
              trailingAction={
                <M3IconButton
                  label="Lokasi saya"
                  onClick={onUseMyPosition}
                  aria-busy={locating || undefined}
                  disabled={locating}
                >
                  <LocateFixed aria-hidden />
                </M3IconButton>
              }
            />
          </div>

          <div className="m3-place-field m3-place-field--to">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-m3-primary" />
            <PlaceInput
              variant="row"
              label="Ke"
              value={destination}
              onValueChange={onDestinationChange}
              onSelectPlace={onSelectDestination}
              memory={memory}
              canSave={destinationCanSave}
              saved={destinationSaved}
              onToggleSaved={onToggleSavedDestination}
              placeholder="Ke halte, stasiun, atau tempat"
              trailingAction={
                <M3IconButton label="Tukar asal dan tujuan" onClick={onSwap}>
                  <ArrowUpDown aria-hidden />
                </M3IconButton>
              }
            />
          </div>
        </div>

        <M3Button
          variant="filled"
          size="m"
          fullWidth
          icon={<Search aria-hidden />}
          onClick={onSubmit}
          disabled={!canSearch}
        >
          Cari rute
        </M3Button>

        {walkError ? (
          <p className="m3-bs text-m3-error" role="alert">
            {walkError}
          </p>
        ) : null}

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
          <M3Chip
            variant="suggestion"
            icon={<MessageSquare aria-hidden />}
            onClick={onOpenChat}
          >
            Tanya Daily
          </M3Chip>
        </div>

        {memory.length > 0 ? (
          <div className="grid gap-2">
            <p className="m3-lm text-m3-on-surface-variant">Terakhir dicari</p>
            <M3ExpressiveList surface="low" ariaLabel="Tempat terakhir dicari">
              {memory.slice(0, 4).map((item) => (
                <M3ExpressiveListItem
                  key={item.id}
                  leading={<MapPin aria-hidden />}
                  leadingShape="cookie6"
                  title={item.name}
                  subtitle={item.detail}
                  trailing={<ChevronRight aria-hidden className="size-4" />}
                  onClick={() => onSelectDestination(item.place)}
                />
              ))}
            </M3ExpressiveList>
          </div>
        ) : null}

        <p className="m3-bs text-m3-on-surface-variant">
          Saran tempat datang dari jaringan dan Places © Overture Maps. Tarif dan waktu
          dihitung oleh perencana, bukan oleh model.
        </p>
      </div>
    </section>
  );
}
